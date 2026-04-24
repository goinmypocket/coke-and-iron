// Scaffold-stage placeholders. Step 3 expands GameState, Intent,
// Result, and FailureReason to cover every entity in game-spec.md §2
// and every action in §5.

export type Seed = number;
export type PlayerCount = 2 | 3 | 4;

export interface EngineConfig {
  seed: Seed;
  playerCount: PlayerCount;
}

export interface GameState {
  seed: Seed;
  playerCount: PlayerCount;
  intentCount: number;
}

export type Intent = { type: "noop" };

export type FailureReason = "not_implemented";

export type Result =
  | { ok: true; state: GameState }
  | { ok: false; reason: FailureReason };
