import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../../src/engine";
import type {
  Card,
  GameState,
  IndustryName,
  PlayerId,
} from "../../../src/engine";

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

function matStack(state: GameState, id: PlayerId, ind: IndustryName): number[] {
  return state.players.find((p) => p.id === id)!.mat.stacks[ind];
}

describe("§5.3 Develop — happy paths", () => {
  it("removes 1 tile from a non-light-bulb industry using Iron Market", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const stackBefore = matStack(base, id, "COAL_MINE");
    expect(stackBefore.length).toBeGreaterThan(0);
    const beforeMoney = base.players[id]!.money;

    const engine = engineFromState(base);
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(true);

    const after = engine.getState();
    const player = after.players[id]!;
    expect(player.mat.stacks.COAL_MINE).toHaveLength(stackBefore.length - 1);
    expect(player.money).toBe(beforeMoney - 2); // cheapest filled iron tier = £2
    expect(player.spentThisRound).toBe(2);
    expect(after.actionsRemaining).toBe(base.actionsRemaining - 1);
    expect(player.hand).toHaveLength(base.players[id]!.hand.length - 1);
    expect(after.ironMarket.filled).toEqual([0, 1, 2, 2, 2, 2]);
  });

  it("removes 2 tiles from the same industry — second pop sees depleted stack", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const stackBefore = matStack(base, id, "IRON_WORKS");
    expect(stackBefore.length).toBeGreaterThanOrEqual(2);

    const engine = engineFromState(base);
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["IRON_WORKS", "IRON_WORKS"],
      ironSources: [[{ kind: "MARKET" }], [{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(true);

    const after = engine.getState();
    expect(after.players[id]!.mat.stacks.IRON_WORKS).toHaveLength(
      stackBefore.length - 2,
    );
    expect(after.players[id]!.spentThisRound).toBe(4); // £2 + £2
    expect(after.ironMarket.filled).toEqual([0, 0, 2, 2, 2, 2]);
  });

  it("removes 2 tiles from different industries", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const engine = engineFromState(base);

    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE", "MANUFACTURER"],
      ironSources: [[{ kind: "MARKET" }], [{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.players[id]!.mat.stacks.COAL_MINE).toHaveLength(
      base.players[id]!.mat.stacks.COAL_MINE.length - 1,
    );
    expect(after.players[id]!.mat.stacks.MANUFACTURER).toHaveLength(
      base.players[id]!.mat.stacks.MANUFACTURER.length - 1,
    );
  });

  it("uses a TILE iron source — free, drains that Iron Works tile", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const ironWorksIdx = base.tileCatalogue.findIndex(
      (s) => s.industry === "IRON_WORKS" && s.level === 1,
    );
    const state: GameState = {
      ...base,
      builtTiles: [
        {
          id: "iw-plant",
          owner: 1,
          cityName: "X",
          slotIndex: 0,
          catalogueIndex: ironWorksIdx,
          resources: 3,
          flipped: false,
        },
      ],
    };
    const beforeMoney = state.players[id]!.money;
    const engine = engineFromState(state);

    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "TILE", tileId: "iw-plant" }]],
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.players[id]!.money).toBe(beforeMoney); // free
    expect(after.builtTiles[0]!.resources).toBe(2);
  });

  it("wild card disposal routes to wild reserve (§2.13)", () => {
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
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(true);
    const after = engine.getState();
    expect(after.wildReserve.wildLocation).toBe(state.wildReserve.wildLocation + 1);
    expect(after.players[id]!.discardPile).toHaveLength(0);
  });
});

describe("§5.3 Develop — rejects", () => {
  it("rejects develop_tile_has_lightbulb when top of POTTERY stack (level 1) is a light-bulb", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    // POTTERY stack[0] is Pottery level 1, which is lightBulb=true.
    const topIdx = base.players[id]!.mat.stacks.POTTERY[0]!;
    expect(base.tileCatalogue[topIdx]!.lightBulb).toBe(true);

    const engine = engineFromState(base);
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["POTTERY"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("develop_tile_has_lightbulb");
  });

  it("rejects develop_count_invalid for 0 industries", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: [],
      ironSources: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("develop_count_invalid");
  });

  it("rejects develop_count_invalid for 3 industries", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE", "COAL_MINE", "COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }], [{ kind: "MARKET" }], [{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("develop_count_invalid");
  });

  it("rejects iron_source_invalid when ironSources length doesn't match industries length", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE", "COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("iron_source_invalid");
  });

  it("rejects iron_source_invalid when the per-removal source list isn't length 1", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }, { kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("iron_source_invalid");
  });

  it("rejects mat_stack_empty when the chosen industry stack is empty", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === id
          ? {
              ...p,
              mat: {
                stacks: { ...p.mat.stacks, MANUFACTURER: [] },
              },
            }
          : p,
      ),
    };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["MANUFACTURER"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mat_stack_empty");
  });

  it("rejects insufficient_funds when market iron exceeds the player's money", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const id = activeSeatId(base);
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === id ? { ...p, money: 1 } : p)),
    };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 0,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient_funds");
    // State unchanged — no pops, no market drain.
    const after = engine.getState();
    expect(after.players[id]!.money).toBe(1);
    expect(after.ironMarket.filled).toEqual(base.ironMarket.filled);
  });

  it("rejects when a non-active seat dispatches", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const other = id === 0 ? 1 : 0;
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: other,
      cardIndex: 0,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_current_turn");
  });

  it("rejects card_not_in_hand for an out-of-range index", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const id = activeSeatId(engine.getState());
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: id,
      cardIndex: 42,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("card_not_in_hand");
  });

  it("rejects no_actions_remaining when actionsRemaining is 0", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = { ...base, actionsRemaining: 0 };
    const engine = engineFromState(state);
    const r = engine.dispatch({
      type: "DEVELOP",
      playerId: activeSeatId(state),
      cardIndex: 0,
      industries: ["COAL_MINE"],
      ironSources: [[{ kind: "MARKET" }]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_actions_remaining");
  });
});
