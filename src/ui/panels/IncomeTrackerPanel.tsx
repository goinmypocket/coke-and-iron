// =============================================================================
// §11.1 Income Tracker — vertical ladder of 100 step rows (99 → 0).
//
// Each row is a single income step. The level badge is drawn only on the
// first row visually-belonging to that level (= the row with the highest
// step of the level). Pawn-coloured markers tile in a 2x2 grid when
// multiple seats share a step.
// =============================================================================

import { useMemo } from "react";
import {
  MAX_INCOME_STEP,
  MIN_INCOME_STEP,
  levelToHighestStep,
  stepToLevel,
} from "../../engine";
import type { PawnColor, PlayerId } from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";

interface SeatMarker {
  readonly seatId: PlayerId;
  readonly pawnColor: PawnColor;
}

export function IncomeTrackerPanel() {
  const seats = useGameState(
    (s) =>
      s.players.map((p) => ({
        seatId: p.id,
        incomeStep: p.incomeStep,
        pawnColor: p.pawnColor,
      })),
    shallowEqual,
  );

  const markersByStep = useMemo(() => {
    const m = new Map<number, SeatMarker[]>();
    for (const seat of seats) {
      const list = m.get(seat.incomeStep) ?? [];
      list.push({ seatId: seat.seatId, pawnColor: seat.pawnColor });
      m.set(seat.incomeStep, list);
    }
    return m;
  }, [seats]);

  // Render top to bottom from highest step (level 30) down.
  const rows: number[] = [];
  for (let s = MAX_INCOME_STEP; s >= MIN_INCOME_STEP; s--) rows.push(s);

  return (
    <Panel id="income" title="Income" maximizable>
      <ol className="income-ladder">
        {rows.map((step) => {
          const level = stepToLevel(step);
          // First-row-visually = top row of the level = highest step in
          // the level. Anchor the level badge there.
          const isLevelTopRow = levelToHighestStep(level) === step;
          const cellMarkers = markersByStep.get(step) ?? [];
          return (
            <li key={step} className="income-row">
              <div className="income-row__level">
                {isLevelTopRow ? (
                  <span className="income-row__level-badge">{level}</span>
                ) : null}
              </div>
              <div className="income-row__cell">
                <span className="income-row__step">{step}</span>
                {cellMarkers.length > 0 ? (
                  <div className="income-row__markers">
                    {cellMarkers.map((m) => (
                      <span
                        key={m.seatId}
                        className="income-row__marker"
                        style={{ background: m.pawnColor }}
                        title={`Seat ${m.seatId + 1}`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
