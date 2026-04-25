import { describe, it, expect } from "vitest";
import { initialState } from "../../../src/engine";
import {
  buyFromMarket,
  consumeIron,
} from "../../../src/engine/sources/iron";
import type { GameState, IronSource, Market } from "../../../src/engine";

function plantTile(
  state: GameState,
  params: {
    id: string;
    owner: number;
    cityName: string;
    industry: "IRON_WORKS" | "COAL_MINE" | "BREWERY";
    level: number;
    resources: number;
    flipped?: boolean;
  },
): GameState {
  const catalogueIndex = state.tileCatalogue.findIndex(
    (s) => s.industry === params.industry && s.level === params.level,
  );
  if (catalogueIndex === -1) throw new Error("no matching catalogue entry");
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
        resources: params.resources,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

describe("consumeIron — TILE source (§5.6.2 pri 1)", () => {
  it("decrements resources on an unflipped Iron Works (no flip yet)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = plantTile(base, {
      id: "iw-1",
      owner: 0,
      cityName: "Coalbrookdale",
      industry: "IRON_WORKS",
      level: 1,
      resources: 4,
    });
    const r = consumeIron(state, 1, [{ kind: "TILE", tileId: "iw-1" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moneySpent).toBe(0);
    const tile = r.state.builtTiles.find((t) => t.id === "iw-1")!;
    expect(tile.resources).toBe(3);
    expect(tile.flipped).toBe(false);
  });

  it("flips on last cube and advances owner income by incomeBonus (§2.10, §5.1 step 8)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = plantTile(base, {
      id: "iw-1",
      owner: 0,
      cityName: "Coalbrookdale",
      industry: "IRON_WORKS",
      level: 1,
      resources: 1,
    });
    const beforeStep = state.players[0]!.incomeStep;
    const incomeBonus = base.tileCatalogue.find(
      (s) => s.industry === "IRON_WORKS" && s.level === 1,
    )!.incomeBonus;

    const r = consumeIron(state, 1, [{ kind: "TILE", tileId: "iw-1" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tile = r.state.builtTiles.find((t) => t.id === "iw-1")!;
    expect(tile.resources).toBe(0);
    expect(tile.flipped).toBe(true);
    expect(r.state.players[0]!.incomeStep).toBe(beforeStep + incomeBonus);
  });

  it("rejects a flipped tile", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = plantTile(base, {
      id: "iw-1",
      owner: 0,
      cityName: "C",
      industry: "IRON_WORKS",
      level: 1,
      resources: 2,
      flipped: true,
    });
    const r = consumeIron(state, 1, [{ kind: "TILE", tileId: "iw-1" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("iron_source_invalid");
  });

  it("rejects a zero-resource tile", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = plantTile(base, {
      id: "iw-1",
      owner: 0,
      cityName: "C",
      industry: "IRON_WORKS",
      level: 1,
      resources: 0,
    });
    const r = consumeIron(state, 1, [{ kind: "TILE", tileId: "iw-1" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("iron_source_invalid");
  });

  it("rejects a non-iron tile (e.g. Coal Mine)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = plantTile(base, {
      id: "cm-1",
      owner: 0,
      cityName: "C",
      industry: "COAL_MINE",
      level: 1,
      resources: 2,
    });
    const r = consumeIron(state, 1, [{ kind: "TILE", tileId: "cm-1" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("iron_source_invalid");
  });

  it("rejects an unknown tileId", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    const r = consumeIron(state, 1, [{ kind: "TILE", tileId: "nope" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("iron_source_invalid");
  });

  it("no connection requirement — TILE source from any owner, any location works", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = plantTile(base, {
      id: "iw-opp",
      owner: 1, // opponent's
      cityName: "C",
      industry: "IRON_WORKS",
      level: 1,
      resources: 2,
    });
    const r = consumeIron(state, 1, [{ kind: "TILE", tileId: "iw-opp" }]);
    expect(r.ok).toBe(true);
  });
});

describe("consumeIron — MARKET source (§5.6.2 pri 2)", () => {
  it("buys from the cheapest filled tier at setup (£2) and decrements filled[1]", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    // Iron market at setup: [0, 2, 2, 2, 2]; cheapest filled tier is £2.
    const r = consumeIron(state, 1, [{ kind: "MARKET" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moneySpent).toBe(2);
    expect(r.state.ironMarket.filled).toEqual([0, 1, 2, 2, 2]);
  });

  it("pays the overflow price £6 when the market is completely empty", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const drained: Market = {
      ...base.ironMarket,
      filled: [0, 0, 0, 0, 0],
    };
    const state: GameState = { ...base, ironMarket: drained };
    const r = consumeIron(state, 1, [{ kind: "MARKET" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moneySpent).toBe(6);
    expect(r.state.ironMarket.filled).toEqual([0, 0, 0, 0, 0]);
  });

  it("two market buys in a row: £2 then £2 (second cube in tier £2 slot)", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    const r = consumeIron(state, 2, [{ kind: "MARKET" }, { kind: "MARKET" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moneySpent).toBe(4);
    expect(r.state.ironMarket.filled).toEqual([0, 0, 2, 2, 2]);
  });
});

describe("consumeIron — source-list validation", () => {
  it("rejects when sources.length !== count", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    const r1 = consumeIron(state, 1, []);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("iron_source_invalid");

    const r2 = consumeIron(state, 1, [
      { kind: "MARKET" },
      { kind: "MARKET" },
    ]);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("iron_source_invalid");
  });

  it("mixed TILE + MARKET sources accumulate correctly", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = plantTile(base, {
      id: "iw-1",
      owner: 0,
      cityName: "C",
      industry: "IRON_WORKS",
      level: 1,
      resources: 4,
    });
    const sources: IronSource[] = [
      { kind: "TILE", tileId: "iw-1" },
      { kind: "MARKET" },
    ];
    const r = consumeIron(state, 2, sources);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moneySpent).toBe(2); // one free (TILE) + one market (£2)
    expect(r.state.builtTiles.find((t) => t.id === "iw-1")!.resources).toBe(3);
    expect(r.state.ironMarket.filled).toEqual([0, 1, 2, 2, 2]);
  });
});

describe("buyFromMarket — generic market buy helper", () => {
  it("takes from cheapest filled tier, decrements by 1, returns tier price", () => {
    const market: Market = {
      resource: "IRON",
      tiers: [1, 2, 3, 4, 5],
      filled: [0, 2, 2, 2, 2],
      overflowPrice: 6,
    };
    const { newMarket, price } = buyFromMarket(market);
    expect(price).toBe(2);
    expect(newMarket.filled).toEqual([0, 1, 2, 2, 2]);
  });

  it("returns overflow price with unchanged filled[] when market is empty", () => {
    const market: Market = {
      resource: "COAL",
      tiers: [1, 2, 3, 4, 5, 6, 7],
      filled: [0, 0, 0, 0, 0, 0, 0],
      overflowPrice: 8,
    };
    const { newMarket, price } = buyFromMarket(market);
    expect(price).toBe(8);
    expect(newMarket.filled).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
