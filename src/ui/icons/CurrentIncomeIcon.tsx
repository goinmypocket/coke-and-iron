// Current-income glyph: open palm holding a coin, optionally with the
// level number written **to the right** of the icon. Used in the seat
// stats bar, the end-game scoreboard, and as a column-header glyph in
// the Player Info table (where `iconOnly` collapses the wider variant
// to a 12×16 square palm-only icon).
//
// The default viewBox is 24 × 16 — wider than tall so the number sits
// beside the palm. With `iconOnly`, the viewBox shrinks to 12 × 16.
// `size` is the icon HEIGHT; width scales with the chosen viewBox.

import type { CSSProperties } from "react";

export function CurrentIncomeIcon({
  amount,
  size = 16,
  x,
  y,
  style,
  iconOnly = false,
}: {
  amount?: number;
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
  /** Render just the palm + coin glyph (no number), 12×16 viewBox. */
  iconOnly?: boolean;
}) {
  const vbWidth = iconOnly ? 12 : 24;
  const width = size * (vbWidth / 16);
  return (
    <svg
      width={width}
      height={size}
      x={x}
      y={y}
      viewBox={`0 0 ${vbWidth} 16`}
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={
        iconOnly
          ? "Current income"
          : `Current income ${amount ?? 0}`
      }
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
      {!iconOnly ? (
        <text
          x={14}
          y={11}
          fontSize={9}
          fontWeight={700}
          fill="#1a1a1a"
        >
          {amount ?? 0}
        </text>
      ) : null}
    </svg>
  );
}
