// =============================================================================
// Shared tile-drain helper.
//
// §2.10 says every resource tile (Coal Mine / Iron Works / Brewery) flips
// when its last resource leaves, regardless of which action caused it.
// §5.1 step 8 spells out the flip + income advance for Build-time
// move-to-market; the same rule applies when a consumer action (§5.6)
// drains the last cube. One helper covers both.
// =============================================================================

import { advanceSteps } from "../income";
import { replacePlayer } from "../turn";
import type { GameState, PlacedIndustryTile } from "../types";

/**
 * Decrement a placed tile's resource count by 1. If this drains the last
 * cube, flip the tile and advance its owner's income by the tile's
 * incomeBonus. Returns new state.
 *
 * Caller MUST have verified that the tile exists, is unflipped, and has
 * resources > 0. Breaches of that contract throw.
 */
export function drainResourceCube(
  state: GameState,
  tileId: string,
): GameState {
  const tileIdx = state.builtTiles.findIndex((t) => t.id === tileId);
  if (tileIdx === -1) {
    throw new Error(`drainResourceCube: tile ${tileId} not found`);
  }
  const tile = state.builtTiles[tileIdx]!;
  if (tile.flipped) {
    throw new Error(`drainResourceCube: tile ${tileId} already flipped`);
  }
  if (tile.resources <= 0) {
    throw new Error(`drainResourceCube: tile ${tileId} has no resources`);
  }

  const newResources = tile.resources - 1;
  const willFlip = newResources === 0;
  const newTile: PlacedIndustryTile = {
    ...tile,
    resources: newResources,
    flipped: willFlip,
  };

  const newBuiltTiles = state.builtTiles.slice();
  newBuiltTiles[tileIdx] = newTile;

  let newPlayers = state.players;
  if (willFlip) {
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (spec === undefined) {
      throw new Error(
        `drainResourceCube: no catalogue entry for ${tile.catalogueIndex}`,
      );
    }
    newPlayers = replacePlayer(state.players, tile.owner, (p) => ({
      ...p,
      incomeStep: advanceSteps(p.incomeStep, spec.incomeBonus),
    }));
  }

  return { ...state, builtTiles: newBuiltTiles, players: newPlayers };
}
