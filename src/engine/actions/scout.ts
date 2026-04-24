// =============================================================================
// §5.7 Scout — discard 3 non-wild cards for 1 Wild Location + 1 Wild
// Industry.
//
// Per the spec's sanity note, step 2's "is a wild" clause is subsumed by
// step 1 (a hand with no wilds can't yield a wild-valued index), so only
// the duplicate-index clause is an independent check here.
// =============================================================================

import {
  replacePlayer,
  validateActiveTurn,
  validateCardIndex,
} from "../turn";
import type { Card, GameState, IntentScout, Result } from "../types";

export function reduceScout(state: GameState, intent: IntentScout): Result {
  const turnFail = validateActiveTurn(state, intent.playerId);
  if (turnFail !== null) return { ok: false, reason: turnFail };

  const player = state.players[intent.playerId];
  if (player === undefined) return { ok: false, reason: "not_current_turn" };

  // §5.7 step 1.
  for (const card of player.hand) {
    if (card.kind === "WILD_LOCATION" || card.kind === "WILD_INDUSTRY") {
      return { ok: false, reason: "scout_has_wild_in_hand" };
    }
  }

  // §5.7 step 2 — distinct indices.
  const [a, b, c] = intent.cardIndices;
  if (a === b || b === c || a === c) {
    return { ok: false, reason: "scout_duplicate_indices" };
  }

  // All indices in range.
  for (const idx of intent.cardIndices) {
    const cardFail = validateCardIndex(player.hand, idx);
    if (cardFail !== null) return { ok: false, reason: cardFail };
  }

  // Spec doesn't call this out explicitly, but the transfer in §5.7 step 4
  // cannot happen if the reserve is empty for either wild type.
  if (
    state.wildReserve.wildLocation < 1 ||
    state.wildReserve.wildIndustry < 1
  ) {
    return { ok: false, reason: "scout_wild_reserve_exhausted" };
  }

  // §5.7 step 3 — discard the 3 cards, preserving original hand order in
  // the discard pile. Using a set-filter keeps the remaining hand stable.
  const discardSet = new Set<number>(intent.cardIndices);
  const discarded: Card[] = [];
  const keptHand: Card[] = [];
  player.hand.forEach((card, i) => {
    if (discardSet.has(i)) discarded.push(card);
    else keptHand.push(card);
  });

  // §5.7 step 4 — add the two wilds to hand.
  const newHand: Card[] = [
    ...keptHand,
    { kind: "WILD_LOCATION" },
    { kind: "WILD_INDUSTRY" },
  ];

  const players = replacePlayer(state.players, intent.playerId, (p) => ({
    ...p,
    hand: newHand,
    discardPile: [...p.discardPile, ...discarded],
  }));

  return {
    ok: true,
    state: {
      ...state,
      players,
      wildReserve: {
        wildLocation: state.wildReserve.wildLocation - 1,
        wildIndustry: state.wildReserve.wildIndustry - 1,
      },
      actionsRemaining: state.actionsRemaining - 1,
    },
  };
}
