// Beer-barrel glyph. Use one icon per barrel.
//
// Wooden cask viewed slightly from above: bulging cylindrical body with
// vertical stave seams, two iron hoops near the rim and base, and an
// elliptical lid showing the cooper's curve. The barrel is sized to
// fill the 16×16 viewBox to match the visual footprint of CoalIcon /
// IronIcon (which are 14×14 cubes inside the same viewBox), so a beer
// token next to a coal cube reads at the same scale.
//
// `consumption` flips the variant: default = produced (clean barrel);
// consumption = same barrel with a red diagonal strike through it,
// for tiles that consume / pay beer when they sell.

import type { CSSProperties } from "react";

export function BeerIcon({
  size = 16,
  x,
  y,
  style,
  consumption = false,
}: {
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
  consumption?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      x={x}
      y={y}
      viewBox="0 0 16 16"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={consumption ? "Beer (consumed)" : "Beer"}
    >
      <defs>
        <linearGradient id="beer-stave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a2410" />
          <stop offset="20%" stopColor="#704a22" />
          <stop offset="55%" stopColor="#a06b3a" />
          <stop offset="80%" stopColor="#704a22" />
          <stop offset="100%" stopColor="#3a2410" />
        </linearGradient>
        <radialGradient id="beer-lid" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0%" stopColor="#b07a42" />
          <stop offset="80%" stopColor="#6a401a" />
          <stop offset="100%" stopColor="#3a2410" />
        </radialGradient>
      </defs>
      {/* Bulging barrel body — max width 14 at the middle so the
       * footprint matches a 14×14 coal/iron cube. */}
      <path
        d="M 2.5 2.4 Q 1.0 8.5 2.5 14.7 L 13.5 14.7 Q 15.0 8.5 13.5 2.4 Z"
        fill="url(#beer-stave)"
        stroke="#1f1208"
        strokeWidth={0.55}
      />
      {/* Vertical stave seams that follow the bulge. */}
      <path
        d="M 5.2 2.6 Q 4.0 8.5 5.2 14.5"
        fill="none"
        stroke="#2a1808"
        strokeWidth={0.35}
        opacity={0.75}
      />
      <path
        d="M 8 2.4 L 8 14.7"
        fill="none"
        stroke="#2a1808"
        strokeWidth={0.35}
        opacity={0.75}
      />
      <path
        d="M 10.8 2.6 Q 12.0 8.5 10.8 14.5"
        fill="none"
        stroke="#2a1808"
        strokeWidth={0.35}
        opacity={0.75}
      />
      {/* Iron hoops top + bottom. */}
      <ellipse
        cx={8}
        cy={3.6}
        rx={5.6}
        ry={0.65}
        fill="none"
        stroke="#1a0d04"
        strokeWidth={0.85}
      />
      <ellipse
        cx={8}
        cy={13.5}
        rx={5.6}
        ry={0.65}
        fill="none"
        stroke="#1a0d04"
        strokeWidth={0.85}
      />
      {/* Lid — radial gradient gives depth, slight overshoot above the
       * body so the rim reads. */}
      <ellipse
        cx={8}
        cy={2.4}
        rx={5.5}
        ry={1.55}
        fill="url(#beer-lid)"
        stroke="#1f1208"
        strokeWidth={0.45}
      />
      {/* Highlight stripe for the lacquered look. */}
      <ellipse
        cx={7}
        cy={1.85}
        rx={2.4}
        ry={0.4}
        fill="#c89a64"
        opacity={0.55}
      />
      {consumption ? (
        <line
          x1={1}
          y1={15}
          x2={15}
          y2={1}
          stroke="#b03030"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
