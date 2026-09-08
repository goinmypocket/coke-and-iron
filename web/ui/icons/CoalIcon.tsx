// Coal cube glyph. Use one icon per cube — multiple cubes are
// indicated by rendering this component multiple times.
//
// Renders a nested <svg> so the same component drops into either
// HTML or SVG host contexts. In SVG hosts pass `x` and `y` for
// positioning; HTML hosts ignore those and use normal flow.

import type { CSSProperties } from "react";

export function CoalIcon({
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
      aria-label="Coal cube"
    >
      <rect
        x={1}
        y={1}
        width={14}
        height={14}
        fill="#24332f"
        stroke="#1a1a1a"
        strokeWidth={0.9}
      />
    </svg>
  );
}
