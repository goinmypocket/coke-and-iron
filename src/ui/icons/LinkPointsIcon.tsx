// Link-points glyph: N pointy-top hexagons joined edge-to-edge,
// drawn with a single outer outline (no per-hex border) plus faint
// dividers between adjacent cells. Each cell holds the same content
// — golden horizontal bar with filled circular ends — so a 1-link
// tile and a 2-link tile read as a single unified affordance.
//
// `size` is the height of the strip (= one hex's height). The width
// scales with `count` and is computed from the same hex geometry so
// every adjacent hex shares its flat side with the next.
//
// Used in TileFace's flipped-face cascade, TileSideColumn's mat
// bonus stack, and BoardPanel's merchant LinkPointsBadge so all
// three sites render link points identically (§11.2 / §11.3).

import type { CSSProperties } from "react";

const VIEWBOX_H = 16;
/** Hex circumradius — picked so two of them tessellate inside a
 *  16-unit-wide viewBox with 1u side margin. */
const HEX_R = 7;
const HEX_HALF_W = (HEX_R * Math.sqrt(3)) / 2; // ≈ 6.062
const HEX_DX = HEX_HALF_W * 2;                 // ≈ 12.124
const SIDE_MARGIN = 16 - HEX_DX;               // ≈ 3.876
const CY = 8;
const Y_TOP = CY - HEX_R;
const Y_MID_TOP = CY - HEX_R / 2;
const Y_MID_BOT = CY + HEX_R / 2;
const Y_BOT = CY + HEX_R;
const LP_BG = "#0a0a0a";
const LP_GOLD = "#c89020";
const INNER_HALF_W = 3.5;
const INNER_R = 1.9;

/** Rendered width (in caller-space units) of an N-hex link-points
 *  strip at the given per-hex `size`. Callers that need to position
 *  the strip relative to its centre can use this to compute their
 *  own offset. */
export function linkPointsIconWidth(count: number, size: number): number {
  if (count <= 0) return 0;
  const innerW = SIDE_MARGIN + HEX_DX * count;
  return size * (innerW / VIEWBOX_H);
}

export function LinkPointsIcon({
  count = 1,
  size = 16,
  x,
  y,
  style,
}: {
  /** Number of link-point cells to draw. Must be ≥ 1. */
  count?: number;
  /** Height of the strip (= one hex's height). Width follows `count`. */
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
}) {
  if (count <= 0) return null;

  const innerW = SIDE_MARGIN + HEX_DX * count;
  const widthPx = size * (innerW / VIEWBOX_H);
  const heightPx = size;

  const cxs: number[] = [];
  for (let i = 0; i < count; i++) {
    cxs.push(SIDE_MARGIN / 2 + HEX_HALF_W + i * HEX_DX);
  }

  // Outer outline — clockwise: top zig-zag (apex up + flat-top right
  // for each hex), right side, bottom zig-zag in reverse, left side.
  const outline: string[] = [];
  for (let i = 0; i < count; i++) {
    outline.push(`${cxs[i]!.toFixed(2)},${Y_TOP.toFixed(2)}`);
    outline.push(
      `${(cxs[i]! + HEX_HALF_W).toFixed(2)},${Y_MID_TOP.toFixed(2)}`,
    );
  }
  outline.push(
    `${(cxs[count - 1]! + HEX_HALF_W).toFixed(2)},${Y_MID_BOT.toFixed(2)}`,
  );
  for (let i = count - 1; i >= 0; i--) {
    outline.push(`${cxs[i]!.toFixed(2)},${Y_BOT.toFixed(2)}`);
    if (i > 0) {
      outline.push(
        `${(cxs[i - 1]! + HEX_HALF_W).toFixed(2)},${Y_MID_BOT.toFixed(2)}`,
      );
    }
  }
  outline.push(
    `${(cxs[0]! - HEX_HALF_W).toFixed(2)},${Y_MID_BOT.toFixed(2)}`,
  );
  outline.push(
    `${(cxs[0]! - HEX_HALF_W).toFixed(2)},${Y_MID_TOP.toFixed(2)}`,
  );

  return (
    <svg
      width={widthPx}
      height={heightPx}
      x={x}
      y={y}
      viewBox={`0 0 ${innerW.toFixed(2)} ${VIEWBOX_H}`}
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={count === 1 ? "Link point" : `${count} link points`}
    >
      <polygon
        points={outline.join(" ")}
        fill={LP_BG}
        stroke={LP_GOLD}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {/* Faint divider between adjacent hex cells. */}
      {Array.from({ length: count - 1 }).map((_, i) => (
        <line
          key={`div${i}`}
          x1={cxs[i]! + HEX_HALF_W}
          y1={Y_MID_TOP}
          x2={cxs[i]! + HEX_HALF_W}
          y2={Y_MID_BOT}
          stroke={LP_GOLD}
          strokeWidth={0.45}
          opacity={0.45}
        />
      ))}
      {/* Per-cell link glyph: horizontal bar + filled ends. */}
      {cxs.map((cx, i) => (
        <g key={`link${i}`}>
          <line
            x1={cx - INNER_HALF_W}
            y1={CY}
            x2={cx + INNER_HALF_W}
            y2={CY}
            stroke={LP_GOLD}
            strokeWidth={1.6}
          />
          <circle cx={cx - INNER_HALF_W} cy={CY} r={INNER_R} fill={LP_GOLD} />
          <circle cx={cx + INNER_HALF_W} cy={CY} r={INNER_R} fill={LP_GOLD} />
        </g>
      ))}
    </svg>
  );
}
