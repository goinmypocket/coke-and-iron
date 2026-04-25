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

function withMoney(
  state: GameState,
  id: PlayerId,
  money: number,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === id ? { ...p, money } : p,
    ),
  };
}

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
        resources: params.resources ?? 2,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

// ---------- happy paths ----------

describe("§5.1 Build — happy paths", () => {
  it("builds a level-1 Coal Mine at Dudley slot 0 with a Dudley location card (disconnected → no move-to-market)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    const engine = engineFromState(state);

    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(true);

    const after = engine.getState();
    const tile = after.builtTiles.find((t) => t.cityName === "Dudley");
    expect(tile).toBeDefined();
    expect(tile!.owner).toBe(id);
    // Coal Mine level 1: capacity 2, no merchant connection → cubes stay.
    expect(tile!.resources).toBe(2);
    expect(tile!.flipped).toBe(false);
    const player = after.players[id]!;
    // £17 start - £5 cost + £0 market gain (no move).
    expect(player.money).toBe(17 - 5);
    expect(player.spentThisRound).toBe(5);
    expect(after.actionsRemaining).toBe(0);
    expect(after.nextTileId).toBe(1);
  });

  it("Coal Mine + merchant connection triggers move-to-market: cube moves, owner gains market price", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    // Link Dudley → Birmingham → Worcester → Gloucester (merchant).
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Dudley", "Birmingham"] },
      { owner: id, endpoints: ["Birmingham", "Worcester"] },
      { owner: id, endpoints: ["Worcester", "Gloucester"] },
    ]);
    const engine = engineFromState(state);

    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(true);

    const after = engine.getState();
    // Coal market at setup: [1,2,2,2,2,2,2,2]. Most-expensive-empty is tier 0 (£1).
    // One cube moves → filled[0]=2. Owner gains £1. Tile resources=1.
    expect(after.coalMarket.filled).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    const tile = after.builtTiles.find((t) => t.cityName === "Dudley")!;
    expect(tile.resources).toBe(1);
    expect(tile.flipped).toBe(false);
    // £17 - £5 + £1 = £13.
    expect(after.players[id]!.money).toBe(13);
  });

  it("Iron Works at Coalbrookdale slot 1 always auto-sells (no connection check)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Coalbrookdale",
    });
    const engine = engineFromState(state);

    // Iron Works level 1 needs 1 coal. No mine / no merchant → must reject.
    // Here we first verify happy by giving a connection.
    const linkedState = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Coalbrookdale", "Kidderminster"] },
      { owner: id, endpoints: ["Kidderminster", "Worcester", "Farm Brewery 2"] },
      { owner: id, endpoints: ["Worcester", "Gloucester"] },
    ]);
    const engineLinked = engineFromState(linkedState);
    const r = engineLinked.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Coalbrookdale",
      slotIndex: 1, // IRON_WORKS slot
      industry: "IRON_WORKS",
      coalSources: [{ kind: "MARKET" }], // buy 1 coal
      ironSources: [],
    });
    expect(r.ok).toBe(true);
    const after = engineLinked.getState();
    // Iron market at setup: [0,2,2,2,2,2]. Move-to-market fills tier 0 with
    // 2 cubes from the just-built Iron Works (capacity 4). Gain = £1+£1 = £2.
    expect(after.ironMarket.filled).toEqual([2, 2, 2, 2, 2, 2]);
    const tile = after.builtTiles.find((t) => t.owner === id)!;
    expect(tile.resources).toBe(2);
    expect(tile.flipped).toBe(false);
    // Iron Works lvl 1: cost £5, +1 coal @ £1 = £6 spent, +£2 from auto-sell.
    // £17 - £6 + £2 = £13.
    expect(after.players[id]!.money).toBe(13);
    expect(after.players[id]!.spentThisRound).toBe(6);
  });

  it("wild location card allows building at any city", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, { kind: "WILD_LOCATION" });
    const beforeReserve = state.wildReserve.wildLocation;
    const engine = engineFromState(state);

    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(true);
    // Wild returns to reserve, not discard.
    expect(engine.getState().wildReserve.wildLocation).toBe(beforeReserve + 1);
  });

  it("industry card is legal when the player's network is empty (first-build exemption)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "INDUSTRY",
      industries: ["COAL_MINE"],
    });
    const engine = engineFromState(state);

    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(true);
  });
});

// ---------- card authorisation rejects ----------

describe("§5.1 Build — card authorisation rejects", () => {
  it("rejects a LOCATION card whose city doesn't match", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Birmingham",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("card_does_not_authorise");
  });

  it("rejects an INDUSTRY card whose industry doesn't match", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "INDUSTRY",
      industries: ["IRON_WORKS"],
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("card_does_not_authorise");
  });

  it("rejects a dual Cotton/Manufacturer card for a non-cotton, non-manufacturer industry", () => {
    const base = initialState({ seed: 1, playerCount: 3 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "INDUSTRY",
      industries: ["COTTON_MILL", "MANUFACTURER"],
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("card_does_not_authorise");
  });

  it("INDUSTRY card rejects not_in_network when the player has a tile elsewhere and the target is outside their network", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Player owns a tile at Walsall. Tries to build COAL_MINE at Dudley with
    // an INDUSTRY card. No developed links → Dudley not in network.
    let state = withTile(base, {
      id: "existing",
      owner: id,
      cityName: "Walsall",
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
    });
    state = withCardAt(state, id, 0, {
      kind: "INDUSTRY",
      industries: ["COAL_MINE"],
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_in_network");
  });
});

// ---------- slot / farm-brewery / one-per-city rejects ----------

describe("§5.1 Build — slot + city rejects", () => {
  it("rejects an out-of-range slot index", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 99,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("slot_does_not_accept_industry");
  });

  it("rejects when the chosen slot doesn't accept the industry", () => {
    // Dudley slot 1 is IRON_WORKS specific. Try to place COAL_MINE.
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 1,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("slot_does_not_accept_industry");
  });

  it("rejects combo slot when a specific slot for the same industry is available (specific-before-combo)", () => {
    // Birmingham slot 0 is [COTTON_MILL, MANUFACTURER] combo; slot 1 is
    // [MANUFACTURER] specific. Picking slot 0 with MANUFACTURER should
    // reject because slot 1 is still empty and specific.
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Birmingham",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Birmingham",
      slotIndex: 0,
      industry: "MANUFACTURER",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("specific_slot_available");
  });

  it("rejects overbuild of opponent's non-coal/iron tile (ownership_blocked)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const other: PlayerId = id === 0 ? 1 : 0;
    // Opponent's Cotton Mill at Stone slot 1 (wildcard), flipped + drained.
    let state = withTile(base, {
      id: "opp-cotton",
      owner: other,
      cityName: "Stone",
      slotIndex: 1,
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
      flipped: true,
    });
    // Force player's COTTON_MILL stack top to level 2 (strictly higher).
    const cotton2Idx = state.tileCatalogue.findIndex(
      (s) => s.industry === "COTTON_MILL" && s.level === 2,
    );
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === id
          ? {
              ...p,
              mat: { stacks: { ...p.mat.stacks, COTTON_MILL: [cotton2Idx] } },
            }
          : p,
      ),
    };
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Stone",
      slotIndex: 1,
      industry: "COTTON_MILL",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("overbuild_ownership_blocked");
  });

  it("rejects Canal-era double-build in the same city for the same player (§5.1.4)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Seed Dudley slot 0 with the player's own Coal Mine. Try to build an
    // Iron Works at slot 1 (legal slot, but §5.1.4 blocks).
    let state = withTile(base, {
      id: "own",
      owner: id,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      level: 1,
    });
    state = withCardAt(state, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 1,
      industry: "IRON_WORKS",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("one_tile_per_city_canal");
  });
});

// ---------- farm-brewery ----------

describe("§5.1.2 Farm-brewery card restriction", () => {
  it("rejects a LOCATION card at a farm-brewery city", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const farmCity = base.districtCities.find((c) => c.farmBrewery);
    expect(farmCity).toBeDefined();
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: farmCity!.name,
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: farmCity!.name,
      slotIndex: 0,
      industry: "BREWERY",
      coalSources: [],
      ironSources: [{ kind: "MARKET" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("farm_brewery_wrong_card");
  });

  it("accepts a BREWERY INDUSTRY card at a farm-brewery city (first-build exemption)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const farmCity = base.districtCities.find((c) => c.farmBrewery)!;
    const state = withCardAt(base, id, 0, {
      kind: "INDUSTRY",
      industries: ["BREWERY"],
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: farmCity.name,
      slotIndex: 0,
      industry: "BREWERY",
      coalSources: [],
      ironSources: [{ kind: "MARKET" }], // Brewery level 1 needs 1 iron
    });
    expect(r.ok).toBe(true);
  });
});

// ---------- era + money + resources ----------

describe("§5.1 Build — era / money / resources", () => {
  it("rejects tile_wrong_era if the lowest-level tile is rail-only in canal era", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Force the POTTERY stack to start with the rail-only level-5 tile.
    const rail5Idx = base.tileCatalogue.findIndex(
      (s) => s.industry === "POTTERY" && s.level === 5,
    );
    const state = {
      ...base,
      players: base.players.map((p) =>
        p.id === id
          ? {
              ...p,
              mat: {
                stacks: { ...p.mat.stacks, POTTERY: [rail5Idx] },
              },
              hand: [
                { kind: "LOCATION", cityName: "Stone" } satisfies Card,
                ...p.hand.slice(1),
              ],
            }
          : p,
      ),
    };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Stone",
      slotIndex: 1, // ANY wildcard slot
      industry: "POTTERY",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("tile_wrong_era");
  });

  it("rejects mat_stack_empty when the picked industry's stack is empty", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === id
          ? { ...p, mat: { stacks: { ...p.mat.stacks, COAL_MINE: [] } } }
          : p,
      ),
    };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mat_stack_empty");
  });

  it("rejects insufficient_funds when money < tile cost", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Cotton Mill level 1 costs £12. Birmingham slot 0 is combo [COTTON,MFG].
    // No COTTON-specific slot exists there, so combo is legal for cotton.
    let state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Birmingham",
    });
    state = withMoney(state, id, 5);
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Birmingham",
      slotIndex: 0,
      industry: "COTTON_MILL",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient_funds");
    const after = engine.getState();
    expect(after.players[id]!.money).toBe(5);
    expect(after.builtTiles).toHaveLength(0);
  });

  it("rejects coal_market_not_connected when coal cost > 0 and no mine/merchant is reachable", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Iron Works at Coalbrookdale slot 1 needs 1 coal. No links → no coal.
    const state = withCardAt(base, id, 0, {
      kind: "LOCATION",
      cityName: "Coalbrookdale",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Coalbrookdale",
      slotIndex: 1,
      industry: "IRON_WORKS",
      coalSources: [{ kind: "MARKET" }],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("coal_market_not_connected");
  });
});

// ---------- turn-flow rejects ----------

describe("§5.1 Build — turn-flow rejects", () => {
  it("rejects when a non-active seat dispatches", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const other = id === 0 ? 1 : 0;
    const r = engine.dispatch({
      type: "BUILD",
      playerId: other,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_current_turn");
  });

  it("rejects card_not_in_hand for an out-of-range index", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 42,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("card_not_in_hand");
  });
});

// ---------- overbuild §5.1.3 ----------

function withMatTop(
  state: GameState,
  id: PlayerId,
  industry: IndustryName,
  level: number,
): GameState {
  const idx = state.tileCatalogue.findIndex(
    (s) => s.industry === industry && s.level === level,
  );
  if (idx === -1) throw new Error(`no ${industry} level ${level}`);
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === id
        ? { ...p, mat: { stacks: { ...p.mat.stacks, [industry]: [idx] } } }
        : p,
    ),
  };
}

describe("§5.1.3 Overbuild — happy paths", () => {
  it("player overbuilds their OWN drained Coal Mine with a higher-level one (canal, net-zero swap)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Own level-1 Coal Mine at Dudley slot 0, drained + flipped.
    let state = withTile(base, {
      id: "own-cm1",
      owner: id,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      level: 1,
      resources: 0,
      flipped: true,
    });
    state = withMatTop(state, id, "COAL_MINE", 2);
    state = withCardAt(state, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });

    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(true);

    const after = engine.getState();
    // Old tile gone, new tile at same slot.
    expect(after.builtTiles.find((t) => t.id === "own-cm1")).toBeUndefined();
    const placed = after.builtTiles.find((t) => t.cityName === "Dudley")!;
    expect(placed.owner).toBe(id);
    const spec = after.tileCatalogue[placed.catalogueIndex]!;
    expect(spec.level).toBe(2);
    // Coal Mine level 2: £7, capacity 3. No merchant connection → cubes stay.
    expect(placed.resources).toBe(3);
    expect(after.players[id]!.money).toBe(17 - 7);
    expect(after.players[id]!.spentThisRound).toBe(7);
  });

  it("player overbuilds OPPONENT's Coal Mine when coal is globally exhausted", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const other: PlayerId = id === 0 ? 1 : 0;
    // Opponent's level-1 Coal Mine at Dudley, drained + flipped.
    let state = withTile(base, {
      id: "opp-cm1",
      owner: other,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      level: 1,
      resources: 0,
      flipped: true,
    });
    // Globally exhaust coal: empty the coal market.
    state = {
      ...state,
      coalMarket: {
        ...state.coalMarket,
        filled: [0, 0, 0, 0, 0, 0, 0, 0],
      },
    };
    state = withMatTop(state, id, "COAL_MINE", 2);
    state = withCardAt(state, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });

    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.builtTiles.find((t) => t.id === "opp-cm1")).toBeUndefined();
    const placed = after.builtTiles.find((t) => t.cityName === "Dudley")!;
    expect(placed.owner).toBe(id);
  });
});

describe("§5.1.3 Overbuild — rejects", () => {
  it("rejects overbuild_not_higher_level when the incoming tile is the same level", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "own-cm1",
      owner: id,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      level: 1,
      resources: 0,
      flipped: true,
    });
    // Default mat top for COAL_MINE is level 1 → same level as existing.
    state = withCardAt(state, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("overbuild_not_higher_level");
  });

  it("rejects overbuild_has_resources when the existing tile still has cubes", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "own-cm1",
      owner: id,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      level: 1,
      resources: 2, // still full
    });
    state = withMatTop(state, id, "COAL_MINE", 2);
    state = withCardAt(state, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("overbuild_has_resources");
  });

  it("rejects overbuild_ownership_blocked for opponent's Coal Mine when the market still has cubes", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const other: PlayerId = id === 0 ? 1 : 0;
    let state = withTile(base, {
      id: "opp-cm1",
      owner: other,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      level: 1,
      resources: 0,
      flipped: true,
    });
    // Coal market NOT exhausted (default setup has cubes).
    state = withMatTop(state, id, "COAL_MINE", 2);
    state = withCardAt(state, id, 0, {
      kind: "LOCATION",
      cityName: "Dudley",
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Dudley",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("overbuild_ownership_blocked");
  });

  it("rejects overbuild_industry_mismatch when a different industry would be placed in the same slot", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Own Cotton Mill at Stone slot 1 (wildcard, so accepts both cotton
    // and coal; specific-before-combo only applies to combo slots).
    let state = withTile(base, {
      id: "own-cot",
      owner: id,
      cityName: "Stone",
      slotIndex: 1,
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
      flipped: true,
    });
    // Default Coal Mine stack top is level 1 — irrelevant because the
    // mismatch fires before the level check.
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "BUILD",
      playerId: id,
      cardIndex: 0,
      cityName: "Stone",
      slotIndex: 1,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("overbuild_industry_mismatch");
  });
});
