import { VictoryPointsValue } from "../icons/VictoryPointsIcon";
import { useMemo } from "react";
import { stepToLevel } from "../../../engine/income";
import { scoringSummary } from "../../../engine/scoring";
import type { ScoredEra } from "../../../engine/types";
import { shallowEqual, useGameState } from "../hooks/useGameState";

const NO_SCORED_ERAS: readonly ScoredEra[] = [];

export function StatisticsPanel({ regionId }: { regionId: string }) {
  const state = useGameState((s) => ({
    phase: s.phase, era: s.era, players: s.players,
    lines: s.lines, merchantCities: s.merchantCities,
    builtTiles: s.builtTiles, tileCatalogue: s.tileCatalogue,
    developedLinks: s.developedLinks, scoredEras: s.scoredEras ?? NO_SCORED_ERAS,
  }), shallowEqual);
  const scores = useMemo(() => scoringSummary(state), [state]);
  const finished = state.phase === "GAME_OVER";
  const eraName = state.era === "CANAL" ? "Canal" : "Rail";
  return (
    <section className="ci-statistics" id={regionId} aria-labelledby={`${regionId}-heading`}>
      <div className="ci-section-heading">
        <h2 id={`${regionId}-heading`}>{finished ? "Final statistics" : "Live statistics"}</h2>
        <span>{finished ? "Both eras scored" : `${eraName} era`}</span>
      </div>
      <p className="ci-statistics__hint">{finished
        ? "Final VP includes both eras and net bonuses / penalties. The remaining board has already scored."
        : "Scored VP is already awarded. Current board is extra VP if this era ended now; only flipped industries count."}</p>
      <div className="ci-statistics__players">
        {scores.map((score) => {
          const player = state.players.find((p) => p.id === score.playerId)!;
          const tiles = state.builtTiles.filter((t) => t.owner === player.id);
          const links = state.developedLinks.filter((l) => l.owner === player.id).length;
          return (
            <article className="ci-score-card" key={player.id} aria-label={`${player.displayName} statistics`}>
              <h3><span className="pawn-swatch" style={{ background: player.pawnColor }} />{player.displayName}</h3>
              <dl className="ci-score-card__totals">
                <div><dt>{finished ? "Final VP" : "Scored VP"}</dt><dd><VictoryPointsValue amount={score.scored.total} /></dd></div>
                {!finished ? <div><dt>If era ended now</dt><dd><VictoryPointsValue amount={score.totalIfScoredNow} /></dd></div> : null}
              </dl>
              <table className="ci-score-table">
                <caption className="ci-visually-hidden">{player.displayName} point distribution</caption>
                <thead><tr><th scope="col">VP source</th><th scope="col">Scored</th>{!finished ? <th scope="col">Current board</th> : null}</tr></thead>
                <tbody>
                  <tr><th scope="row">Industries</th><td><VictoryPointsValue amount={score.scored.industry} /></td>{score.projection ? <td>+<VictoryPointsValue amount={score.projection.industry} /></td> : null}</tr>
                  <tr><th scope="row">Links</th><td><VictoryPointsValue amount={score.scored.links} /></td>{score.projection ? <td>+<VictoryPointsValue amount={score.projection.links} /></td> : null}</tr>
                  <tr><th scope="row">Bonuses / penalties</th><td>{score.scored.other > 0 ? "+" : ""}<VictoryPointsValue amount={score.scored.other} /></td>{!finished ? <td>—</td> : null}</tr>
                </tbody>
              </table>
              <p className="ci-score-card__economy">£{player.money} cash · £{stepToLevel(player.incomeStep)} income · {player.loansTaken} loans</p>
              <p className="ci-score-card__board">Board: {tiles.filter((t) => t.flipped).length}/{tiles.length} industries flipped · {links} links</p>
            </article>
          );
        })}
      </div>
      <p className="ci-statistics__hint">Bonuses / penalties is the net of merchant VP and points lost to debt. Cash and income do not add VP.</p>
      {state.scoredEras?.length ? (
        <details className="ci-score-history">
          <summary>Scored eras · point breakdown</summary>
          {state.scoredEras.map((era, index) => (
            <table className="ci-score-table" key={index}>
              <caption>{era.era === "CANAL" ? "Canal" : "Rail"} era awarded</caption>
              <thead><tr><th scope="col">Player</th><th scope="col">Industries</th><th scope="col">Links</th></tr></thead>
              <tbody>{era.players.map((score) => (
                <tr key={score.playerId}><th scope="row">{state.players.find((p) => p.id === score.playerId)?.displayName}</th><td><VictoryPointsValue amount={score.industry} /></td><td><VictoryPointsValue amount={score.links} /></td></tr>
              ))}</tbody>
            </table>
          ))}
        </details>
      ) : null}
    </section>
  );
}
