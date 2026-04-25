import { shallowEqual, useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";

/**
 * §11.4 Game state — read-only summary: era, round, phase, active seat
 * (in pawn colour), actions remaining, draw deck size.
 */
export function GameStatePanel() {
  const summary = useGameState((s) => {
    const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
    const active = activeId !== null
      ? s.players.find((p) => p.id === activeId) ?? null
      : null;
    return {
      era: s.era,
      round: s.round,
      phase: s.phase,
      actionsRemaining: s.actionsRemaining,
      deckSize: s.drawDeck.length,
      pendingShortfalls: s.pendingShortfalls.length,
      activeName: active?.displayName ?? "—",
      activeColor: active?.pawnColor ?? "var(--muted)",
    };
  }, shallowEqual);

  return (
    <Panel id="game_state" title="Game state">
      <dl className="kv-list">
        <dt className="kv-list__key">Era</dt>
        <dd>
          <strong>{summary.era}</strong>
        </dd>
        <dt className="kv-list__key">Round</dt>
        <dd>{summary.round}</dd>
        <dt className="kv-list__key">Phase</dt>
        <dd>{summary.phase}</dd>
        <dt className="kv-list__key">Turn</dt>
        <dd>
          <span style={{ color: summary.activeColor, fontWeight: 600 }}>
            {summary.activeName}
          </span>
        </dd>
        <dt className="kv-list__key">Actions left</dt>
        <dd>{summary.actionsRemaining}</dd>
        <dt className="kv-list__key">Deck</dt>
        <dd>{summary.deckSize} cards</dd>
        {summary.pendingShortfalls > 0 && (
          <>
            <dt className="kv-list__key">Shortfalls</dt>
            <dd style={{ color: "var(--warm-gold)" }}>
              {summary.pendingShortfalls} pending
            </dd>
          </>
        )}
      </dl>
    </Panel>
  );
}
