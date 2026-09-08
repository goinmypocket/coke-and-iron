import type { CSSProperties } from "react";

/** One simple connected pair per link point; shared geometry for every caller. */
export function linkPointsIconWidth(count: number, size: number): number {
  return Math.max(0, count) * size;
}

export function LinkPointsIcon({ count = 1, size = 16, x, y, style }: {
  count?: number; size?: number; x?: number; y?: number; style?: CSSProperties;
}) {
  if (count <= 0) return null;
  return (
    <svg width={linkPointsIconWidth(count, size)} height={size} x={x} y={y}
      viewBox={`0 0 ${count * 16} 16`}
      style={{ verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label={count === 1 ? "Link point" : `${count} link points`}>
      {Array.from({ length: count }, (_, index) => (
        <g key={index} transform={`translate(${index * 16}, 0)`}>
          <rect x={0.75} y={2} width={14.5} height={12} rx={3} fill="#f2eee1" stroke="#5e5743" strokeWidth={1} />
          <path d="M4 8h8" stroke="#414b45" strokeWidth={1.5} />
          <circle cx={4} cy={8} r={2} fill="#414b45" />
          <circle cx={12} cy={8} r={2} fill="#414b45" />
        </g>
      ))}
    </svg>
  );
}
