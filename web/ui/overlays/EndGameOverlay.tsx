import { VictoryPointsValue } from "../icons/VictoryPointsIcon";
import { Modal } from "./Modal";
// =============================================================================
// §11.11 End-game overlay — rendered when state.phase === "GAME_OVER".
//
// Shows ranked seats per §6.6 (VP desc, income level desc, money desc),
// names the winner or "draw" if the top two seats truly tie, and offers
// a Close button. Closing does not change game state — the overlay just
// hides for the rest of the session.
// =============================================================================

import { useMemo, useState } from "react";
import { rankSeats } from "../../../engine";
import type { GameState, RankReason } from "../../../engine";
import { useEngine } from "../hooks/useEngine";
import { useGameState } from "../hooks/useGameState";

const TIE_BREAK_LABEL: Readonly<Record<RankReason, string>> = {
  VP: "VP",
  INCOME: "income",
  MONEY: "money",
  DRAW: "tied",
};

export function EndGameOverlay() {
  // Subscribe only to phase + the player array — both are stable refs
  // until something actually changes — and compute the ranked
  // scoreboard outside the selector so we don't return a fresh array
  // every getSnapshot call.
  const phase = useGameState((s) => s.phase);
  const engine = useEngine();
  const ranked = useMemo(() => {
    if (phase !== "GAME_OVER") return null;
    return rankSeats(engine.getState() as GameState);
  }, [phase, engine]);

  const [closed, setClosed] = useState(false);

  if (ranked === null || closed) return null;

  const top = ranked[0];
  const second = ranked[1];
  const headline =
    top !== undefined &&
    second !== undefined &&
    top.rank === second.rank
      ? "Draw at the top"
      : top !== undefined
        ? `Winner: ${top.displayName}`
        : "Game over";

  return (
    <Modal className="endgame-overlay" label="Game results" onClose={() => setClosed(true)}>
        <header className="endgame-overlay__title">{headline}</header>
        <table className="endgame-overlay__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>VP</th>
              <th>Income</th>
              <th>Cash</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr key={row.playerId}>
                <td>{row.rank}</td>
                <td>
                  <span
                    className="pawn-swatch"
                    style={{ background: row.pawnColor }}
                  />
                  {row.displayName}<small className="ci-result-reason">{TIE_BREAK_LABEL[row.tieBreak]}</small>
                </td>
                <td>
                  <VictoryPointsValue amount={row.vp} />
                </td>
                <td>
                  £{row.incomeLevel}
                </td>
                <td>
                  £{row.money}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="endgame-overlay__footnote">
          Ranking: VP, then income level, then cash. The note under each name shows the deciding tie-break.
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
    </Modal>
  );
}

