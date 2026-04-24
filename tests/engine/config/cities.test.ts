import { describe, it, expect } from "vitest";
import {
  DEFAULT_CITIES_CONFIG,
  buildMerchantBag,
  extractDistrictCities,
  extractMerchantCities,
  parseCitiesConfig,
} from "../../../src/engine/config/cities";

describe("cities config", () => {
  it("loads district cities from the bundled cities.json", () => {
    const districts = extractDistrictCities(DEFAULT_CITIES_CONFIG);
    expect(districts.length).toBeGreaterThan(15);
    expect(districts.some((c) => c.name === "Birmingham")).toBe(true);
  });

  it("Birmingham has four slots starting with a Cotton/Manufacturer combo (§2.3 / cities.json)", () => {
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

  it("a 'Stone' wildcard slot maps to an empty acceptList (§2.3)", () => {
    const districts = extractDistrictCities(DEFAULT_CITIES_CONFIG);
    const stone = districts.find((c) => c.name === "Stone");
    expect(stone).toBeDefined();
    const wildSlot = stone?.slots.find((s) => s.acceptList.length === 0);
    expect(wildSlot).toBeDefined();
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
        merchantBag: {},
        merchantCities: [],
      }),
    ).toThrow();
  });
});
