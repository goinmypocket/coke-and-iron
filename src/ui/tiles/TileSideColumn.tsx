// =============================================================================
// §11.3 Mat right column — sibling of TileFace inside a mat row.
//
// Always renders the bonus stack (VP top, income middle, link points
// bottom). Each row uses the shared icon component so the glyphs read
// the same anywhere they appear in the app.
// =============================================================================

import type { IndustryTileSpec } from "../../engine";
import { IncomeGainedIcon } from "../icons/IncomeGainedIcon";
import { LinkPointsIcon } from "../icons/LinkPointsIcon";
import { VictoryPointsIcon } from "../icons/VictoryPointsIcon";
import { MAT_TILE_PX, TILE } from "./TileFace";

/** Side-column width as a fraction of TILE — keeps the visual ratio
 *  between the bonus stack and the tile constant on every board / mat,
 *  so a single TILE bump scales everything together. */
export const SIDE_COL_RATIO = 12 / 28;
export const SIDE_COL_W = TILE * SIDE_COL_RATIO;
/** Mat-side-column display width in CSS pixels, derived from the same
 *  ratio against `MAT_TILE_PX`. Kept here rather than in the consumer
 *  panel so the whole geometry chain stays in one place. */
export const MAT_SIDE_COL_PX = MAT_TILE_PX * SIDE_COL_RATIO;

// Internal coordinate frame matches TileFace's BASE_TILE so the bonus
// glyphs scale proportionally with the rest of the tile.
const BASE_SIDE_COL_W = 12;
const BASE_TILE_HEIGHT = 28;

export function TileSideColumn({
  spec,
}: {
  spec: IndustryTileSpec;
}) {
  // Vertical layout: VP top → income middle → links bottom. Rows
  // whose value is 0 collapse so a tile with only one of the three
  // doesn't look top-heavy.
  const rowH = 9;
  const cx = BASE_SIDE_COL_W / 2;
  const iconSize = 8;
  const half = iconSize / 2;
  const items: JSX.Element[] = [];
  if (spec.vp > 0) {
    items.push(
      <VictoryPointsIcon
        key="vp"
        x={cx - half}
        y={rowH / 2 - half}
        size={iconSize}
        amount={spec.vp}
      />,
    );
  }
  if (spec.incomeBonus > 0) {
    items.push(
      <IncomeGainedIcon
        key="inc"
        x={cx - half}
        y={rowH + rowH / 2 - half}
        size={iconSize}
        amount={spec.incomeBonus}
      />,
    );
  }
  if (spec.linkPoints > 0) {
    // Render N link icons in a cascade, centred on the slot.
    const linkSize = 6;
    const step = linkSize - 2;
    const totalW = linkSize + step * (spec.linkPoints - 1);
    const startX = cx - totalW / 2;
    const cy = 2 * rowH + rowH / 2;
    for (let i = 0; i < spec.linkPoints; i++) {
      items.push(
        <LinkPointsIcon
          key={`lp${i}`}
          x={startX + i * step}
          y={cy - linkSize / 2}
          size={linkSize}
        />,
      );
    }
  }
  return (
    <svg
      className="mat-side-col"
      width={SIDE_COL_W}
      height={TILE}
      viewBox={`0 0 ${BASE_SIDE_COL_W} ${BASE_TILE_HEIGHT}`}
      aria-hidden
    >
      {items}
    </svg>
  );
}
