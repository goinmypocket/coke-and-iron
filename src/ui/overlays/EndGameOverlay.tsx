// =============================================================================
// §11.11 End-game overlay — rendered when state.phase === "GAME_OVER".
//
// Shows ranked seats per §6.6 (VP desc, income level desc, money desc),
// names the winner or "draw" if the top two seats truly tie, and offers
// a Close button. Closing does not change game state — the overlay just
// hides for the rest of the session.
// =============================================================================

import { useMemo, useState } from "react";
import { rankSeats } from "../../engine";
import type { GameState, RankReason } from "../../engine";
import { useEngine } from "../hooks/useEngine";
import { useGameState } from "../hooks/useGameState";
import { CurrentIncomeIcon } from "../icons/IncomeIcons";
import { MoneyCoin } from "../icons/MoneyCoin";

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
              <th>Money</th>
              <th>Tie-break</th>
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
                </td>
                <td>{row.displayName}</td>
                <td>{row.vp}</td>
                <td>
                  <CurrentIncomeIcon amount={row.incomeLevel} size={14} />
                </td>
                <td>
                  <MoneyCoin amount={row.money} size={14} />
                </td>
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

