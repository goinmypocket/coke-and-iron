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
  BoardScore,
  GameState,
  PlacedIndustryTile,
  PlacedLinkTile,
  PlayerId,
} from "./types";

/** This seam accepts only public board fields, including redacted PlayerViews. */
type ScoringBoard = Pick<GameState, "lines" | "merchantCities" | "tileCatalogue"> & {
  readonly builtTiles: readonly PlacedIndustryTile[];
  readonly developedLinks: readonly PlacedLinkTile[];
};
type ScoringState = ScoringBoard & Pick<GameState, "phase" | "scoredEras"> & {
  readonly players: readonly { readonly id: PlayerId; readonly vp: number }[];
};

/**
 * §6.1 — a link tile's VP is the sum of each endpoint's link-point
 * contribution:
 *   - Merchant cities (active or inert) always contribute exactly 2.
 *   - District cities contribute the sum of linkPoints on their FLIPPED
 *     industry tiles.
 */
export function scoreLinkTileVp(
  state: ScoringBoard,
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

function linkPointContribution(state: ScoringBoard, city: string): number {
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
  state: ScoringBoard,
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
  const breakdown = boardScores(state);

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
  return {
    state: {
      ...state,
      players,
      scoredEras: [...(state.scoredEras ?? []), { era: state.era, players: breakdown }],
    },
    gainedByPlayer: gained,
  };
}

function boardScores(state: ScoringState): BoardScore[] {
  return state.players.map((player) => ({
    playerId: player.id,
    industry: state.builtTiles.reduce((total, tile) =>
      total + (tile.owner === player.id ? scoreFlippedIndustryVp(state, tile) : 0), 0),
    links: state.developedLinks.reduce((total, link) =>
      total + (link.owner === player.id ? scoreLinkTileVp(state, link) : 0), 0),
  }));
}

/** Awarded points and the additional points this public board would score now.
 * Other is a signed net adjustment: merchant VP bonuses less actual VP lost
 * to debt (including the existing zero floor). No hypothetical future flips.
 * Retained Rail tiles/links are already scored at GAME_OVER. */
export function scoringSummary(state: ScoringState) {
  const current = state.phase === "GAME_OVER" ? null : boardScores(state);
  return state.players.map((player) => {
    let industry = 0;
    let links = 0;
    for (const era of state.scoredEras ?? []) {
      const score = era.players.find((p) => p.playerId === player.id);
      industry += score?.industry ?? 0;
      links += score?.links ?? 0;
    }
    const projection = current?.find((p) => p.playerId === player.id) ?? null;
    return {
      playerId: player.id,
      scored: { industry, links, other: player.vp - industry - links, total: player.vp },
      projection,
      totalIfScoredNow: player.vp + (projection?.industry ?? 0) + (projection?.links ?? 0),
    };
  });
}
