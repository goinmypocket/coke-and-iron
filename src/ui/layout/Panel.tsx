import { useState, type ReactNode } from "react";

/**
 * Shared §10 panel chrome: title strip, optional maximize chevron, and
 * the bounded-rect / clipping discipline that every §11 panel inherits.
 * Game-specific behaviour lives in the panel's own component, never
 * here.
 */
export function Panel({
  id,
  title,
  maximizable = false,
  emphasized = false,
  borderColor,
  children,
}: {
  id: string;
  title: string;
  maximizable?: boolean;
  emphasized?: boolean;
  /** Override the neutral ink border (used by per-seat sub-panels in
   * §11.3 to paint the seat's pawn colour). */
  borderColor?: string;
  children: ReactNode;
}) {
  const [maximized, setMaximized] = useState(false);
  const className = [
    "panel",
    emphasized ? "panel--emphasized" : "",
    maximized ? "panel--maximized" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style = borderColor ? { borderColor } : undefined;

  return (
    <section className={className} data-panel-id={id} style={style}>
      <header className="panel__title">
        <span>{title}</span>
        {maximizable && (
          <button
            type="button"
            className="panel__maximize"
            onClick={() => setMaximized((m) => !m)}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            ⤢
          </button>
        )}
      </header>
      <div className="panel__content">{children}</div>
    </section>
  );
}
