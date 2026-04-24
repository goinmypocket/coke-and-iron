// =============================================================================
// §5.8 Pass — discard one card; no other effect.
// =============================================================================

import {
  disposeCard,
  replacePlayer,
  validateActiveTurn,
  validateCardIndex,
} from "../turn";
import type { GameState, IntentPass, Result } from "../types";

export function reducePass(state: GameState, intent: IntentPass): Result {
  const turnFail = validateActiveTurn(state, intent.playerId);
  if (turnFail !== null) return { ok: false, reason: turnFail };

  const player = state.players[intent.playerId];
  if (player === undefined) return { ok: false, reason: "not_current_turn" };

  const cardFail = validateCardIndex(player.hand, intent.cardIndex);
  if (cardFail !== null) return { ok: false, reason: cardFail };

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
