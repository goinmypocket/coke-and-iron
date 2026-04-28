import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../engine";
import type { Card, GameState, PlayerId } from "../../../engine";

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

function withHand(state: GameState, hand: Card[]): GameState {
  const id = activeSeatId(state);
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, hand } : p)),
  };
}

describe("§5.7 Scout — happy path", () => {
  it("succeeds on 3 distinct non-wild indices with wilds in the reserve", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    const id = activeSeatId(before);
    const handBefore = before.players[id]!.hand;
    // Setup guarantees 8 non-wild cards in hand and 4/4 wild reserve.
    expect(handBefore).toHaveLength(8);
    expect(before.wildReserve).toEqual({ wildLocation: 4, wildIndustry: 4 });
    const picked = [0, 2, 5] as [number, number, number];
    const pickedCards = picked.map((i) => handBefore[i]!);

    const r = engine.dispatch({ type: "SCOUT", playerId: id, cardIndices: picked });
    expect(r.ok).toBe(true);

    const after = engine.getState();
    const player = after.players[id]!;
    expect(player.hand).toHaveLength(8 - 3 + 2);
    expect(player.hand.some((c) => c.kind === "WILD_LOCATION")).toBe(true);
    expect(player.hand.some((c) => c.kind === "WILD_INDUSTRY")).toBe(true);
    // Discarded cards land in the discard pile, preserving hand order.
    expect(player.discardPile).toEqual(pickedCards);
    // Reserve decremented by exactly one of each.
    expect(after.wildReserve).toEqual({ wildLocation: 3, wildIndustry: 3 });
    expect(after.actionsRemaining).toBe(before.actionsRemaining - 1);
    expect(engine.getIntentLog()).toHaveLength(1);
  });

  it("index order in cardIndices doesn't matter — any permutation of {0,1,2} is accepted", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    for (const perm of [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
    ] as const) {
      const engine = engineFromState(base);
      const r = engine.dispatch({
        type: "SCOUT",
        playerId: id,
        cardIndices: perm,
      });
      expect(r.ok).toBe(true);
      const after = engine.getState();
      expect(after.players[id]!.discardPile).toHaveLength(3);
    }
  });
});

describe("§5.7 Scout — rejects", () => {
  it("rejects scout_has_wild_in_hand if the hand already contains a WILD_LOCATION", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const hand: Card[] = [
      { kind: "WILD_LOCATION" },
      ...base.players[id]!.hand.slice(1),
    ];
    const engine = engineFromState(withHand(base, hand));
    const r = engine.dispatch({
      type: "SCOUT",
      playerId: id,
      cardIndices: [1, 2, 3],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scout_has_wild_in_hand");
  });

  it("rejects scout_has_wild_in_hand for WILD_INDUSTRY in hand", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const hand: Card[] = [
      ...base.players[id]!.hand.slice(0, 4),
      { kind: "WILD_INDUSTRY" },
      ...base.players[id]!.hand.slice(5),
    ];
    const engine = engineFromState(withHand(base, hand));
    const r = engine.dispatch({
      type: "SCOUT",
      playerId: id,
      cardIndices: [0, 1, 2],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scout_has_wild_in_hand");
  });

  it("rejects scout_duplicate_indices for any repeated index", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    for (const dup of [
      [0, 0, 1],
      [1, 2, 1],
      [3, 4, 4],
    ] as const) {
      const r = engine.dispatch({
        type: "SCOUT",
        playerId: id,
        cardIndices: dup,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("scout_duplicate_indices");
    }
  });

  it("rejects card_not_in_hand for out-of-range, negative, or non-integer indices", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    for (const bad of [
      [0, 1, 99],
      [0, 1, -1],
      [0, 1, 1.5],
    ] as const) {
      const r = engine.dispatch({
        type: "SCOUT",
        playerId: id,
        cardIndices: bad,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("card_not_in_hand");
    }
  });

  it("rejects scout_wild_reserve_exhausted when the reserve is out of Wild Locations", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state: GameState = {
      ...base,
      wildReserve: { wildLocation: 0, wildIndustry: 4 },
    };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SCOUT",
      playerId: id,
      cardIndices: [0, 1, 2],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scout_wild_reserve_exhausted");
  });

  it("rejects scout_wild_reserve_exhausted when the reserve is out of Wild Industries", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state: GameState = {
      ...base,
      wildReserve: { wildLocation: 4, wildIndustry: 0 },
    };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SCOUT",
      playerId: id,
      cardIndices: [0, 1, 2],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scout_wild_reserve_exhausted");
  });

  it("rejects when a non-active seat dispatches", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const other = id === 0 ? 1 : 0;
    const r = engine.dispatch({
      type: "SCOUT",
      playerId: other,
      cardIndices: [0, 1, 2],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_current_turn");
  });

  it("rejects no_actions_remaining when actionsRemaining is 0", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = { ...base, actionsRemaining: 0 };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SCOUT",
      playerId: activeSeatId(state),
      cardIndices: [0, 1, 2],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_actions_remaining");
  });

  it("rejects game_over when phase is GAME_OVER", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = { ...base, phase: "GAME_OVER" };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "SCOUT",
      playerId: activeSeatId(state),
      cardIndices: [0, 1, 2],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("game_over");
  });

  it("does not mutate prior state on reject", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state: GameState = {
      ...base,
      wildReserve: { wildLocation: 0, wildIndustry: 0 },
    };
    const engine = engineFromState(state);
    const before = engine.getState();
    engine.dispatch({
      type: "SCOUT",
      playerId: id,
      cardIndices: [0, 1, 2],
    });
    expect(engine.getState()).toBe(before);
  });
});
