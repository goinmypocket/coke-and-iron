import { describe, it, expect } from "vitest";
import { Engine } from "../../src/engine/Engine";

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
    expect(state.coalMarket.tiers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(state.coalMarket.overflowPrice).toBe(8);
    // 14 cubes, one £1 slot empty (§2.11.1).
    expect(state.coalMarket.filled).toEqual([1, 2, 2, 2, 2, 2, 2, 2]);
    expect(state.ironMarket.tiers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(state.ironMarket.overflowPrice).toBe(6);
    // 10 cubes, both £1 slots empty (§2.11.2).
    expect(state.ironMarket.filled).toEqual([0, 2, 2, 2, 2, 2]);
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
