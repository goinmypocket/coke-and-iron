// Income-gained glyph: gold up-arrow with the gain written inside.
//
// Used on tile-face flipped corners, the mat side column, and the
// merchant INCOME bonus badge. Anywhere the player would otherwise
// see "+N inc" or "income +N".

import type { CSSProperties } from "react";

export function IncomeGainedIcon({
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
      aria-label={`+${amount} income`}
    >
      <path
        d="M 8 1 L 14 8 L 11.5 8 L 11.5 14 L 4.5 14 L 4.5 8 L 2 8 Z"
        fill="#d4a017"
        stroke="#1a1a1a"
        strokeWidth={0.7}
        strokeLinejoin="round"
      />
      <text
        x={8}
        y={12.4}
        textAnchor="middle"
        fontSize={6}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {amount}
      </text>
    </svg>
  );
}
