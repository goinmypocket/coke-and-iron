import type { GameState, Intent, Result } from "./types";

export function reduce(state: GameState, intent: Intent): Result {
  switch (intent.type) {
    case "noop":
      return { ok: true, state };
  }
}
