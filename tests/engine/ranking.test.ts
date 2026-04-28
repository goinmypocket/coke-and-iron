import { describe, expect, it } from "vitest";
import { initialState, rankSeats } from "../../engine";
import type { GameState } from "../../engine";

function withMutated(
  base: GameState,
  perPlayer: ReadonlyArray<{
    vp?: number;
    incomeStep?: number;
    money?: number;
  }>,
): GameState {
  return {
    ...base,
    players: base.players.map((p, i) => {
      const m = perPlayer[i];
      return m === undefined
        ? p
        : {
            ...p,
            vp: m.vp ?? p.vp,
            incomeStep: m.incomeStep ?? p.incomeStep,
            money: m.money ?? p.money,
          };
    }),
  };
}

describe("§6.6 tie-breaking — rankSeats", () => {
  const base = initialState({ seed: 1, playerCount: 4 });

  it("ranks by VP desc when VPs differ", () => {
    const s = withMutated(base, [
      { vp: 50 },
      { vp: 80 },
      { vp: 60 },
      { vp: 70 },
    ]);
    const r = rankSeats(s);
    expect(r.map((x) => x.playerId)).toEqual([1, 3, 2, 0]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r[0]!.tieBreak).toBe("VP");
  });

  it("breaks VP ties by income level", () => {
    const s = withMutated(base, [
      { vp: 50, incomeStep: 30 }, // L10
      { vp: 50, incomeStep: 10 }, // L0
      { vp: 80 },
      { vp: 80, incomeStep: 60 }, // L20
    ]);
    const r = rankSeats(s);
    // Both 80s tied on VP; player 3 has higher income (L20 vs lower default).
    expect(r[0]!.playerId).toBe(3);
    expect(r[0]!.tieBreak).toBe("INCOME");
    expect(r[1]!.playerId).toBe(2);
  });

  it("breaks remaining ties by money", () => {
    const s = withMutated(base, [
      { vp: 50, money: 5 },
      { vp: 50, money: 30 },
      { vp: 50, money: 10 },
      { vp: 80 },
    ]);
    const r = rankSeats(s);
    expect(r[0]!.playerId).toBe(3);
    // Among the three tied at VP=50, default income is identical, so money breaks it.
    expect(r.slice(1).map((x) => x.playerId)).toEqual([1, 2, 0]);
    expect(r[1]!.tieBreak).toBe("MONEY");
  });

  it("declares DRAW when VP, income, and money all match", () => {
    const s = withMutated(base, [
      { vp: 50, incomeStep: 20, money: 10 },
      { vp: 50, incomeStep: 20, money: 10 },
      { vp: 30 },
      { vp: 30 },
    ]);
    const r = rankSeats(s);
    expect(r[0]!.rank).toBe(1);
    expect(r[1]!.rank).toBe(1);
    expect(r[0]!.tieBreak).toBe("DRAW");
    expect(r[1]!.tieBreak).toBe("VP");
    expect(r[2]!.rank).toBe(3);
    expect(r[3]!.rank).toBe(3);
    expect(r[2]!.tieBreak).toBe("DRAW");
  });
});
