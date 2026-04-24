// =============================================================================
// §5.4 Sell — flip any number of own Cotton / Manufacturer / Pottery tiles,
// paying `beer_to_sell` barrels per tile.
//
// Per order (§5.4 step 2):
//   a. Verify own, unflipped, and sellable industry at the stated location.
//   b. Verify the buying merchant tile is non-blank, accepts the industry,
//      and the sold tile is connected (any-player graph) to the merchant.
//   c. Consume exactly beer_to_sell barrels from the declared source list.
//      Merchant beer may ONLY come from THIS order's merchant slot (§5.6.3
//      pri 3); brewery beer validated by the shared helper.
//   d. Flip the tile; advance the owner's income by the tile's incomeBonus.
//   e. If the order's merchant beer was used, fire the merchant's §5.4.1
//      bonus once (fires at most once per order since a slot holds ≤ 1
//      barrel).
//
// After all orders: Gloucester generates one pending Develop-like removal
// per Gloucester beer consumed (§5.4 step 3). The intent carries the list
// of industries to remove; they're processed here at no iron cost, but
// still respect the light-bulb + empty-stack rules.
//
// Merchant beer is OPTIONAL — leaving it on the slot is legal, the bonus
// just doesn't fire. The player opts in by including { kind: "MERCHANT" }
// in that order's beerSources.
// =============================================================================

import { advanceSteps } from "../income";
import { buildDistanceMap } from "../network/graph";
import { consumeBeerFromBrewery } from "../sources/beer";
import {
  disposeCard,
  replacePlayer,
  validateActiveTurn,
  validateCardIndex,
} from "../turn";
import type {
  FailureReason,
  GameState,
  IndustryName,
  IntentSell,
  MerchantCity,
  Player,
  PlayerId,
  Result,
  SellOrder,
} from "../types";

const SELLABLE: readonly IndustryName[] = [
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
];

export function reduceSell(state: GameState, intent: IntentSell): Result {
  const turnFail = validateActiveTurn(state, intent.playerId);
  if (turnFail !== null) return { ok: false, reason: turnFail };

  const player = state.players[intent.playerId];
  if (player === undefined) return { ok: false, reason: "not_current_turn" };

  const cardFail = validateCardIndex(player.hand, intent.cardIndex);
  if (cardFail !== null) return { ok: false, reason: cardFail };

  // --- Walk orders in declared order ---
  let working = state;
  let gloucesterBeersUsed = 0;

  for (const order of intent.orders) {
    const result = processOrder(working, order, intent.playerId);
    if (!result.ok) return result;
    working = result.state;
    if (result.merchantUsed) {
      working = applyMerchantBonus(working, intent.playerId, result.merchantCity);
      if (result.merchantCity.name === "Gloucester") gloucesterBeersUsed++;
    }
  }

  // --- Gloucester follow-up (§5.4 step 3) ---
  if (gloucesterBeersUsed !== intent.gloucesterDevelops.length) {
    return { ok: false, reason: "develop_count_invalid" };
  }
  for (const industry of intent.gloucesterDevelops) {
    const popFail = popMatTopForDevelop(working, intent.playerId, industry);
    if (!popFail.ok) return popFail;
    working = popFail.state;
  }

  // --- Dispose card + decrement actions ---
  const playerFinal = working.players.find((p) => p.id === intent.playerId);
  if (playerFinal === undefined) {
    return { ok: false, reason: "not_current_turn" };
  }
  const disposed = disposeCard(
    playerFinal.hand,
    playerFinal.discardPile,
    working.wildReserve,
    intent.cardIndex,
  );
  working = {
    ...working,
    players: replacePlayer(working.players, intent.playerId, (p) => ({
      ...p,
      hand: disposed.hand,
      discardPile: disposed.discardPile,
    })),
    wildReserve: disposed.wildReserve,
    actionsRemaining: working.actionsRemaining - 1,
  };

  return { ok: true, state: working };
}

// -----------------------------------------------------------------------------
// Per-order processing
// -----------------------------------------------------------------------------

type OrderResult =
  | {
      ok: true;
      state: GameState;
      merchantUsed: boolean;
      merchantCity: MerchantCity;
    }
  | { ok: false; reason: FailureReason };

function processOrder(
  state: GameState,
  order: SellOrder,
  playerId: PlayerId,
): OrderResult {
  // --- (a) sold-tile validation ---
  const tile = state.builtTiles.find((t) => t.id === order.tileId);
  if (tile === undefined) {
    return { ok: false, reason: "sell_tile_not_owned" };
  }
  if (tile.owner !== playerId) {
    return { ok: false, reason: "sell_tile_not_owned" };
  }
  if (tile.flipped) {
    return { ok: false, reason: "sell_tile_already_flipped" };
  }
  const spec = state.tileCatalogue[tile.catalogueIndex];
  if (spec === undefined) {
    return { ok: false, reason: "sell_tile_wrong_industry" };
  }
  if (!SELLABLE.includes(spec.industry)) {
    return { ok: false, reason: "sell_tile_wrong_industry" };
  }

  // --- (b) merchant-tile validation ---
  const merchantCity = state.merchantCities.find(
    (m) => m.name === order.merchantCityName,
  );
  if (merchantCity === undefined) {
    return { ok: false, reason: "sell_merchant_invalid" };
  }
  const slot = state.merchantSlots.find(
    (s) =>
      s.merchantCityName === order.merchantCityName &&
      s.slotIndex === order.merchantSlotIndex,
  );
  if (slot === undefined) {
    return { ok: false, reason: "sell_merchant_invalid" };
  }
  if (slot.accept === "BLANK") {
    return { ok: false, reason: "sell_merchant_invalid" };
  }
  if (slot.accept !== "ANY" && slot.accept !== spec.industry) {
    return { ok: false, reason: "sell_merchant_invalid" };
  }

  // --- connectivity: sold tile's city ↔ merchant city ---
  const dist = buildDistanceMap(state, [tile.cityName]);
  if (!dist.has(order.merchantCityName)) {
    return { ok: false, reason: "sell_not_connected_to_merchant" };
  }

  // --- (c) beer consumption ---
  if (order.beerSources.length !== spec.beerToSell) {
    return { ok: false, reason: "beer_source_invalid" };
  }

  let working = state;
  let merchantUsed = false;

  for (const source of order.beerSources) {
    if (source.kind === "BREWERY") {
      const r = consumeBeerFromBrewery(
        working,
        source.tileId,
        [tile.cityName],
        playerId,
      );
      if (!r.ok) return r;
      working = r.state;
    } else {
      // MERCHANT — must consume this order's own slot exactly once.
      if (merchantUsed) {
        return { ok: false, reason: "beer_source_invalid" };
      }
      const slotNow = working.merchantSlots.find(
        (s) =>
          s.merchantCityName === order.merchantCityName &&
          s.slotIndex === order.merchantSlotIndex,
      );
      if (slotNow === undefined || !slotNow.hasBeer) {
        return { ok: false, reason: "beer_source_invalid" };
      }
      working = {
        ...working,
        merchantSlots: working.merchantSlots.map((s) =>
          s.merchantCityName === order.merchantCityName &&
          s.slotIndex === order.merchantSlotIndex
            ? { ...s, hasBeer: false }
            : s,
        ),
      };
      merchantUsed = true;
    }
  }

  // --- (d) flip the tile + advance income ---
  working = {
    ...working,
    builtTiles: working.builtTiles.map((t) =>
      t.id === order.tileId ? { ...t, flipped: true } : t,
    ),
    players: replacePlayer(working.players, playerId, (p) => ({
      ...p,
      incomeStep: advanceSteps(p.incomeStep, spec.incomeBonus),
    })),
  };

  return { ok: true, state: working, merchantUsed, merchantCity };
}

// -----------------------------------------------------------------------------
// Merchant bonuses (§5.4.1)
// -----------------------------------------------------------------------------

function applyMerchantBonus(
  state: GameState,
  playerId: PlayerId,
  merchantCity: MerchantCity,
): GameState {
  switch (merchantCity.bonus) {
    case "VP":
      return updatePlayer(state, playerId, (p) => ({
        ...p,
        vp: p.vp + merchantCity.bonusValue,
      }));
    case "MONEY":
      return updatePlayer(state, playerId, (p) => ({
        ...p,
        money: p.money + merchantCity.bonusValue,
      }));
    case "INCOME":
      return updatePlayer(state, playerId, (p) => ({
        ...p,
        incomeStep: advanceSteps(p.incomeStep, merchantCity.bonusValue),
      }));
    case "DEVELOP":
      // Gloucester's follow-up is applied after all orders, using
      // intent.gloucesterDevelops. No mat change here.
      return state;
  }
}

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  mutate: (p: Player) => Player,
): GameState {
  return { ...state, players: replacePlayer(state.players, playerId, mutate) };
}

// -----------------------------------------------------------------------------
// Gloucester develop (§5.4 step 3) — same logic as Develop, no iron cost
// -----------------------------------------------------------------------------

function popMatTopForDevelop(
  state: GameState,
  playerId: PlayerId,
  industry: IndustryName,
):
  | { ok: true; state: GameState }
  | { ok: false; reason: FailureReason } {
  const current = state.players.find((p) => p.id === playerId);
  if (current === undefined) return { ok: false, reason: "not_current_turn" };
  const stack = current.mat.stacks[industry];
  if (stack.length === 0) return { ok: false, reason: "mat_stack_empty" };
  const topIdx = stack[0]!;
  const topSpec = state.tileCatalogue[topIdx];
  if (topSpec === undefined) return { ok: false, reason: "mat_stack_empty" };
  if (topSpec.lightBulb) {
    return { ok: false, reason: "develop_tile_has_lightbulb" };
  }
  return {
    ok: true,
    state: {
      ...state,
      players: replacePlayer(state.players, playerId, (p) => ({
        ...p,
        mat: {
          stacks: { ...p.mat.stacks, [industry]: p.mat.stacks[industry].slice(1) },
        },
      })),
    },
  };
}
