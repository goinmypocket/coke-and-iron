// Link tile glyph: a plain boat or rail with a player-coloured end.
// Used for:
//   - the link-supply count on the player stats bar
//   - developed canal / rail tokens on the board (placed at the
//     midpoint of a 2-endpoint link, optionally rotated to align
//     with the line; placed unrotated at the centroid of a triple
//     link).
//

import type { CSSProperties } from "react";

type Era = "CANAL" | "RAIL";


// Shared tile geometry for supply counts and rotated board tokens.
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
        fill="#f7f6ef"
        stroke="#1a1a1a"
        strokeWidth={0.8}
      />
      <rect x={1} y={1} width={4} height={12} rx={1} fill={color} />
      {era === "CANAL" ? (
        <path d="M8 8h21l-3 3H11ZM13 7V4h10v3" fill="#3d5357" />
      ) : (
        <g fill="none" stroke="#3d5357" strokeWidth={1.5}>
          <path d="M10 3v8M26 3v8M10 4h16M10 7h16M10 10h16" />
        </g>
      )}
    </svg>
  );
  if (angle === 0 || x === undefined || y === undefined) return tile;
  // SVG-context rotation: wrap in a <g> with rotate(angle, cx, cy).
  const cx = x + width / 2;
  const cy = y + size / 2;
  return <g transform={`rotate(${angle} ${cx} ${cy})`}>{tile}</g>;
}
