// =============================================================================
// §5.6.1 Coal source validator.
//
// Strict priority order:
//   1. Closest unflipped Coal Mine reachable from the consumer city set
//      (any-player developed-link graph). Ties: player picks. Free.
//   2. Coal Market. Only if the consumer is connected to any merchant city
//      (active or inert). Pay cheapest-filled tier's price; overflow £8
//      when the market is empty. REJECTED if any priority-1 candidate
//      still exists — the player must exhaust reachable Coal Mines first.
//
// `consumerCities` lets one consume call handle Build (1 city) and Network
// on a 2- or 3-endpoint line (2-3 cities). Distance is taken as the min
// over all consumer cities for each candidate mine.
// =============================================================================

import {
  buildDistanceMap,
  isConnectedToAnyMerchantCity,
} from "../network/graph";
import { drainResourceCube } from "./drain";
import { buyFromMarket } from "./iron";
import type {
  CoalSource,
  FailureReason,
  GameState,
  PlacedIndustryTile,
} from "../types";

export type CoalConsumptionResult =
  | { readonly ok: true; readonly state: GameState; readonly moneySpent: number }
  | { readonly ok: false; readonly reason: FailureReason };

export function consumeCoal(
  state: GameState,
  count: number,
  sources: readonly CoalSource[],
  consumerCities: readonly string[],
): CoalConsumptionResult {
  if (sources.length !== count) {
    return { ok: false, reason: "coal_source_invalid" };
  }

  let working = state;
  let moneySpent = 0;

  for (const src of sources) {
    const candidates = closestUnflippedCoalMines(working, consumerCities);

    if (src.kind === "TILE") {
      if (!candidates.some((c) => c.tile.id === src.tileId)) {
        return { ok: false, reason: "coal_source_invalid" };
      }
      working = drainResourceCube(working, src.tileId);
      continue;
    }

    // MARKET: priority 1 must be unavailable.
    if (candidates.length > 0) {
      return { ok: false, reason: "coal_source_invalid" };
    }
    // Priority 2 connection requirement: consumer connected to any merchant.
    const connected = consumerCities.some((c) =>
      isConnectedToAnyMerchantCity(working, c),
    );
    if (!connected) {
      return { ok: false, reason: "coal_market_not_connected" };
    }
    const { newMarket, price } = buyFromMarket(working.coalMarket);
    working = { ...working, coalMarket: newMarket };
    moneySpent += price;
  }

  return { ok: true, state: working, moneySpent };
}

/**
 * Find unflipped Coal Mines reachable from any consumer city, grouped at
 * the minimum hop-distance. Returns [] when nothing is reachable.
 */
function closestUnflippedCoalMines(
  state: GameState,
  consumerCities: readonly string[],
): { tile: PlacedIndustryTile; distance: number }[] {
  const dist = buildDistanceMap(state, consumerCities);
  const mines: { tile: PlacedIndustryTile; distance: number }[] = [];

  for (const tile of state.builtTiles) {
    if (tile.flipped || tile.resources <= 0) continue;
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (!spec || spec.industry !== "COAL_MINE") continue;
    const d = dist.get(tile.cityName);
    if (d === undefined) continue;
    mines.push({ tile, distance: d });
  }

  if (mines.length === 0) return [];
  let minDist = mines[0]!.distance;
  for (const m of mines) if (m.distance < minDist) minDist = m.distance;
  return mines.filter((m) => m.distance === minDist);
}
