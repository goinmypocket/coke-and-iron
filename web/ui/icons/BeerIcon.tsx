import type { CSSProperties } from "react";

/** Flat barrel with a diagonal strike when beer is consumed. */
export function BeerIcon({ size = 16, x, y, style, consumption = false }: {
  size?: number; x?: number; y?: number; style?: CSSProperties; consumption?: boolean;
}) {
  return (
    <svg width={size} height={size} x={x} y={y} viewBox="0 0 16 16"
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={consumption ? "Beer (consumed)" : "Beer"}>
      <path d="M4 1.5h8q4 6.5 0 13H4q-4-6.5 0-13Z" fill="#dddddd" stroke="#222222" strokeWidth={1} />
      <path d="M2.5 5h11M2.5 11h11M8 2v12" fill="none" stroke="#222222" strokeWidth={1} />
      {consumption ? <path d="M1 15 15 1" stroke="#9a3434" strokeWidth={1.8} strokeLinecap="round" /> : null}
    </svg>
  );
}
