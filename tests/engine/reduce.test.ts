import { describe, it, expect } from "vitest";
import { Engine, initialState, reduce } from "../../src/engine";
import type { FailureReason, Intent, PlayerId } from "../../src/engine";

/**
 * NETWORK and SELL are still not_implemented; every other §5 action has
 * its own test suite under tests/engine/actions/. This file retains
 * coverage for the taxonomy surface and engine-log discipline.
 */

function minimalState() {
  return initialState({ seed: 1, playerCount: 2 });
}

function activeSeatId(): PlayerId {
  return minimalState().turnOrder[0]!;
}

describe("reduce — intent taxonomy", () => {
  it("noop succeeds and returns the same state reference", () => {
    const state = minimalState();
    const r = reduce(state, { type: "noop" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toBe(state);
  });

  const rejectCases: { name: string; intent: Intent }[] = [
    {
      name: "NETWORK",
      intent: {
        type: "NETWORK",
        playerId: 0,
        cardIndex: 0,
        lineIndex: 0,
        coalSources: [],
        secondLink: null,
      },
    },
    {
      name: "SELL",
      intent: {
        type: "SELL",
        playerId: 0,
        cardIndex: 0,
        orders: [],
        gloucesterDevelops: [],
      },
    },
  ];

  for (const c of rejectCases) {
    it(`${c.name} returns not_implemented`, () => {
      const r = reduce(minimalState(), c.intent);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        const reason: FailureReason = r.reason;
        expect(reason).toBe("not_implemented");
      }
    });
  }
});

describe("Engine — intent log discipline", () => {
  it("appends only on accepted intents", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    engine.dispatch({ type: "noop" });
    // SELL is still not_implemented at this milestone → rejects.
    engine.dispatch({
      type: "SELL",
      playerId: activeSeatId(),
      cardIndex: 0,
      orders: [],
      gloucesterDevelops: [],
    });
    engine.dispatch({ type: "noop" });
    const log = engine.getIntentLog();
    expect(log).toHaveLength(2);
    for (const entry of log) expect(entry.type).toBe("noop");
  });

  it("does not advance state on a rejected intent", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    const r = engine.dispatch({
      type: "SELL",
      playerId: activeSeatId(),
      cardIndex: 0,
      orders: [],
      gloucesterDevelops: [],
    });
    expect(r.ok).toBe(false);
    expect(engine.getState()).toBe(before);
  });
});
