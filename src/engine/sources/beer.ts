// =============================================================================
// §5.6.3 Beer — brewery sources only.
//
// This module covers priorities 1 and 2:
//   1. Own unflipped Brewery — no connection required.
//   2. Opponent's unflipped Brewery — must be connected (any-player graph)
//      to any of the consumer cities.
//
// Priority 3 (merchant beer) is Sell-only and belongs in a separate
// validator; Network must reject merchant-beer sources entirely per
// §5.6.3 and the SecondRailLink type which restricts beerSource to the
// BREWERY variant.
// =============================================================================

import { buildDistanceMap } from "../network/graph";
import { drainResourceCube } from "./drain";
import type { FailureReason, GameState, PlayerId } from "../types";

export type BeerFromBreweryResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: FailureReason };

/**
 * Consume one barrel from the named Brewery tile. Tile must exist, be
 * unflipped, have resources > 0, and either belong to the player (free)
 * or be connected via any-player developed links to at least one of the
 * consumer cities.
 *
 * On success, drains one cube (may flip the tile and advance owner's
 * income per §2.10 — handled by drainResourceCube).
 */
export function consumeBeerFromBrewery(
  state: GameState,
  tileId: string,
  consumerCities: readonly string[],
  playerId: PlayerId,
): BeerFromBreweryResult {
  const tile = state.builtTiles.find((t) => t.id === tileId);
  if (tile === undefined) {
    return { ok: false, reason: "beer_source_invalid" };
  }
  const spec = state.tileCatalogue[tile.catalogueIndex];
  if (spec === undefined || spec.industry !== "BREWERY") {
    return { ok: false, reason: "beer_source_invalid" };
  }
  if (tile.flipped || tile.resources <= 0) {
    return { ok: false, reason: "beer_source_invalid" };
  }

  if (tile.owner !== playerId) {
    const dist = buildDistanceMap(state, consumerCities);
    if (!dist.has(tile.cityName)) {
      return { ok: false, reason: "brewery_not_connected" };
    }
  }

  return { ok: true, state: drainResourceCube(state, tileId) };
}
