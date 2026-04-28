import { describe, it, expect } from "vitest";
import { initialState } from "../../engine";
import {
  applyScoring,
  scoreFlippedIndustryVp,
  scoreLinkTileVp,
} from "../../engine/scoring";
import type {
  GameState,
  IndustryName,
  PlayerId,
} from "../../engine";

// ---------- helpers ----------

function canalLineIndex(state: GameState, want: readonly string[]): number {
  const i = state.lines.findIndex(
    (l) =>
      l.era === "CANAL" &&
      l.endpoints.length === want.length &&
      want.every((c) => l.endpoints.includes(c)),
  );
  if (i === -1) throw new Error(`line not found: ${want.join("-")}`);
  return i;
}

function withTile(
  state: GameState,
  params: {
    id: string;
    owner: PlayerId;
    cityName: string;
    slotIndex?: number;
    industry: IndustryName;
    level: number;
    flipped?: boolean;
  },
): GameState {
  const catalogueIndex = state.tileCatalogue.findIndex(
    (s) => s.industry === params.industry && s.level === params.level,
  );
  if (catalogueIndex === -1) throw new Error("no catalogue entry");
  return {
    ...state,
    builtTiles: [
      ...state.builtTiles,
      {
        id: params.id,
        owner: params.owner,
        cityName: params.cityName,
        slotIndex: params.slotIndex ?? 0,
        catalogueIndex,
        resources: 0,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

// ---------- link scoring (§6.1) ----------

describe("scoreLinkTileVp — §6.1", () => {
  it("a 2-endpoint link between district cities with no flipped tiles scores 0", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const li = canalLineIndex(base, ["Birmingham", "Dudley"]);
    const state: GameState = {
      ...base,
      developedLinks: [{ owner: 0, lineIndex: li }],
    };
    expect(scoreLinkTileVp(state, state.developedLinks[0]!)).toBe(0);
  });

  it("a link adjacent to a merchant city scores at least 2 (merchant contributes 2)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const li = canalLineIndex(base, ["Worcester", "Gloucester"]);
    const state: GameState = {
      ...base,
      developedLinks: [{ owner: 0, lineIndex: li }],
    };
    // Worcester contributes 0 (no flipped tiles); Gloucester (merchant) 2.
    expect(scoreLinkTileVp(state, state.developedLinks[0]!)).toBe(2);
  });

  it("a link's district endpoint contributes sum of linkPoints on FLIPPED tiles at that city", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Plant a flipped Manufacturer level 1 at Dudley (linkPoints=2 per
    // industry_tiles.json).
    let state = withTile(base, {
      id: "t1",
      owner: 0,
      cityName: "Dudley",
      industry: "MANUFACTURER",
      level: 1,
      flipped: true,
    });
    const li = canalLineIndex(state, ["Birmingham", "Dudley"]);
    state = { ...state, developedLinks: [{ owner: 0, lineIndex: li }] };
    // Birmingham endpoint: 0 (no flipped). Dudley: MANUFACTURER level 1
    // linkPoints = 2. Total 2.
    expect(scoreLinkTileVp(state, state.developedLinks[0]!)).toBe(2);
  });

  it("unflipped industry tiles contribute 0 to their city's link points", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "t1",
      owner: 0,
      cityName: "Dudley",
      industry: "MANUFACTURER",
      level: 1,
      flipped: false, // unflipped
    });
    const li = canalLineIndex(state, ["Birmingham", "Dudley"]);
    state = { ...state, developedLinks: [{ owner: 0, lineIndex: li }] };
    expect(scoreLinkTileVp(state, state.developedLinks[0]!)).toBe(0);
  });

  it("triple link sums link points across all 3 endpoints", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Triple: Kidderminster — Worcester — Farm Brewery 2.
    // None are merchants; no flipped tiles → 0.
    let state = withTile(base, {
      id: "t1",
      owner: 0,
      cityName: "Kidderminster",
      industry: "MANUFACTURER",
      level: 1,
      flipped: true,
    });
    state = withTile(state, {
      id: "t2",
      owner: 0,
      cityName: "Worcester",
      industry: "BREWERY",
      level: 1,
      flipped: true,
    });
    const li = canalLineIndex(state, [
      "Kidderminster",
      "Worcester",
      "Farm Brewery 2",
    ]);
    state = { ...state, developedLinks: [{ owner: 0, lineIndex: li }] };
    // Manufacturer lv 1 linkPoints=2 + Brewery lv 1 linkPoints=2 + Farm
    // Brewery 2 (district, no tiles) 0 = 4.
    expect(scoreLinkTileVp(state, state.developedLinks[0]!)).toBe(4);
  });
});

// ---------- flipped tile scoring (§6.2) ----------

describe("scoreFlippedIndustryVp — §6.2", () => {
  it("returns the tile's printed VP when flipped", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "t1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
      flipped: true,
    });
    // COTTON_MILL lv 1 vp=5.
    expect(scoreFlippedIndustryVp(state, state.builtTiles[0]!)).toBe(5);
  });

  it("returns 0 for unflipped tiles", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "t1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
      flipped: false,
    });
    expect(scoreFlippedIndustryVp(state, state.builtTiles[0]!)).toBe(0);
  });
});

// ---------- applyScoring ----------

describe("applyScoring — sums links + flipped tiles by owner", () => {
  it("adds link VP and tile VP to each player's vp", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Player 0: flipped Cotton Mill lv 1 at Birmingham (vp=5).
    let state = withTile(base, {
      id: "p0-cot",
      owner: 0,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
      flipped: true,
    });
    // Player 1: flipped Brewery at Worcester + a developed link
    // Worcester–Gloucester (merchant → +2 link points).
    state = withTile(state, {
      id: "p1-brew",
      owner: 1,
      cityName: "Worcester",
      industry: "BREWERY",
      level: 1,
      flipped: true,
    });
    const li = canalLineIndex(state, ["Worcester", "Gloucester"]);
    state = { ...state, developedLinks: [{ owner: 1, lineIndex: li }] };

    const beforeVp = state.players.map((p) => p.vp);
    const { state: after, gainedByPlayer } = applyScoring(state);

    // Player 0: 5 VP from Cotton Mill. No links.
    expect(gainedByPlayer.get(0)).toBe(5);
    // Player 1: 4 VP from Brewery + link. Link scores from Worcester
    // (brewery linkPoints=2) + Gloucester (merchant=2) = 4.
    expect(gainedByPlayer.get(1)).toBe(4 + 4);
    expect(after.players[0]!.vp).toBe(beforeVp[0]! + 5);
    expect(after.players[1]!.vp).toBe(beforeVp[1]! + 8);
  });
});
