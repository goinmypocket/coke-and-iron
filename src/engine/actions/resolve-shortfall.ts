// =============================================================================
// §4.3 step 2 shortfall resolution.
//
// Triggered only when state.pendingShortfalls is non-empty. The head
// player removes industry tiles for half (rounded down) the printed
// build cost; once the proceeds cover the remaining debt, surplus
// returns to their money and the entry pops off the queue. If the
// player can no longer (or chooses not to) raise enough proceeds, they
// pass `finalize: true`, which converts the remaining debt to VP loss
// (clamped at 0 VP) and pops the entry.
//
// When the queue empties, this reducer resumes the round-end pipeline
// (refill hands + era-end check + round bump).
// =============================================================================

import { continueEndOfRoundPostShortfall } from "./end-turn";
import type {
  GameState,
  IntentResolveShortfall,
  PlacedIndustryTile,
  Player,
  PlayerId,
  Result,
} from "../types";
import { replacePlayer } from "../turn";

export function reduceResolveShortfall(
  state: GameState,
  intent: IntentResolveShortfall,
): Result {
  if (state.phase === "GAME_OVER") {
    return { ok: false, reason: "game_over" };
  }
  const head = state.pendingShortfalls[0];
  if (head === undefined) {
    return { ok: false, reason: "no_pending_shortfall" };
  }
  if (head.playerId !== intent.playerId) {
    return { ok: false, reason: "no_pending_shortfall" };
  }

  // Validate tile picks: each must exist, be owned by this player, with
  // no duplicates within the intent.
  const removeIds = new Set<string>();
  let proceeds = 0;
  const tilesById = indexBuiltTilesById(state.builtTiles);

  for (const id of intent.tilesToRemove) {
    if (removeIds.has(id)) {
      return { ok: false, reason: "shortfall_duplicate_tile" };
    }
    const tile = tilesById.get(id);
    if (tile === undefined || tile.owner !== intent.playerId) {
      return { ok: false, reason: "shortfall_tile_not_owned" };
    }
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (spec === undefined) {
      return { ok: false, reason: "shortfall_tile_not_owned" };
    }
    proceeds += Math.floor(spec.costMoney / 2);
    removeIds.add(id);
  }

  // Remove the tiles from the board.
  let working: GameState = {
    ...state,
    builtTiles: state.builtTiles.filter((t) => !removeIds.has(t.id)),
  };

  // Apply proceeds vs owed.
  if (proceeds >= head.owed) {
    const surplus = proceeds - head.owed;
    working = updatePlayer(working, intent.playerId, (p) => ({
      ...p,
      money: p.money + surplus,
    }));
  } else {
    if (!intent.finalize) {
      return { ok: false, reason: "shortfall_not_satisfied" };
    }
    const remaining = head.owed - proceeds;
    working = updatePlayer(working, intent.playerId, (p) => ({
      ...p,
      vp: Math.max(0, p.vp - remaining),
    }));
  }

  // Pop the head entry.
  working = {
    ...working,
    pendingShortfalls: working.pendingShortfalls.slice(1),
  };

  // If the queue is empty, resume the round-end pipeline.
  if (working.pendingShortfalls.length === 0) {
    working = continueEndOfRoundPostShortfall(working);
  }

  return { ok: true, state: working };
}

function indexBuiltTilesById(
  tiles: readonly PlacedIndustryTile[],
): Map<string, PlacedIndustryTile> {
  const m = new Map<string, PlacedIndustryTile>();
  for (const t of tiles) m.set(t.id, t);
  return m;
}

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  mutate: (p: Player) => Player,
): GameState {
  return { ...state, players: replacePlayer(state.players, playerId, mutate) };
}
