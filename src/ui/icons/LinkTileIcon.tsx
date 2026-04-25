// Link tile glyph: a player-coloured rounded rectangle with the
// canal or rail asset embedded inside. Used for:
//   - the link-supply count on the player stats bar
//   - developed canal / rail tokens on the board (placed at the
//     midpoint of a 2-endpoint link, optionally rotated to align
//     with the line; placed unrotated at the centroid of a triple
//     link).
//
// The asset SVGs (assets/link_icons/) are detailed line-art that
// reads against any pawn-colour background.

import type { CSSProperties } from "react";
import canalIcon from "../../../assets/link_icons/canal.svg";
import railIcon from "../../../assets/link_icons/rail.svg";

type Era = "CANAL" | "RAIL";

const CANAL_HREF = canalIcon;
const RAIL_HREF = railIcon;

// Tile aspect: 2 : 1 (matches the canal / rail asset viewBoxes).
const TILE_VB_W = 32;
const TILE_VB_H = 14;

export function LinkTileIcon({
  era,
  color,
  size = 18,
  x,
  y,
  angle = 0,
  style,
}: {
  era: Era;
  color: string;
  /** Height of the tile in container units. Width is `size * 2`. */
  size?: number;
  x?: number;
  y?: number;
  /** Rotation in degrees applied around the tile centre. */
  angle?: number;
  style?: CSSProperties;
}) {
  const width = size * (TILE_VB_W / TILE_VB_H);
  // Apply rotation by wrapping the SVG in an outer transform when
  // there's an explicit angle. The SVG itself stays axis-aligned so
  // the asset content keeps its natural orientation inside the
  // rotated tile.
  const tile = (
    <svg
      width={width}
      height={size}
      x={x}
      y={y}
      viewBox={`0 0 ${TILE_VB_W} ${TILE_VB_H}`}
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={era === "CANAL" ? "Canal link" : "Rail link"}
    >
      <rect
        x={0.6}
        y={0.6}
        width={TILE_VB_W - 1.2}
        height={TILE_VB_H - 1.2}
        rx={2}
        ry={2}
        fill={color}
        stroke="#1a1a1a"
        strokeWidth={0.8}
      />
      <image
        href={era === "CANAL" ? CANAL_HREF : RAIL_HREF}
        x={2}
        y={1}
        width={TILE_VB_W - 4}
        height={TILE_VB_H - 2}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
  if (angle === 0 || x === undefined || y === undefined) return tile;
  // SVG-context rotation: wrap in a <g> with rotate(angle, cx, cy).
  const cx = x + width / 2;
  const cy = y + size / 2;
  return <g transform={`rotate(${angle} ${cx} ${cy})`}>{tile}</g>;
}
