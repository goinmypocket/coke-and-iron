// Beer-barrel glyph. Use one icon per barrel.
//
// `consumption` flips the variant: default = produced (clean barrel);
// consumption = same barrel with a red diagonal strike through it,
// for tiles that consume / pay beer when they sell.

import type { CSSProperties } from "react";

export function BeerIcon({
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
      aria-label={consumption ? "Beer (consumed)" : "Beer"}
    >
      {/* Barrel body: ellipse with two stave bands. */}
      <ellipse
        cx={8}
        cy={8}
        rx={6}
        ry={5}
        fill="#c79b3f"
        stroke="#5b4516"
        strokeWidth={0.7}
      />
      <line x1={2.5} y1={6.4} x2={13.5} y2={6.4} stroke="#5b4516" strokeWidth={0.5} />
      <line x1={2.5} y1={9.6} x2={13.5} y2={9.6} stroke="#5b4516" strokeWidth={0.5} />
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
