import type { EngineConfig, GameState, Intent, Result } from "./types";
import { initialState, type EngineConfigBundle } from "./initialState";
import { reduce } from "./reduce";

type Subscriber = () => void;

/**
 * Headless state container for the game.
 *
 * Owns:
 *  - The current GameState (mutated only by reduce()).
 *  - An append-only intent log of every successful dispatch — used for
 *    replay-based Undo (§10.2) and future save/load + multiplayer sync.
 *  - The set-up parameters needed to rebuild initialState from seed
 *    when replaying.
 *  - A turn-boundary offset that marks where the CURRENT seat's turn
 *    began in the log. Undo can roll back any number of intents within
 *    the current turn but cannot cross the boundary, matching §10.2's
 *    "history clears on End Turn" rule.
 */
export class Engine {
  private state: GameState;
  private readonly subscribers = new Set<Subscriber>();
  private readonly intentLog: Intent[] = [];
  private readonly initialConfig: EngineConfig;
  private readonly initialBundle: EngineConfigBundle;
  private readonly allowUndo: boolean;
  private turnStartLogOffset = 0;

  constructor(config: EngineConfig, bundle: EngineConfigBundle = {}) {
    this.initialConfig = config;
    this.initialBundle = bundle;
    this.state = initialState(config, bundle);
    this.allowUndo = config.allowUndo ?? true;
  }

  getState = (): GameState => this.state;

  /** Setup parameters captured at construction. The recent-actions panel
   * uses these to replay the intent log and recover state-at-time-of-
   * dispatch (which card was at hand[i], which level was on the mat
   * stack, which tile sat in builtTiles before a Sell flipped or a
   * Shortfall removed it). */
  getInitialConfig = (): EngineConfig => this.initialConfig;
  getInitialBundle = (): EngineConfigBundle => this.initialBundle;

  subscribe = (cb: Subscriber): (() => void) => {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  };

  dispatch = (intent: Intent): Result => {
    const beforeSeat = this.state.currentPlayerIndex;
    const result = reduce(this.state, intent);
    if (result.ok) {
      this.state = result.state;
      this.intentLog.push(intent);
      // Whenever the active seat advances (regular END_TURN, auto-advance,
      // end-of-round seating, era flip), the prior turn's history is
      // committed and undo can no longer cross this point.
      if (this.state.currentPlayerIndex !== beforeSeat) {
        this.turnStartLogOffset = this.intentLog.length;
      }
      this.notify();
    }
    return result;
  };

  getIntentLog = (): readonly Intent[] => this.intentLog;

  /** Spec §10.2 — true when the dispatching seat has at least one intent
   * in the current turn AND the host hasn't disabled undo. */
  canUndo = (): boolean =>
    this.allowUndo && this.intentLog.length > this.turnStartLogOffset;

  /**
   * Spec §10.2 — drop the most recent successful dispatch and replay
   * the rest from seed. Replay is deterministic given (seed, bundle,
   * remaining intents). Returns true if a rollback happened, false if
   * nothing to undo.
   */
  undo = (): boolean => {
    if (!this.canUndo()) return false;
    this.intentLog.pop();
    this.state = initialState(this.initialConfig, this.initialBundle);
    let boundary = 0;
    let prevSeat = this.state.currentPlayerIndex;
    for (let i = 0; i < this.intentLog.length; i++) {
      const r = reduce(this.state, this.intentLog[i]!);
      // Logged intents are always successes — failures never enter the
      // log. If replay diverges, that's an engine bug, not user error.
      if (!r.ok) {
        throw new Error(
          `undo replay diverged at intent ${i}: ${r.reason}`,
        );
      }
      this.state = r.state;
      if (this.state.currentPlayerIndex !== prevSeat) {
        boundary = i + 1;
      }
      prevSeat = this.state.currentPlayerIndex;
    }
    this.turnStartLogOffset = boundary;
    this.notify();
    return true;
  };

  private notify(): void {
    for (const cb of this.subscribers) cb();
  }
}
