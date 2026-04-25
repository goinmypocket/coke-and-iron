// =============================================================================
// §11.9 Recent actions — newest-first scrolling list of dispatched intents.
//
// Renders one line per Intent. Player names come from current GameState
// (display names are immutable, so this is safe even though the log is
// historical). Plain text formatting at this milestone — full colour
// scheme (per pawn / district / era) is roadmap polish.
// =============================================================================

import type { GameState, Intent, PlayerId } from "../../engine";
import { useEngine, useIntentLogVersion } from "../hooks/useEngine";
import { useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";

const MAX_ENTRIES = 100;

export function RecentActionsPanel() {
  const engine = useEngine();
  useIntentLogVersion();
  const players = useGameState((s) => s.players);
  const log = engine.getIntentLog();
  // newest first; cap at MAX_ENTRIES
  const view = log.slice(-MAX_ENTRIES).slice().reverse();

  return (
    <Panel id="recent_actions" title="Recent actions" maximizable>
      {view.length === 0 ? (
        <div className="recent-actions__empty">No actions yet.</div>
      ) : (
        <ol className="recent-actions">
          {view.map((intent, i) => (
            <li key={log.length - i} className="recent-actions__row">
              {formatIntent(intent, players)}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function formatIntent(
  intent: Intent,
  players: GameState["players"],
): string {
  if (intent.type === "noop") return "(noop)";
  if (intent.type === "END_TURN") return `${name(players, intent.playerId)} ended turn`;

  const who = name(players, intent.playerId);
  switch (intent.type) {
    case "BUILD":
      return `${who} built ${prettyIndustry(intent.industry)} at ${intent.cityName}`;
    case "NETWORK": {
      const second =
        intent.secondLink !== null ? " (+ second link)" : "";
      return `${who} laid link${second}`;
    }
    case "DEVELOP":
      return `${who} developed ${intent.industries
        .map(prettyIndustry)
        .join(", ")}`;
    case "SELL":
      return `${who} sold ${intent.orders.length} tile${
        intent.orders.length === 1 ? "" : "s"
      }`;
    case "LOAN":
      return `${who} took a loan`;
    case "SCOUT":
      return `${who} scouted`;
    case "PASS":
      return `${who} passed`;
    case "RESOLVE_SHORTFALL":
      return `${who} resolved shortfall (${
        intent.tilesToRemove.length
      } tile${intent.tilesToRemove.length === 1 ? "" : "s"}${
        intent.finalize ? ", finalized" : ""
      })`;
  }
}

function name(players: GameState["players"], id: PlayerId): string {
  return players.find((p) => p.id === id)?.displayName ?? `P${id + 1}`;
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((part) => part[0]! + part.slice(1).toLowerCase())
    .join(" ");
}
