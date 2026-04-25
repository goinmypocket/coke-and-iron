import { describe, it, expect } from "vitest";
import {
  DEFAULT_CARDS_CONFIG,
  buildDeck,
  parseCardsConfig,
} from "../../../src/engine/config/cards";

describe("cards config", () => {
  it("loads the bundled cards.json with the §3.2 starting hand size of 8", () => {
    expect(DEFAULT_CARDS_CONFIG.startingHandSize).toBe(8);
  });

  it("declares a 4 + 4 wild reserve (§2.13)", () => {
    expect(DEFAULT_CARDS_CONFIG.wild).toEqual({ location: 4, industry: 4 });
  });

  it("dual Cotton/Manufacturer card is absent at 2 players, present at 3+ (§2.13)", () => {
    expect(DEFAULT_CARDS_CONFIG.dualCottonManufacturer["2"]).toBe(0);
    expect(DEFAULT_CARDS_CONFIG.dualCottonManufacturer["3"]).toBeGreaterThan(0);
    expect(DEFAULT_CARDS_CONFIG.dualCottonManufacturer["4"]).toBeGreaterThan(0);
  });

  it("buildDeck for 2 players includes no dual Cotton/Manufacturer cards", () => {
    const deck = buildDeck(DEFAULT_CARDS_CONFIG, 2);
    // The dual card collapses into the INDUSTRY variant with industries =
    // [COTTON_MILL, MANUFACTURER]; at 2P the config sets its count to 0.
    expect(
      deck.some(
        (c) =>
          c.kind === "INDUSTRY" &&
          c.industries.length === 2 &&
          c.industries.includes("COTTON_MILL") &&
          c.industries.includes("MANUFACTURER"),
      ),
    ).toBe(false);
  });

  it("buildDeck for 4 players includes a Derby Location card and a 4-player Belper card", () => {
    const deck = buildDeck(DEFAULT_CARDS_CONFIG, 4);
    expect(
      deck.some((c) => c.kind === "LOCATION" && c.cityName === "Derby"),
    ).toBe(true);
    expect(
      deck.some((c) => c.kind === "LOCATION" && c.cityName === "Belper"),
    ).toBe(true);
  });

  it("buildDeck never includes Wild cards (they live in the wild reserve)", () => {
    const deck = buildDeck(DEFAULT_CARDS_CONFIG, 3);
    expect(deck.some((c) => c.kind === "WILD_LOCATION")).toBe(false);
    expect(deck.some((c) => c.kind === "WILD_INDUSTRY")).toBe(false);
  });

  it("buildDeck size grows with player count", () => {
    const sizes = ([2, 3, 4] as const).map((n) =>
      buildDeck(DEFAULT_CARDS_CONFIG, n).length,
    );
    expect(sizes[0]).toBeLessThan(sizes[1]!);
    expect(sizes[1]).toBeLessThan(sizes[2]!);
  });

  it("rejects garbage input via parseCardsConfig", () => {
    expect(() => parseCardsConfig({})).toThrow();
    expect(() =>
      parseCardsConfig({
        startingHandSize: "eight",
        location: {},
        industry: {},
        dualCottonManufacturer: {},
        wild: {},
      }),
    ).toThrow();
  });
});
