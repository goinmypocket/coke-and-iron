import { describe, it, expect } from "vitest";
import { initialState } from "../../../engine";
import { consumeBeerFromBrewery } from "../../../engine/sources/beer";
import type {
  GameState,
  IndustryName,
  PlayerId,
} from "../../../engine";

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

function withDevelopedLinks(
  state: GameState,
  entries: { owner: PlayerId; endpoints: string[] }[],
): GameState {
  return {
    ...state,
    developedLinks: entries.map((e) => ({
      owner: e.owner,
      lineIndex: canalLineIndex(state, e.endpoints),
    })),
  };
}

function withTile(
  state: GameState,
  params: {
    id: string;
    owner: PlayerId;
    cityName: string;
    industry: IndustryName;
    level: number;
    resources?: number;
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
        slotIndex: 0,
        catalogueIndex,
        resources: params.resources ?? 1,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

// ---------- tests ----------

describe("consumeBeerFromBrewery — priority 1 (own brewery)", () => {
  it("accepts own brewery with no connection required", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "b-1",
      owner: 0,
      cityName: "Farm Brewery 1",
      industry: "BREWERY",
      level: 1,
      resources: 1,
    });
    const r = consumeBeerFromBrewery(state, "b-1", ["Birmingham"], 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const tile = r.state.builtTiles.find((t) => t.id === "b-1")!;
      expect(tile.resources).toBe(0);
      expect(tile.flipped).toBe(true);
    }
  });
});

describe("consumeBeerFromBrewery — priority 2 (opponent brewery, connected)", () => {
  it("accepts opponent's brewery when consumer is connected to it", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "b-opp",
      owner: 1,
      cityName: "Worcester",
      industry: "BREWERY",
      level: 1,
      resources: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: 0, endpoints: ["Birmingham", "Worcester"] },
    ]);
    const r = consumeBeerFromBrewery(state, "b-opp", ["Birmingham"], 0);
    expect(r.ok).toBe(true);
  });

  it("rejects brewery_not_connected when opponent's brewery is disconnected", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "b-opp",
      owner: 1,
      cityName: "Worcester",
      industry: "BREWERY",
      level: 1,
      resources: 1,
    });
    const r = consumeBeerFromBrewery(state, "b-opp", ["Birmingham"], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("brewery_not_connected");
  });
});

describe("consumeBeerFromBrewery — rejects", () => {
  it("rejects an unknown tileId", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    const r = consumeBeerFromBrewery(state, "nope", ["Birmingham"], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("beer_source_invalid");
  });

  it("rejects a non-brewery tile", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "cm",
      owner: 0,
      cityName: "Dudley",
      industry: "COAL_MINE",
      level: 1,
      resources: 2,
    });
    const r = consumeBeerFromBrewery(state, "cm", ["Dudley"], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("beer_source_invalid");
  });

  it("rejects a flipped brewery", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "b-1",
      owner: 0,
      cityName: "Farm Brewery 1",
      industry: "BREWERY",
      level: 1,
      resources: 1,
      flipped: true,
    });
    const r = consumeBeerFromBrewery(state, "b-1", ["Birmingham"], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("beer_source_invalid");
  });

  it("rejects a brewery with zero resources", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "b-1",
      owner: 0,
      cityName: "Farm Brewery 1",
      industry: "BREWERY",
      level: 1,
      resources: 0,
    });
    const r = consumeBeerFromBrewery(state, "b-1", ["Birmingham"], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("beer_source_invalid");
  });
});
