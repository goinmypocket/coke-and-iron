import type { CSSProperties, ReactNode } from "react";
import layoutConfig from "../../../config/layout.json";

interface PanelPlacement {
  readonly id: string;
  readonly column: string;
  readonly row?: string;
}

interface LayoutFile {
  readonly columns: string;
  readonly rows?: string;
  readonly panels: readonly PanelPlacement[];
}

/**
 * Reads `config/layout.json` and arranges named panels in three vertical
 * flex columns. `columns` is a CSS-grid-style track string ("8rem 1fr
 * 13rem"); each track becomes one flex column. Panels with `column`
 * starting at track N are stacked into column N in declaration order.
 *
 * Page layout is flex-column friendly so the document scrolls
 * vertically rather than each panel scrolling on its own. The legacy
 * `row` field on each panel is retained in the schema for backwards
 * compatibility but is ignored — declaration order drives stacking.
 */
export function PanelGrid({
  children,
}: {
  children: Readonly<Record<string, ReactNode>>;
}) {
  const cfg = layoutConfig as unknown as LayoutFile;
  const tracks = cfg.columns.split(/\s+/).filter(Boolean);
  const groups: PanelPlacement[][] = tracks.map(() => []);
  for (const p of cfg.panels) {
    const idx = Math.max(0, startTrack(p.column) - 1);
    if (idx < groups.length) groups[idx]!.push(p);
  }
  return (
    <div
      className="panel-grid"
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "0.5rem",
        padding: "0.5rem",
        width: "100%",
        boxSizing: "border-box",
        alignItems: "flex-start",
      }}
    >
      {tracks.map((track, i) => (
        <div
          key={i}
          className="panel-grid__col"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            minWidth: 0,
            ...trackStyle(track),
          }}
        >
          {groups[i]!.map((p) => (
            <div
              key={p.id}
              className="panel-grid__cell"
              style={{ display: "flex", width: "100%", minWidth: 0 }}
            >
              {children[p.id] ?? null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function startTrack(span: string): number {
  const match = span.match(/^(\d+)/);
  return match ? Number(match[1]) : 1;
}

function trackStyle(track: string): CSSProperties {
  if (track.endsWith("fr")) {
    const fr = parseFloat(track.slice(0, -2)) || 1;
    return { flex: `${fr} 1 0`, minWidth: 0 };
  }
  if (track === "auto") return { flex: "0 0 auto" };
  return { flex: "0 0 auto", width: track };
}
