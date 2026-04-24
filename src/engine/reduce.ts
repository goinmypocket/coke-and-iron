import { reduceBuild } from "./actions/build";
import { reduceDevelop } from "./actions/develop";
import { reduceEndTurn, runEndOfTurn } from "./actions/end-turn";
import { reduceLoan } from "./actions/loan";
import { reduceNetwork } from "./actions/network";
import { reducePass } from "./actions/pass";
import { reduceScout } from "./actions/scout";
import { reduceSell } from "./actions/sell";
import type { GameState, Intent, Result } from "./types";

/**
 * Top-level reducer. Dispatches on intent.type to the per-action handler.
 * After any §5 action succeeds, if the new state's actionsRemaining is 0
 * AND state.autoEndTurn is true, the reducer inlines runEndOfTurn() —
 * this makes replay faithful regardless of whether the intent log
 * includes explicit END_TURN entries (§3.5).
 *
 * The default branch's `assertNever` ensures TypeScript fails the build
 * the moment a new Intent variant is added without a case.
 */
export function reduce(state: GameState, intent: Intent): Result {
  switch (intent.type) {
    case "noop":
      return { ok: true, state };
    case "END_TURN":
      return reduceEndTurn(state, intent);
    case "PASS":
      return maybeAutoAdvance(reducePass(state, intent));
    case "LOAN":
      return maybeAutoAdvance(reduceLoan(state, intent));
    case "SCOUT":
      return maybeAutoAdvance(reduceScout(state, intent));
    case "DEVELOP":
      return maybeAutoAdvance(reduceDevelop(state, intent));
    case "BUILD":
      return maybeAutoAdvance(reduceBuild(state, intent));
    case "NETWORK":
      return maybeAutoAdvance(reduceNetwork(state, intent));
    case "SELL":
      return maybeAutoAdvance(reduceSell(state, intent));
    default:
      return assertNever(intent);
  }
}

function maybeAutoAdvance(result: Result): Result {
  if (!result.ok) return result;
  const s = result.state;
  if (
    s.autoEndTurn &&
    s.actionsRemaining === 0 &&
    s.phase === "PLAYER_TURNS"
  ) {
    return { ok: true, state: runEndOfTurn(s) };
  }
  return result;
}

function assertNever(x: never): never {
  throw new Error(`reduce: unhandled intent ${JSON.stringify(x)}`);
}
