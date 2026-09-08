// Iron cube glyph. One icon per cube; multiple cubes = multiple icons.

import type { CSSProperties } from "react";

export function IronIcon({
  size = 16,
  x,
  y,
  style,
}: {
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
      aria-label="Iron"
    >
      <rect
        x={1}
        y={1}
        width={14}
        height={14}
        fill="#ad7040"
        stroke="#1a1a1a"
        strokeWidth={0.6}
      />
    </svg>
  );
}
