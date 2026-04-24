// =============================================================================
// §5.1 Build — place an industry tile from the mat onto an empty city slot.
//
// Engine steps mirror the spec §5.1:
//   1. Verify the card authorises the build (location vs. industry + network)
//   2. Verify the chosen slot accepts the industry, enforcing specific-
//      before-combo
//   3. Pop the lowest-level tile of that industry from the mat, respecting
//      era restrictions
//   4. Deduct the money cost (reject on insufficient funds)
//   5. Consume coal then iron per §5.6
//   6. Place the tile (stamp owner, location, live resource count)
//   7. Move-to-market for Coal Mine / Iron Works (§5.1.1)
//   8. If the tile is now at 0 resources, flip it and advance income
//
// Subsections covered here:
//   §5.1.2 — farm-brewery card restriction
//   §5.1.4 — one-tile-per-location (Canal era only)
//
// Deferred to the next milestone:
//   §5.1.3 — overbuild; for now any occupied slot rejects
// =============================================================================

import {
  isConnectedToAnyMerchantCity,
  isInPlayerNetwork,
  isPlayerNetworkEmpty,
} from "../network/graph";
import { consumeCoal } from "../sources/coal";
import { consumeIron } from "../sources/iron";
import { moveCubesToMarket } from "../sources/market-move";
import {
  disposeCard,
  replacePlayer,
  validateActiveTurn,
  validateCardIndex,
} from "../turn";
import type {
  Card,
  DistrictCity,
  Era,
  FailureReason,
  GameState,
  IndustryName,
  IndustryTileSpec,
  IntentBuild,
  PlacedIndustryTile,
  PlayerId,
  Result,
  SlotSpec,
} from "../types";

export function reduceBuild(state: GameState, intent: IntentBuild): Result {
  const turnFail = validateActiveTurn(state, intent.playerId);
  if (turnFail !== null) return { ok: false, reason: turnFail };

  const player = state.players[intent.playerId];
  if (player === undefined) return { ok: false, reason: "not_current_turn" };

  const cardFail = validateCardIndex(player.hand, intent.cardIndex);
  if (cardFail !== null) return { ok: false, reason: cardFail };
  const card = player.hand[intent.cardIndex]!;

  const city = state.districtCities.find((c) => c.name === intent.cityName);
  if (city === undefined) {
    return { ok: false, reason: "slot_does_not_accept_industry" };
  }

  // --- Step 1: card authorisation ---
  const cardFailReason = validateCardAuthorises(
    card,
    city,
    intent.industry,
    state,
    intent.playerId,
  );
  if (cardFailReason !== null) return { ok: false, reason: cardFailReason };

  // --- §5.1.2: farm-brewery card restriction ---
  if (city.farmBrewery && isLocationCard(card)) {
    return { ok: false, reason: "farm_brewery_wrong_card" };
  }

  // --- Step 2: slot accept + specific-before-combo ---
  const slotFail = validateSlotAccept(
    city,
    intent.slotIndex,
    intent.industry,
    state.builtTiles,
  );
  if (slotFail !== null) return { ok: false, reason: slotFail };

  // Slot occupancy: this milestone rejects any occupied slot (overbuild
  // comes later).
  if (slotOccupied(state, intent.cityName, intent.slotIndex)) {
    return { ok: false, reason: "slot_occupied_overbuild_invalid" };
  }

  // --- §5.1.4: one-tile-per-city in Canal era ---
  if (state.era === "CANAL" && playerOwnsTileIn(state, intent.playerId, intent.cityName)) {
    return { ok: false, reason: "one_tile_per_city_canal" };
  }

  // --- Step 3: pop mat tile ---
  const stack = player.mat.stacks[intent.industry];
  if (stack.length === 0) {
    return { ok: false, reason: "mat_stack_empty" };
  }
  const catalogueIndex = stack[0]!;
  const spec = state.tileCatalogue[catalogueIndex];
  if (spec === undefined) return { ok: false, reason: "mat_stack_empty" };
  if (!isTileEligibleForEra(spec, state.era)) {
    return { ok: false, reason: "tile_wrong_era" };
  }

  // --- Steps 4 + 5: consume resources, compute total cost, verify funds ---
  let working = state;
  const coalResult = consumeCoal(
    working,
    spec.coalCost,
    intent.coalSources,
    [intent.cityName],
  );
  if (!coalResult.ok) return coalResult;
  working = coalResult.state;

  const ironResult = consumeIron(working, spec.ironCost, intent.ironSources);
  if (!ironResult.ok) return ironResult;
  working = ironResult.state;

  const totalSpent =
    spec.costMoney + coalResult.moneySpent + ironResult.moneySpent;
  // Re-read acting player from working state — coal/iron consumption can
  // have advanced their income if they drained their own tile.
  const playerAfterConsumption = working.players.find(
    (p) => p.id === intent.playerId,
  );
  if (playerAfterConsumption === undefined) {
    return { ok: false, reason: "not_current_turn" };
  }
  if (playerAfterConsumption.money < totalSpent) {
    return { ok: false, reason: "insufficient_funds" };
  }

  // --- Step 6: place the tile ---
  const tileId = `tile-${working.nextTileId}`;
  const resourceCapacity = pickResourceCapacity(spec, working.era);
  const placedTile: PlacedIndustryTile = {
    id: tileId,
    owner: intent.playerId,
    cityName: intent.cityName,
    slotIndex: intent.slotIndex,
    catalogueIndex,
    resources: resourceCapacity,
    flipped: false,
  };

  // Pop from mat, deduct money, credit spent_this_round, dispose card.
  const disposed = disposeCard(
    playerAfterConsumption.hand,
    playerAfterConsumption.discardPile,
    working.wildReserve,
    intent.cardIndex,
  );

  working = {
    ...working,
    players: replacePlayer(working.players, intent.playerId, (p) => ({
      ...p,
      money: p.money - totalSpent,
      spentThisRound: p.spentThisRound + totalSpent,
      hand: disposed.hand,
      discardPile: disposed.discardPile,
      mat: {
        stacks: {
          ...p.mat.stacks,
          [intent.industry]: stack.slice(1),
        },
      },
    })),
    wildReserve: disposed.wildReserve,
    builtTiles: [...working.builtTiles, placedTile],
    nextTileId: working.nextTileId + 1,
  };

  // --- Step 7: move-to-market auto-sell for resource producers ---
  if (spec.industry === "COAL_MINE") {
    if (isConnectedToAnyMerchantCity(working, intent.cityName)) {
      const moved = moveCubesToMarket(working, tileId, "coalMarket");
      working = {
        ...moved.state,
        players: replacePlayer(
          moved.state.players,
          intent.playerId,
          (p) => ({ ...p, money: p.money + moved.ownerGain }),
        ),
      };
    }
  } else if (spec.industry === "IRON_WORKS") {
    const moved = moveCubesToMarket(working, tileId, "ironMarket");
    working = {
      ...moved.state,
      players: replacePlayer(
        moved.state.players,
        intent.playerId,
        (p) => ({ ...p, money: p.money + moved.ownerGain }),
      ),
    };
  }
  // Non-resource tiles (Cotton / Manufacturer / Pottery) have
  // resourceCapacity 0 so they are "already drained" — the §5.1 step 8
  // flip-if-zero rule would fire, but per §2.10 those tiles flip only on
  // Sell, not on placement. So we do NOT auto-flip them here. Breweries
  // keep their barrels until consumed.

  return {
    ok: true,
    state: {
      ...working,
      actionsRemaining: working.actionsRemaining - 1,
    },
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function validateCardAuthorises(
  card: Card,
  city: DistrictCity,
  industry: IndustryName,
  state: GameState,
  playerId: PlayerId,
): FailureReason | null {
  switch (card.kind) {
    case "LOCATION":
      if (card.cityName !== city.name) return "card_does_not_authorise";
      return null;
    case "WILD_LOCATION":
      return null;
    case "INDUSTRY": {
      if (card.industry !== industry) return "card_does_not_authorise";
      return checkNetwork(state, playerId, city.name);
    }
    case "WILD_INDUSTRY":
      return checkNetwork(state, playerId, city.name);
    case "DUAL_COTTON_MANUFACTURER": {
      if (industry !== "COTTON_MILL" && industry !== "MANUFACTURER") {
        return "card_does_not_authorise";
      }
      return checkNetwork(state, playerId, city.name);
    }
  }
}

function checkNetwork(
  state: GameState,
  playerId: PlayerId,
  city: string,
): FailureReason | null {
  if (isPlayerNetworkEmpty(state, playerId)) return null;
  if (isInPlayerNetwork(state, playerId, city)) return null;
  return "not_in_network";
}

function isLocationCard(card: Card): boolean {
  return card.kind === "LOCATION" || card.kind === "WILD_LOCATION";
}

function validateSlotAccept(
  city: DistrictCity,
  slotIndex: number,
  industry: IndustryName,
  builtTiles: readonly PlacedIndustryTile[],
): FailureReason | null {
  const slot = city.slots[slotIndex];
  if (slot === undefined) return "slot_does_not_accept_industry";
  if (!slotAccepts(slot, industry)) {
    return "slot_does_not_accept_industry";
  }
  // Specific-before-combo: chosen slot is combo (length > 1) AND some
  // other EMPTY slot in the same city is specific (length == 1) for the
  // chosen industry.
  if (slot.acceptList.length > 1) {
    for (let i = 0; i < city.slots.length; i++) {
      if (i === slotIndex) continue;
      const other = city.slots[i]!;
      if (other.acceptList.length === 1 && other.acceptList[0] === industry) {
        const occupied = builtTiles.some(
          (t) => t.cityName === city.name && t.slotIndex === i,
        );
        if (!occupied) return "specific_slot_available";
      }
    }
  }
  return null;
}

function slotAccepts(slot: SlotSpec, industry: IndustryName): boolean {
  return slot.acceptList.length === 0 || slot.acceptList.includes(industry);
}

function slotOccupied(
  state: GameState,
  cityName: string,
  slotIndex: number,
): boolean {
  return state.builtTiles.some(
    (t) => t.cityName === cityName && t.slotIndex === slotIndex,
  );
}

function playerOwnsTileIn(
  state: GameState,
  playerId: PlayerId,
  cityName: string,
): boolean {
  return state.builtTiles.some(
    (t) => t.owner === playerId && t.cityName === cityName,
  );
}

function isTileEligibleForEra(
  spec: IndustryTileSpec,
  era: Era,
): boolean {
  if (spec.canalOnly && era === "RAIL") return false;
  if (spec.railOnly && era === "CANAL") return false;
  return true;
}

function pickResourceCapacity(spec: IndustryTileSpec, era: Era): number {
  if (era === "RAIL" && spec.resourceCapacityRail !== null) {
    return spec.resourceCapacityRail;
  }
  return spec.resourceCapacity;
}
