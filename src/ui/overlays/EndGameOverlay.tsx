// =============================================================================
// §11.11 End-game overlay — rendered when state.phase === "GAME_OVER".
//
// Shows ranked seats per §6.6 (VP desc, income level desc, money desc),
// names the winner or "draw" if the top two seats truly tie, and offers
// a Close button. Closing does not change game state — the overlay just
// hides for the rest of the session.
// =============================================================================

import { useState } from "react";
import { rankSeats } from "../../engine";
import type { RankReason } from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";

const TIE_BREAK_LABEL: Readonly<Record<RankReason, string>> = {
  VP: "VP",
  INCOME: "income",
  MONEY: "money",
  DRAW: "tied",
};

export function EndGameOverlay() {
  const view = useGameState((s) => {
    if (s.phase !== "GAME_OVER") return null;
    return { ranked: rankSeats(s) };
  }, shallowEqual);

  const [closed, setClosed] = useState(false);

  if (!view || closed) return null;

  const top = view.ranked[0];
  const second = view.ranked[1];
  const headline =
    top !== undefined &&
    second !== undefined &&
    top.rank === second.rank
      ? "Draw at the top"
      : top !== undefined
        ? `Winner: ${top.displayName}`
        : "Game over";

  return (
    <div className="overlay-backdrop">
      <div className="endgame-overlay">
        <header className="endgame-overlay__title">{headline}</header>
        <table className="endgame-overlay__table">
          <thead>
            <tr>
              <th>#</th>
              <th></th>
              <th>Name</th>
              <th>VP</th>
              <th>Inc</th>
              <th>£</th>
              <th>Tie-break</th>
            </tr>
          </thead>
          <tbody>
            {view.ranked.map((row) => (
              <tr key={row.playerId}>
                <td>{row.rank}</td>
                <td>
                  <span
                    className="pawn-swatch"
                    style={{ background: row.pawnColor }}
                  />
                </td>
                <td>{row.displayName}</td>
                <td>{row.vp}</td>
                <td>{row.incomeLevel}</td>
                <td>£{row.money}</td>
                <td>{TIE_BREAK_LABEL[row.tieBreak]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="endgame-overlay__footnote">
          Tie-break order per §6.6: VP, then income level, then money.
        </p>
        <div className="endgame-overlay__buttons">
          <button
            type="button"
            className="action-btn"
            onClick={() => setClosed(true)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

