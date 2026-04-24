// =============================================================================
// End-of-turn / end-of-round / end-of-era orchestration.
//
// §4.2 step 6  — END_TURN ends the dispatching seat's turn.
// §4.3         — end-of-round: reseat by spent, reset spent, collect income
//                (skipped in the final round per §4.3 step 2), refill hands
//                (seats shrink by actionsForRound once deck is empty), bump
//                round, reset seat + actions. If every hand is 0 and the
//                deck is empty, era-end triggers instead of the round bump.
// §6.4 / §6.5  — end-of-era: score links + flipped tiles (§6.1 / §6.2);
//                canal era additionally removes level-1 tiles, refills
//                merchant beer, reshuffles the deck from all discards,
//                restores link supply, flips era to RAIL, refills hands
//                back to 8. Rail end just sets phase = GAME_OVER.
//
// Simplifications vs. spec, to be addressed in later milestones:
//   * §4.3 step 2 shortfall tile-removal sub-flow (requires player choice);
//     current code converts unpayable debt to VP loss clamped at 0 VP.
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

  // §4.3 step 1 — reseat by spent asc, stable on ties.
  working = { ...working, turnOrder: reseatByLowestSpend(working) };

  // §4.3 step 1 (cont.) — reset spent_this_round.
  working = {
    ...working,
    players: working.players.map((p) => ({ ...p, spentThisRound: 0 })),
  };

  // §4.3 step 2 — collect income EXCEPT in the final round of each era.
  if (!isFinalRound(working)) {
    working = {
      ...working,
      players: working.players.map((p) => collectIncome(p)),
    };
  }

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

/** Simplified income collection. Spec §4.3 step 2's tile-removal
 * shortfall sub-flow is deferred; unpayable debt converts directly to
 * VP loss, clamped at 0 VP. */
function collectIncome(player: Player): Player {
  const level = stepToLevel(player.incomeStep);
  if (level >= 0) return { ...player, money: player.money + level };
  const owed = -level;
  if (player.money >= owed) return { ...player, money: player.money - owed };
  const paidFromMoney = player.money;
  const remainingDebt = owed - paidFromMoney;
  const vpLoss = Math.min(remainingDebt, player.vp);
  return { ...player, money: 0, vp: player.vp - vpLoss };
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
