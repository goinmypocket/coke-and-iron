// Income-gained glyph: outlined up-arrow with the gain written inside.
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
      {/* Arrow body widened (3 → 13, was 4.5 → 11.5) and lowered shoulder
       *  so the inscribed number can use the same fontSize as VP /
       *  Money icons. */}
      <path
        d="M 8 1 L 14 7 L 13 7 L 13 14 L 3 14 L 3 7 L 2 7 Z"
        fill="#ffffff"
        stroke="#1a1a1a"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* Number centred within the icon's full 16×16 viewBox (not just
       *  the rectangular body at the bottom) — dominant-baseline keeps
       *  it visually centred regardless of the font's metrics. */}
      <text
        x={8}
        y={8}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {amount}
      </text>
    </svg>
  );
}
