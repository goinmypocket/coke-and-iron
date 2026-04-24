// =============================================================================
// Turn-flow helpers shared by every §5 action.
//
// Each exported helper is pure: it returns new values rather than mutating
// its inputs. The reducer composes these to produce the new GameState.
// Keeping them here means rules like "the active seat is turnOrder[idx]"
// or "wilds return to the wild reserve" have ONE implementation that the
// Build / Loan / Sell etc. cases all lean on.
// =============================================================================

import type {
  Card,
  FailureReason,
  Player,
  PlayerId,
  WildReserve,
} from "./types";
import type { GameState } from "./types";

/**
 * Is it legal to dispatch an action right now for this player?
 * Returns null on success, or the FailureReason to surface on reject.
 * Checks §4.2: phase alive, dispatching seat matches turn order, actions
 * left.
 */
export function validateActiveTurn(
  state: GameState,
  playerId: PlayerId,
): FailureReason | null {
  if (state.phase === "GAME_OVER") return "game_over";
  const activeId = state.turnOrder[state.currentPlayerIndex];
  if (activeId === undefined || playerId !== activeId) {
    return "not_current_turn";
  }
  if (state.actionsRemaining <= 0) return "no_actions_remaining";
  return null;
}

/** Check cardIndex is in-range for the given hand. */
export function validateCardIndex(
  hand: readonly Card[],
  cardIndex: number,
): FailureReason | null {
  if (
    !Number.isInteger(cardIndex) ||
    cardIndex < 0 ||
    cardIndex >= hand.length
  ) {
    return "card_not_in_hand";
  }
  return null;
}

/**
 * §5 preamble card disposal: wild cards return to the wild reserve; every
 * other card goes to the player's discard pile. Returns new hand, new
 * discard pile, and new wild reserve — all freshly allocated so the
 * caller can build a new Player without mutating the old one.
 */
export function disposeCard(
  hand: readonly Card[],
  discardPile: readonly Card[],
  wildReserve: WildReserve,
  cardIndex: number,
): {
  hand: Card[];
  discardPile: Card[];
  wildReserve: WildReserve;
} {
  const card = hand[cardIndex];
  if (card === undefined) {
    throw new Error(
      `disposeCard: cardIndex ${cardIndex} out of range for hand of ${hand.length}`,
    );
  }
  const newHand = hand.slice(0, cardIndex).concat(hand.slice(cardIndex + 1));

  if (card.kind === "WILD_LOCATION") {
    return {
      hand: newHand,
      discardPile: [...discardPile],
      wildReserve: {
        ...wildReserve,
        wildLocation: wildReserve.wildLocation + 1,
      },
    };
  }
  if (card.kind === "WILD_INDUSTRY") {
    return {
      hand: newHand,
      discardPile: [...discardPile],
      wildReserve: {
        ...wildReserve,
        wildIndustry: wildReserve.wildIndustry + 1,
      },
    };
  }
  return {
    hand: newHand,
    discardPile: [...discardPile, card],
    wildReserve,
  };
}

/**
 * Return a new players array with the seat at `playerId` replaced by
 * `mutate(oldPlayer)`. Safe no-op if the seat doesn't exist (though that
 * would indicate a caller-side invariant break).
 */
export function replacePlayer(
  players: readonly Player[],
  playerId: PlayerId,
  mutate: (p: Player) => Player,
): Player[] {
  return players.map((p) => (p.id === playerId ? mutate(p) : p));
}
