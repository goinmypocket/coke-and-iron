// =============================================================================
// §5.1 Build — place an industry tile from the mat onto a city slot.
//
// Engine steps mirror the spec §5.1:
//   1. Verify the card authorises the build (location vs. industry + network)
//   2. Verify the chosen slot accepts the industry, enforcing specific-
//      before-combo
//   3. Pop the lowest-level tile of that industry from the mat, respecting
//      era restrictions
//   4. If the slot is occupied, validate overbuild (§5.1.3)
//   5. Enforce canal one-tile-per-city, factoring in the overbuild (§5.1.4)
//   6. Consume coal then iron per §5.6; accumulate cost; verify funds
//   7. Remove the overbuilt tile (if any) and place the new tile
//   8. Move-to-market auto-sell for Coal Mine / Iron Works (§5.1.1)
//      — the flip + income advance happens inside the helper when the tile
//      drains to zero
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

  // --- Step 3: pop mat tile (read-only at this stage; mutation below) ---
  const stack = player.mat.stacks[intent.industry];
  if (stack.length === 0) {
    return { ok: false, reason: "mat_stack_empty" };
  }
  const catalogueIndex = stack[0]!;
  const incomingSpec = state.tileCatalogue[catalogueIndex];
  if (incomingSpec === undefined) {
    return { ok: false, reason: "mat_stack_empty" };
  }
  if (!isTileEligibleForEra(incomingSpec, state.era)) {
    return { ok: false, reason: "tile_wrong_era" };
  }

  // --- Step 4: slot-occupancy → overbuild validation (§5.1.3) ---
  const existingTile = findTileAt(state, intent.cityName, intent.slotIndex);
  if (existingTile !== undefined) {
    const overbuildFail = validateOverbuild(
      state,
      existingTile,
      intent.industry,
      incomingSpec,
      intent.playerId,
    );
    if (overbuildFail !== null) {
      return { ok: false, reason: overbuildFail };
    }
  }

  // --- Step 5: §5.1.4 one-tile-per-city in Canal era ---
  // "An overbuild of the player's OWN tile is a net-zero swap and is
  // therefore exempt." The rule is: after the build, the player must not
  // exceed 1 tile at this city. If the overbuilt tile was theirs, swapping
  // keeps the count; else the new tile adds one.
  if (state.era === "CANAL") {
    const priorCount = countPlayerTilesAt(
      state,
      intent.playerId,
      intent.cityName,
    );
    const overbuiltOwnTile =
      existingTile !== undefined && existingTile.owner === intent.playerId;
    const afterCount = priorCount - (overbuiltOwnTile ? 1 : 0) + 1;
    if (afterCount > 1) {
      return { ok: false, reason: "one_tile_per_city_canal" };
    }
  }

  // --- Step 6: consume coal then iron; accumulate cost; verify funds ---
  let working = state;
  const coalResult = consumeCoal(
    working,
    incomingSpec.coalCost,
    intent.coalSources,
    [intent.cityName],
  );
  if (!coalResult.ok) return coalResult;
  working = coalResult.state;

  const ironResult = consumeIron(
    working,
    incomingSpec.ironCost,
    intent.ironSources,
  );
  if (!ironResult.ok) return ironResult;
  working = ironResult.state;

  const totalSpent =
    incomingSpec.costMoney + coalResult.moneySpent + ironResult.moneySpent;
  const playerAfterConsumption = working.players.find(
    (p) => p.id === intent.playerId,
  );
  if (playerAfterConsumption === undefined) {
    return { ok: false, reason: "not_current_turn" };
  }
  if (playerAfterConsumption.money < totalSpent) {
    return { ok: false, reason: "insufficient_funds" };
  }

  // --- Step 7: remove overbuilt tile (§5.1.3 "returns to the box"), then
  // place the new tile ---
  const tileId = `tile-${working.nextTileId}`;
  const resourceCapacity = pickResourceCapacity(incomingSpec, working.era);
  const placedTile: PlacedIndustryTile = {
    id: tileId,
    owner: intent.playerId,
    cityName: intent.cityName,
    slotIndex: intent.slotIndex,
    catalogueIndex,
    resources: resourceCapacity,
    flipped: false,
  };

  const disposed = disposeCard(
    playerAfterConsumption.hand,
    playerAfterConsumption.discardPile,
    working.wildReserve,
    intent.cardIndex,
  );

  const remainingBuiltTiles =
    existingTile !== undefined
      ? working.builtTiles.filter((t) => t.id !== existingTile.id)
      : working.builtTiles;

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
    builtTiles: [...remainingBuiltTiles, placedTile],
    nextTileId: working.nextTileId + 1,
  };

  // --- Step 8: move-to-market auto-sell (§5.1.1). Non-resource tiles
  // (Cotton / Manufacturer / Pottery) have resourceCapacity 0 so they skip
  // this entirely; they flip only on Sell per §2.10. Breweries keep their
  // barrels until consumed. ---
  if (incomingSpec.industry === "COAL_MINE") {
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
  } else if (incomingSpec.industry === "IRON_WORKS") {
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
      // Single-industry cards have one entry; the dual Cotton/Manufacturer
      // card has two. Either way, the chosen industry must appear in the
      // list (§2.13).
      if (!card.industries.includes(industry)) {
        return "card_does_not_authorise";
      }
      return checkNetwork(state, playerId, city.name);
    }
    case "WILD_INDUSTRY":
      return checkNetwork(state, playerId, city.name);
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

function findTileAt(
  state: GameState,
  cityName: string,
  slotIndex: number,
): PlacedIndustryTile | undefined {
  return state.builtTiles.find(
    (t) => t.cityName === cityName && t.slotIndex === slotIndex,
  );
}

function countPlayerTilesAt(
  state: GameState,
  playerId: PlayerId,
  cityName: string,
): number {
  return state.builtTiles.reduce(
    (n, t) => n + (t.owner === playerId && t.cityName === cityName ? 1 : 0),
    0,
  );
}

function validateOverbuild(
  state: GameState,
  existingTile: PlacedIndustryTile,
  incomingIndustry: IndustryName,
  incomingSpec: IndustryTileSpec,
  playerId: PlayerId,
): FailureReason | null {
  const existingSpec = state.tileCatalogue[existingTile.catalogueIndex];
  if (existingSpec === undefined) return "overbuild_industry_mismatch";

  // Same industry required (§5.1.3).
  if (existingSpec.industry !== incomingIndustry) {
    return "overbuild_industry_mismatch";
  }
  // Strictly higher level.
  if (incomingSpec.level <= existingSpec.level) {
    return "overbuild_not_higher_level";
  }
  // Existing tile has zero resources (always true for non-producers;
  // producers must be fully drained).
  if (existingTile.resources > 0) {
    return "overbuild_has_resources";
  }

  // Ownership rule. Own tile: always legal. Otherwise only Coal Mine /
  // Iron Works, AND only when every cube of that resource is globally
  // exhausted (board + market).
  if (existingTile.owner === playerId) return null;
  if (
    existingSpec.industry !== "COAL_MINE" &&
    existingSpec.industry !== "IRON_WORKS"
  ) {
    return "overbuild_ownership_blocked";
  }
  if (!isResourceGloballyExhausted(state, existingSpec.industry)) {
    return "overbuild_ownership_blocked";
  }
  return null;
}

function isResourceGloballyExhausted(
  state: GameState,
  industry: "COAL_MINE" | "IRON_WORKS",
): boolean {
  let boardCubes = 0;
  for (const t of state.builtTiles) {
    const spec = state.tileCatalogue[t.catalogueIndex];
    if (spec && spec.industry === industry) boardCubes += t.resources;
  }
  if (boardCubes > 0) return false;
  const market =
    industry === "COAL_MINE" ? state.coalMarket : state.ironMarket;
  for (const n of market.filled) if (n > 0) return false;
  return true;
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
