// Victory-points glyph: pointy-top hex with the VP value inside.

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
        fill="#fffdf6"
        stroke="#1a1a1a"
        strokeWidth={0.8}
      />
      <text
        x={8}
        y={11}
        textAnchor="middle"
        fontSize={8}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {amount}
      </text>
    </svg>
  );
}
