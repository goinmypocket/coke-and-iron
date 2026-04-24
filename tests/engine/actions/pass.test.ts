import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../src/engine";
import type { Card, GameState, PlayerId } from "../../../src/engine";

function activeSeatId(state: GameState): PlayerId {
  return state.turnOrder[state.currentPlayerIndex]!;
}

function withWildInHand(state: GameState, kind: "WILD_LOCATION" | "WILD_INDUSTRY"): GameState {
  const id = activeSeatId(state);
  const player = state.players[id]!;
  const newHand: Card[] = [{ kind }, ...player.hand.slice(1)];
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, hand: newHand } : p)),
  };
}

describe("§5.8 Pass — happy path", () => {
  it("succeeds on a legal dispatch and decrements actionsRemaining", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const state = engine.getState();
    const id = activeSeatId(state);
    const beforeHand = state.players[id]!.hand.length;
    expect(state.actionsRemaining).toBe(1); // §3.4 first Canal round

    const result = engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    expect(result.ok).toBe(true);
    const after = engine.getState();
    expect(after.actionsRemaining).toBe(0);
    expect(after.players[id]!.hand).toHaveLength(beforeHand - 1);
    expect(engine.getIntentLog()).toHaveLength(1);
  });

  it("non-wild card goes to the player's discard pile", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const state = engine.getState();
    const id = activeSeatId(state);
    const card = state.players[id]!.hand[0]!;
    expect(card.kind).not.toBe("WILD_LOCATION");
    expect(card.kind).not.toBe("WILD_INDUSTRY");

    engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    const after = engine.getState();
    expect(after.players[id]!.discardPile).toEqual([card]);
    // Wild reserve untouched by a non-wild discard.
    expect(after.wildReserve).toEqual(state.wildReserve);
  });

  it("wild location card returns to the wild reserve, NOT the discard pile (§2.13)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withWildInHand(base, "WILD_LOCATION");
    const beforeReserve = state.wildReserve.wildLocation;
    const beforeDiscardLen = state.players[id]!.discardPile.length;

    const engine = engineFromState(state);
    const result = engine.dispatch({
      type: "PASS",
      playerId: id,
      cardIndex: 0,
    });
    expect(result.ok).toBe(true);
    const after = engine.getState();
    expect(after.wildReserve.wildLocation).toBe(beforeReserve + 1);
    expect(after.wildReserve.wildIndustry).toBe(state.wildReserve.wildIndustry);
    expect(after.players[id]!.discardPile).toHaveLength(beforeDiscardLen);
  });

  it("wild industry card routes to wildIndustry counter", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state = withWildInHand(base, "WILD_INDUSTRY");
    const before = state.wildReserve.wildIndustry;

    const engine = engineFromState(state);
    engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    expect(engine.getState().wildReserve.wildIndustry).toBe(before + 1);
  });

  it("returns a new GameState reference (subscribers must see the change)", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    engine.dispatch({
      type: "PASS",
      playerId: activeSeatId(before),
      cardIndex: 0,
    });
    expect(engine.getState()).not.toBe(before);
  });
});

describe("§5.8 Pass — rejects", () => {
  it("rejects when a non-active seat tries to dispatch", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const state = engine.getState();
    const id = activeSeatId(state);
    const other = id === 0 ? 1 : 0;
    const result = engine.dispatch({
      type: "PASS",
      playerId: other,
      cardIndex: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_current_turn");
    expect(engine.getIntentLog()).toHaveLength(0);
  });

  it("rejects card_not_in_hand for an out-of-range index", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({ type: "PASS", playerId: id, cardIndex: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("card_not_in_hand");
  });

  it("rejects card_not_in_hand for a negative or non-integer index", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    for (const bad of [-1, 1.5, Number.NaN]) {
      const r = engine.dispatch({
        type: "PASS",
        playerId: id,
        cardIndex: bad,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("card_not_in_hand");
    }
  });

  it("rejects no_actions_remaining once actionsRemaining is 0", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = { ...base, actionsRemaining: 0 };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "PASS",
      playerId: activeSeatId(state),
      cardIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_actions_remaining");
  });

  it("rejects game_over when phase is GAME_OVER", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = { ...base, phase: "GAME_OVER" };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "PASS",
      playerId: activeSeatId(state),
      cardIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("game_over");
  });

  it("does not mutate prior state on reject", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    const beforeJson = JSON.stringify({
      hand: before.players[0]!.hand,
      discard: before.players[0]!.discardPile,
      wild: before.wildReserve,
      actions: before.actionsRemaining,
    });
    engine.dispatch({
      type: "PASS",
      playerId: 999 as PlayerId,
      cardIndex: 0,
    });
    const after = engine.getState();
    const afterJson = JSON.stringify({
      hand: after.players[0]!.hand,
      discard: after.players[0]!.discardPile,
      wild: after.wildReserve,
      actions: after.actionsRemaining,
    });
    expect(afterJson).toBe(beforeJson);
    expect(after).toBe(before); // same reference on reject
  });
});

// ---- test utilities ----

function engineFromState(state: GameState): Engine {
  // The Engine constructor always runs initialState. To test with a
  // hand-crafted state we reach behind via a controlled seam: construct
  // the engine, then replace its internal state via dispatch of noop
  // (which keeps the current state) after swapping the field directly.
  //
  // We avoid touching Engine internals from outside by using a subclass
  // with a protected hook. For now, patch via Object.assign — the field
  // is a plain class property and this keeps the test surface readable.
  const engine = new Engine({ seed: state.seed, playerCount: state.playerCount });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).state = state;
  return engine;
}
