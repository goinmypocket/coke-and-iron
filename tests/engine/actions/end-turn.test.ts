import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../engine";
import type { GameState, PlayerId } from "../../../engine";

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

function withAutoEndTurn(state: GameState, on: boolean): GameState {
  return { ...state, autoEndTurn: on };
}

function withActionsRemaining(state: GameState, n: number): GameState {
  return { ...state, actionsRemaining: n };
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

// ---------- END_TURN basics ----------

describe("§4.2 END_TURN — basics", () => {
  it("rejects actions_still_remaining when actionsRemaining > 0", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const engine = engineFromState(base);
    const active = base.turnOrder[0]!;
    const r = engine.dispatch({ type: "END_TURN", playerId: active });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("actions_still_remaining");
  });

  it("rejects when the non-active seat dispatches", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const active = base.turnOrder[0]!;
    const other: PlayerId = active === 0 ? 1 : 0;
    const state = withActionsRemaining(base, 0);
    const engine = engineFromState(state);
    const r = engine.dispatch({ type: "END_TURN", playerId: other });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_current_turn");
  });

  it("rejects game_over when phase is GAME_OVER", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = {
      ...base,
      phase: "GAME_OVER",
      actionsRemaining: 0,
    };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "END_TURN",
      playerId: state.turnOrder[0]!,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("game_over");
  });

  it("advances to the next seat when actionsRemaining is 0 and there are more seats", () => {
    const base = initialState({ seed: 1, playerCount: 3 });
    const first = base.turnOrder[0]!;
    const state = withActionsRemaining(base, 0);
    const engine = engineFromState(state);
    const r = engine.dispatch({ type: "END_TURN", playerId: first });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.currentPlayerIndex).toBe(1);
    // First canal round grants 1 action per seat.
    expect(after.actionsRemaining).toBe(1);
    expect(after.round).toBe(1);
  });
});

// ---------- end-of-round ----------

describe("§4.3 end-of-round pipeline", () => {
  it("ends the round, bumps round, resets seat index, and gives 2 actions to round 2 (canal)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Two END_TURNs in a row to close out round 1 (first canal round).
    let state = withActionsRemaining(base, 0);
    let engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: state.turnOrder[0]! });
    // Seat 1 now active. Still in round 1. Spend all actions.
    state = withActionsRemaining(engine.getState(), 0);
    engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: state.turnOrder[1]! });
    const after = engine.getState();
    expect(after.round).toBe(2);
    expect(after.currentPlayerIndex).toBe(0);
    // Round 2+ grants 2 actions.
    expect(after.actionsRemaining).toBe(2);
  });

  it("recomputes turn order by spent_this_round ascending (stable on ties)", () => {
    const base = initialState({ seed: 1, playerCount: 3 });
    // Force deterministic turn order [0, 1, 2] and distinct spends.
    let state: GameState = {
      ...base,
      turnOrder: [0, 1, 2],
      currentPlayerIndex: 2,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({ ...p, spentThisRound: 10 }));
    state = withPlayer(state, 1, (p) => ({ ...p, spentThisRound: 3 }));
    state = withPlayer(state, 2, (p) => ({ ...p, spentThisRound: 7 }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 2 });
    const after = engine.getState();
    // Sorted asc by spent: seat 1 (3), seat 2 (7), seat 0 (10).
    expect(after.turnOrder).toEqual([1, 2, 0]);
  });

  it("preserves relative order on ties (stable sort)", () => {
    const base = initialState({ seed: 1, playerCount: 3 });
    let state: GameState = {
      ...base,
      turnOrder: [0, 1, 2],
      currentPlayerIndex: 2,
      actionsRemaining: 0,
    };
    // All three tied → order should stay [0, 1, 2].
    state = withPlayer(state, 0, (p) => ({ ...p, spentThisRound: 5 }));
    state = withPlayer(state, 1, (p) => ({ ...p, spentThisRound: 5 }));
    state = withPlayer(state, 2, (p) => ({ ...p, spentThisRound: 5 }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 2 });
    expect(engine.getState().turnOrder).toEqual([0, 1, 2]);
  });

  it("resets spent_this_round to 0 for every seat", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({ ...p, spentThisRound: 12 }));
    state = withPlayer(state, 1, (p) => ({ ...p, spentThisRound: 8 }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    for (const p of after.players) expect(p.spentThisRound).toBe(0);
  });

  it("collects income: +level when positive", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Step 30 → level 10.
    let state: GameState = {
      ...base,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({ ...p, incomeStep: 30, money: 17 }));
    state = withPlayer(state, 1, (p) => ({ ...p, incomeStep: 10, money: 17 }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.players[0]!.money).toBe(17 + 10);
    expect(after.players[1]!.money).toBe(17 + 0);
  });

  it("collects income: deducts money when negative", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Step 3 → level -7.
    let state: GameState = {
      ...base,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      incomeStep: 3,
      money: 20,
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    expect(engine.getState().players[0]!.money).toBe(20 - 7);
  });

  it("queues a shortfall entry when income exceeds the player's money (§4.3 step 2)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Step 0 → level -10. Player has £3 money. Owes £10. After collection:
    // money 0, queued shortfall of £7.
    let state: GameState = {
      ...base,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      incomeStep: 0,
      money: 3,
      vp: 6,
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.players[0]!.money).toBe(0);
    expect(after.players[0]!.vp).toBe(6); // VP not touched until resolution
    expect(after.pendingShortfalls).toEqual([{ playerId: 0, owed: 7 }]);
  });

  it("refills hands back to 8 when the deck has enough cards", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Drop each seat's hand to 5 — they should refill to 8 (+3 each).
    let state: GameState = {
      ...base,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      hand: p.hand.slice(0, 5),
    }));
    state = withPlayer(state, 1, (p) => ({
      ...p,
      hand: p.hand.slice(0, 6),
    }));
    const beforeDeck = state.drawDeck.length;
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.players[0]!.hand.length).toBe(8);
    expect(after.players[1]!.hand.length).toBe(8);
    // Drew 3 + 2 = 5 cards.
    expect(after.drawDeck.length).toBe(beforeDeck - 5);
  });

  it("shrinks hands when deck runs out, by actionsPerRound per seat skipped", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    // Drain the deck entirely, set hands below 8, end round 2 (2 actions/round).
    let state: GameState = {
      ...base,
      round: 2,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
      drawDeck: [],
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      hand: p.hand.slice(0, 6),
    }));
    state = withPlayer(state, 1, (p) => ({
      ...p,
      hand: p.hand.slice(0, 4),
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    // Both seats shrink by 2 (actionsPerRound in round 2+).
    expect(after.players[0]!.hand.length).toBe(6 - 2);
    expect(after.players[1]!.hand.length).toBe(4 - 2);
  });

  it("first-canal-round shrink uses 1 action per seat (§3.4)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      round: 1,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
      drawDeck: [],
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      hand: p.hand.slice(0, 5),
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    // Only 1 action in first canal round → hand shrinks by 1.
    expect(after.players[0]!.hand.length).toBe(5 - 1);
  });
});

// ---------- auto-advance ----------

describe("§3.5 autoEndTurn — chained dispatches", () => {
  it("default is false so existing tests aren't disrupted", () => {
    const s = initialState({ seed: 1, playerCount: 2 });
    expect(s.autoEndTurn).toBe(false);
  });

  it("respects EngineConfig.autoEndTurn: true", () => {
    const s = initialState({ seed: 1, playerCount: 2, autoEndTurn: true });
    expect(s.autoEndTurn).toBe(true);
  });

  it("auto-advances the turn after an action exhausts actionsRemaining", () => {
    const base = initialState({
      seed: 1,
      playerCount: 2,
      autoEndTurn: true,
    });
    const activeIdBefore = base.turnOrder[base.currentPlayerIndex]!;
    const engine = engineFromState(withAutoEndTurn(base, true));
    // First canal round → 1 action. A single PASS ends the seat.
    const r = engine.dispatch({
      type: "PASS",
      playerId: activeIdBefore,
      cardIndex: 0,
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    // Seat advanced (currentPlayerIndex went from 0 to 1); actionsRemaining
    // reset to 1 (still in first canal round).
    expect(after.currentPlayerIndex).toBe(1);
    expect(after.actionsRemaining).toBe(1);
  });

  it("does NOT auto-advance when autoEndTurn is false", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const activeIdBefore = base.turnOrder[base.currentPlayerIndex]!;
    const engine = engineFromState(base);
    engine.dispatch({
      type: "PASS",
      playerId: activeIdBefore,
      cardIndex: 0,
    });
    const after = engine.getState();
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.actionsRemaining).toBe(0);
  });
});

// ---------- the card that END_TURN consumes (spoiler: none) ----------

describe("END_TURN does not consume a card", () => {
  it("hand size is unchanged after END_TURN", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state = withActionsRemaining(base, 0);
    const active = state.turnOrder[0]!;
    const handBefore = state.players[active]!.hand.length;
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: active });
    const after = engine.getState();
    expect(after.players[active]!.hand.length).toBe(handBefore);
  });
});

