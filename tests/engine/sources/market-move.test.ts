import { describe, it, expect } from "vitest";
import { initialState } from "../../../engine";
import { moveCubesToMarket } from "../../../engine/sources/market-move";
import type { GameState, IndustryName, Market, PlayerId } from "../../../engine";

function plantTile(
  state: GameState,
  params: {
    id: string;
    owner: PlayerId;
    cityName: string;
    industry: IndustryName;
    level: number;
    resources: number;
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
        resources: params.resources,
        flipped: false,
      },
    ],
  };
}

describe("moveCubesToMarket — Coal Mine onto Coal Market (§5.1.1 / §2.11.1)", () => {
  it("fills most-expensive-empty first and credits the owner at that tier", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Coal market at setup: [1, 2, 2, 2, 2, 2, 2] — one £1 slot empty.
    const state = plantTile(base, {
      id: "cm-1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      resources: 2, // level-1 Coal Mine capacity
    });

    const r = moveCubesToMarket(state, "cm-1", "coalMarket");
    // Only 1 empty slot (£1). One cube moves there, 1 cube stays on the tile.
    expect(r.ownerGain).toBe(1);
    expect(r.state.coalMarket.filled).toEqual([2, 2, 2, 2, 2, 2, 2]);
    const tile = r.state.builtTiles.find((t) => t.id === "cm-1")!;
    expect(tile.resources).toBe(1);
    expect(tile.flipped).toBe(false);
  });

  it("flips the tile and advances income when every cube moves out", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Force a lot of market emptiness so all cubes can move.
    const emptyMarket: Market = {
      ...base.coalMarket,
      filled: [0, 0, 0, 0, 0, 0, 0],
    };
    let state: GameState = { ...base, coalMarket: emptyMarket };
    state = plantTile(state, {
      id: "cm-1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      resources: 2,
    });

    const beforeIncome = state.players[0]!.incomeStep;
    const incomeBonus = state.tileCatalogue.find(
      (s) => s.industry === "COAL_MINE" && s.level === 1,
    )!.incomeBonus;

    const r = moveCubesToMarket(state, "cm-1", "coalMarket");
    // Both cubes move. Most-expensive empty first: £7 takes first, then £7 again.
    // The £8 row is the unlimited overflow — never a sell target.
    expect(r.ownerGain).toBe(14); // £7 + £7
    expect(r.state.coalMarket.filled).toEqual([0, 0, 0, 0, 0, 0, 2]);
    const tile = r.state.builtTiles.find((t) => t.id === "cm-1")!;
    expect(tile.resources).toBe(0);
    expect(tile.flipped).toBe(true);
    expect(r.state.players[0]!.incomeStep).toBe(beforeIncome + incomeBonus);
  });

  it("partial fill: market saturates with some cubes left on the tile", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Market already saturated (every tier full).
    const fullMarket: Market = {
      ...base.coalMarket,
      filled: [2, 2, 2, 2, 2, 2, 2],
    };
    let state: GameState = { ...base, coalMarket: fullMarket };
    state = plantTile(state, {
      id: "cm-1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      resources: 2,
    });
    const r = moveCubesToMarket(state, "cm-1", "coalMarket");
    expect(r.ownerGain).toBe(0);
    expect(r.state.coalMarket.filled).toEqual([2, 2, 2, 2, 2, 2, 2]);
    const tile = r.state.builtTiles.find((t) => t.id === "cm-1")!;
    expect(tile.resources).toBe(2);
    expect(tile.flipped).toBe(false);
  });
});

describe("moveCubesToMarket — Iron Works onto Iron Market", () => {
  it("fills most-expensive-empty first and credits the owner", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Iron market at setup: [0, 2, 2, 2, 2] — both £1 slots empty.
    const state = plantTile(base, {
      id: "iw-1",
      owner: 1,
      cityName: "Coalbrookdale",
      industry: "IRON_WORKS",
      level: 1,
      resources: 4, // level-1 Iron Works capacity
    });

    const beforeIncome = state.players[1]!.incomeStep;
    const incomeBonus = state.tileCatalogue.find(
      (s) => s.industry === "IRON_WORKS" && s.level === 1,
    )!.incomeBonus;

    const r = moveCubesToMarket(state, "iw-1", "ironMarket");
    // 2 £1 slots are empty. Most-expensive-empty-first means we search
    // from tier[4] (£5) down. Tiers £2..£5 are full; only £1 is empty
    // (2 slots). Both cubes go to £1: gain = £2. Tile drains 4 → 2.
    expect(r.ownerGain).toBe(2);
    expect(r.state.ironMarket.filled).toEqual([2, 2, 2, 2, 2]);
    const tile = r.state.builtTiles.find((t) => t.id === "iw-1")!;
    expect(tile.resources).toBe(2);
    expect(tile.flipped).toBe(false);
    // Not flipped → income unchanged.
    expect(r.state.players[1]!.incomeStep).toBe(beforeIncome);
    void incomeBonus;
  });
});
