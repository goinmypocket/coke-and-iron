import { describe, it, expect } from "vitest";
import { Engine } from "../../src/engine/Engine";

describe("Engine (scaffold smoke tests)", () => {
  it("instantiates with the configured seed and player count", () => {
    const engine = new Engine({ seed: 42, playerCount: 2 });
    const state = engine.getState();
    expect(state.seed).toBe(42);
    expect(state.playerCount).toBe(2);
    expect(state.intentCount).toBe(0);
  });

  it("dispatches a noop intent and increments the intent counter", () => {
    const engine = new Engine({ seed: 1, playerCount: 3 });
    const result = engine.dispatch({ type: "noop" });
    expect(result.ok).toBe(true);
    expect(engine.getState().intentCount).toBe(1);
  });

  it("notifies subscribers on a successful dispatch and stops after unsubscribe", () => {
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

  it("appends every successful intent to the intent log", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    engine.dispatch({ type: "noop" });
    engine.dispatch({ type: "noop" });
    expect(engine.getIntentLog()).toHaveLength(2);
  });
});
