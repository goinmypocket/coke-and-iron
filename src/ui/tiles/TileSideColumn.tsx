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
import { TILE } from "./TileFace";

export const SIDE_COL_W = 12;

export function TileSideColumn({
  spec,
}: {
  spec: IndustryTileSpec;
}) {
  // Vertical layout: VP top → income middle → links bottom. Rows
  // whose value is 0 collapse so a tile with only one of the three
  // doesn't look top-heavy.
  const rowH = 9;
  const cx = SIDE_COL_W / 2;
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
      viewBox={`0 0 ${SIDE_COL_W} ${TILE}`}
      aria-hidden
    >
      {items}
    </svg>
  );
}
