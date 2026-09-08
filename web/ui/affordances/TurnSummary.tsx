import { stepToLevel } from "../../../engine";
import { useActualSeatId, useMySeatId } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";

export function TurnSummary({ paused }: { paused: boolean }) {
  const actualSeatId = useActualSeatId();
  const mySeatId = useMySeatId();
  const view = useGameState((s) => ({
    era: s.era, round: s.round, phase: s.phase,
    active: s.players.find((p) => p.id === s.turnOrder[s.currentPlayerIndex]),
    me: s.players.find((p) => p.id === mySeatId),
  }), shallowEqual);
  const myTurn = actualSeatId !== null && view.active?.id === actualSeatId;
  return (
    <header className="ci-turn-summary">
      <div className="ci-game-heading">
        <h1>Coke and Iron</h1>
        <span>{view.era === "CANAL" ? "Canal" : "Rail"} era <span aria-hidden="true">·</span> Round {view.round}</span>
      </div>
      <div className="ci-turn-summary__line">
        <p aria-live="polite">
          <strong>{view.phase === "GAME_OVER" ? "Game over" : paused ? "Game paused" : myTurn ? "Your turn" : `${view.active?.displayName ?? "Next player"}’s turn`}</strong>
          <span className="ci-seat-label">{view.me ? ` · ${actualSeatId === null ? "Viewing" : "Playing as"} ${view.me.displayName}` : " · Spectating"}</span>
        </p>
        {view.me ? <dl className="ci-resource-summary">
          <div><dt>Money</dt><dd>£{view.me.money}</dd></div>
          <div><dt>Income</dt><dd>£{stepToLevel(view.me.incomeStep)}</dd></div>
          <div><dt>{view.phase === "GAME_OVER" ? "Final VP" : "Scored VP"}</dt><dd>{view.me.vp}</dd></div>
        </dl> : null}
      </div>
    </header>
  );
}
