// =============================================================================
// §5.6.2 Iron source validator.
//
// Priority order:
//   1. Any unflipped Iron Works tile (any owner). Free.
//   2. Iron Market. Pay cheapest-filled-tier's price. Overflow £6 when
//      the market is empty.
//
// No connection requirement — the Iron Market is always reachable (§2.11.2,
// §5.6.2 pri 2).
//
// The caller (Build / Develop) declares the full source list in order.
// This module walks the list exactly as declared, validates each source
// against the rules, and returns either {ok, state, moneySpent} or a
// FailureReason. The caller is responsible for verifying funds and
// updating player.money / spent_this_round.
// =============================================================================

import type {
  FailureReason,
  GameState,
  IronSource,
  Market,
} from "../types";
import { drainResourceCube } from "./drain";

export type IronConsumptionResult =
  | { readonly ok: true; readonly state: GameState; readonly moneySpent: number }
  | { readonly ok: false; readonly reason: FailureReason };

export function consumeIron(
  state: GameState,
  count: number,
  sources: readonly IronSource[],
): IronConsumptionResult {
  if (sources.length !== count) {
    return { ok: false, reason: "iron_source_invalid" };
  }

  let working = state;
  let moneySpent = 0;

  for (const src of sources) {
    if (src.kind === "TILE") {
      const next = consumeIronFromTile(working, src.tileId);
      if (!next.ok) return next;
      working = next.state;
    } else {
      const next = buyIronFromMarket(working);
      working = next.state;
      moneySpent += next.price;
    }
  }

  return { ok: true, state: working, moneySpent };
}

function consumeIronFromTile(
  state: GameState,
  tileId: string,
):
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: FailureReason } {
  const tile = state.builtTiles.find((t) => t.id === tileId);
  if (tile === undefined) {
    return { ok: false, reason: "iron_source_invalid" };
  }
  const spec = state.tileCatalogue[tile.catalogueIndex];
  if (spec === undefined || spec.industry !== "IRON_WORKS") {
    return { ok: false, reason: "iron_source_invalid" };
  }
  if (tile.flipped || tile.resources <= 0) {
    return { ok: false, reason: "iron_source_invalid" };
  }
  return { ok: true, state: drainResourceCube(state, tileId) };
}

/**
 * Buy one iron cube from the market. Returns the new market state + the
 * price paid. When the market has no cubes, nothing changes in the market
 * but the caller still pays the overflow price (§2.11.2).
 */
function buyIronFromMarket(
  state: GameState,
): { readonly state: GameState; readonly price: number } {
  const market = state.ironMarket;
  const { newMarket, price } = buyFromMarket(market);
  return { state: { ...state, ironMarket: newMarket }, price };
}

/**
 * Generic market buy: cheapest filled tier first; empty → overflow price.
 * Pulled out as a helper so Coal can reuse it when that validator lands.
 */
export function buyFromMarket(market: Market): {
  newMarket: Market;
  price: number;
} {
  const filledIdx = market.filled.findIndex((n) => n > 0);
  if (filledIdx === -1) {
    return { newMarket: market, price: market.overflowPrice };
  }
  const price = market.tiers[filledIdx];
  if (price === undefined) {
    throw new Error(
      `buyFromMarket: filled index ${filledIdx} has no tier price`,
    );
  }
  const newFilled = market.filled.slice();
  newFilled[filledIdx] = newFilled[filledIdx]! - 1;
  return { newMarket: { ...market, filled: newFilled }, price };
}
