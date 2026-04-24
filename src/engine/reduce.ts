import type { GameState, Intent, Result } from "./types";

/**
 * Top-level reducer. Dispatches on intent.type to the per-action handler.
 * Every real §5 action has a case here; actions that are not yet
 * implemented return { ok: false, reason: "not_implemented" } so the
 * type-level wiring is exercised before behaviour lands.
 *
 * The default branch's `assertNever` ensures TypeScript fails the build
 * the moment a new Intent variant is added without a case.
 */
export function reduce(state: GameState, intent: Intent): Result {
  switch (intent.type) {
    case "noop":
      return { ok: true, state };
    case "BUILD":
    case "NETWORK":
    case "DEVELOP":
    case "SELL":
    case "LOAN":
    case "SCOUT":
    case "PASS":
      return NOT_IMPLEMENTED;
    default:
      return assertNever(intent);
  }
}

const NOT_IMPLEMENTED: Result = { ok: false, reason: "not_implemented" };

function assertNever(x: never): never {
  throw new Error(`reduce: unhandled intent ${JSON.stringify(x)}`);
}
