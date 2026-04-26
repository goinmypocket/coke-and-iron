import type { ReactNode } from "react";

/**
 * Top-level game shell. Five named regions arranged in a CSS Grid via
 * `grid-template-areas` (defined in styles/app.css `.game-layout`):
 *
 *   ┌─────────┬───────────┬──────────┐
 *   │ status  │  board    │ workspace│   ← row 1
 *   ├─────────┴───────────┤          │
 *   │       players       │          │   ← row 2
 *   ├─────────────────────┴──────────┤
 *   │            log                 │   ← row 3
 *   └────────────────────────────────┘
 *
 * On narrow viewports (< 48em) the same regions stack vertically via
 * a media query — board first, then workspace, then status, players,
 * log. Page handles vertical overflow.
 *
 * Each region is just a named <div> the parent fills with whatever
 * components belong there. The shell knows nothing about the panels
 * inside — adding/moving content is a CSS-only edit on the
 * `grid-template-areas` string.
 */
export function GameLayout({
  status,
  board,
  workspace,
  players,
  log,
}: {
  status: ReactNode;
  board: ReactNode;
  workspace: ReactNode;
  players: ReactNode;
  log: ReactNode;
}) {
  return (
    <div className="game-layout">
      <div className="game-layout__region game-layout__region--status">
        {status}
      </div>
      <div className="game-layout__region game-layout__region--board">
        {board}
      </div>
      <div className="game-layout__region game-layout__region--workspace">
        {workspace}
      </div>
      <div className="game-layout__region game-layout__region--players">
        {players}
      </div>
      <div className="game-layout__region game-layout__region--log">
        {log}
      </div>
    </div>
  );
}
