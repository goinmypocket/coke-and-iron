// =============================================================================
// §11.1 Income Tracker — vertical ladder of income LEVELS, level 30 at top.
//
// Each row represents one income level. Within the row sits one cell per
// raw step that belongs to that level (1 / 2 / 3 / or 4 cells, with
// level 30 truncated to 3). Each seat's pawn-coloured marker drops into
// the cell of its exact incomeStep. Markers in the same cell tile 2x2.
// =============================================================================

import { useMemo } from "react";
import {
  MAX_INCOME_LEVEL,
  MAX_INCOME_STEP,
  MIN_INCOME_LEVEL,
  MIN_INCOME_STEP,
  stepToLevel,
} from "../../engine";
import type { PawnColor, PlayerId } from "../../engine";
import { useGameState } from "../hooks/useGameState";
import { MoneyCoin } from "../icons/MoneyCoin";
import { Panel } from "../layout/Panel";

interface SeatMarker {
  readonly seatId: PlayerId;
  readonly pawnColor: PawnColor;
}

// Pre-compute the step list for every level once at module load.
// Iterating steps and bucketing by stepToLevel keeps the band geometry
// (incl. level 30's three-cell truncation) authoritative in the engine.
const STEPS_BY_LEVEL: ReadonlyMap<number, readonly number[]> = (() => {
  const m = new Map<number, number[]>();
  for (let s = MIN_INCOME_STEP; s <= MAX_INCOME_STEP; s++) {
    const lv = stepToLevel(s);
    const arr = m.get(lv) ?? [];
    arr.push(s);
    m.set(lv, arr);
  }
  return m;
})();

const LEVELS_TOP_DOWN: readonly number[] = (() => {
  const arr: number[] = [];
  for (let lv = MAX_INCOME_LEVEL; lv >= MIN_INCOME_LEVEL; lv--) arr.push(lv);
  return arr;
})();

export function IncomeTrackerPanel() {
  // Read the players array directly — its outer reference is stable
  // unless one of the players actually mutates. Building a fresh array
  // of fresh objects in the selector would create a NEW value every
  // call and defeat shallowEqual's element-by-element comparison.
  const players = useGameState((s) => s.players);

  const markersByStep = useMemo(() => {
    const m = new Map<number, SeatMarker[]>();
    for (const p of players) {
      const list = m.get(p.incomeStep) ?? [];
      list.push({ seatId: p.id, pawnColor: p.pawnColor });
      m.set(p.incomeStep, list);
    }
    return m;
  }, [players]);

  return (
    <Panel id="income" title="Income" maximizable>
      <ol className="income-ladder">
        {LEVELS_TOP_DOWN.map((level) => {
          const steps = STEPS_BY_LEVEL.get(level) ?? [];
          return (
            <li key={level} className="income-row">
              <div className="income-row__level">
                <MoneyCoin amount={level} size={18} />
              </div>
              <div className="income-row__cells">
                {steps.map((step) => {
                  const cellMarkers = markersByStep.get(step) ?? [];
                  return (
                    <div key={step} className="income-cell">
                      <span className="income-cell__step">{step}</span>
                      {cellMarkers.length > 0 ? (
                        <div className="income-cell__markers">
                          {cellMarkers.map((m) => (
                            <span
                              key={m.seatId}
                              className="income-cell__marker"
                              style={{ background: m.pawnColor }}
                              title={`Seat ${m.seatId + 1}`}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
