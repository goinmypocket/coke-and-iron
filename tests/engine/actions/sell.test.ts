import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../src/engine";
import type {
  Card,
  GameState,
  IndustryName,
  MerchantTileAccept,
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
        resources: params.resources ?? 0,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

/** Overwrite the merchant slot at (city, slotIndex) so its `accept` and
 * `hasBeer` match the test's needs. */
function withMerchantSlot(
  state: GameState,
  merchantCityName: string,
  slotIndex: number,
  accept: MerchantTileAccept,
  hasBeer: boolean,
): GameState {
  const exists = state.merchantSlots.some(
    (s) =>
      s.merchantCityName === merchantCityName && s.slotIndex === slotIndex,
  );
  const patched = state.merchantSlots.map((s) =>
    s.merchantCityName === merchantCityName && s.slotIndex === slotIndex
      ? { ...s, accept, hasBeer }
      : s,
  );
  return {
    ...state,
    merchantSlots: exists
      ? patched
      : [
          ...patched,
          { merchantCityName, slotIndex, accept, hasBeer },
        ],
  };
}

// A canal chain Birmingham → Worcester → Gloucester so Birmingham is
// connected to Gloucester (2P setup). Similarly Birmingham → Oxford
// directly, and Birmingham → Coventry directly, for simple tests.
function linkBirminghamToGloucester(
  state: GameState,
  owner: PlayerId,
): GameState {
  return withDevelopedLinks(state, [
    { owner, endpoints: ["Birmingham", "Worcester"] },
    { owner, endpoints: ["Worcester", "Gloucester"] },
  ]);
}

// ---------- happy paths ----------

describe("§5.4 Sell — happy paths", () => {
  it("sells 1 Cotton Mill to Shrewsbury using own brewery (merchant beer NOT used, no bonus)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Own Cotton Mill at Stone (connected via a canal chain); beerToSell=1.
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Stone",
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
    });
    // Own brewery with a barrel.
    state = withTile(state, {
      id: "brew",
      owner: id,
      cityName: "Farm Brewery 1",
      industry: "BREWERY",
      level: 1,
      resources: 1,
    });
    // Connect Stone → Stafford → Stoke-on-Trent → Rugeley/... — simplest:
    // use a direct Stone–Stafford canal, then Stafford–Cannock, Cannock–Walsall,
    // Walsall–Birmingham, Birmingham–Worcester, Worcester–Shrewsbury?
    // Easier: test shows Stone and Shrewsbury connection via a chain. Let me
    // route Stone → Stafford (canal exists), Stafford → Stoke-on-Trent,
    // Stoke-on-Trent → Leek, Leek → ? — tedious.
    // Simplest route: Stone–Stafford–Stoke-on-Trent is a real chain but
    // doesn't reach Shrewsbury directly.
    // Instead plant the Cotton Mill at Coventry (linked to Birmingham canal).
    // Shrewsbury connects via Stafford → Stone → ... ugh.
    //
    // Pragmatic: use withDevelopedLinks with arbitrary lines. The canal
    // line table has direct Stone→Stafford, Stafford→Birmingham,
    // Birmingham→Worcester, Worcester→Shrewsbury isn't real but let me
    // route via Stafford→Stone→... actually: use Dudley/Birmingham chain
    // reaching Shrewsbury via Wolverhampton→Shrewsbury if a canal exists.
    // I'll take a shortcut — place the Cotton Mill at a city whose canal
    // link directly reaches Shrewsbury.
    // From links.json: Stafford–Shrewsbury? Not listed in the sample.
    // Use the triple link: Kidderminster–Worcester–Farm Brewery 2 (triple).
    // Plant cotton at Kidderminster, then develop Kidderminster–Stafford
    // chain. Still messy.
    //
    // Simplest workable plan: plant cotton at a city directly linked to
    // Shrewsbury. Let me check.
    // For a clean test, skip Shrewsbury — use Oxford instead (Birmingham
    // has a direct canal to Oxford).
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Oxford"] },
    ]);
    // Now Oxford is linked. Plant the cotton mill at Birmingham instead
    // (but Birmingham has no COTTON_MILL specific slot — slot 0 is combo
    // COTTON/MANUFACTURER which is fine for planting via state manip).
    // Let me re-plant.
    state = {
      ...state,
      builtTiles: [
        ...state.builtTiles.filter((t) => t.id !== "cot"),
        {
          id: "cot",
          owner: id,
          cityName: "Birmingham",
          slotIndex: 0,
          catalogueIndex: state.tileCatalogue.findIndex(
            (s) => s.industry === "COTTON_MILL" && s.level === 1,
          ),
          resources: 0,
          flipped: false,
        },
      ],
    };
    // Force Oxford slot 0 to accept COTTON_MILL (or ANY) — it does at setup
    // but ensure hasBeer=true so we can confirm we DON'T use it here.
    state = withMerchantSlot(state, "Oxford", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);

    const beforeVp = state.players[id]!.vp;
    const beforeMoney = state.players[id]!.money;

    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "BREWERY", tileId: "brew" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    // Cotton Mill flipped.
    expect(after.builtTiles.find((t) => t.id === "cot")!.flipped).toBe(true);
    // Brewery drained and flipped.
    expect(after.builtTiles.find((t) => t.id === "brew")!.flipped).toBe(true);
    // Merchant beer NOT consumed → bonus not fired → vp & money unchanged
    // from the bonus (Oxford's INCOME wasn't triggered either).
    expect(after.players[id]!.vp).toBe(beforeVp);
    expect(after.players[id]!.money).toBe(beforeMoney);
    // Merchant slot still has beer.
    expect(
      after.merchantSlots.find(
        (s) => s.merchantCityName === "Oxford" && s.slotIndex === 0,
      )!.hasBeer,
    ).toBe(true);
    // Income advanced by COTTON_MILL level-1 incomeBonus (+5) PLUS the
    // brewery's incomeBonus (+4) since draining its last barrel flips it
    // per §2.10 (incomeBonus for BREWERY level 1 is 4). Total +9 steps.
    expect(after.players[id]!.incomeStep).toBe(
      state.players[id]!.incomeStep + 9,
    );
    expect(after.actionsRemaining).toBe(0);
  });

  it("Oxford INCOME bonus: advances income by +2 steps when merchant beer is used", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      slotIndex: 0,
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
    });
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Oxford"] },
    ]);
    state = withMerchantSlot(state, "Oxford", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const beforeStep = state.players[id]!.incomeStep;
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    // Income advanced by tile incomeBonus (5) + Oxford bonus (2) = +7.
    expect(after.players[id]!.incomeStep).toBe(beforeStep + 7);
    // Slot beer drained.
    expect(
      after.merchantSlots.find(
        (s) => s.merchantCityName === "Oxford" && s.slotIndex === 0,
      )!.hasBeer,
    ).toBe(false);
  });

  it("Warrington MONEY bonus: +£5 when merchant beer is used", () => {
    const base = initialState({ seed: 1, playerCount: 4 }); // Warrington needs 4P
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Stone",
      slotIndex: 0,
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
    });
    // Connect Stone → Stoke-on-Trent → Warrington (merchant at 4P).
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Stone", "Stoke-on-Trent"] },
      { owner: id, endpoints: ["Stoke-on-Trent", "Warrington"] },
    ]);
    state = withMerchantSlot(state, "Warrington", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const beforeMoney = state.players[id]!.money;
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Warrington",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(true);
    expect(engine.getState().players[id]!.money).toBe(beforeMoney + 5);
  });

  it("Shrewsbury VP bonus: +4 VP when merchant beer is used", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Wolverhampton",
      slotIndex: 0,
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
    });
    // Connect Wolverhampton → Shrewsbury via any canal path.
    // Direct canal: Wolverhampton–Coalbrookdale, Coalbrookdale–Shrewsbury?
    // Try a simpler route: just find a line that reaches Shrewsbury.
    // From links.json sample, I saw Shrewsbury linked to Coalbrookdale (canal).
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Wolverhampton", "Coalbrookdale"] },
      { owner: id, endpoints: ["Coalbrookdale", "Shrewsbury"] },
    ]);
    state = withMerchantSlot(state, "Shrewsbury", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const beforeVp = state.players[id]!.vp;
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Shrewsbury",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(true);
    expect(engine.getState().players[id]!.vp).toBe(beforeVp + 4);
  });

  it("Gloucester DEVELOP bonus queues a pending develop per beer consumed", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      slotIndex: 0,
      industry: "COTTON_MILL",
      level: 1,
      resources: 0,
    });
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Worcester"] },
      { owner: id, endpoints: ["Worcester", "Gloucester"] },
    ]);
    state = withMerchantSlot(state, "Gloucester", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    // COAL_MINE is the most convenient stack to develop (level-1 has no
    // lightbulb and the default mat top is level 1).
    const stackBefore =
      state.players[id]!.mat.stacks.COAL_MINE.length;

    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Gloucester",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: ["COAL_MINE"],
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    // Mat stack popped by 1 (no iron cost for Gloucester develop).
    expect(after.players[id]!.mat.stacks.COAL_MINE).toHaveLength(
      stackBefore - 1,
    );
  });
});

// ---------- rejects ----------

describe("§5.4 Sell — rejects", () => {
  it("rejects sell_tile_not_owned for an unknown or opponent-owned tile", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const other: PlayerId = id === 0 ? 1 : 0;
    let state = withTile(base, {
      id: "opp-cot",
      owner: other,
      cityName: "Birmingham",
      slotIndex: 0,
      industry: "COTTON_MILL",
      level: 1,
    });
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "opp-cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sell_tile_not_owned");
  });

  it("rejects sell_tile_already_flipped", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
      flipped: true,
    });
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sell_tile_already_flipped");
  });

  it("rejects sell_tile_wrong_industry for non-Cotton/Manufacturer/Pottery", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cm",
      owner: id,
      cityName: "Dudley",
      industry: "COAL_MINE",
      level: 1,
    });
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cm",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sell_tile_wrong_industry");
  });

  it("rejects sell_merchant_invalid when the slot doesn't accept the industry", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    state = linkBirminghamToGloucester(state, id);
    state = withMerchantSlot(state, "Gloucester", 0, "POTTERY", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Gloucester",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sell_merchant_invalid");
  });

  it("rejects sell_merchant_invalid for a BLANK slot", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    state = linkBirminghamToGloucester(state, id);
    state = withMerchantSlot(state, "Gloucester", 0, "BLANK", false);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Gloucester",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "BREWERY", tileId: "x" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sell_merchant_invalid");
  });

  it("rejects sell_not_connected_to_merchant when no path exists", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    // No developed links → Birmingham is disconnected from everything.
    state = withMerchantSlot(state, "Oxford", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sell_not_connected_to_merchant");
  });

  it("rejects beer_source_invalid when beerSources length doesn't match beerToSell", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Oxford"] },
    ]);
    state = withMerchantSlot(state, "Oxford", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [], // CottonMill level-1 beerToSell=1
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("beer_source_invalid");
  });

  it("rejects beer_source_invalid when MERCHANT beer is declared but the slot has none", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Oxford"] },
    ]);
    state = withMerchantSlot(state, "Oxford", 0, "COTTON_MILL", false); // no beer
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("beer_source_invalid");
  });

  it("rejects brewery_not_connected for opponent's disconnected brewery", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const other: PlayerId = id === 0 ? 1 : 0;
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    state = withTile(state, {
      id: "opp-brew",
      owner: other,
      cityName: "Farm Brewery 1",
      industry: "BREWERY",
      level: 1,
      resources: 1,
    });
    state = withDevelopedLinks(state, [
      { owner: id, endpoints: ["Birmingham", "Oxford"] },
    ]);
    state = withMerchantSlot(state, "Oxford", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Oxford",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "BREWERY", tileId: "opp-brew" }],
        },
      ],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("brewery_not_connected");
  });

  it("rejects develop_count_invalid when Gloucester bonus count doesn't match gloucesterDevelops length", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    let state = withTile(base, {
      id: "cot",
      owner: id,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    state = linkBirminghamToGloucester(state, id);
    state = withMerchantSlot(state, "Gloucester", 0, "COTTON_MILL", true);
    state = withCardAt(state, id, 0, { kind: "WILD_LOCATION" });
    const engine = engineFromState(state);
    // Consume Gloucester merchant beer (1) but declare 2 develops.
    const r = engine.dispatch({
      type: "SELL",
      playerId: id,
      cardIndex: 0,
      orders: [
        {
          tileId: "cot",
          merchantCityName: "Gloucester",
          merchantSlotIndex: 0,
          beerSources: [{ kind: "MERCHANT" }],
        },
      ],
      gloucesterDevelops: ["COAL_MINE", "COAL_MINE"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("develop_count_invalid");
  });
});
