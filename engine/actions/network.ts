// =============================================================================
// §5.2 Network — develop 1 or 2 link tiles on canal/rail lines.
//
// Engine steps:
//   1. Discard the card (done as part of disposal at the end).
//   2. Verify the line is undeveloped and of the current era.
//   3. Verify the line is adjacent to the player's network, OR the network
//      is empty (first-action exemption).
//   4. Deduct costs:
//        Canal era:           £3.
//        Rail era, first:     £5 + 1 coal.
//        Rail era, second:    +£10 + 1 coal + 1 beer.
//   5. Consume coal from the declared source list (§5.6.1); consumers are
//      the line's endpoints.
//   6. Consume beer (brewery only) for the second rail link.
//   7. Place link tile; decrement link supply.
//
// For the second rail, adjacency is evaluated AFTER the first tile is
// placed, so the first link's endpoints are legitimately in-network when
// the second is checked.
// =============================================================================

import { isInPlayerNetwork, isPlayerNetworkEmpty } from "../network/graph";
import { consumeBeerFromBrewery } from "../sources/beer";
import { consumeCoal } from "../sources/coal";
import {
  disposeCard,
  replacePlayer,
  validateActiveTurn,
  validateCardIndex,
} from "../turn";
import type {
  FailureReason,
  GameState,
  IntentNetwork,
  Line,
  PlayerId,
  Result,
} from "../types";

const CANAL_LINK_COST = 3;
const RAIL_FIRST_COST = 5;
const RAIL_FIRST_COAL = 1;
const RAIL_SECOND_COST = 10;
const RAIL_SECOND_COAL = 1;

export function reduceNetwork(state: GameState, intent: IntentNetwork): Result {
  const turnFail = validateActiveTurn(state, intent.playerId);
  if (turnFail !== null) return { ok: false, reason: turnFail };

  const player = state.players[intent.playerId];
  if (player === undefined) return { ok: false, reason: "not_current_turn" };

  const cardFail = validateCardIndex(player.hand, intent.cardIndex);
  if (cardFail !== null) return { ok: false, reason: cardFail };

  // Canal era accepts only single-link Network actions.
  if (state.era === "CANAL" && intent.secondLink !== null) {
    return { ok: false, reason: "line_wrong_era" };
  }

  // Coal declaration shape check against era (each link takes 0 or 1 coal).
  const expectedFirstCoal = state.era === "CANAL" ? 0 : RAIL_FIRST_COAL;
  if (intent.coalSources.length !== expectedFirstCoal) {
    return { ok: false, reason: "coal_source_invalid" };
  }

  // Link supply — 1 for single, 2 for double.
  const linksToPlace = intent.secondLink === null ? 1 : 2;
  if (player.linkSupply < linksToPlace) {
    return { ok: false, reason: "link_supply_empty" };
  }

  // --- First link validation ---
  const firstLineFail = validateLineAvailable(state, intent.lineIndex);
  if (firstLineFail !== null) return { ok: false, reason: firstLineFail };
  const firstLine = state.lines[intent.lineIndex]!;

  if (
    !isPlayerNetworkEmpty(state, intent.playerId) &&
    !isLineAdjacent(state, intent.playerId, firstLine)
  ) {
    return { ok: false, reason: "line_not_adjacent" };
  }

  // --- Consume first-link coal ---
  let working = state;
  let totalSpent = firstLineMoneyCost(state.era);

  const firstCoal = consumeCoal(
    working,
    expectedFirstCoal,
    intent.coalSources,
    firstLine.endpoints,
  );
  if (!firstCoal.ok) return firstCoal;
  working = firstCoal.state;
  totalSpent += firstCoal.moneySpent;

  // --- Place first link (before validating the second so its adjacency
  // sees the newly-developed link). ---
  working = {
    ...working,
    developedLinks: [
      ...working.developedLinks,
      { owner: intent.playerId, lineIndex: intent.lineIndex },
    ],
  };

  // --- Second link, if any ---
  if (intent.secondLink !== null) {
    const sl = intent.secondLink;

    if (sl.coalSources.length !== RAIL_SECOND_COAL) {
      return { ok: false, reason: "coal_source_invalid" };
    }
    if (sl.lineIndex === intent.lineIndex) {
      // Same line declared twice — will also fail the "already developed"
      // check below, but flag it early with a clearer signal.
      return { ok: false, reason: "line_already_developed" };
    }

    const secondLineFail = validateLineAvailable(working, sl.lineIndex);
    if (secondLineFail !== null) {
      return { ok: false, reason: secondLineFail };
    }
    const secondLine = working.lines[sl.lineIndex]!;

    // Adjacency after first placement: at this point the player is never
    // "empty-network" (we just placed a link), so the exemption is moot.
    if (!isLineAdjacent(working, intent.playerId, secondLine)) {
      return { ok: false, reason: "line_not_adjacent" };
    }

    const secondCoal = consumeCoal(
      working,
      RAIL_SECOND_COAL,
      sl.coalSources,
      secondLine.endpoints,
    );
    if (!secondCoal.ok) return secondCoal;
    working = secondCoal.state;
    totalSpent += RAIL_SECOND_COST + secondCoal.moneySpent;

    const beer = consumeBeerFromBrewery(
      working,
      sl.beerSource.tileId,
      secondLine.endpoints,
      intent.playerId,
    );
    if (!beer.ok) return beer;
    working = beer.state;

    working = {
      ...working,
      developedLinks: [
        ...working.developedLinks,
        { owner: intent.playerId, lineIndex: sl.lineIndex },
      ],
    };
  }

  // --- Funds check on accumulated spend ---
  const playerAfter = working.players.find((p) => p.id === intent.playerId);
  if (playerAfter === undefined) {
    return { ok: false, reason: "not_current_turn" };
  }
  if (playerAfter.money < totalSpent) {
    return { ok: false, reason: "insufficient_funds" };
  }

  // --- Apply money, spent_this_round, link supply, card disposal ---
  const disposed = disposeCard(
    playerAfter.hand,
    playerAfter.discardPile,
    working.wildReserve,
    intent.cardIndex,
  );

  working = {
    ...working,
    players: replacePlayer(working.players, intent.playerId, (p) => ({
      ...p,
      money: p.money - totalSpent,
      spentThisRound: p.spentThisRound + totalSpent,
      linkSupply: p.linkSupply - linksToPlace,
      hand: disposed.hand,
      discardPile: disposed.discardPile,
    })),
    wildReserve: disposed.wildReserve,
    actionsRemaining: working.actionsRemaining - 1,
  };

  return { ok: true, state: working };
}

// -----------------------------------------------------------------------------

function firstLineMoneyCost(era: "CANAL" | "RAIL"): number {
  return era === "CANAL" ? CANAL_LINK_COST : RAIL_FIRST_COST;
}

function validateLineAvailable(
  state: GameState,
  lineIndex: number,
): FailureReason | null {
  const line = state.lines[lineIndex];
  if (line === undefined) return "line_already_developed"; // out-of-range → treat as unavailable
  if (line.era !== state.era) return "line_wrong_era";
  if (state.developedLinks.some((dl) => dl.lineIndex === lineIndex)) {
    return "line_already_developed";
  }
  return null;
}

function isLineAdjacent(
  state: GameState,
  playerId: PlayerId,
  line: Line,
): boolean {
  return line.endpoints.some((city) =>
    isInPlayerNetwork(state, playerId, city),
  );
}
