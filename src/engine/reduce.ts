import { reduceDevelop } from "./actions/develop";
import { reduceLoan } from "./actions/loan";
import { reducePass } from "./actions/pass";
import { reduceScout } from "./actions/scout";
import type { GameState, Intent, Result } from "./types";

/**
 * Top-level reducer. Dispatches on intent.type to the per-action handler.
 * Unimplemented actions return { ok: false, reason: "not_implemented" }.
 * The default branch's `assertNever` ensures TypeScript fails the build
 * the moment a new Intent variant is added without a case.
 */
export function reduce(state: GameState, intent: Intent): Result {
  switch (intent.type) {
    case "noop":
      return { ok: true, state };
    case "PASS":
      return reducePass(state, intent);
    case "LOAN":
      return reduceLoan(state, intent);
    case "SCOUT":
      return reduceScout(state, intent);
    case "DEVELOP":
      return reduceDevelop(state, intent);
    case "BUILD":
    case "NETWORK":
    case "SELL":
      return NOT_IMPLEMENTED;
    default:
      return assertNever(intent);
  }
}

const NOT_IMPLEMENTED: Result = { ok: false, reason: "not_implemented" };

function assertNever(x: never): never {
  throw new Error(`reduce: unhandled intent ${JSON.stringify(x)}`);
}
