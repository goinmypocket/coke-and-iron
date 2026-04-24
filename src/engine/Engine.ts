import type { EngineConfig, GameState, Intent, Result } from "./types";
import { initialState, type EngineConfigBundle } from "./initialState";
import { reduce } from "./reduce";

type Subscriber = () => void;

export class Engine {
  private state: GameState;
  private readonly subscribers = new Set<Subscriber>();
  private readonly intentLog: Intent[] = [];

  constructor(config: EngineConfig, bundle: EngineConfigBundle = {}) {
    this.state = initialState(config, bundle);
  }

  getState = (): GameState => this.state;

  subscribe = (cb: Subscriber): (() => void) => {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  };

  dispatch = (intent: Intent): Result => {
    const result = reduce(this.state, intent);
    if (result.ok) {
      this.state = result.state;
      this.intentLog.push(intent);
      for (const cb of this.subscribers) cb();
    }
    return result;
  };

  getIntentLog = (): readonly Intent[] => this.intentLog;
}
