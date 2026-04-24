// =============================================================================
// §5.5 Loan — take £30 at the cost of 3 income levels.
// =============================================================================

import { MIN_INCOME_LEVEL, moveBackLevels } from "../income";
import {
  disposeCard,
  replacePlayer,
  validateActiveTurn,
  validateCardIndex,
} from "../turn";
import type { GameState, IntentLoan, Result } from "../types";

const LOAN_AMOUNT = 30;
const LOAN_LEVEL_COST = 3;

export function reduceLoan(state: GameState, intent: IntentLoan): Result {
  const turnFail = validateActiveTurn(state, intent.playerId);
  if (turnFail !== null) return { ok: false, reason: turnFail };

  const player = state.players[intent.playerId];
  if (player === undefined) return { ok: false, reason: "not_current_turn" };

  const cardFail = validateCardIndex(player.hand, intent.cardIndex);
  if (cardFail !== null) return { ok: false, reason: cardFail };

  // §5.5 step 2: the destination level must stay ≥ MIN_INCOME_LEVEL.
  const move = moveBackLevels(player.incomeStep, LOAN_LEVEL_COST);
  if (move.level < MIN_INCOME_LEVEL) {
    return { ok: false, reason: "loan_income_floor" };
  }

  const disposed = disposeCard(
    player.hand,
    player.discardPile,
    state.wildReserve,
    intent.cardIndex,
  );

  const players = replacePlayer(state.players, intent.playerId, (p) => ({
    ...p,
    hand: disposed.hand,
    discardPile: disposed.discardPile,
    money: p.money + LOAN_AMOUNT,
    incomeStep: move.step,
    loansTaken: p.loansTaken + 1,
  }));

  return {
    ok: true,
    state: {
      ...state,
      players,
      wildReserve: disposed.wildReserve,
      actionsRemaining: state.actionsRemaining - 1,
    },
  };
}
