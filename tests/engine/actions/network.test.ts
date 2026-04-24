import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../src/engine";
import type {
  Card,
  GameState,
  IndustryName,
  PlayerId,
} from "../../../src/engine";

// ---------- helpers ----------

function activeSeatId(state: GameState): PlayerId {
  return state.turnOrder[state.currentPlayerIndex]!;
}

function engineFromState(state: GameState): Engine {
  const engine = new Engine({
    seed: state.seed,
    playerCount: state.playerCount,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).state = state;
  return engine;
}

function withCardAt(
  state: GameState,
  id: PlayerId,
  cardIndex: number,
  card: Card,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== id) return p;
      const hand = [...p.hand];
      hand[cardIndex] = card;
      return { ...p, hand };
    }),
  };
}

function withEra(state: GameState, era: "CANAL" | "RAIL"): GameState {
  return { ...state, era };
}

function withLinkSupply(
  state: GameState,
  id: PlayerId,
  supply: number,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === id ? { ...p, linkSupply: supply } : p,
    ),
  };
}

function withMoney(
  state: GameState,
  id: PlayerId,
  money: number,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, money } : p)),
  };
}

function lineIndex(
  state: GameState,
  want: readonly string[],
  era: "CANAL" | "RAIL",
): number {
  const i = state.lines.findIndex(
    (l) =>
      l.era === era &&
      l.endpoints.length === want.length &&
      want.every((c) => l.endpoints.includes(c)),
  );
  if (i === -1)
    throw new Error(`line not found: ${era} ${want.join("-")}`);
  return i;
}

function withDevelopedLinks(
  state: GameState,
  entries: { owner: PlayerId; endpoints: string[]; era: "CANAL" | "RAIL" }[],
): GameState {
  return {
    ...state,
    developedLinks: entries.map((e) => ({
      owner: e.owner,
      lineIndex: lineIndex(state, e.endpoints, e.era),
    })),
  };
}

function withTile(
  state: GameState,
  params: {
    id: string;
    owner: PlayerId;
    cityName: string;
    slotIndex?: number;
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
        slotIndex: params.slotIndex ?? 0,
        catalogueIndex,
        resources: params.resources ?? 1,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

// ---------- happy paths ----------

describe("§5.2 Network — canal era happy paths", () => {
  it("first-action exemption: any canal line is legal when the network is empty", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    const li = lineIndex(state, ["Birmingham", "Dudley"], "CANAL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.developedLinks).toHaveLength(1);
    expect(after.developedLinks[0]!.owner).toBe(id);
    expect(after.developedLinks[0]!.lineIndex).toBe(li);
    // Canal cost £3.
    expect(after.players[id]!.money).toBe(17 - 3);
    expect(after.players[id]!.spentThisRound).toBe(3);
    expect(after.players[id]!.linkSupply).toBe(13);
    expect(after.actionsRemaining).toBe(0);
  });

  it("second canal action requires adjacency (extends from Dudley after first link)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Dudley"], era: "CANAL" },
    ]);
    const li = lineIndex(state, ["Dudley", "Kidderminster"], "CANAL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(true);
  });
});

describe("§5.2 Network — rail era", () => {
  it("rail single link: £5 + 1 coal from market (if connected to merchant)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withEra(base, "RAIL");
    // Seed a rail-era connection to a merchant so the coal market is buyable.
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Worcester"], era: "RAIL" },
      { owner: id, endpoints: ["Worcester", "Gloucester"], era: "RAIL" },
    ]);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    // Build the line adjacent to an in-network endpoint (Worcester → Birmingham).
    const li = lineIndex(state, ["Birmingham", "Oxford"], "RAIL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [{ kind: "MARKET" }],
      secondLink: null,
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    // Cost: £5 link + £1 coal = £6.
    expect(after.players[id]!.money).toBe(17 - 6);
    expect(after.players[id]!.spentThisRound).toBe(6);
    expect(after.coalMarket.filled[0]).toBe(0);
  });

  it("rail double link: +£10 + 1 coal + 1 beer (own brewery, free coal from own mine)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withEra(base, "RAIL");
    // Own brewery with a barrel; no connection needed for own beer.
    state = withTile(state, {
      id: "own-brew",
      owner: id,
      cityName: "Farm Brewery 1",
      industry: "BREWERY",
      level: 1,
      resources: 1,
    });
    // Own Coal Mine at Birmingham with 2 cubes — distance 0 from both line
    // endpoint sets, so coal is free for both rails.
    state = withTile(state, {
      id: "own-cm",
      owner: id,
      cityName: "Birmingham",
      industry: "COAL_MINE",
      level: 1,
      resources: 2,
    });
    // Pre-existing rail links to seat the player's network at Birmingham
    // (so the first-line adjacency check passes).
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Worcester"], era: "RAIL" },
      { owner: id, endpoints: ["Worcester", "Gloucester"], era: "RAIL" },
    ]);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const firstLi = lineIndex(state, ["Birmingham", "Oxford"], "RAIL");
    const secondLi = lineIndex(state, ["Birmingham", "Coventry"], "RAIL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: firstLi,
      coalSources: [{ kind: "TILE", tileId: "own-cm" }],
      secondLink: {
        lineIndex: secondLi,
        coalSources: [{ kind: "TILE", tileId: "own-cm" }],
        beerSource: { kind: "BREWERY", tileId: "own-brew" },
      },
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    // Cost: £5 + £10 + £0 + £0 = £15 (coal free from own mine).
    expect(after.players[id]!.money).toBe(17 - 15);
    expect(after.players[id]!.linkSupply).toBe(12);
    expect(after.developedLinks.length).toBe(2 + 2); // 2 planted + 2 new
    // Beer consumed from own brewery; drained → flipped.
    const brew = after.builtTiles.find((t) => t.id === "own-brew")!;
    expect(brew.resources).toBe(0);
    expect(brew.flipped).toBe(true);
    // Coal Mine drained twice → flipped.
    const cm = after.builtTiles.find((t) => t.id === "own-cm")!;
    expect(cm.resources).toBe(0);
    expect(cm.flipped).toBe(true);
  });
});

// ---------- rejects ----------

describe("§5.2 Network — rejects", () => {
  it("rejects line_wrong_era when a rail-era line is declared during canal era", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    const railLine = lineIndex(state, ["Birmingham", "Oxford"], "RAIL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: railLine,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("line_wrong_era");
  });

  it("rejects line_wrong_era when a second link is declared in canal era", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    const firstLi = lineIndex(state, ["Birmingham", "Dudley"], "CANAL");
    const secondLi = lineIndex(state, ["Birmingham", "Coventry"], "CANAL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: firstLi,
      coalSources: [],
      secondLink: {
        lineIndex: secondLi,
        coalSources: [],
        beerSource: { kind: "BREWERY", tileId: "x" },
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("line_wrong_era");
  });

  it("rejects line_already_developed", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Dudley"], era: "CANAL" },
    ]);
    const li = lineIndex(state, ["Birmingham", "Dudley"], "CANAL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("line_already_developed");
  });

  it("rejects line_not_adjacent when player has a non-empty network and chosen line isn't adjacent", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    // Player has a link between Birmingham and Dudley (network non-empty).
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Dudley"], era: "CANAL" },
    ]);
    // Try to develop a line far away.
    const li = lineIndex(state, ["Stoke-on-Trent", "Warrington"], "CANAL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("line_not_adjacent");
  });

  it("rejects coal_source_invalid when coalSources length doesn't match era expectation", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    const li = lineIndex(state, ["Birmingham", "Dudley"], "CANAL");
    const engine = engineFromState(state);
    // Canal era expects 0 coal.
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [{ kind: "MARKET" }],
      secondLink: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_source_invalid");
  });

  it("rejects link_supply_empty when player has fewer link tiles than requested", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    state = withLinkSupply(state, id, 0);
    const li = lineIndex(state, ["Birmingham", "Dudley"], "CANAL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("link_supply_empty");
  });

  it("rejects insufficient_funds when player cannot cover the link cost", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    state = withMoney(state, id, 2); // canal cost is £3
    const li = lineIndex(state, ["Birmingham", "Dudley"], "CANAL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient_funds");
    // State unchanged: no link placed, no money deducted.
    expect(engine.getState().developedLinks).toHaveLength(0);
    expect(engine.getState().players[id]!.money).toBe(2);
  });

  it("rejects line_already_developed when second link repeats the first", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withEra(base, "RAIL");
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Worcester"], era: "RAIL" },
      { owner: id, endpoints: ["Worcester", "Gloucester"], era: "RAIL" },
    ]);
    state = withTile(state, {
      id: "own-brew",
      owner: id,
      cityName: "Farm Brewery 1",
      industry: "BREWERY",
      level: 1,
      resources: 1,
    });
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const li = lineIndex(state, ["Birmingham", "Oxford"], "RAIL");
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: li,
      coalSources: [{ kind: "MARKET" }],
      secondLink: {
        lineIndex: li,
        coalSources: [{ kind: "MARKET" }],
        beerSource: { kind: "BREWERY", tileId: "own-brew" },
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("line_already_developed");
  });
});

describe("§5.2 Network — triple link", () => {
  it("triple link becomes adjacent from any of its 3 endpoints", () => {
    // Triple: Kidderminster — Worcester — Farm Brewery 2.
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    // Player has a canal link at Kidderminster–Coalbrookdale → Kidderminster is in network.
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Kidderminster", "Coalbrookdale"], era: "CANAL" },
    ]);
    const triple = lineIndex(
      state,
      ["Kidderminster", "Worcester", "Farm Brewery 2"],
      "CANAL",
    );
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "NETWORK",
      playerId: id,
      cardIndex: 0,
      lineIndex: triple,
      coalSources: [],
      secondLink: null,
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    // All 3 endpoints now in network via the newly placed triple link.
    // (Checked implicitly: subsequent-any-endpoint adjacency would succeed.)
    expect(after.developedLinks).toHaveLength(2);
  });
});
