import type { ReactNode } from "react";
import layoutConfig from "../../../config/layout.json";

interface PanelPlacement {
  readonly id: string;
  readonly column: string;
  readonly row: string;
}

interface LayoutFile {
  readonly columns: string;
  readonly rows: string;
  readonly panels: readonly PanelPlacement[];
}

/**
 * Reads `config/layout.json` and arranges named panels in a CSS Grid.
 * Children is a map of panel id → ReactNode; cells whose id has no
 * mapping render empty. Adding a new panel = one entry in the json
 * and one entry in the map.
 */
export function PanelGrid({
  children,
}: {
  children: Readonly<Record<string, ReactNode>>;
}) {
  const cfg = layoutConfig as unknown as LayoutFile;
  return (
    <div
      className="panel-grid"
      style={{
        display: "grid",
        gridTemplateColumns: cfg.columns,
        gridTemplateRows: cfg.rows,
        gap: "0.5rem",
        width: "100vw",
        height: "100vh",
        padding: "0.5rem",
        boxSizing: "border-box",
      }}
    >
      {cfg.panels.map((p) => (
        <div
          key={p.id}
          style={{
            gridColumn: p.column,
            gridRow: p.row,
            minHeight: 0,
            display: "flex",
          }}
        >
          {children[p.id] ?? null}
        </div>
      ))}
    </div>
  );
}
