import type { EngineConfig, GameState } from "./types";

export function initialState(config: EngineConfig): GameState {
  return {
    seed: config.seed,
    playerCount: config.playerCount,
    intentCount: 0,
  };
}
