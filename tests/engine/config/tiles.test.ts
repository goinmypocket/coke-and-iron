import { describe, it, expect } from "vitest";
import {
  DEFAULT_TILES_CONFIG,
  extractCatalogue,
  parseTilesConfig,
} from "../../../src/engine/config/tiles";

describe("tiles config", () => {
  it("loads the bundled industry_tiles.json with 29 tiles", () => {
    expect(DEFAULT_TILES_CONFIG.tiles).toHaveLength(29);
  });

  it("includes all 6 industries", () => {
    const industries = new Set(DEFAULT_TILES_CONFIG.tiles.map((t) => t.industry));
    expect(industries).toEqual(
      new Set([
        "COAL_MINE",
        "IRON_WORKS",
        "BREWERY",
        "COTTON_MILL",
        "MANUFACTURER",
        "POTTERY",
      ]),
    );
  });

  it("Coal Mine I matches the published catalogue", () => {
    const cm1 = DEFAULT_TILES_CONFIG.tiles.find(
      (t) => t.industry === "COAL_MINE" && t.level === 1,
    );
    expect(cm1).toBeDefined();
    expect(cm1?.costMoney).toBe(5);
    expect(cm1?.qty).toBe(1);
    expect(cm1?.canalOnly).toBe(true);
    expect(cm1?.resourceCapacity).toBe(2);
    expect(cm1?.linkPoints).toBe(2);
    expect(cm1?.incomeBonus).toBe(4);
  });

  it("only Pottery I and III carry the light-bulb flag (§2.9.2.1)", () => {
    const lit = DEFAULT_TILES_CONFIG.tiles.filter((t) => t.lightBulb);
    expect(lit).toHaveLength(2);
    expect(lit.every((t) => t.industry === "POTTERY")).toBe(true);
    const levels = lit.map((t) => t.level).sort();
    expect(levels).toEqual([1, 3]);
  });

  it("only Breweries override resourceCapacityRail", () => {
    for (const t of DEFAULT_TILES_CONFIG.tiles) {
      if (t.industry === "BREWERY") {
        expect(t.resourceCapacityRail).toBe(2);
      } else {
        expect(t.resourceCapacityRail).toBeNull();
      }
    }
  });

  it("Brewery IV is the only rail-only Brewery (§2.9.1)", () => {
    const railOnly = DEFAULT_TILES_CONFIG.tiles.filter((t) => t.railOnly);
    expect(railOnly).toHaveLength(2);
    const ids = railOnly.map((t) => `${t.industry}-${t.level}`).sort();
    expect(ids).toEqual(["BREWERY-4", "POTTERY-5"]);
  });

  it("extractCatalogue produces an entry per parsed tile", () => {
    const cat = extractCatalogue(DEFAULT_TILES_CONFIG);
    expect(cat).toHaveLength(29);
    expect(cat[0]).toEqual(DEFAULT_TILES_CONFIG.tiles[0]);
  });

  it("rejects garbage input via parseTilesConfig", () => {
    expect(() => parseTilesConfig({ tiles: "not an array" })).toThrow();
    expect(() => parseTilesConfig({ tiles: [] })).toThrow();
  });
});
