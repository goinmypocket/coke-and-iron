// =============================================================================
// ClientEngine — server-authoritative engine adapter for the browser.
//
// Same interface as the headless `Engine` class so existing UI components
// (panels, wizard, hooks) keep their shape. Internally it doesn't run a
// reducer — the host owns that — and instead just holds the latest
// per-recipient PlayerView and forwards dispatch/undo over the wire.
//
// Why this exists:
//   - The mirror engine that used to run in every browser was
//     deterministic from (seed, intentLog), so shipping those two values
//     to clients leaked everyone's hand and the deck order.
//   - The new model ships a redacted PlayerView per recipient and lets
//     the host be the single source of truth.
//   - This shim keeps the migration small: components keep calling
//     `engine.getState()`, `engine.dispatch(intent)`, `engine.undo()`,
//     `engine.canUndo()`, `engine.subscribe(cb)` — only the impl
//     changes.
//
// Type-pragmatics: getState() returns the PlayerView typed AS
// GameState. The two shapes overlap in every public field; the only
// places they diverge are arrays of redacted card content
// (drawDeck / removedCards / others' hands), and PlayerView pads those
// with HIDDEN-card placeholders to keep `.length` honest. UI selectors
// that switch on `card.kind` learn HIDDEN as a new arm; everything
// else keeps working.
// =============================================================================

import type { Engine as RealEngine } from "../../engine/Engine";
import type {
  EngineConfig,
  GameState,
  Intent,
  Result,
} from "../../engine/types";
import type { EngineConfigBundle } from "../../engine/initialState";
import type { PlayerView } from "../../engine/view";
import { projectForSpectator } from "../../engine/view";
import { buildEvent, type ObservableEvent } from "./eventLog";
import type { S2CState } from "../../shared/protocol";

type StateCause = S2CState["cause"];

/** Subset of the `Engine` interface that the UI actually uses. Keeping
 *  this narrow means we don't have to mock parts of the engine that
 *  no longer make sense (e.g., the seeded `rng`). */
export type ClientEngineLike = Pick<
  RealEngine,
  | "getState"
  | "dispatch"
  | "undo"
  | "canUndo"
  | "subscribe"
  | "getInitialConfig"
  | "getInitialBundle"
  | "getIntentLog"
>;

type Subscriber = () => void;

export interface ClientEngineDeps {
  /** Send an INTENT to the host. The local apply is *not* attempted —
   *  the UI sees the new state when the host echoes back STATE. */
  readonly sendIntent: (intent: Intent) => void;
  /** Ask the host to roll back the last intent of the current turn. */
  readonly sendUndo: () => void;
}

export class ClientEngine implements ClientEngineLike {
  private view: PlayerView;
  private canUndoNow: boolean;
  private readonly subs = new Set<Subscriber>();
  /** Synthetic "config" we expose for components that ask the engine
   *  for setup parameters. No seed (the real one stays server-side). */
  private readonly initialConfig: EngineConfig;
  private readonly initialBundle: EngineConfigBundle;
  /** Public history of dispatched intents, computed locally from the
   *  STATE pre/post diffs the host streams. Same content for every
   *  client (no private information leaks in) — and rebuilt from
   *  scratch on each SNAPSHOT-cause STATE so reconnects start clean. */
  private recentEvents: ObservableEvent[] = [];

  constructor(
    initialView: PlayerView,
    canUndoNow: boolean,
    private readonly deps: ClientEngineDeps,
  ) {
    this.view = initialView;
    this.canUndoNow = canUndoNow;
    this.initialConfig = {
      seed: 0,
      playerCount: initialView.playerCount,
    };
    this.initialBundle = {};
  }

  /** Replace the held view (and the canUndo flag) with a fresh one
   *  from the host. Notifies every subscriber synchronously, the same
   *  contract the real Engine offers. Called by useNetworkClient on
   *  every STATE / SNAPSHOT message.
   *
   *  The `cause` discriminates how to evolve the local recent-events
   *  log: `intent` appends a derived ObservableEvent, `undo` pops the
   *  last entry, and `snapshot` resets the log (a fresh snapshot means
   *  we just joined or someone reloaded a save — the prior chain we
   *  held no longer applies). */
  applyView = (
    view: PlayerView,
    canUndoNow: boolean,
    cause: StateCause,
  ): void => {
    const prev = this.view;
    if (cause.kind === "intent") {
      this.recentEvents = [
        ...this.recentEvents,
        buildEvent(prev, view, cause.intent),
      ];
    } else if (cause.kind === "undo") {
      this.recentEvents = this.recentEvents.slice(0, -1);
    } else {
      // snapshot — fresh authoritative state with no prior chain.
      this.recentEvents = [];
    }
    this.view = view;
    this.canUndoNow = canUndoNow;
    for (const cb of this.subs) cb();
  };

  /** The locally-derived public history of dispatched intents. Same
   *  on every client; safe to render directly. Empty until the first
   *  intent-cause STATE arrives. */
  getRecentEvents = (): readonly ObservableEvent[] => this.recentEvents;

  // ---------------------------------------------------------------------------
  // Engine compat surface
  // ---------------------------------------------------------------------------

  /** The cast is the heart of the shim: PlayerView and GameState
   *  share field shapes for everything the UI reads, but PlayerView is
   *  the more honest type at the boundary. Components that switch on
   *  `card.kind` already account for HIDDEN; selectors that want the
   *  exact count for redacted slots should prefer
   *  `view.drawDeckCount` / `player.handSize`, both of which are
   *  PlayerView-only fields not on GameState. */
  getState = (): GameState => this.view as unknown as GameState;

  /** Optimistic-ish dispatch. We never apply locally — the host is
   *  the single reducer — so we return ok unconditionally and rely on
   *  the toast surfaced by INTENT_REJECTED for the rejection path.
   *  Anything that needs the actual post-apply state should subscribe
   *  to the engine and read after the next STATE arrives. */
  dispatch = (intent: Intent): Result => {
    this.deps.sendIntent(intent);
    return { ok: true, state: this.view as unknown as GameState };
  };

  /** Same async story as dispatch — server-driven. */
  undo = (): boolean => {
    if (!this.canUndoNow) return false;
    this.deps.sendUndo();
    return true;
  };

  canUndo = (): boolean => this.canUndoNow;

  subscribe = (cb: Subscriber): (() => void) => {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  };

  /** Returned for compat with components that ask the engine for the
   *  setup parameters (the recent-actions overlay, mainly). The seed
   *  is *deliberately* zero — the real one never leaves the host. */
  getInitialConfig = (): EngineConfig => this.initialConfig;
  getInitialBundle = (): EngineConfigBundle => this.initialBundle;

  /** No client-side intent log any more — the host owns history. The
   *  recent-actions overlay needs this rewritten to consume a
   *  server-sent observable log; until then it just renders empty. */
  getIntentLog = (): readonly Intent[] => [];
}

/** Build an empty / placeholder ClientEngine for components that need
 *  one before the first SNAPSHOT arrives. Useful for tests. */
export function spectatorEngine(deps: ClientEngineDeps): ClientEngine {
  // Synthesise a degenerate view by projecting an empty engine state.
  // We never mount this in the real flow (useNetworkClient waits for
  // a real snapshot), but tests sometimes want a default.
  const fallback = projectForSpectator({
    playerCount: 2,
    drawDeck: [],
    removedCards: [],
    players: [],
    turnOrder: [],
    currentPlayerIndex: 0,
  } as unknown as Parameters<typeof projectForSpectator>[0]);
  return new ClientEngine(fallback, false, deps);
}
