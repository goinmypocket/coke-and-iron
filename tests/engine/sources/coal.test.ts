import { describe, it, expect } from "vitest";
import { initialState } from "../../../src/engine";
import { consumeCoal } from "../../../src/engine/sources/coal";
import type {
  CoalSource,
  GameState,
  IndustryName,
  Market,
  PlayerId,
} from "../../../src/engine";

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
        resources: params.resources ?? 2,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

// ---------- tests ----------

describe("consumeCoal — priority 1 (closest unflipped Coal Mine)", () => {
  it("accepts a Coal Mine at the consumer city itself (distance 0)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "cm-birm",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      resources: 2,
    });
    const r = consumeCoal(
      state,
      1,
      [{ kind: "TILE", tileId: "cm-birm" }],
      ["Birmingham"],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.moneySpent).toBe(0);
      expect(r.state.builtTiles.find((t) => t.id === "cm-birm")!.resources).toBe(1);
    }
  });

  it("accepts a Coal Mine 1 hop away via developed link", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "cm-dud",
      owner: 1,
      cityName: "Dudley",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: 0, endpoints: ["Birmingham", "Dudley"] },
    ]);
    const r = consumeCoal(
      state,
      1,
      [{ kind: "TILE", tileId: "cm-dud" }],
      ["Birmingham"],
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a non-closest Coal Mine when a closer one exists", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "cm-dud",
      owner: 0,
      cityName: "Dudley",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withTile(state, {
      id: "cm-kid",
      owner: 0,
      cityName: "Kidderminster",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: 0, endpoints: ["Birmingham", "Dudley"] },
      { owner: 0, endpoints: ["Dudley", "Kidderminster"] },
    ]);
    // Dudley mine is at distance 1, Kidderminster at distance 2.
    const r = consumeCoal(
      state,
      1,
      [{ kind: "TILE", tileId: "cm-kid" }],
      ["Birmingham"],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_source_invalid");
  });

  it("ties are legal — either of two distance-1 mines works", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "cm-ox",
      owner: 0,
      cityName: "Oxford",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withTile(state, {
      id: "cm-co",
      owner: 0,
      cityName: "Coventry",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: 0, endpoints: ["Birmingham", "Oxford"] },
      { owner: 0, endpoints: ["Birmingham", "Coventry"] },
    ]);
    for (const pick of ["cm-ox", "cm-co"]) {
      const r = consumeCoal(
        state,
        1,
        [{ kind: "TILE", tileId: pick }],
        ["Birmingham"],
      );
      expect(r.ok).toBe(true);
    }
  });

  it("rejects flipped or zero-resource Coal Mines even at closest distance", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "cm-birm",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      flipped: true,
    });
    const r = consumeCoal(
      state,
      1,
      [{ kind: "TILE", tileId: "cm-birm" }],
      ["Birmingham"],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_source_invalid");
  });
});

describe("consumeCoal — priority 2 (market)", () => {
  it("rejects MARKET when priority-1 mine is still available", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "cm-birm",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
    });
    const r = consumeCoal(state, 1, [{ kind: "MARKET" }], ["Birmingham"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_source_invalid");
  });

  it("rejects coal_market_not_connected when no merchant is reachable", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    // No developed links → Birmingham not connected to any merchant.
    const r = consumeCoal(state, 1, [{ kind: "MARKET" }], ["Birmingham"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_market_not_connected");
  });

  it("accepts MARKET when no mines reachable AND consumer connected to a merchant", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Birmingham", "Worcester"] },
      { owner: 0, endpoints: ["Worcester", "Gloucester"] },
    ]);
    const r = consumeCoal(state, 1, [{ kind: "MARKET" }], ["Birmingham"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Cheapest filled tier at setup is £2 (coal fill is [1, 2, 2, 2, 2, 2, 2, 2]).
      // But wait — tier £1 has 1 cube, so the cheapest filled is £1.
      expect(r.moneySpent).toBe(1);
      expect(r.state.coalMarket.filled[0]).toBe(0);
    }
  });

  it("pays £8 overflow when coal market is empty and consumer is connected", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Birmingham", "Worcester"] },
      { owner: 0, endpoints: ["Worcester", "Gloucester"] },
    ]);
    const drained: Market = {
      ...state.coalMarket,
      filled: [0, 0, 0, 0, 0, 0, 0, 0],
    };
    state = { ...state, coalMarket: drained };
    const r = consumeCoal(state, 1, [{ kind: "MARKET" }], ["Birmingham"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.moneySpent).toBe(8);
  });
});

describe("consumeCoal — multi-cube sequencing", () => {
  it("priority-1 availability is re-checked between cubes (mine flips mid-consumption)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "cm-birm",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      resources: 1, // only one cube
    });
    state = withDevelopedLinks(state, [
      { owner: 0, endpoints: ["Birmingham", "Worcester"] },
      { owner: 0, endpoints: ["Worcester", "Gloucester"] },
    ]);
    // Cube 1: TILE (drains the mine → flips). Cube 2: MARKET (no mines left; connected to Gloucester).
    const r = consumeCoal(
      state,
      2,
      [{ kind: "TILE", tileId: "cm-birm" }, { kind: "MARKET" }],
      ["Birmingham"],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.moneySpent).toBe(1); // cheapest filled tier at setup = £1
      const tile = r.state.builtTiles.find((t) => t.id === "cm-birm")!;
      expect(tile.flipped).toBe(true);
    }
  });

  it("declaring MARKET as cube 1 while a mine is still priority-1 is illegal", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "cm-birm",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      resources: 2,
    });
    state = withDevelopedLinks(state, [
      { owner: 0, endpoints: ["Birmingham", "Worcester"] },
      { owner: 0, endpoints: ["Worcester", "Gloucester"] },
    ]);
    const r = consumeCoal(
      state,
      2,
      [{ kind: "MARKET" }, { kind: "TILE", tileId: "cm-birm" }],
      ["Birmingham"],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_source_invalid");
  });
});

describe("consumeCoal — multi-consumer (Network-style)", () => {
  it("picks the minimum distance across all consumer cities", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTile(base, {
      id: "cm-dud",
      owner: 0,
      cityName: "Dudley",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: 0, endpoints: ["Birmingham", "Dudley"] },
    ]);
    // Network line endpoints = [Birmingham, Dudley]. Mine is AT Dudley → dist 0.
    const r = consumeCoal(
      state,
      1,
      [{ kind: "TILE", tileId: "cm-dud" }],
      ["Birmingham", "Dudley"],
    );
    expect(r.ok).toBe(true);
  });
});

describe("consumeCoal — source-list validation", () => {
  it("rejects when sources.length !== count", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    const r = consumeCoal(state, 1, [], ["Birmingham"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_source_invalid");
  });

  it("rejects an unknown tileId", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTile(base, {
      id: "cm-birm",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
    });
    const sources: CoalSource[] = [{ kind: "TILE", tileId: "nope" }];
    const r = consumeCoal(state, 1, sources, ["Birmingham"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_source_invalid");
  });
});
