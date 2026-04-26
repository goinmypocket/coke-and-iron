// =============================================================================
// §11.1 Income Tracker — vertical ladder of income LEVELS, level 20 at top,
// negative-income levels at the bottom.
//
// Each row represents one income level. Within the row sits one cell per
// raw step that belongs to that level (1 / 2 / 3 cells). Each seat's
// pawn-coloured marker drops into the cell of its exact incomeStep.
// Markers in the same cell tile 2x2.
//
// Levels 21..30 (steps 61..99) are collapsed into ONE compressed row at
// the top labelled "21+" / "61+". Players whose actual income is in
// that range all stack into the single compressed cell — the engine
// still tracks the raw step, so the Game State and Player Info panels
// continue to display the precise level / step numbers.
//
// Negative income levels (1 step each, levels 0 down to -10) render as
// individual rows below the positive ladder so a Loan that pushes a
// player into the red is visible.
//
// The ladder renders as a chrome-less `<IncomeLadder>` component;
// the board panel embeds it next to the board so the two share a
// single bounding box (a rectangular ladder + a square map).
// =============================================================================

import { useMemo } from "react";
import {
  MAX_INCOME_STEP,
  MIN_INCOME_LEVEL,
  MIN_INCOME_STEP,
  stepToLevel,
} from "../../engine";
import type { PawnColor, PlayerId } from "../../engine";
import { useGameState } from "../hooks/useGameState";
import { MoneyCoin } from "../icons/MoneyCoin";

interface SeatMarker {
  readonly seatId: PlayerId;
  readonly pawnColor: PawnColor;
}

const TOP_VISIBLE_LEVEL = 20;
const COMPRESSED_FIRST_STEP = 61;

// Pre-compute the step list for every visible level once at module load.
// Iterating steps and bucketing by stepToLevel keeps the band geometry
// authoritative in the engine.
const STEPS_BY_LEVEL: ReadonlyMap<number, readonly number[]> = (() => {
  const m = new Map<number, number[]>();
  for (let s = MIN_INCOME_STEP; s <= MAX_INCOME_STEP; s++) {
    const lv = stepToLevel(s);
    if (lv > TOP_VISIBLE_LEVEL) continue;
    const arr = m.get(lv) ?? [];
    arr.push(s);
    m.set(lv, arr);
  }
  return m;
})();

const LEVELS_TOP_DOWN: readonly number[] = (() => {
  const arr: number[] = [];
  for (let lv = TOP_VISIBLE_LEVEL; lv >= MIN_INCOME_LEVEL; lv--) arr.push(lv);
  return arr;
})();

/** Chrome-less income ladder. Sized by its content (rem-based cells)
 *  so a parent can lay it out side-by-side with other geometry —
 *  notably the board, which embeds it inside its own panel chrome. */
export function IncomeLadder() {
  // Read the players array directly — its outer reference is stable
  // unless one of the players actually mutates. Building a fresh array
  // of fresh objects in the selector would create a NEW value every
  // call and defeat shallowEqual's element-by-element comparison.
  const players = useGameState((s) => s.players);

  const { markersByStep, compressedMarkers } = useMemo(() => {
    const byStep = new Map<number, SeatMarker[]>();
    const compressed: SeatMarker[] = [];
    for (const p of players) {
      const m: SeatMarker = { seatId: p.id, pawnColor: p.pawnColor };
      if (p.incomeStep >= COMPRESSED_FIRST_STEP) {
        compressed.push(m);
      } else {
        const list = byStep.get(p.incomeStep) ?? [];
        list.push(m);
        byStep.set(p.incomeStep, list);
      }
    }
    return { markersByStep: byStep, compressedMarkers: compressed };
  }, [players]);

  return (
    <ol className="income-ladder">
      <li key="compressed" className="income-row">
        <div className="income-row__level">
          <MoneyCoin amount={21} label="21+" size={18} />
        </div>
        <div className="income-row__cells">
          <div className="income-cell">
            <span className="income-cell__step">61+</span>
            {compressedMarkers.length > 0 ? (
              <div className="income-cell__markers">
                {compressedMarkers.map((m) => (
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
        </div>
      </li>
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
  );
}
