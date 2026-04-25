// Current-income glyph: open palm holding a coin, with the level
// number written **to the right** of the icon. Used in the seat
// stats bar and the end-game scoreboard.
//
// The icon's intrinsic viewBox is 24 × 16 — wider than tall so the
// number sits beside the palm. `size` here is the icon HEIGHT;
// width scales with the aspect ratio.

import type { CSSProperties } from "react";

export function CurrentIncomeIcon({
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
  const width = size * (24 / 16);
  return (
    <svg
      width={width}
      height={size}
      x={x}
      y={y}
      viewBox="0 0 24 16"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={`Current income ${amount}`}
    >
      {/* Coin floating above the palm. */}
      <circle
        cx={6}
        cy={5.5}
        r={3}
        fill="#d4a017"
        stroke="#1a1a1a"
        strokeWidth={0.6}
      />
      {/* Open palm. */}
      <path
        d="M 0.5 11.5 Q 0.5 14 3.5 14 L 8.5 14 Q 11.5 14 11.5 11.5"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      {/* Amount to the right. */}
      <text
        x={14}
        y={11}
        fontSize={9}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {amount}
      </text>
    </svg>
  );
}
