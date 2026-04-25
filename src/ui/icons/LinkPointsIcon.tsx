// Link-points glyph: same hexagon as VictoryPointsIcon (black bg,
// dark-golden border) with a horizontal line through the centre
// ending in filled circles. The line and the circular ends are
// golden. One icon per link point — multiple link points = multiple
// instances. All geometry is expressed in viewBox units so scaling
// stays proportional.

import type { CSSProperties } from "react";

const HEX_POINTS = (() => {
  const cx = 8;
  const cy = 8;
  const r = 7;
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ");
})();

const LP_BG = "#0a0a0a";
const LP_GOLD = "#c89020";

export function LinkPointsIcon({
  size = 16,
  x,
  y,
  style,
}: {
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      x={x}
      y={y}
      viewBox="0 0 16 16"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label="Link point"
    >
      <polygon
        points={HEX_POINTS}
        fill={LP_BG}
        stroke={LP_GOLD}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {/* Horizontal segment through the centre with circular filled ends. */}
      <line
        x1={4.5}
        y1={8}
        x2={11.5}
        y2={8}
        stroke={LP_GOLD}
        strokeWidth={1.6}
        strokeLinecap="butt"
      />
      <circle cx={4.5} cy={8} r={1.9} fill={LP_GOLD} />
      <circle cx={11.5} cy={8} r={1.9} fill={LP_GOLD} />
    </svg>
  );
}
