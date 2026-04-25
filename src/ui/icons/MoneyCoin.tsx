// Reusable money-coin SVG. Used wherever the UI displays a money
// value — replaces the `£N` text everywhere outside of doc comments.
//
// HTML callers use `<MoneyCoin amount={N} />`. Inside SVG documents,
// use the lower-level `moneyCoinSvg(cx, cy, amount, size)` helper to
// emit the same shape as a `<g>` group.

import type { CSSProperties } from "react";

export function MoneyCoin({
  amount,
  size = 14,
  style,
}: {
  amount: number;
  size?: number;
  style?: CSSProperties;
}) {
  // viewBox kept at 14×14 so the same constants drive both scales.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={`£${amount}`}
    >
      <circle
        cx={7}
        cy={7}
        r={6.4}
        fill="#d4a017"
        stroke="#1a1a1a"
        strokeWidth={0.6}
      />
      <text
        x={7}
        y={9.6}
        textAnchor="middle"
        fontSize={6.5}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {amount}
      </text>
    </svg>
  );
}
