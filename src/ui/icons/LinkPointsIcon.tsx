// Link-points glyph: a single link marker. Multiple link points are
// indicated by rendering this component multiple times.

import type { CSSProperties } from "react";

export function LinkPointsIcon({
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
      aria-label="Link point"
    >
      {/* Two interlocking ring halves — read as "link" at small size. */}
      <circle
        cx={6}
        cy={8}
        r={3.5}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={1.4}
      />
      <circle
        cx={10}
        cy={8}
        r={3.5}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={1.4}
      />
    </svg>
  );
}
