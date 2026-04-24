import { describe, it, expect } from "vitest";
import { Engine, initialState } from "../../src/engine";
import type {
  GameState,
  IndustryName,
  PlayerId,
} from "../../src/engine";

// ---------- helpers ----------

function engineFromState(state: GameState): Engine {
  const engine = new Engine({
    seed: state.seed,
    playerCount: state.playerCount,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).state = state;
  return engine;
}

function withPlayer(
  state: GameState,
  id: PlayerId,
  mutate: (
    p: GameState["players"][number],
  ) => GameState["players"][number],
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? mutate(p) : p)),
  };
}

function canalLineIndex(state: GameState, want: readonly string[]): number {
  const i = state.lines.findIndex(
    (l) =>
      l.era === "CANAL" &&
      l.endpoints.length === want.length &&
      want.every((c) => l.endpoints.includes(c)),
  );
  if (i === -1) throw new Error(`canal line not found: ${want.join("-")}`);
  return i;
}

function railLineIndex(state: GameState, want: readonly string[]): number {
  const i = state.lines.findIndex(
    (l) =>
      l.era === "RAIL" &&
      l.endpoints.length === want.length &&
      want.every((c) => l.endpoints.includes(c)),
  );
  if (i === -1) throw new Error(`rail line not found: ${want.join("-")}`);
  return i;
}

function withTile(
  state: GameState,
  params: {
    id: string;
    owner: PlayerId;
    cityName: string;
    slotIndex?: number;
    industry: IndustryName;
    level: number;
    flipped?: boolean;
    resources?: number;
  },
): GameState {
  const catalogueIndex = state.tileCatalogue.findIndex(
    (s) => s.industry === params.industry && s.level === params.level,
  );
  if (catalogueIndex === -1) throw new Error("no catalogue entry");
  return {
    ...state,
    builtTiles: [
      ...state.builtTiles,
      {
        id: params.id,
        owner: params.owner,
        cityName: params.cityName,
        slotIndex: params.slotIndex ?? 0,
        catalogueIndex,
        resources: params.resources ?? 0,
        flipped: params.flipped ?? false,
      },
    ],
  };
}

// ---------- trigger detection ----------

describe("§4.3 step 4 — era-end trigger", () => {
  it("does NOT trigger if any seat still holds a card after the shrink", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      round: 2,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
      drawDeck: [],
    };
    // Round 2 shrinks by 2 per seat. One seat has 0 (stays 0), the other
    // has 4 → shrinks to 2, so hands aren't fully drained.
    state = withPlayer(state, 0, (p) => ({ ...p, hand: [] }));
    state = withPlayer(state, 1, (p) => ({ ...p, hand: p.hand.slice(0, 4) }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    // No era transition; still CANAL, round bumped to 3.
    expect(after.era).toBe("CANAL");
    expect(after.round).toBe(3);
  });

  it("does NOT trigger if deck still has cards (refill refills)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    const state: GameState = {
      ...base,
      round: 2,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    // Default hands have 8 cards each. Deck is long.
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    expect(engine.getState().era).toBe("CANAL");
  });

  it("triggers end-of-canal-era when deck is empty AND every hand is zero after refill", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      round: 5,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
      drawDeck: [],
    };
    // Each seat ends the round with 2 cards — refill with empty deck will
    // shrink each by 2 (actionsForRound for round 5 = 2), bringing them
    // to 0.
    state = withPlayer(state, 0, (p) => ({ ...p, hand: p.hand.slice(0, 2) }));
    state = withPlayer(state, 1, (p) => ({ ...p, hand: p.hand.slice(0, 2) }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.era).toBe("RAIL");
    // Round resets to 1 on era flip; rail round 1 grants 2 actions.
    expect(after.round).toBe(1);
    expect(after.actionsRemaining).toBe(2);
  });
});

// ---------- end-of-canal cleanup ----------

describe("§6.4 End of Canal era cleanup", () => {
  function buildCanalEndingState(seed = 1): GameState {
    const base = initialState({ seed, playerCount: 2 });
    let state: GameState = {
      ...base,
      round: 5,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
      drawDeck: [],
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      hand: p.hand.slice(0, 2),
      // Give some discards so reshuffle has fuel.
      discardPile: p.hand.slice(),
    }));
    state = withPlayer(state, 1, (p) => ({
      ...p,
      hand: p.hand.slice(0, 2),
      discardPile: p.hand.slice(),
    }));
    return state;
  }

  it("scores link tiles and removes them from the board (§6.4 step 1)", () => {
    let state = buildCanalEndingState();
    const li = canalLineIndex(state, ["Worcester", "Gloucester"]);
    state = {
      ...state,
      developedLinks: [{ owner: 0, lineIndex: li }],
    };
    const beforeVp = state.players[0]!.vp;
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    // Link scored: Gloucester merchant 2 + Worcester (no tiles) 0 = 2.
    expect(after.players[0]!.vp).toBe(beforeVp + 2);
    expect(after.developedLinks).toEqual([]);
  });

  it("scores flipped industry tiles but LEAVES them on the board (§6.4 step 2)", () => {
    let state = buildCanalEndingState();
    state = withTile(state, {
      id: "cot",
      owner: 0,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 2, // not level 1 — survives the cleanup
      flipped: true,
    });
    const beforeVp = state.players[0]!.vp;
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    // COTTON_MILL level 2 vp = 5 per industry_tiles.json.
    expect(after.players[0]!.vp).toBe(beforeVp + 5);
    // Tile still on the board.
    expect(after.builtTiles.find((t) => t.id === "cot")).toBeDefined();
  });

  it("removes every level-1 tile (§6.4 step 3) and keeps higher levels", () => {
    let state = buildCanalEndingState();
    // Level-1 Coal Mine — removed.
    state = withTile(state, {
      id: "cm1",
      owner: 0,
      cityName: "Dudley",
      industry: "COAL_MINE",
      level: 1,
      flipped: true,
    });
    // Level-2 Coal Mine — survives.
    state = withTile(state, {
      id: "cm2",
      owner: 1,
      cityName: "Coalbrookdale",
      industry: "COAL_MINE",
      level: 2,
      flipped: true,
    });
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.builtTiles.find((t) => t.id === "cm1")).toBeUndefined();
    expect(after.builtTiles.find((t) => t.id === "cm2")).toBeDefined();
  });

  it("refills merchant beer on every non-BLANK slot (§6.4 step 4)", () => {
    let state = buildCanalEndingState();
    // Drain all merchant beer.
    state = {
      ...state,
      merchantSlots: state.merchantSlots.map((s) => ({
        ...s,
        hasBeer: false,
      })),
    };
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    for (const slot of after.merchantSlots) {
      if (slot.accept === "BLANK") {
        expect(slot.hasBeer).toBe(false);
      } else {
        expect(slot.hasBeer).toBe(true);
      }
    }
  });

  it("reshuffles discards into a new draw deck (§6.4 step 5) and refills hands to 8 (§6.4 step 7)", () => {
    const state = buildCanalEndingState();
    const totalDiscards = state.players.reduce(
      (sum, p) => sum + p.discardPile.length,
      0,
    );
    expect(totalDiscards).toBeGreaterThan(0);
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    // Each seat refilled to 8.
    for (const p of after.players) expect(p.hand).toHaveLength(8);
    // Discards cleared.
    for (const p of after.players) expect(p.discardPile).toEqual([]);
    // Draw deck holds the rest.
    expect(after.drawDeck.length).toBe(
      totalDiscards - 8 * after.playerCount,
    );
  });

  it("restores link supply to 14 per seat for the Rail era (§2.7)", () => {
    let state = buildCanalEndingState();
    state = withPlayer(state, 0, (p) => ({ ...p, linkSupply: 1 }));
    state = withPlayer(state, 1, (p) => ({ ...p, linkSupply: 0 }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    for (const p of after.players) expect(p.linkSupply).toBe(14);
  });

  it("sets era=RAIL and resets round+seat+actions (§6.4 step 6)", () => {
    const state = buildCanalEndingState();
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.era).toBe("RAIL");
    expect(after.round).toBe(1);
    expect(after.currentPlayerIndex).toBe(0);
    expect(after.actionsRemaining).toBe(2);
  });
});

// ---------- end-of-rail ----------

describe("§6.5 End of Rail era", () => {
  function buildRailEndingState(): GameState {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      era: "RAIL",
      round: 10, // LAST_ROUND[2] so income skips
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
      drawDeck: [],
    };
    state = withPlayer(state, 0, (p) => ({ ...p, hand: [] }));
    state = withPlayer(state, 1, (p) => ({ ...p, hand: [] }));
    return state;
  }

  it("sets phase=GAME_OVER", () => {
    const state = buildRailEndingState();
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    expect(engine.getState().phase).toBe("GAME_OVER");
  });

  it("scores remaining rail links and all flipped industry tiles", () => {
    let state = buildRailEndingState();
    // Rail link Worcester–Gloucester owned by player 0: +2 VP.
    const railLi = railLineIndex(state, ["Worcester", "Gloucester"]);
    state = {
      ...state,
      developedLinks: [{ owner: 0, lineIndex: railLi }],
    };
    // A canal-era flipped Cotton Mill level 2 still on board (player 1):
    // vp=5. Scores again at rail end per §6.2 note.
    state = withTile(state, {
      id: "cot2",
      owner: 1,
      cityName: "Birmingham",
      industry: "COTTON_MILL",
      level: 2,
      flipped: true,
    });
    const beforeVp = state.players.map((p) => p.vp);
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    expect(after.players[0]!.vp).toBe(beforeVp[0]! + 2);
    expect(after.players[1]!.vp).toBe(beforeVp[1]! + 5);
  });
});

// ---------- final-round income skip ----------

describe("§4.3 step 2 — income is not collected in the final round", () => {
  it("skips income in the last canal round", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      round: 10, // LAST_ROUND[2]
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      incomeStep: 30, // level 10 → would be +£10 in a non-final round
      money: 17,
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    const after = engine.getState();
    // Income skipped → money unchanged.
    expect(after.players[0]!.money).toBe(17);
  });

  it("DOES collect income in round 9 (one before last, 2P)", () => {
    const base = initialState({ seed: 1, playerCount: 2 });
    let state: GameState = {
      ...base,
      round: 9,
      turnOrder: [0, 1],
      currentPlayerIndex: 1,
      actionsRemaining: 0,
    };
    state = withPlayer(state, 0, (p) => ({
      ...p,
      incomeStep: 30,
      money: 17,
    }));
    const engine = engineFromState(state);
    engine.dispatch({ type: "END_TURN", playerId: 1 });
    expect(engine.getState().players[0]!.money).toBe(27);
  });
});
