import { describe, it, expect } from "vitest";
import { Engine, initialState, reduce } from "../../src/engine";
import type { PlayerId } from "../../src/engine";

/**
 * All §5 actions now have their own test suites under tests/engine/actions/.
 * This file keeps coverage on the generic reducer surface and the engine
 * intent-log discipline.
 */

function minimalState() {
  return initialState({ seed: 1, playerCount: 2 });
}

function activeSeatId(): PlayerId {
  const s = minimalState();
  return s.turnOrder[s.currentPlayerIndex]!;
}

describe("reduce — generic", () => {
  it("noop succeeds and returns the same state reference", () => {
    const state = minimalState();
    const r = reduce(state, { type: "noop" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toBe(state);
  });
});

describe("Engine — intent log discipline", () => {
  it("appends only on accepted intents", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    engine.dispatch({ type: "noop" });
    // PASS from a non-active seat rejects with not_current_turn.
    const active = activeSeatId();
    const other: PlayerId = active === 0 ? 1 : 0;
    engine.dispatch({ type: "PASS", playerId: other, cardIndex: 0 });
    engine.dispatch({ type: "noop" });
    const log = engine.getIntentLog();
    expect(log).toHaveLength(2);
    for (const entry of log) expect(entry.type).toBe("noop");
  });

  it("does not advance state on a rejected intent", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    const active = activeSeatId();
    const other: PlayerId = active === 0 ? 1 : 0;
    const r = engine.dispatch({
      type: "PASS",
      playerId: other,
      cardIndex: 0,
    });
    expect(r.ok).toBe(false);
    expect(engine.getState()).toBe(before);
  });
});
