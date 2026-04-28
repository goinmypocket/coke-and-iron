// =============================================================================
// End-of-era scoring (§6.1 / §6.2).
//
// Pure helpers. Callers (end-of-canal-era / end-of-rail-era) use these to
// add VP to each player based on the current board; the helpers do not
// mutate tiles or links, so the caller can remove canal links after
// scoring or leave industry tiles in place for a second rail-era scoring
// pass.
// =============================================================================

import type {
  GameState,
  PlacedIndustryTile,
  PlacedLinkTile,
  PlayerId,
} from "./types";

/**
 * §6.1 — a link tile's VP is the sum of each endpoint's link-point
 * contribution:
 *   - Merchant cities (active or inert) always contribute exactly 2.
 *   - District cities contribute the sum of linkPoints on their FLIPPED
 *     industry tiles.
 */
export function scoreLinkTileVp(
  state: GameState,
  link: PlacedLinkTile,
): number {
  const line = state.lines[link.lineIndex];
  if (!line) return 0;
  let total = 0;
  for (const city of line.endpoints) {
    total += linkPointContribution(state, city);
  }
  return total;
}

function linkPointContribution(state: GameState, city: string): number {
  if (state.merchantCities.some((m) => m.name === city)) return 2;
  let total = 0;
  for (const tile of state.builtTiles) {
    if (tile.cityName !== city || !tile.flipped) continue;
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (spec) total += spec.linkPoints;
  }
  return total;
}

/** §6.2 — a flipped industry tile scores its printed VP. Unflipped: 0. */
export function scoreFlippedIndustryVp(
  state: GameState,
  tile: PlacedIndustryTile,
): number {
  if (!tile.flipped) return 0;
  const spec = state.tileCatalogue[tile.catalogueIndex];
  return spec ? spec.vp : 0;
}

/**
 * Apply end-of-era scoring to the whole state. Returns a map from player
 * id → total VP gained (from both links and flipped tiles), plus a new
 * GameState with each player's vp incremented. Neither links nor tiles
 * are removed by this function — the caller (canal vs. rail era end) is
 * responsible for whatever clean-up the spec demands next.
 */
export function applyScoring(state: GameState): {
  state: GameState;
  gainedByPlayer: Map<PlayerId, number>;
} {
  const gained = new Map<PlayerId, number>();

  for (const link of state.developedLinks) {
    const vp = scoreLinkTileVp(state, link);
    if (vp > 0) gained.set(link.owner, (gained.get(link.owner) ?? 0) + vp);
  }
  for (const tile of state.builtTiles) {
    const vp = scoreFlippedIndustryVp(state, tile);
    if (vp > 0) gained.set(tile.owner, (gained.get(tile.owner) ?? 0) + vp);
  }

  const players = state.players.map((p) => ({
    ...p,
    vp: p.vp + (gained.get(p.id) ?? 0),
  }));
  return { state: { ...state, players }, gainedByPlayer: gained };
}
