import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../engine";
import type {
  GameState,
  IndustryName,
  PlayerId,
} from "../../../engine";

// ---------- helpers ----------

function engineFromState(state: GameState): Engine {
  const engine = new Engine({
    seed: state.seed,
    playerCount: state.playerCount,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).state = state;
  return engine;
}

function withPlayer(
  state: GameState,
  id: PlayerId,
  mutate: (
    p: GameState["players"][number],
  ) => GameState["players"][number],
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? mutate(p) : p)),
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
        resources: 0,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

/** Build a state where player 0 has just been forced into an end-of-round
 * shortfall: money 0, pending entry of `owed` £. */
function buildShortfallState(opts: {
  owed: number;
  playerCount?: 2 | 3 | 4;
}): GameState {
  const base = initialState({
    seed: 1,
    playerCount: opts.playerCount ?? 2,
  });
  let state: GameState = {
    ...base,
    turnOrder: Array.from({ length: opts.playerCount ?? 2 }, (_, i) => i),
    currentPlayerIndex: 0,
    actionsRemaining: 0,
    pendingShortfalls: [{ playerId: 0, owed: opts.owed }],
  };
  state = withPlayer(state, 0, (p) => ({ ...p, money: 0, vp: 6 }));
  return state;
}

// ---------- queueing during income collection ----------

describe("§4.3 step 2 — multiple shortfalls queue in turn order", () => {
  it("seats with sufficient money pay normally, others are queued in turn order", () => {
    const base = initialState({ seed: 1, playerCount: 3 });
    let state: GameState = {
      ...base,
      round: 2,
      turnOrder: [0, 1, 2],
      currentPlayerIndex: 2,
      actionsRemaining: 0,
    };
    // Seat 0: level -5, money 2 → owes 5, pays 2, queue 3.
    state = withPlayer(state, 0, (p) => ({
      ...p,
      incomeStep: 5,
      money: 2,
    }));
    // Seat 1: level 0, no income change.
    state = withPlayer(state, 1, (p) => ({
      ...p,
      incomeStep: 10,
      money: 17,
    }));
    // Seat 2: level -3, money 1 → queue 2.
    state = withPlayer(state, 2, (p) => ({
      ...p,
      incomeStep: 7,
      money: 1,
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 2 });
    const after = engine.getState();
    expect(after.pendingShortfalls).toEqual([
      { playerId: 0, owed: 3 },
      { playerId: 2, owed: 2 },
    ]);
    expect(after.players[0]!.money).toBe(0);
    expect(after.players[1]!.money).toBe(17);
    expect(after.players[2]!.money).toBe(0);
  });
});

// ---------- pipeline halt ----------

describe("§4.3 — round-end pipeline halts while shortfalls pending", () => {
  it("does not refill hands or bump round while pendingShortfalls is non-empty", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      round: 2,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      hand: p.hand.slice(0, 5),
      incomeStep: 0, // -10, money 0 → queue full debt
      money: 0,
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.pendingShortfalls.length).toBe(1);
    // Hand was 5 — would have refilled to 8 if pipeline ran. It hasn't.
    expect(after.players[0]!.hand.length).toBe(5);
    // Round not yet bumped.
    expect(after.round).toBe(2);
  });

  it("blocks §5 actions with shortfall_resolution_required while pending", () => {
    const state = buildShortfallState({ owed: 5 });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "PASS",
      playerId: state.turnOrder[0]!,
      cardIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("shortfall_resolution_required");
  });

  it("blocks END_TURN with shortfall_resolution_required while pending", () => {
    const state = buildShortfallState({ owed: 5 });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "END_TURN",
      playerId: state.turnOrder[0]!,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("shortfall_resolution_required");
  });
});

// ---------- happy paths ----------

describe("RESOLVE_SHORTFALL — happy paths", () => {
  it("removes a tile, applies surplus proceeds to money, pops the queue", () => {
    let state = buildShortfallState({ owed: 5 });
    // Plant a Cotton Mill level 1 (cost £12 → half = £6) owned by player 0.
    state = withTile(state, {
      id: "cot",
      owner: 0,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: ["cot"],
      finalize: false,
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.pendingShortfalls).toEqual([]);
    expect(after.builtTiles.find((t) => t.id === "cot")).toBeUndefined();
    // Proceeds £6 - £5 owed = £1 surplus → money £1.
    expect(after.players[0]!.money).toBe(1);
    expect(after.players[0]!.vp).toBe(6); // unchanged
  });

  it("finalize=true converts unpaid debt to VP loss, clamped at 0 VP", () => {
    let state = buildShortfallState({ owed: 10 });
    // Player has 0 tiles to remove; finalize → VP loss 10, clamped at 0.
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: [],
      finalize: true,
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.pendingShortfalls).toEqual([]);
    expect(after.players[0]!.vp).toBe(0);
  });

  it("partial proceeds + finalize=true: VP loss is just the remainder", () => {
    let state = buildShortfallState({ owed: 10 });
    // Manufacturer level 1: cost £8 → half = £4. Owes £10. Proceeds £4.
    // Remaining debt £6. With vp=6 → vp drops to 0.
    state = withTile(state, {
      id: "m1",
      owner: 0,
      cityName: "Birmingham",
      industry: "MANUFACTURER",
      level: 1,
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: ["m1"],
      finalize: true,
    });
    expect(r.ok).toBe(true);
    expect(engine.getState().players[0]!.vp).toBe(0);
  });

  it("resumes the round-end pipeline once the queue empties (refill + bump)", () => {
    let state = buildShortfallState({ owed: 5 });
    // Player 0's hand was at 8, but to verify refill we shrink and add deck.
    state = withPlayer(state, 0, (p) => ({
      ...p,
      hand: p.hand.slice(0, 6),
    }));
    const engine = engineFromState(state);
    engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: [],
      finalize: true,
    });
    const after = engine.getState();
    // Refill brought hand back up to 8.
    expect(after.players[0]!.hand.length).toBe(8);
    // Round bumped from 1 → 2.
    expect(after.round).toBe(2);
    expect(after.actionsRemaining).toBe(2);
  });

  it("resolves multi-player shortfalls in order", () => {
    const base = initialState({ seed: 1, playerCount: 3 });
    let state: GameState = {
      ...base,
      pendingShortfalls: [
        { playerId: 1, owed: 3 },
        { playerId: 2, owed: 2 },
      ],
      turnOrder: [0, 1, 2],
      currentPlayerIndex: 2,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 1, (p) => ({ ...p, money: 0 }));
    state = withPlayer(state, 2, (p) => ({ ...p, money: 0 }));
    const engine = engineFromState(state);
    // Player 1 first.
    engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 1,
      tilesToRemove: [],
      finalize: true,
    });
    expect(engine.getState().pendingShortfalls).toEqual([
      { playerId: 2, owed: 2 },
    ]);
    // Player 2 next.
    engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 2,
      tilesToRemove: [],
      finalize: true,
    });
    expect(engine.getState().pendingShortfalls).toEqual([]);
  });
});

// ---------- rejects ----------

describe("RESOLVE_SHORTFALL — rejects", () => {
  it("rejects no_pending_shortfall when the queue is empty", () => {
    const state = initialState({ seed: 1, playerCount: 2 });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: [],
      finalize: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_pending_shortfall");
  });

  it("rejects when a non-head player tries to resolve", () => {
    const state = buildShortfallState({ owed: 5 });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 1, // head is player 0
      tilesToRemove: [],
      finalize: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_pending_shortfall");
  });

  it("rejects shortfall_not_satisfied when proceeds < owed and finalize=false", () => {
    let state = buildShortfallState({ owed: 10 });
    state = withTile(state, {
      id: "m1",
      owner: 0,
      cityName: "Birmingham",
      industry: "MANUFACTURER",
      level: 1,
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: ["m1"],
      finalize: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("shortfall_not_satisfied");
    // No state mutation on reject.
    expect(engine.getState().builtTiles.find((t) => t.id === "m1")).toBeDefined();
  });

  it("rejects shortfall_tile_not_owned for opponent's tile", () => {
    let state = buildShortfallState({ owed: 5 });
    state = withTile(state, {
      id: "opp",
      owner: 1, // opponent's tile
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: ["opp"],
      finalize: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("shortfall_tile_not_owned");
  });

  it("rejects shortfall_tile_not_owned for unknown tile id", () => {
    const state = buildShortfallState({ owed: 5 });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: ["nope"],
      finalize: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("shortfall_tile_not_owned");
  });

  it("rejects shortfall_duplicate_tile when the same id appears twice", () => {
    let state = buildShortfallState({ owed: 5 });
    state = withTile(state, {
      id: "cot",
      owner: 0,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 1,
    });
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: 0,
      tilesToRemove: ["cot", "cot"],
      finalize: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("shortfall_duplicate_tile");
  });
});
