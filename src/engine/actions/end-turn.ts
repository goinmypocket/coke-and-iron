// =============================================================================
// End-of-turn / end-of-round orchestration (§4.2 step 6, §4.3).
//
// END_TURN advances the dispatching seat past turnOrder[currentPlayerIndex].
// If that seat was the last of the round, the engine then:
//
//   1. Recomputes turn order by spent_this_round ascending (stable ties).
//   2. Resets every seat's spent_this_round.
//   3. Collects income (§6.3 ladder). Negative income may trigger the
//      shortfall sub-flow — TILE-REMOVAL IS DEFERRED. This milestone
//      converts unpayable debt directly to VP loss (clamped at 0 VP).
//   4. Refills hands back to 8 (§4.3 step 3). Once the deck empties the
//      remaining seats shrink by the round's actions-per-seat count.
//   5. Increments round and sets actionsRemaining per §3.4.
//
// Era end (§6.4 / §6.5) is not handled yet; this milestone just increments
// round indefinitely.
//
// The auto-advance wrapper in reduce.ts calls runEndOfTurn() when an action
// drops actionsRemaining to 0 and state.autoEndTurn is true, so §3.5's
// "chain dispatches" behaviour comes for free.
// =============================================================================

import { stepToLevel } from "../income";
import type {
  Card,
  Era,
  GameState,
  IntentEndTurn,
  Player,
  PlayerId,
  Result,
} from "../types";

const DEFAULT_HAND_SIZE = 8;

export function reduceEndTurn(state: GameState, intent: IntentEndTurn): Result {
  // Phase + current-seat guard. We can't reuse validateActiveTurn verbatim
  // because it also checks actionsRemaining > 0; END_TURN wants the
  // opposite — actionsRemaining MUST be 0.
  if (state.phase === "GAME_OVER") {
    return { ok: false, reason: "game_over" };
  }
  const activeId = state.turnOrder[state.currentPlayerIndex];
  if (activeId === undefined || intent.playerId !== activeId) {
    return { ok: false, reason: "not_current_turn" };
  }
  if (state.actionsRemaining > 0) {
    return { ok: false, reason: "actions_still_remaining" };
  }
  return { ok: true, state: runEndOfTurn(state) };
}

/**
 * Advance one seat. If past the last seat in turnOrder, run end-of-round.
 * Used by END_TURN and by reduce.ts's auto-advance wrapper.
 */
export function runEndOfTurn(state: GameState): GameState {
  const nextIdx = state.currentPlayerIndex + 1;
  if (nextIdx < state.turnOrder.length) {
    return {
      ...state,
      currentPlayerIndex: nextIdx,
      actionsRemaining: actionsForRound(state.round, state.era),
    };
  }
  return runEndOfRound(state);
}

export function actionsForRound(round: number, era: Era): number {
  // §3.4: only the very first Canal round gives 1 action per seat.
  if (era === "CANAL" && round === 1) return 1;
  return 2;
}

// -----------------------------------------------------------------------------
// End-of-round pipeline (§4.3)
// -----------------------------------------------------------------------------

function runEndOfRound(state: GameState): GameState {
  let working = state;

  // 1. Recompute turn order: spent asc, stable ties (decorate-sort-undecorate
  //    makes the sort deterministic even if the JS engine's sort isn't).
  working = {
    ...working,
    turnOrder: reseatByLowestSpend(working),
  };

  // 2. Reset spent_this_round for every seat.
  working = {
    ...working,
    players: working.players.map((p) => ({ ...p, spentThisRound: 0 })),
  };

  // 3. Collect income (simplified shortfall: VP loss only).
  working = {
    ...working,
    players: working.players.map((p) => collectIncome(p)),
  };

  // 4. Refill hands in the NEW turn order. Seats whose turn to refill arrives
  //    after the deck empties shrink by actionsForRound instead.
  working = refillHands(working);

  // 5. Bump round, reset seat index + actions.
  const nextRound = working.round + 1;
  return {
    ...working,
    round: nextRound,
    currentPlayerIndex: 0,
    actionsRemaining: actionsForRound(nextRound, working.era),
  };
}

function reseatByLowestSpend(state: GameState): PlayerId[] {
  const decorated = state.turnOrder.map((id, i) => ({
    id,
    spent: state.players.find((p) => p.id === id)?.spentThisRound ?? 0,
    i,
  }));
  decorated.sort((a, b) => a.spent - b.spent || a.i - b.i);
  return decorated.map((d) => d.id);
}

/**
 * Simplified income collection. TODO: hook up the spec's tile-removal
 * shortfall sub-flow — needs a player-choice sub-phase.
 */
function collectIncome(player: Player): Player {
  const level = stepToLevel(player.incomeStep);
  if (level >= 0) {
    return { ...player, money: player.money + level };
  }
  const owed = -level;
  if (player.money >= owed) {
    return { ...player, money: player.money - owed };
  }
  const paidFromMoney = player.money;
  const remainingDebt = owed - paidFromMoney;
  const vpLoss = Math.min(remainingDebt, player.vp);
  return { ...player, money: 0, vp: player.vp - vpLoss };
}

function refillHands(state: GameState): GameState {
  const deck = [...state.drawDeck];
  const actionsThisRound = actionsForRound(state.round, state.era);

  // Refill in the (newly recomputed) turn order.
  const handsBySeat = new Map<PlayerId, Card[]>();
  for (const p of state.players) handsBySeat.set(p.id, [...p.hand]);

  for (const seatId of state.turnOrder) {
    const hand = handsBySeat.get(seatId)!;
    if (deck.length === 0) {
      // Deck is empty before this seat gets a chance to refill — shrink.
      const keep = Math.max(0, hand.length - actionsThisRound);
      handsBySeat.set(seatId, hand.slice(0, keep));
      continue;
    }
    const needed = Math.max(0, DEFAULT_HAND_SIZE - hand.length);
    const take = Math.min(needed, deck.length);
    const drawn = deck.splice(0, take);
    handsBySeat.set(seatId, [...hand, ...drawn]);
  }

  const players = state.players.map((p) => ({
    ...p,
    hand: handsBySeat.get(p.id) ?? p.hand,
  }));
  return { ...state, players, drawDeck: deck };
}
