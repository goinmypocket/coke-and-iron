// Develop glyph: lightbulb. `consumption` flips to the
// "cannot develop" variant — same bulb with a red diagonal strike.
//
// Default (consumption=false) → the merchant DEVELOP-bonus marker.
// consumption=true → Pottery light-bulb tiles that can't be Developed.

import type { CSSProperties } from "react";

export function DevelopIcon({
  size = 16,
  x,
  y,
  style,
  consumption = false,
}: {
  size?: number;
  x?: number;
  y?: number;
  style?: CSSProperties;
  consumption?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      x={x}
      y={y}
      viewBox="0 0 16 16"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={consumption ? "Cannot develop" : "Develop"}
    >
      {/* Bulb body */}
      <path
        d="M 8 1.5 C 5.2 1.5 3.4 3.6 3.4 5.8 C 3.4 7.4 4.2 8.2 5 9.4 L 5 11 L 11 11 L 11 9.4 C 11.8 8.2 12.6 7.4 12.6 5.8 C 12.6 3.6 10.8 1.5 8 1.5 Z"
        fill="#f0d050"
        stroke="#1a1a1a"
        strokeWidth={0.7}
      />
      {/* Bulb base */}
      <rect
        x={5.6}
        y={11}
        width={4.8}
        height={1.8}
        fill="#888"
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      <rect
        x={6.2}
        y={12.8}
        width={3.6}
        height={1.2}
        fill="#888"
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      {consumption ? (
        <line
          x1={1}
          y1={15}
          x2={15}
          y2={1}
          stroke="#b03030"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
