// =============================================================================
// §11.3 Mat right column — sibling of TileFace inside a mat row.
//
// Always renders the bonus stack (VP top, income middle, link points
// bottom). Each row uses the shared icon component so the glyphs read
// the same anywhere they appear in the app.
// =============================================================================

import type { IndustryTileSpec } from "../../../engine";
import { IncomeGainedIcon } from "../icons/IncomeGainedIcon";
import {
  LinkPointsIcon,
  linkPointsIconWidth,
} from "../icons/LinkPointsIcon";
import { VictoryPointsIcon } from "../icons/VictoryPointsIcon";
import { MAT_TILE_PX, TILE } from "./TileFace";

/** Side-column width as a fraction of TILE — keeps the visual ratio
 *  between the bonus stack and the tile constant on every board / mat,
 *  so a single TILE bump scales everything together. Bumped to 18/28
 *  so a 12-unit badge (the VP hexagon especially) sits comfortably
 *  inside the column with right-side padding instead of nudging the
 *  edge of the row. */
export const SIDE_COL_RATIO = 18 / 28;
export const SIDE_COL_W = TILE * SIDE_COL_RATIO;
/** Mat-side-column display width in CSS pixels, derived from the same
 *  ratio against `MAT_TILE_PX`. Kept here rather than in the consumer
 *  panel so the whole geometry chain stays in one place. */
export const MAT_SIDE_COL_PX = MAT_TILE_PX * SIDE_COL_RATIO;

// Internal coordinate frame for the side column. Width matches
// SIDE_COL_RATIO (18 base units); the inner vertical layout uses
// `rowH × 3` so it scales to whatever output height the caller asks
// for. Caller passes `height` so the side column can claim more
// vertical room than the tile face — gives the badges legible size.
const BASE_SIDE_COL_W = 18;
/** Internal "row" height for the bonus stack — VP / income / link
 *  rows each use this. Three rows = full BASE_VIEWBOX_H. */
const BASE_ROW_H = 14;
const BASE_VIEWBOX_H = BASE_ROW_H * 3;

export function TileSideColumn({
  spec,
  /** Output height in viewBox units. Defaults to TILE for backward
   *  compatibility (board-side / non-mat callers); mat callers pass
   *  the row's full height so the badges grow with row padding. */
  height = TILE,
}: {
  spec: IndustryTileSpec;
  height?: number;
}) {
  // Vertical layout: VP top → income middle → links bottom. Rows
  // whose value is 0 collapse so a tile with only one of the three
  // doesn't look top-heavy.
  const cx = BASE_SIDE_COL_W / 2;
  // Side-col VP / income badges intentionally render larger than the
  // tile-face corner badges (HEX_ICON_SIZE = 8). The mat row has
  // more room than a board tile, and these are the player's primary
  // score affordance — bumped to 14 so they read clearly even when
  // the link cascade below them is small.
  const iconSize = 14;
  const half = iconSize / 2;
  // Link-derived VP uses the same numbered hexagon and size as industry VP.
  const linkIconSize = iconSize;
  const rowH = BASE_ROW_H;
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
    // Same numbered VP hexagon as flipped tiles and merchant badges.
    const stripW = linkPointsIconWidth(spec.linkPoints, linkIconSize);
    const cy = 2 * rowH + rowH / 2;
    items.push(
      <LinkPointsIcon
        key="lp"
        x={cx - stripW / 2}
        y={cy - linkIconSize / 2}
        size={linkIconSize}
        count={spec.linkPoints}
      />,
    );
  }
  return (
    <svg
      className="mat-side-col"
      width={SIDE_COL_W}
      height={height}
      viewBox={`0 0 ${BASE_SIDE_COL_W} ${BASE_VIEWBOX_H}`}
      overflow="visible"
      aria-hidden
    >
      {items}
    </svg>
  );
}
