import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../src/engine";
import type { Card, GameState, PlayerId } from "../../../src/engine";

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

function withActivePlayerIncomeStep(state: GameState, step: number): GameState {
  const id = activeSeatId(state);
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === id ? { ...p, incomeStep: step } : p,
    ),
  };
}

describe("§5.5 Loan — happy path", () => {
  it("succeeds from the default opening position (step 10, level 0) and drops to level −3 / step 7", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const beforeMoney = base.players[id]!.money;
    const engine = engineFromState(base);

    const r = engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    expect(r.ok).toBe(true);

    const after = engine.getState().players[id]!;
    expect(after.money).toBe(beforeMoney + 30);
    expect(after.incomeStep).toBe(7);
    expect(after.loansTaken).toBe(1);
  });

  it("from step 30 (level 10) → level 7, step 24", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withActivePlayerIncomeStep(base, 30);
    const engine = engineFromState(state);
    engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    expect(engine.getState().players[id]!.incomeStep).toBe(24);
  });

  it("from step 99 (level 30) → level 27, step 88", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withActivePlayerIncomeStep(base, 99);
    const engine = engineFromState(state);
    engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    expect(engine.getState().players[id]!.incomeStep).toBe(88);
  });

  it("decrements actionsRemaining and consumes the card (§5 preamble + §4.2)", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    const id = activeSeatId(before);
    const beforeHand = before.players[id]!.hand.length;
    engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    const after = engine.getState();
    expect(after.actionsRemaining).toBe(before.actionsRemaining - 1);
    expect(after.players[id]!.hand).toHaveLength(beforeHand - 1);
  });

  it("non-wild card goes to discard pile; loan doesn't touch spent_this_round", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const card = engine.getState().players[id]!.hand[0]!;
    engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    const after = engine.getState().players[id]!;
    expect(after.discardPile).toEqual([card]);
    expect(after.spentThisRound).toBe(0); // gain, not spend
  });

  it("wild card returns to the wild reserve, not the discard pile (§2.13)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const wild: Card = { kind: "WILD_LOCATION" };
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === id ? { ...p, hand: [wild, ...p.hand.slice(1)] } : p,
      ),
    };
    const engine = engineFromState(state);
    const before = state.wildReserve.wildLocation;
    engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    const after = engine.getState();
    expect(after.wildReserve.wildLocation).toBe(before + 1);
    expect(after.players[id]!.discardPile).toHaveLength(0);
  });
});

describe("§5.5 Loan — rejects", () => {
  it("rejects loan_income_floor when the destination level would drop below −10", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // Step 2 → level −8; minus 3 levels → −11 (below floor).
    const state = withActivePlayerIncomeStep(base, 2);
    const engine = engineFromState(state);

    const r = engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("loan_income_floor");

    // State unchanged.
    const after = engine.getState().players[id]!;
    expect(after.money).toBe(state.players[id]!.money);
    expect(after.loansTaken).toBe(0);
  });

  it("accepts a loan that lands EXACTLY at level −10 (step 3 → step 0)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withActivePlayerIncomeStep(base, 3);
    const engine = engineFromState(state);

    const r = engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 0 });
    expect(r.ok).toBe(true);
    const after = engine.getState().players[id]!;
    expect(after.incomeStep).toBe(0);
    expect(after.money).toBe(state.players[id]!.money + 30);
  });

  it("rejects when a non-active seat dispatches", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const other = id === 0 ? 1 : 0;
    const r = engine.dispatch({
      type: "LOAN",
      playerId: other,
      cardIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_current_turn");
  });

  it("rejects card_not_in_hand for an out-of-range index", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({ type: "LOAN", playerId: id, cardIndex: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("card_not_in_hand");
  });

  it("rejects no_actions_remaining once actionsRemaining is 0", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = { ...base, actionsRemaining: 0 };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "LOAN",
      playerId: activeSeatId(state),
      cardIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_actions_remaining");
  });
});
