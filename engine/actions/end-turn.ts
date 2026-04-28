// =============================================================================
// End-of-turn / end-of-round / end-of-era orchestration.
//
// §4.2 step 6  — END_TURN ends the dispatching seat's turn.
// §4.3         — end-of-round: reseat by spent, reset spent, collect income
//                (skipped in the final round per §4.3 step 2). If any seat
//                couldn't cover their negative income, queue a shortfall
//                entry and HALT — the affected players resolve via
//                RESOLVE_SHORTFALL. Once the queue is empty, refill hands
//                and check era end.
// §6.4 / §6.5  — end-of-era: score links + flipped tiles (§6.1 / §6.2);
//                canal era additionally removes level-1 tiles, refills
//                merchant beer, reshuffles the deck from all discards,
//                restores link supply, flips era to RAIL, refills hands
//                back to 8. Rail end just sets phase = GAME_OVER.
// =============================================================================

import { stepToLevel } from "../income";
import { shuffle } from "../rng";
import { applyScoring } from "../scoring";
import type {
  Card,
  Era,
  GameState,
  IntentEndTurn,
  PlacedIndustryTile,
  Player,
  PlayerCount,
  PlayerId,
  Result,
  ShortfallEntry,
} from "../types";

const DEFAULT_HAND_SIZE = 8;
const LINK_SUPPLY_PER_ERA = 14; // §2.7

/**
 * §4.4 — rounds per era table. Each table entry is the LAST round of
 * that era given the player count; round numbers reset to 1 at era flip.
 */
const LAST_ROUND: Readonly<Record<PlayerCount, number>> = {
  2: 10,
  3: 9,
  4: 8,
};

export function reduceEndTurn(
  state: GameState,
  intent: IntentEndTurn,
): Result {
  if (state.phase === "GAME_OVER") {
    return { ok: false, reason: "game_over" };
  }
  if (state.pendingShortfalls.length > 0) {
    return { ok: false, reason: "shortfall_resolution_required" };
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
  if (era === "CANAL" && round === 1) return 1;
  return 2;
}

function isFinalRound(state: GameState): boolean {
  return state.round === LAST_ROUND[state.playerCount];
}

// -----------------------------------------------------------------------------
// End-of-round pipeline (§4.3)
// -----------------------------------------------------------------------------

function runEndOfRound(state: GameState): GameState {
  let working = state;

  // §4.3 step 1 — reseat by spent asc, stable on ties; reset
  // spent_this_round.
  working = { ...working, turnOrder: reseatByLowestSpend(working) };
  working = {
    ...working,
    players: working.players.map((p) => ({ ...p, spentThisRound: 0 })),
  };

  // §4.3 step 2 — collect income EXCEPT in the final round of each era.
  // Players who can't cover negative income produce a shortfall entry.
  if (!isFinalRound(working)) {
    working = collectIncomeAndQueueShortfalls(working);
  }

  // If any shortfalls are pending, halt here. The affected players
  // dispatch RESOLVE_SHORTFALL until the queue empties; the last
  // resolution then calls continueEndOfRoundPostShortfall().
  if (working.pendingShortfalls.length > 0) return working;

  return continueEndOfRoundPostShortfall(working);
}

/**
 * Steps 3 + 4 of §4.3, plus the era-end check and the round bump. Called
 * either directly by runEndOfRound (when no shortfalls are queued) or by
 * the RESOLVE_SHORTFALL reducer once the last queue entry is popped.
 */
export function continueEndOfRoundPostShortfall(state: GameState): GameState {
  let working = state;
  // §4.3 step 3 — refill hands, shrink seats when the deck empties.
  working = refillHands(working);

  // §4.3 step 4 — era end triggers if every hand is 0 and the deck is 0.
  const eraEnding =
    working.drawDeck.length === 0 &&
    working.players.every((p) => p.hand.length === 0);
  if (eraEnding) {
    return working.era === "CANAL"
      ? runEndOfCanalEra(working)
      : runEndOfRailEra(working);
  }

  // Normal round bump.
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
 * §4.3 step 2 income collection. Players who can't cover their negative
 * income hand over all remaining cash and have a shortfall entry queued
 * — the actual tile-removal happens via RESOLVE_SHORTFALL. Returns a new
 * GameState with money/vp adjusted and pendingShortfalls populated in
 * turn-order.
 */
function collectIncomeAndQueueShortfalls(state: GameState): GameState {
  const newQueue: ShortfallEntry[] = [...state.pendingShortfalls];
  const players = state.players.map((p) => {
    const level = stepToLevel(p.incomeStep);
    if (level >= 0) return { ...p, money: p.money + level };
    const owed = -level;
    if (p.money >= owed) return { ...p, money: p.money - owed };
    // Shortfall: take everything they have; queue the rest as debt.
    const remaining = owed - p.money;
    return { ...p, money: 0, _shortfall: remaining };
  });
  // Walk turn order so the queue is ordered by lowest-spent-first.
  for (const seatId of state.turnOrder) {
    const p = players.find((pp) => pp.id === seatId);
    if (!p) continue;
    const debt = (p as Player & { _shortfall?: number })._shortfall;
    if (debt && debt > 0) {
      newQueue.push({ playerId: seatId, owed: debt });
    }
  }
  // Strip the temporary _shortfall annotation before returning.
  const cleanedPlayers: Player[] = players.map((p) => {
    const { _shortfall: _omit, ...rest } =
      p as Player & { _shortfall?: number };
    return rest as Player;
  });
  return { ...state, players: cleanedPlayers, pendingShortfalls: newQueue };
}

function refillHands(state: GameState): GameState {
  const deck = [...state.drawDeck];
  const actionsThisRound = actionsForRound(state.round, state.era);

  const handsBySeat = new Map<PlayerId, Card[]>();
  for (const p of state.players) handsBySeat.set(p.id, [...p.hand]);

  for (const seatId of state.turnOrder) {
    const hand = handsBySeat.get(seatId)!;
    if (deck.length === 0) {
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

// -----------------------------------------------------------------------------
// End of Canal era (§6.4)
// -----------------------------------------------------------------------------

function runEndOfCanalEra(state: GameState): GameState {
  // Step 1-2: score links + flipped tiles.
  let working = applyScoring(state).state;

  // Step 1 "Remove each as it scores" — all link tiles retire at canal end.
  working = { ...working, developedLinks: [] };

  // Step 3: remove every level-1 industry tile from the board.
  working = {
    ...working,
    builtTiles: working.builtTiles.filter(
      (t) => !isLevelOne(working, t),
    ),
  };

  // Step 4: refill merchant beer — 1 barrel on every non-BLANK slot.
  working = {
    ...working,
    merchantSlots: working.merchantSlots.map((s) =>
      s.accept === "BLANK" ? s : { ...s, hasBeer: true },
    ),
  };

  // Step 5: reshuffle — combine all discards with the (empty) draw deck
  // and shuffle using a CLONED rng so replay / preview stay safe.
  working = reshuffleDeckFromDiscards(working);

  // Restore per-seat link supply to 14 for the rail era (§2.7; the canal
  // link tiles were retired at scoring, and rail links are a fresh pool).
  working = {
    ...working,
    players: working.players.map((p) => ({
      ...p,
      linkSupply: LINK_SUPPLY_PER_ERA,
    })),
  };

  // Step 6: era = RAIL.
  working = { ...working, era: "RAIL" };

  // Step 7: refill hands back to 8 from the new draw deck.
  working = refillAllHandsToEight(working);

  // Reset round numbering for the rail era.
  return {
    ...working,
    round: 1,
    currentPlayerIndex: 0,
    actionsRemaining: actionsForRound(1, "RAIL"),
  };
}

function isLevelOne(state: GameState, tile: PlacedIndustryTile): boolean {
  const spec = state.tileCatalogue[tile.catalogueIndex];
  return spec?.level === 1;
}

function reshuffleDeckFromDiscards(state: GameState): GameState {
  const rng = state.rng.clone();
  const allDiscards: Card[] = state.players.flatMap((p) => p.discardPile);
  const combined: Card[] = [...state.drawDeck, ...allDiscards];
  const shuffled = shuffle(combined, rng);
  return {
    ...state,
    rng,
    drawDeck: shuffled,
    players: state.players.map((p) => ({ ...p, discardPile: [] })),
  };
}

function refillAllHandsToEight(state: GameState): GameState {
  const deck = [...state.drawDeck];
  const handsBySeat = new Map<PlayerId, Card[]>();
  for (const p of state.players) handsBySeat.set(p.id, [...p.hand]);
  for (const seatId of state.turnOrder) {
    const hand = handsBySeat.get(seatId)!;
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

// -----------------------------------------------------------------------------
// End of Rail era (§6.5)
// -----------------------------------------------------------------------------

function runEndOfRailEra(state: GameState): GameState {
  // Only rail links remain on the board; canal links were retired at the
  // canal-era flip. Canal-era flipped tiles that survived (non-level-1)
  // are still present and score again per §6.2.
  const scored = applyScoring(state).state;
  return {
    ...scored,
    phase: "GAME_OVER",
    actionsRemaining: 0,
  };
}
