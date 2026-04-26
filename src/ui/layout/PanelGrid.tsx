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
 * Reads `config/layout.json` and arranges named panels into responsive
 * flex columns. `columns` is a CSS-grid-style track string ("auto 1fr
 * 13rem"); each track becomes one flex column. Panels with `column`
 * starting at track N are stacked into column N in declaration order.
 *
 * Responsive behaviour (driven from app.css media queries on
 * `.panel-grid`):
 *
 *   - ≥ 48em: columns sit side-by-side as declared in layout.json
 *             (income / board+mats / info). flex-wrap is on so any
 *             column that can't shrink to fit drops onto its own row
 *             rather than forcing horizontal page overflow.
 *   - < 48em: flex-direction switches to column so each track stacks
 *             full-width — phone-portrait scrolls vertically only.
 *
 * Per-column sizing (track strings in layout.json) is preserved as
 * the wide-regime preference — fixed-rem tracks keep their requested
 * width, "auto" sits at content size, "Nfr" grows. At narrow widths
 * the media query overrides the per-column widths.
 *
 * The legacy `row` field on each panel is retained in the schema for
 * backwards compatibility but is ignored — declaration order drives
 * stacking within a column.
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
    <div className="panel-grid">
      {tracks.map((track, i) => (
        <div
          key={i}
          className="panel-grid__col"
          data-col-idx={i}
          style={trackStyle(track)}
        >
          {groups[i]!.map((p) => (
            <div
              key={p.id}
              className="panel-grid__cell"
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
    // Allow shrinking below intrinsic content so the board column
    // can squeeze to fit narrow viewports rather than forcing
    // horizontal overflow. `min-width: 0` ditto.
    return { flex: `${fr} 1 0`, minWidth: 0 };
  }
  if (track === "auto") {
    // "auto" columns (income) sit at natural width when room allows
    // but also allow growing on narrow viewports where they'd
    // otherwise stand alone in their row.
    return { flex: "0 1 auto", minWidth: 0 };
  }
  // Fixed-rem tracks (e.g. "13rem") prefer their requested basis but
  // can grow when wrapped onto their own row at medium widths.
  return { flex: `0 1 ${track}`, minWidth: 0, width: track };
}
