import { describe, it, expect } from "vitest";
import { Engine, initialState, reduce } from "../../src/engine";
import type { FailureReason, Intent } from "../../src/engine";

/**
 * At this milestone the reducer knows how to branch over every §5 intent
 * but does not yet implement any of them. Each real action returns
 * not_implemented; noop succeeds. The engine's intent log must only grow
 * on success.
 */

function minimalState() {
  return initialState({ seed: 1, playerCount: 2 });
}

describe("reduce — intent taxonomy (not yet implemented)", () => {
  it("noop succeeds and returns the same state reference", () => {
    const state = minimalState();
    const r = reduce(state, { type: "noop" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toBe(state);
  });

  const rejectCases: { name: string; intent: Intent }[] = [
    {
      name: "BUILD",
      intent: {
        type: "BUILD",
        playerId: 0,
        cardIndex: 0,
        cityName: "Birmingham",
        slotIndex: 0,
        industry: "COAL_MINE",
        coalSources: [],
        ironSources: [],
      },
    },
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
      name: "DEVELOP",
      intent: {
        type: "DEVELOP",
        playerId: 0,
        cardIndex: 0,
        industries: ["COAL_MINE"],
        ironSources: [[]],
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
    {
      name: "LOAN",
      intent: { type: "LOAN", playerId: 0, cardIndex: 0 },
    },
    {
      name: "SCOUT",
      intent: {
        type: "SCOUT",
        playerId: 0,
        cardIndices: [0, 1, 2],
      },
    },
    {
      name: "PASS",
      intent: { type: "PASS", playerId: 0, cardIndex: 0 },
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
    engine.dispatch({ type: "LOAN", playerId: 0, cardIndex: 0 });
    engine.dispatch({ type: "noop" });
    const log = engine.getIntentLog();
    expect(log).toHaveLength(2);
    for (const entry of log) expect(entry.type).toBe("noop");
  });

  it("does not advance state on a rejected intent", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const before = engine.getState();
    const r = engine.dispatch({
      type: "BUILD",
      playerId: 0,
      cardIndex: 0,
      cityName: "Birmingham",
      slotIndex: 0,
      industry: "COAL_MINE",
      coalSources: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    expect(engine.getState()).toBe(before);
  });
});
