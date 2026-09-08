// Victory-points glyph: pointy-top hexagon with the VP value inside.
// Plain outlined hexagon; the number stays legible at board scale.

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

const VP_BG = "#ffffff";
const VP_INK = "#222222";

export function VictoryPointsIcon({
  amount,
  size = 16,
  x,
  y,
  style,
  label,
}: {
  amount?: number;
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      x={x}
      y={y}
      viewBox="0 0 16 16"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={label ?? (amount === undefined ? "Victory points" : `${amount} victory points`)}
    >
      <polygon
        points={HEX_POINTS}
        fill={VP_BG}
        stroke={VP_INK}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {amount !== undefined ? <text
        x={8}
        y={11}
        textAnchor="middle"
        fontSize={String(amount).length > 2 ? 6.5 : 8}
        fontWeight={700}
        fill={VP_INK}
      >
        {amount}
      </text> : null}
    </svg>
  );
}

/** Keep prose and table values at normal text size beside the shared VP glyph. */
export function VictoryPointsValue({ amount }: { amount: number }) {
  return <span className="ci-vp-value"><span aria-hidden="true"><VictoryPointsIcon /></span><span>{amount}</span></span>;
}
