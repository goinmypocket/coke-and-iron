import type { ReactNode } from "react";

/**
 * Shared chrome for a region of the UI: title strip + bordered content
 * box. A panel is a bounding box for whatever sits inside it; it does
 * not maximize, minimize, or own internal scroll. Page-level scroll
 * handles long pages; the recent-actions panel opts in to internal
 * scroll via its own CSS rule.
 */
export function Panel({
  id,
  title,
  hideTitle = false,
  emphasized = false,
  borderColor,
  children,
}: {
  id: string;
  title: string;
  /** Drop the chrome header strip while keeping the panel border.
   *  Used by the Main Board and the outer Player Mats panel where the
   *  contents are self-explanatory and the heading is just visual noise. */
  hideTitle?: boolean;
  emphasized?: boolean;
  /** Override the neutral ink border (used by per-seat sub-panels in
   * the players region to paint the seat's pawn colour). */
  borderColor?: string;
  children: ReactNode;
}) {
  const className = [
    "panel",
    hideTitle ? "panel--no-title" : "",
    emphasized ? "panel--emphasized" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = borderColor ? { borderColor } : undefined;
  return (
    <section className={className} data-panel-id={id} style={style}>
      {hideTitle ? null : (
        <header className="panel__title">
          <span>{title}</span>
        </header>
      )}
      <div className="panel__content">{children}</div>
    </section>
  );
}
