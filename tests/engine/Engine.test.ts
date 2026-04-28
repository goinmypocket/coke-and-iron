import { describe, it, expect } from "vitest";
import { Engine } from "../../engine/Engine";

describe("Engine — initial state", () => {
  it("seeds top-level GameState fields per §3.2 / §3.4", () => {
    const engine = new Engine({ seed: 42, playerCount: 2 });
    const state = engine.getState();
    expect(state.seed).toBe(42);
    expect(state.playerCount).toBe(2);
    expect(state.era).toBe("CANAL");
    expect(state.round).toBe(1);
    expect(state.phase).toBe("PLAYER_TURNS");
    expect(state.actionsRemaining).toBe(1);
    // Turn order is a random permutation of [0..playerCount-1] (§3.3).
    expect([...state.turnOrder].sort()).toEqual([0, 1]);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.wildReserve).toEqual({ wildLocation: 4, wildIndustry: 4 });
  });

  it("sets up the markets per §2.11.1 / §2.11.2", () => {
    const engine = new Engine({ seed: 1, playerCount: 4 });
    const state = engine.getState();
    expect(state.coalMarket.tiers).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.coalMarket.overflowPrice).toBe(8);
    // 13 cubes in priced range, one £1 slot empty (§2.11.1).
    expect(state.coalMarket.filled).toEqual([1, 2, 2, 2, 2, 2, 2]);
    expect(state.ironMarket.tiers).toEqual([1, 2, 3, 4, 5]);
    expect(state.ironMarket.overflowPrice).toBe(6);
    // 8 cubes in priced range, both £1 slots empty (§2.11.2).
    expect(state.ironMarket.filled).toEqual([0, 2, 2, 2, 2]);
  });

  it("builds default per-seat fields with 8-card hands per §3.2", () => {
    const engine = new Engine({ seed: 1, playerCount: 4 });
    const players = engine.getState().players;
    expect(players).toHaveLength(4);
    for (const p of players) {
      expect(p.money).toBe(17);
      expect(p.vp).toBe(0);
      expect(p.incomeStep).toBe(10);
      expect(p.loansTaken).toBe(0);
      expect(p.spentThisRound).toBe(0);
      expect(p.linkSupply).toBe(14);
      expect(p.hand).toHaveLength(8);
      expect(p.discardPile).toHaveLength(0);
      // All six industry mat stacks present and populated.
      expect(Object.keys(p.mat.stacks).sort()).toEqual([
        "BREWERY",
        "COAL_MINE",
        "COTTON_MILL",
        "IRON_WORKS",
        "MANUFACTURER",
        "POTTERY",
      ]);
      for (const ind of Object.keys(p.mat.stacks)) {
        expect(
          p.mat.stacks[ind as keyof typeof p.mat.stacks].length,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("Engine — dispatch + subscribers + intent log", () => {
  it("dispatches a noop intent and appends to the intent log", () => {
    const engine = new Engine({ seed: 1, playerCount: 3 });
    const result = engine.dispatch({ type: "noop" });
    expect(result.ok).toBe(true);
    expect(engine.getIntentLog()).toHaveLength(1);
  });

  it("notifies subscribers on dispatch and stops after unsubscribe", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    let calls = 0;
    const unsubscribe = engine.subscribe(() => {
      calls++;
    });
    engine.dispatch({ type: "noop" });
    engine.dispatch({ type: "noop" });
    expect(calls).toBe(2);
    unsubscribe();
    engine.dispatch({ type: "noop" });
    expect(calls).toBe(2);
  });
});

describe("Engine — undo (§10.2)", () => {
  function activeSeat(engine: Engine) {
    const s = engine.getState();
    return s.turnOrder[s.currentPlayerIndex]!;
  }

  it("canUndo() is false at game start", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    expect(engine.canUndo()).toBe(false);
    expect(engine.undo()).toBe(false);
  });

  it("canUndo() flips true after a successful action and undo() reverts", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    const id = activeSeat(engine);
    engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });

    expect(engine.canUndo()).toBe(true);
    expect(engine.undo()).toBe(true);

    const after = engine.getState();
    // State and intent log fully restored.
    expect(after.actionsRemaining).toBe(before.actionsRemaining);
    expect(after.players[id]!.hand).toHaveLength(
      before.players[id]!.hand.length,
    );
    expect(engine.getIntentLog()).toHaveLength(0);
    expect(engine.canUndo()).toBe(false);
  });

  it("multiple undos within a turn roll back each successful action", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeat(engine);
    engine.dispatch({ type: "noop" });
    engine.dispatch({ type: "noop" });
    expect(engine.getIntentLog()).toHaveLength(2);
    expect(engine.canUndo()).toBe(true);

    engine.undo();
    expect(engine.getIntentLog()).toHaveLength(1);
    engine.undo();
    expect(engine.getIntentLog()).toHaveLength(0);
    expect(engine.canUndo()).toBe(false);
    void id;
  });

  it("END_TURN commits the prior turn's history — canUndo() goes false", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeat(engine);
    engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    expect(engine.canUndo()).toBe(true);
    // First canal round: 1 action → actionsRemaining now 0 → END_TURN OK.
    engine.dispatch({ type: "END_TURN", playerId: id });
    // Seat advanced; the prior turn is committed and uncommittable.
    expect(engine.canUndo()).toBe(false);
    expect(engine.undo()).toBe(false);
  });

  it("autoEndTurn-driven seat advance also clears canUndo()", () => {
    const engine = new Engine({
      seed: 1,
      playerCount: 2,
      autoEndTurn: true,
    });
    const id = activeSeat(engine);
    engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    // Auto-advance bumped the seat → undo would cross a turn boundary.
    expect(engine.canUndo()).toBe(false);
  });

  it("respects allowUndo: false from EngineConfig", () => {
    const engine = new Engine({
      seed: 1,
      playerCount: 2,
      allowUndo: false,
    });
    const id = activeSeat(engine);
    engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    expect(engine.canUndo()).toBe(false);
    expect(engine.undo()).toBe(false);
    expect(engine.getIntentLog()).toHaveLength(1);
  });

  it("replay determinism: undo produces a state byte-identical to never-dispatched", () => {
    const a = new Engine({ seed: 1, playerCount: 2 });
    const b = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeat(a);
    a.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    a.undo();
    // a's state should now match b's pristine state (which never
    // dispatched anything).
    expect(JSON.stringify(stripRng(a.getState()))).toBe(
      JSON.stringify(stripRng(b.getState())),
    );
  });

  it("notifies subscribers on undo", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeat(engine);
    engine.dispatch({ type: "PASS", playerId: id, cardIndex: 0 });
    let calls = 0;
    engine.subscribe(() => {
      calls++;
    });
    engine.undo();
    expect(calls).toBe(1);
  });
});

// rng has live methods + internal state — strip for deep-equality JSON
// snapshots between two independently constructed engines.
function stripRng(state: unknown): unknown {
  if (typeof state !== "object" || state === null) return state;
  const { rng: _rng, ...rest } = state as Record<string, unknown>;
  return rest;
}
