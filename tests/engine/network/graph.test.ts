import { describe, it, expect } from "vitest";
import { initialState } from "../../../engine";
import {
  buildDistanceMap,
  isConnectedToAnyMerchantCity,
  isInPlayerNetwork,
  isPlayerNetworkEmpty,
} from "../../../engine/network/graph";
import type {
  GameState,
  IndustryName,
  PlayerId,
} from "../../../engine";

// ---------- test helpers ----------

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

function withTileAt(
  state: GameState,
  params: {
    id: string;
    owner: PlayerId;
    cityName: string;
    industry: IndustryName;
    level: number;
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
        resources: 2,
        flipped: false,
      },
    ],
  };
}

// ---------- tests ----------

describe("buildDistanceMap — any-player developed-link BFS (§2.18 connection)", () => {
  it("with no developed links, only the start cities are reachable at distance 0", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    const dist = buildDistanceMap(state, ["Birmingham"]);
    expect(dist.get("Birmingham")).toBe(0);
    expect(dist.has("Dudley")).toBe(false);
  });

  it("a single 2-endpoint developed link reaches the other endpoint at distance 1", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Birmingham", "Dudley"] },
    ]);
    const dist = buildDistanceMap(state, ["Birmingham"]);
    expect(dist.get("Dudley")).toBe(1);
  });

  it("chains distance across two developed links", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Birmingham", "Dudley"] },
      { owner: 1, endpoints: ["Dudley", "Kidderminster"] },
    ]);
    const dist = buildDistanceMap(state, ["Birmingham"]);
    expect(dist.get("Dudley")).toBe(1);
    expect(dist.get("Kidderminster")).toBe(2);
  });

  it("triple link reaches every other endpoint in ONE hop (§2.6.1)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      {
        owner: 0,
        endpoints: ["Kidderminster", "Worcester", "Farm Brewery 2"],
      },
    ]);
    const dist = buildDistanceMap(state, ["Kidderminster"]);
    expect(dist.get("Worcester")).toBe(1);
    expect(dist.get("Farm Brewery 2")).toBe(1);
  });

  it("multi-source BFS uses min distance across all starts", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Birmingham", "Dudley"] },
      { owner: 0, endpoints: ["Dudley", "Kidderminster"] },
    ]);
    const distSingle = buildDistanceMap(state, ["Birmingham"]);
    expect(distSingle.get("Kidderminster")).toBe(2);
    // Starting from both Birmingham AND Dudley simultaneously, Kidderminster is 1 hop.
    const distMulti = buildDistanceMap(state, ["Birmingham", "Dudley"]);
    expect(distMulti.get("Kidderminster")).toBe(1);
  });

  it("developed links of any player count — connection is player-agnostic", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 1, endpoints: ["Birmingham", "Dudley"] },
    ]);
    expect(buildDistanceMap(state, ["Birmingham"]).get("Dudley")).toBe(1);
  });
});

describe("isConnectedToAnyMerchantCity (§5.6.1 pri 2, §2.11.1)", () => {
  it("returns false when no developed links reach any merchant", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    expect(isConnectedToAnyMerchantCity(state, "Birmingham")).toBe(false);
  });

  it("true via Worcester→Gloucester link (Gloucester is a merchant)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Birmingham", "Worcester"] },
      { owner: 0, endpoints: ["Worcester", "Gloucester"] },
    ]);
    expect(isConnectedToAnyMerchantCity(state, "Birmingham")).toBe(true);
  });

  it("covers inert merchants too (Warrington is inert at 2P but still counts)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Stoke-on-Trent", "Warrington"] },
    ]);
    expect(isConnectedToAnyMerchantCity(state, "Stoke-on-Trent")).toBe(true);
  });
});

describe("isInPlayerNetwork (§2.18, non-transitive)", () => {
  it("city with own tile is in network", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTileAt(base, {
      id: "t1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
    });
    expect(isInPlayerNetwork(state, 0, "Birmingham")).toBe(true);
    expect(isInPlayerNetwork(state, 1, "Birmingham")).toBe(false);
  });

  it("endpoint of own link is in network even without a tile there", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 0, endpoints: ["Birmingham", "Dudley"] },
    ]);
    expect(isInPlayerNetwork(state, 0, "Dudley")).toBe(true);
    expect(isInPlayerNetwork(state, 0, "Birmingham")).toBe(true);
  });

  it("OTHER player's link adjacency does NOT put you in network", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 1, endpoints: ["Birmingham", "Dudley"] },
    ]);
    expect(isInPlayerNetwork(state, 0, "Dudley")).toBe(false);
  });

  it("network is NON-transitive: your tile at A + someone else's link A–B does not put B in your network", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state = withTileAt(base, {
      id: "t1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: 1, endpoints: ["Birmingham", "Dudley"] },
    ]);
    expect(isInPlayerNetwork(state, 0, "Birmingham")).toBe(true);
    expect(isInPlayerNetwork(state, 0, "Dudley")).toBe(false);
  });

  it("all 3 endpoints of an owned triple link are in network (§2.6.1 adjacency)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      {
        owner: 0,
        endpoints: ["Kidderminster", "Worcester", "Farm Brewery 2"],
      },
    ]);
    expect(isInPlayerNetwork(state, 0, "Kidderminster")).toBe(true);
    expect(isInPlayerNetwork(state, 0, "Worcester")).toBe(true);
    expect(isInPlayerNetwork(state, 0, "Farm Brewery 2")).toBe(true);
  });
});

describe("isPlayerNetworkEmpty (§5.1 first-build exemption)", () => {
  it("true at setup — no tiles, no links", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    expect(isPlayerNetworkEmpty(state, 0)).toBe(true);
    expect(isPlayerNetworkEmpty(state, 1)).toBe(true);
  });

  it("false once the player has any tile", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withTileAt(base, {
      id: "t1",
      owner: 0,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
    });
    expect(isPlayerNetworkEmpty(state, 0)).toBe(false);
    expect(isPlayerNetworkEmpty(state, 1)).toBe(true);
  });

  it("false once the player has any link", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withDevelopedLinks(base, [
      { owner: 1, endpoints: ["Birmingham", "Dudley"] },
    ]);
    expect(isPlayerNetworkEmpty(state, 0)).toBe(true);
    expect(isPlayerNetworkEmpty(state, 1)).toBe(false);
  });
});
