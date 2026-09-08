// Reusable money-coin SVG. Used wherever the UI displays a money
// value — replaces the `£N` text everywhere outside of doc comments.
//
// HTML callers use `<MoneyCoin amount={N} />`. Inside SVG documents,
// use the lower-level `moneyCoinSvg(cx, cy, amount, size)` helper to
// emit the same shape as a `<g>` group.

import type { CSSProperties } from "react";

export function MoneyCoin({
  amount,
  label,
  size = 14,
  x,
  y,
  style,
}: {
  amount: number;
  /** Override the displayed text (e.g. "21+"). When omitted, shows amount. */
  label?: string;
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
}) {
  const text = label ?? String(amount);
  // Squeeze the glyph down a bit when the label is wider so multi-char
  // strings like "21+" still fit inside the coin. Single-char text uses
  // the same screen size (relative to icon size) as VP / Income — at
  // viewBox 14 the 7.0 single-char base matches VP's 8.0 in viewBox 16.
  const fontSize =
    text.length >= 3 ? 5.6 : text.length === 2 ? 6.5 : 7.0;
  return (
    <svg
      width={size}
      height={size}
      x={x}
      y={y}
      viewBox="0 0 14 14"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={label ?? `£${amount}`}
    >
      <circle
        cx={7}
        cy={7}
        r={6.4}
        fill="#d9c596"
        stroke="#1a1a1a"
        strokeWidth={0.6}
      />
      <text
        x={7}
        y={9.4}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {text}
      </text>
    </svg>
  );
}
