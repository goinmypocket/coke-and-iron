// Minimal income-related glyphs used wherever the UI shows an
// income value:
//
//   - <IncomeIncreaseIcon amount={N} />  — up-arrow with the gain
//     written inside. Used wherever the spec previously displayed
//     "+N inc" (tile income-bonus, Income merchant bonus, etc.).
//   - <CurrentIncomeIcon amount={N} />   — palm-with-coin glyph plus
//     the level rendered to the right of the icon. Used for "current
//     income" displays (seat stats, end-game tally).
//
// Both come in HTML (top-level) and SVG (board-side) flavours so any
// caller can pick the appropriate one.

import type { CSSProperties } from "react";

const ARROW_FILL = "#d4a017";
const ARROW_STROKE = "#1a1a1a";

export function IncomeIncreaseIcon({
  amount,
  size = 16,
  style,
}: {
  amount: number;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={`+${amount} income`}
    >
      <IncomeIncreaseGlyph cx={8} cy={8} size={16} amount={amount} />
    </svg>
  );
}

/** SVG-context up-arrow centred on (cx, cy). `size` is the bounding
 *  box edge length; the arrow scales to fit. */
export function IncomeIncreaseGlyph({
  cx,
  cy,
  size,
  amount,
}: {
  cx: number;
  cy: number;
  size: number;
  amount: number;
}) {
  // Solid up-arrow shape with the value inside. Geometry expressed
  // relative to a 16-unit box, scaled by `size / 16`.
  const s = size / 16;
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${s})`} style={{ pointerEvents: "none" }}>
      <path
        d="M0 -7 L 6 1 L 2.5 1 L 2.5 6 L -2.5 6 L -2.5 1 L -6 1 Z"
        fill={ARROW_FILL}
        stroke={ARROW_STROKE}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <text
        x={0}
        y={4}
        textAnchor="middle"
        fontSize={6}
        fontWeight={700}
        fill={ARROW_STROKE}
      >
        {amount}
      </text>
    </g>
  );
}

export function CurrentIncomeIcon({
  amount,
  size = 16,
  style,
}: {
  amount: number;
  size?: number;
  style?: CSSProperties;
}) {
  // HTML inline: icon + value to its right.
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        verticalAlign: "middle",
        ...style,
      }}
      aria-label={`income level ${amount}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        style={{ flexShrink: 0 }}
        aria-hidden
      >
        <CurrentIncomeGlyph cx={8} cy={8} size={16} />
      </svg>
      <span style={{ fontWeight: 600 }}>{amount}</span>
    </span>
  );
}

/** SVG-context coin-on-palm glyph centred on (cx, cy). */
export function CurrentIncomeGlyph({
  cx,
  cy,
  size,
}: {
  cx: number;
  cy: number;
  size: number;
}) {
  const s = size / 16;
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${s})`} style={{ pointerEvents: "none" }}>
      {/* Coin floats above the palm */}
      <circle cx={0} cy={-2.5} r={3} fill={ARROW_FILL} stroke={ARROW_STROKE} strokeWidth={0.6} />
      {/* Open palm: a flat curve under the coin */}
      <path
        d="M -6.5 4 Q -6.5 6.5 -3.5 6.5 L 3.5 6.5 Q 6.5 6.5 6.5 4"
        fill="none"
        stroke={ARROW_STROKE}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  );
}
