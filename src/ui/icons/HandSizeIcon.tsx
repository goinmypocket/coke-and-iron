// Hand-size glyph: three overlapping rounded rectangles fanned with a
// slight rotation, suggesting a small fan of cards. The hand-size
// number renders inside the same SVG, immediately to the right of
// the icon (like CurrentIncomeIcon), so the count scales with the
// icon and stays visually anchored to it.

import type { CSSProperties } from "react";

export function HandSizeIcon({
  amount,
  size = 16,
  x,
  y,
  style,
}: {
  /** Hand size to display next to the icon. Omit for an icon-only render. */
  amount?: number;
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
}) {
  // Wider viewBox (24×16) when an amount is shown so the number can
  // sit beside the fan without crowding it; square (16×16) otherwise.
  const showAmount = amount !== undefined;
  const vbWidth = showAmount ? 24 : 16;
  const width = size * (vbWidth / 16);
  // Three cards share a common pivot just below the icon centre so
  // the fan opens upward. Pivot stays inside the icon's 16-unit
  // square portion of the viewBox regardless of width.
  const pivotX = 8;
  const pivotY = 12;
  const cardW = 6;
  const cardH = 9;
  const cardX = pivotX - cardW / 2;
  const cardY = pivotY - cardH;
  const stroke = "#1a1a1a";
  const strokeWidth = 1.1;
  const fill = "#fff";
  const rx = 1;
  return (
    <svg
      width={width}
      height={size}
      x={x}
      y={y}
      viewBox={`0 0 ${vbWidth} 16`}
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={showAmount ? `${amount} cards in hand` : "Cards in hand"}
    >
      {/* Back card — rotated counterclockwise around the bottom pivot. */}
      <rect
        x={cardX}
        y={cardY}
        width={cardW}
        height={cardH}
        rx={rx}
        ry={rx}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        transform={`rotate(-22 ${pivotX} ${pivotY})`}
      />
      {/* Middle card — drawn straight up. */}
      <rect
        x={cardX}
        y={cardY}
        width={cardW}
        height={cardH}
        rx={rx}
        ry={rx}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Front card — rotated clockwise around the same pivot. */}
      <rect
        x={cardX}
        y={cardY}
        width={cardW}
        height={cardH}
        rx={rx}
        ry={rx}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        transform={`rotate(22 ${pivotX} ${pivotY})`}
      />
      {showAmount ? (
        <text
          x={15}
          y={11}
          fontSize={9}
          fontWeight={700}
          fill="#1a1a1a"
        >
          {amount}
        </text>
      ) : null}
    </svg>
  );
}
