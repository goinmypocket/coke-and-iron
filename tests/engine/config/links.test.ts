import { describe, it, expect } from "vitest";
import {
  DEFAULT_LINKS_CONFIG,
  extractLines,
  parseLinksConfig,
} from "../../../src/engine/config/links";

describe("links config", () => {
  it("loads the bundled links.json", () => {
    expect(DEFAULT_LINKS_CONFIG.canal.length).toBeGreaterThan(0);
    expect(DEFAULT_LINKS_CONFIG.rail.length).toBeGreaterThan(0);
  });

  it("rail era has more lines than canal era (Birmingham–Nuneaton etc. open up)", () => {
    expect(DEFAULT_LINKS_CONFIG.rail.length).toBeGreaterThan(
      DEFAULT_LINKS_CONFIG.canal.length,
    );
  });

  it("contains the Kidderminster–Worcester–Farm Brewery 2 triple link in both eras (§2.6.1)", () => {
    const tripleEndpoints = ["Kidderminster", "Worcester", "Farm Brewery 2"];
    const matches = (line: readonly string[]) =>
      line.length === 3 &&
      tripleEndpoints.every((c) => line.includes(c));
    expect(DEFAULT_LINKS_CONFIG.canal.some(matches)).toBe(true);
    expect(DEFAULT_LINKS_CONFIG.rail.some(matches)).toBe(true);
  });

  it("every endpoint list is length 2 or 3", () => {
    const allEndpoints = [
      ...DEFAULT_LINKS_CONFIG.canal,
      ...DEFAULT_LINKS_CONFIG.rail,
    ];
    for (const endpoints of allEndpoints) {
      expect([2, 3]).toContain(endpoints.length);
    }
  });

  it("extractLines tags each line with its era and preserves order", () => {
    const lines = extractLines(DEFAULT_LINKS_CONFIG);
    expect(lines).toHaveLength(
      DEFAULT_LINKS_CONFIG.canal.length + DEFAULT_LINKS_CONFIG.rail.length,
    );
    const canalCount = lines.filter((l) => l.era === "CANAL").length;
    const railCount = lines.filter((l) => l.era === "RAIL").length;
    expect(canalCount).toBe(DEFAULT_LINKS_CONFIG.canal.length);
    expect(railCount).toBe(DEFAULT_LINKS_CONFIG.rail.length);
  });

  it("rejects garbage input via parseLinksConfig", () => {
    expect(() => parseLinksConfig({ canal: "x", rail: [] })).toThrow();
    expect(() => parseLinksConfig({ canal: [["A"]], rail: [] })).toThrow();
  });
});
