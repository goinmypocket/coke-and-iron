import { describe, expect, it, vi } from "vitest";
import { initialState } from "../../engine";
import { canPickIndustry, canTakeTurn, guardChoice, nextIndustryTile } from "./interactionPolicy";

describe("frontend interaction availability", () => {
  it("locks and resumes a captured callback without changing the engine state reference", () => {
    const state = initialState({ seed: 4242, playerCount: 2 });
    const seat = state.turnOrder[state.currentPlayerIndex]!;
    let paused = false;
    const dispatch = vi.fn();
    const pick = guardChoice(() => canTakeTurn(state, seat, paused), dispatch);
    pick("first");
    paused = true;
    pick("blocked");
    paused = false;
    pick("resumed");
    expect(dispatch.mock.calls).toEqual([["first"], ["resumed"]]);
  });

  it("never treats a spectator perspective or another player's seat as turn ownership", () => {
    const state = initialState({ seed: 4242, playerCount: 2 });
    const seat = state.turnOrder[state.currentPlayerIndex]!;
    expect(canTakeTurn(state, null, false)).toBe(false);
    expect(canTakeTurn(state, seat === 0 ? 1 : 0, false)).toBe(false);
    expect(canTakeTurn({ ...state, phase: "GAME_OVER" }, seat, false)).toBe(false);
    expect(canTakeTurn({ ...state, pendingShortfalls: [{ playerId: seat, owed: 1 }] }, seat, false)).toBe(false);
  });

  it("offers a light-bulb Pottery tile to Build but never to Develop or Gloucester", () => {
    const state = initialState({ seed: 4242, playerCount: 2 });
    const pottery = nextIndustryTile(state.players[0]!.mat.stacks.POTTERY, state.tileCatalogue, true, 0)!;
    expect(pottery.lightBulb).toBe(true);
    expect(canPickIndustry(pottery, true)).toBe(true);
    expect(canPickIndustry(pottery, false)).toBe(false);
    expect(canPickIndustry(undefined, true)).toBe(false);
  });

  it("advances repeated Develop selections through the real mat stack, including exhaustion", () => {
    const state = initialState({ seed: 4242, playerCount: 2 });
    const stack = state.players[0]!.mat.stacks.COTTON_MILL;
    expect(nextIndustryTile(stack, state.tileCatalogue, false, 1)).toBe(state.tileCatalogue[stack[1]!]);
    expect(nextIndustryTile(stack, state.tileCatalogue, true, 1)).toBe(state.tileCatalogue[stack[0]!]);
    expect(nextIndustryTile(stack, state.tileCatalogue, false, stack.length)).toBeUndefined();
  });
});
