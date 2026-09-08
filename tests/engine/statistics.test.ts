import { describe, expect, it } from "vitest";
import { Engine, initialState } from "../../engine";
import { reduce } from "../../engine/reduce";
import { applyScoring, scoringSummary } from "../../engine/scoring";
import { projectFor, projectForSpectator } from "../../engine/view";
import type { GameState, Intent } from "../../engine/types";

function board(): GameState {
  const state = initialState({ seed: 42, playerCount: 2 });
  const cotton = state.tileCatalogue.findIndex((t) => t.industry === "COTTON_MILL" && t.level === 2);
  const coal = state.tileCatalogue.findIndex((t) => t.industry === "COAL_MINE" && t.level === 1);
  return {
    ...state,
    builtTiles: [
      { id: "cotton", owner: 0, cityName: "Birmingham", slotIndex: 0, catalogueIndex: cotton, flipped: true, resources: 0 },
      { id: "coal", owner: 1, cityName: "Dudley", slotIndex: 0, catalogueIndex: coal, flipped: false, resources: 2 },
    ],
    developedLinks: [{ owner: 1, lineIndex: state.lines.findIndex((l) => l.era === "CANAL" && l.endpoints.includes("Birmingham") && l.endpoints.includes("Oxford")) }],
  };
}

function dispatch(state: GameState, intent: Intent) {
  const result = reduce(state, intent);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

function endEra(state: GameState) {
  return dispatch({
    ...state, turnOrder: [0, 1], currentPlayerIndex: 1, round: 2,
    actionsRemaining: 0, drawDeck: [],
    players: state.players.map((p) => ({ ...p, hand: [], discardPile: [...p.discardPile, ...p.hand] })),
  }, { type: "END_TURN", playerId: 1 });
}

describe("public live scoring statistics", () => {
  it("previews only flipped industries and includes other players' endpoint points in links", () => {
    const state = board();
    const summary = scoringSummary(state);
    expect(summary[0]!.scored.total).toBe(0);
    expect(summary[0]!.projection).toEqual({ playerId: 0, industry: 5, links: 0 });
    expect(summary[1]!.projection).toEqual({ playerId: 1, industry: 0, links: 4 });
    expect(summary[1]!.totalIfScoredNow).toBe(4);
    const flipped = { ...state, builtTiles: state.builtTiles.map((t) => ({ ...t, flipped: true })) };
    expect(scoringSummary(flipped)[1]!.projection!.industry).toBeGreaterThan(0);
    expect(state.scoredEras).toEqual([]);
    expect(state.players.every((p) => p.vp === 0)).toBe(true);
  });

  it("retains Canal breakdown after cleanup and previews surviving industries again in Rail", () => {
    const state = board();
    const before = scoringSummary(state);
    const rail = endEra(state);
    expect(rail.era).toBe("RAIL");
    expect(rail.developedLinks).toEqual([]);
    expect(rail.builtTiles.map((t) => t.id)).toEqual(["cotton"]);
    expect(rail.scoredEras).toEqual([{ era: "CANAL", players: before.map((p) => p.projection) }]);
    const scores = scoringSummary(rail);
    expect(scores[0]!.scored).toEqual({ industry: 5, links: 0, other: 0, total: 5 });
    expect(scores[0]!.projection!.industry).toBe(5);
    expect(scores[0]!.totalIfScoredNow).toBe(10);
    expect(scores[1]!.scored.links).toBe(4);
    expect(scores[1]!.projection!.links).toBe(0);
  });

  it("stops projecting a retained final board and the distribution sums to final VP", () => {
    const final = endEra(endEra(board()));
    expect(final.phase).toBe("GAME_OVER");
    expect(final.builtTiles).toHaveLength(1);
    expect(final.scoredEras?.map((e) => e.era)).toEqual(["CANAL", "RAIL"]);
    for (const score of scoringSummary(final)) {
      expect(score.projection).toBeNull();
      expect(score.totalIfScoredNow).toBe(score.scored.total);
      expect(score.scored.industry + score.scored.links + score.scored.other).toBe(final.players[score.playerId]!.vp);
    }
    expect(scoringSummary(final)[0]!.scored.industry).toBe(10);
  });

  it("shows bonuses and actual debt losses as a signed net adjustment, including the VP floor", () => {
    const scored = applyScoring(board()).state;
    // A public bonus was already awarded, independently of end-of-era scoring.
    const bonus = { ...scored, players: scored.players.map((p) => p.id === 0 ? { ...p, vp: p.vp + 3 } : p) };
    expect(scoringSummary(bonus)[0]!.scored.other).toBe(3);
    const debt = dispatch({ ...bonus, pendingShortfalls: [{ playerId: 0, owed: 20 }] }, {
      type: "RESOLVE_SHORTFALL", playerId: 0, tilesToRemove: [], finalize: true,
    });
    expect(debt.players[0]!.vp).toBe(0);
    expect(scoringSummary(debt)[0]!.scored).toEqual({ industry: 5, links: 0, other: -5, total: 0 });
  });

  it("gives spectators identical statistics without leaking hidden cards", () => {
    const state = endEra(board());
    const spectator = projectForSpectator(state);
    expect(scoringSummary(spectator)).toEqual(scoringSummary(projectFor(state, 0)));
    expect(spectator.scoredEras).toEqual(state.scoredEras);
    expect(spectator.myHand).toEqual([]);
    expect(spectator.players.flatMap((p) => p.hand).every((c) => c.kind === "HIDDEN")).toBe(true);
    const changedHidden = { ...state, removedCards: [], drawDeck: [], players: state.players.map((p) => ({ ...p, hand: [] })) };
    expect(scoringSummary(projectForSpectator(changedHidden))).toEqual(scoringSummary(spectator));
  });

  it("reconstructs scoring telemetry on replay and undo without a save schema change", () => {
    const engine = new Engine({ seed: 42, playerCount: 2 });
    // Finish Canal with public Pass actions. The existing seat boundary
    // commits its award; undo during the next turn rebuilds it by replay.
    let safety = 200;
    while (engine.getState().era === "CANAL" && safety-- > 0) {
      const state = engine.getState();
      const playerId = state.turnOrder[state.currentPlayerIndex]!;
      const intent: Intent = state.actionsRemaining === 0
        ? { type: "END_TURN", playerId }
        : { type: "PASS", playerId, cardIndex: 0 };
      expect(engine.dispatch(intent).ok).toBe(true);
    }
    expect(engine.getState().era).toBe("RAIL");
    expect(engine.canUndo()).toBe(false);
    const replay = new Engine({ seed: 42, playerCount: 2 });
    for (const intent of engine.getIntentLog()) expect(replay.dispatch(intent).ok).toBe(true);
    expect(replay.getState().scoredEras).toEqual(engine.getState().scoredEras);
    const railHistory = engine.getState().scoredEras;
    const seat = engine.getState().turnOrder[0]!;
    expect(engine.dispatch({ type: "PASS", playerId: seat, cardIndex: 0 }).ok).toBe(true);
    expect(engine.undo()).toBe(true);
    expect(engine.getState().scoredEras).toEqual(railHistory);
    // Replay a prefix before the era-changing intent: no stale award remains.
    const prefix = new Engine({ seed: 42, playerCount: 2 });
    for (const intent of engine.getIntentLog().slice(0, -1)) expect(prefix.dispatch(intent).ok).toBe(true);
    expect(prefix.getState().scoredEras).toEqual([]);
  });
});
