// =============================================================================
// §5.1.1 Move-to-market — auto-sell for a just-built Coal Mine / Iron Works.
//
// Cubes move from the tile into the market one at a time, filling the
// MOST EXPENSIVE EMPTY slot first (§2.11.1 Sell). The owner collects that
// slot's price per cube. If the market saturates before the tile drains,
// the remaining cubes stay on the tile. If the tile drains to zero, it
// flips per §2.10 and the owner's income advances by incomeBonus.
//
// Connection gating (§5.1.1) is handled by the caller: only Coal Mines
// with a merchant-city connection move cubes; Iron Works always move.
// =============================================================================

import { advanceSteps } from "../income";
import { replacePlayer } from "../turn";
import type { GameState, Market, PlacedIndustryTile } from "../types";

const SLOTS_PER_TIER = 2;

export function moveCubesToMarket(
  state: GameState,
  tileId: string,
  marketField: "coalMarket" | "ironMarket",
): { state: GameState; ownerGain: number } {
  const tileIdx = state.builtTiles.findIndex((t) => t.id === tileId);
  if (tileIdx === -1) {
    throw new Error(`moveCubesToMarket: tile ${tileId} not found`);
  }
  const tile = state.builtTiles[tileIdx]!;
  if (tile.flipped) {
    throw new Error(`moveCubesToMarket: tile ${tileId} already flipped`);
  }

  const market = state[marketField];
  const newFilled = market.filled.slice();
  let remaining = tile.resources;
  let ownerGain = 0;

  for (
    let tier = market.tiers.length - 1;
    tier >= 0 && remaining > 0;
    tier--
  ) {
    while ((newFilled[tier] ?? 0) < SLOTS_PER_TIER && remaining > 0) {
      newFilled[tier] = (newFilled[tier] ?? 0) + 1;
      ownerGain += market.tiers[tier]!;
      remaining--;
    }
  }

  const willFlip = remaining === 0;
  const newTile: PlacedIndustryTile = {
    ...tile,
    resources: remaining,
    flipped: willFlip,
  };
  const newBuiltTiles = state.builtTiles.slice();
  newBuiltTiles[tileIdx] = newTile;

  let newPlayers = state.players;
  if (willFlip) {
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (!spec) {
      throw new Error(
        `moveCubesToMarket: no catalogue entry for ${tile.catalogueIndex}`,
      );
    }
    newPlayers = replacePlayer(state.players, tile.owner, (p) => ({
      ...p,
      incomeStep: advanceSteps(p.incomeStep, spec.incomeBonus),
    }));
  }

  const newMarket: Market = { ...market, filled: newFilled };
  const nextState: GameState = {
    ...state,
    [marketField]: newMarket,
    builtTiles: newBuiltTiles,
    players: newPlayers,
  };
  return { state: nextState, ownerGain };
}
