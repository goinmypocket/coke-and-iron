// Victory-points glyph: pointy-top hexagon with the VP value inside.
// Black background, dark-golden border, dark-golden value.

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

const VP_BG = "#0a0a0a";
const VP_GOLD = "#c89020";

export function VictoryPointsIcon({
  amount,
  size = 16,
  x,
  y,
  style,
}: {
  amount: number;
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
      aria-label={`${amount} victory points`}
    >
      <polygon
        points={HEX_POINTS}
        fill={VP_BG}
        stroke={VP_GOLD}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <text
        x={8}
        y={11}
        textAnchor="middle"
        fontSize={8}
        fontWeight={700}
        fill={VP_GOLD}
      >
        {amount}
      </text>
    </svg>
  );
}
