import { describe, it, expect } from "vitest";
import {
  DEFAULT_CITIES_CONFIG,
  buildMerchantBag,
  extractDistrictCities,
  extractMerchantCities,
  parseCitiesConfig,
} from "../../../src/engine/config/cities";

describe("cities config", () => {
  it("loads district cities from the bundled board.json", () => {
    const districts = extractDistrictCities(DEFAULT_CITIES_CONFIG);
    expect(districts.length).toBeGreaterThan(15);
    expect(districts.some((c) => c.name === "Birmingham")).toBe(true);
  });

  it("Birmingham has four slots starting with a Cotton/Manufacturer combo (§2.3 / board.json)", () => {
    const districts = extractDistrictCities(DEFAULT_CITIES_CONFIG);
    const birmingham = districts.find((c) => c.name === "Birmingham");
    expect(birmingham).toBeDefined();
    expect(birmingham?.slots).toHaveLength(4);
    expect(birmingham?.slots[0]?.acceptList).toEqual([
      "COTTON_MILL",
      "MANUFACTURER",
    ]);
    // §5.1 step 2 specific-before-combo applies because subsequent slots
    // are MANUFACTURER-specific.
    expect(birmingham?.slots[1]?.acceptList).toEqual(["MANUFACTURER"]);
  });

  it("the two Farm Brewery cities are tagged farmBrewery=true and tagged 'farm' district", () => {
    const districts = extractDistrictCities(DEFAULT_CITIES_CONFIG);
    const farms = districts.filter((c) => c.farmBrewery);
    expect(farms).toHaveLength(2);
    for (const f of farms) {
      expect(f.districtTag).toBe("farm");
      expect(f.slots).toHaveLength(1);
      expect(f.slots[0]?.acceptList).toEqual(["BREWERY"]);
    }
  });

  it("a raw 'ANY' slot maps to an empty acceptList (§2.3)", () => {
    // Synthetic config — bundled board.json no longer ships any
    // wildcard slots, but the loader contract still has to honour
    // "ANY" → empty acceptList for any future config that uses it.
    const cfg = parseCitiesConfig({
      cities: [
        {
          name: "Test",
          district: "purple",
          position: [0, 0],
          slots: ["ANY", "COAL_MINE"],
        },
      ],
      industryNames: [
        "COAL_MINE",
        "IRON_WORKS",
        "BREWERY",
        "COTTON_MILL",
        "MANUFACTURER",
        "POTTERY",
      ],
      marketPlace: { position: [0, 0] },
      roundTracker: { position: [0, 0] },
      merchantBag: {
        "2": { any: 0, cotton: 0, empty: 0, manufacturer: 0, pottery: 0 },
        "3": { any: 0, cotton: 0, empty: 0, manufacturer: 0, pottery: 0 },
        "4": { any: 0, cotton: 0, empty: 0, manufacturer: 0, pottery: 0 },
      },
      merchantCities: [],
    });
    const districts = extractDistrictCities(cfg);
    const test = districts.find((c) => c.name === "Test");
    expect(test).toBeDefined();
    expect(test?.slots[0]?.acceptList).toEqual([]);
    expect(test?.slots[1]?.acceptList).toEqual(["COAL_MINE"]);
  });

  it("extractMerchantCities exposes Shrewsbury / Nottingham / Gloucester / Oxford / Warrington with linkPoints=2", () => {
    const merchants = extractMerchantCities(DEFAULT_CITIES_CONFIG);
    const names = merchants.map((m) => m.name).sort();
    expect(names).toEqual([
      "Gloucester",
      "Nottingham",
      "Oxford",
      "Shrewsbury",
      "Warrington",
    ]);
    for (const m of merchants) {
      expect(m.linkPoints).toBe(2);
    }
  });

  it("Warrington is active only at 4 players (§2.4)", () => {
    const merchants = extractMerchantCities(DEFAULT_CITIES_CONFIG);
    const warr = merchants.find((m) => m.name === "Warrington");
    expect(warr?.activePlayerCounts).toEqual([4]);
  });

  it("Oxford fires INCOME 2 on merchant beer consumption (§5.4.1)", () => {
    const merchants = extractMerchantCities(DEFAULT_CITIES_CONFIG);
    const oxford = merchants.find((m) => m.name === "Oxford");
    expect(oxford?.bonus).toBe("INCOME");
    expect(oxford?.bonusValue).toBe(2);
  });

  it("buildMerchantBag size matches the active merchant slots at each player count", () => {
    const merchants = extractMerchantCities(DEFAULT_CITIES_CONFIG);
    for (const playerCount of [2, 3, 4] as const) {
      const activeSlots = merchants
        .filter((m) => m.activePlayerCounts.includes(playerCount))
        .reduce((sum, m) => sum + m.slotCount, 0);
      const bag = buildMerchantBag(DEFAULT_CITIES_CONFIG, playerCount);
      expect(bag.length).toBe(activeSlots);
    }
  });

  it("buildMerchantBag for 2 players only includes accepts active at 2P", () => {
    const bag = buildMerchantBag(DEFAULT_CITIES_CONFIG, 2);
    // 2P bag has 1 ANY + 1 COTTON_MILL + 1 MANUFACTURER + 2 BLANK + 0 POTTERY
    const counts: Record<string, number> = {};
    for (const a of bag) counts[a] = (counts[a] ?? 0) + 1;
    expect(counts["POTTERY"] ?? 0).toBe(0);
  });

  it("rejects garbage input via parseCitiesConfig", () => {
    expect(() => parseCitiesConfig({})).toThrow();
    expect(() =>
      parseCitiesConfig({
        cities: [],
        industryNames: [],
        marketPlace: { position: [0, 0] },
        roundTracker: { position: [0, 0] },
        merchantBag: {},
        merchantCities: [],
      }),
    ).toThrow();
  });
});
