// =============================================================================
// §6.6 Tie-breaking — pure utility for ranking seats at game end.
//
// Order: VP desc, income LEVEL desc, money desc. Two seats remain tied
// (a draw) only if all three are equal. The UI uses `rankReason` on each
// row to explain how the rank was determined.
// =============================================================================

import { stepToLevel } from "./income";
import type { GameState, PlayerId } from "./types";

export type RankReason = "VP" | "INCOME" | "MONEY" | "DRAW";

export interface RankedSeat {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly pawnColor: string;
  readonly vp: number;
  readonly incomeLevel: number;
  readonly money: number;
  /** 1 for the winner; tied seats share the same rank number. */
  readonly rank: number;
  /** Which criterion separated this seat from the seat one rank lower.
   * "DRAW" means a tie with at least one other seat. The top-ranked
   * seat reports the criterion that put it ahead of the next group;
   * if everyone is tied, every seat reports "DRAW". */
  readonly tieBreak: RankReason;
}

/**
 * Rank seats per §6.6. Stable order within ties is by playerId ascending
 * so output is deterministic. `tieBreak` says how each seat was placed
 * relative to the seat below it; tied seats all share the same `rank`
 * number and report "DRAW" when the tie reaches the bottom.
 */
export function rankSeats(state: GameState): readonly RankedSeat[] {
  const rows = state.players.map((p) => ({
    playerId: p.id,
    displayName: p.displayName,
    pawnColor: p.pawnColor,
    vp: p.vp,
    incomeLevel: stepToLevel(p.incomeStep),
    money: p.money,
  }));

  rows.sort((a, b) => {
    if (a.vp !== b.vp) return b.vp - a.vp;
    if (a.incomeLevel !== b.incomeLevel) return b.incomeLevel - a.incomeLevel;
    if (a.money !== b.money) return b.money - a.money;
    return a.playerId - b.playerId;
  });

  const out: RankedSeat[] = [];
  let currentRank = 1;
  for (let i = 0; i < rows.length; i++) {
    const me = rows[i]!;
    const prev = rows[i - 1];
    // Same rank as prior seat iff everything matches.
    if (
      prev !== undefined &&
      !(
        prev.vp === me.vp &&
        prev.incomeLevel === me.incomeLevel &&
        prev.money === me.money
      )
    ) {
      currentRank = i + 1;
    }

    // Determine which criterion separated me from the seat BELOW (next).
    const next = rows[i + 1];
    let tieBreak: RankReason;
    if (next === undefined) {
      // I'm last — I'm tied with everyone above me iff no one separated.
      const truelyTiedAll = rows.every(
        (r) =>
          r.vp === me.vp &&
          r.incomeLevel === me.incomeLevel &&
          r.money === me.money,
      );
      tieBreak = truelyTiedAll ? "DRAW" : "MONEY";
    } else if (me.vp !== next.vp) {
      tieBreak = "VP";
    } else if (me.incomeLevel !== next.incomeLevel) {
      tieBreak = "INCOME";
    } else if (me.money !== next.money) {
      tieBreak = "MONEY";
    } else {
      tieBreak = "DRAW";
    }

    out.push({ ...me, rank: currentRank, tieBreak });
  }
  return out;
}
