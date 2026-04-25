// =============================================================================
// §11.9 Recent actions — newest-first scrolling list of dispatched intents.
//
// One line per Intent. Player names are rendered in the player's pawn
// colour and city references in their district colour, so a glance can
// answer "who did what where" without reading the full sentence.
// =============================================================================

import { useMemo, type ReactNode } from "react";
import type {
  DistrictTag,
  GameState,
  Intent,
  PlayerId,
} from "../../engine";
import { useEngine, useIntentLogVersion } from "../hooks/useEngine";
import { useGameState } from "../hooks/useGameState";
import { DISTRICT_FILL } from "../industryIcons";
import { Panel } from "../layout/Panel";

const MAX_ENTRIES = 100;

export function RecentActionsPanel() {
  const engine = useEngine();
  useIntentLogVersion();
  const players = useGameState((s) => s.players);
  const districtCities = useGameState((s) => s.districtCities);
  const cityDistrict = useMemo(() => {
    const m = new Map<string, DistrictTag>();
    for (const c of districtCities) m.set(c.name, c.districtTag);
    return m;
  }, [districtCities]);
  const log = engine.getIntentLog();
  const view = log.slice(-MAX_ENTRIES).slice().reverse();

  return (
    <Panel id="recent_actions" title="Recent actions" maximizable>
      {view.length === 0 ? (
        <div className="recent-actions__empty">No actions yet.</div>
      ) : (
        <ol className="recent-actions">
          {view.map((intent, i) => (
            <li key={log.length - i} className="recent-actions__row">
              {formatIntent(intent, players, cityDistrict)}
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
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode {
  if (intent.type === "noop") return "(noop)";
  const who = playerSpan(players, intent.playerId);
  if (intent.type === "END_TURN") return <>{who} ended turn</>;

  switch (intent.type) {
    case "BUILD":
      return (
        <>
          {who} built {prettyIndustry(intent.industry)} at{" "}
          {citySpan(intent.cityName, cityDistrict)}
        </>
      );
    case "NETWORK":
      return (
        <>
          {who} laid link
          {intent.secondLink !== null ? " (+ second link)" : ""}
        </>
      );
    case "DEVELOP":
      return (
        <>
          {who} developed{" "}
          {intent.industries.map(prettyIndustry).join(", ")}
        </>
      );
    case "SELL":
      return (
        <>
          {who} sold {intent.orders.length} tile
          {intent.orders.length === 1 ? "" : "s"}
        </>
      );
    case "LOAN":
      return <>{who} took a loan</>;
    case "SCOUT":
      return <>{who} scouted</>;
    case "PASS":
      return <>{who} passed</>;
    case "RESOLVE_SHORTFALL":
      return (
        <>
          {who} resolved shortfall ({intent.tilesToRemove.length} tile
          {intent.tilesToRemove.length === 1 ? "" : "s"}
          {intent.finalize ? ", finalized" : ""})
        </>
      );
  }
}

function playerSpan(
  players: GameState["players"],
  id: PlayerId,
): ReactNode {
  const p = players.find((x) => x.id === id);
  const label = p?.displayName ?? `P${id + 1}`;
  if (!p) return label;
  return (
    <span className="recent-actions__player" style={{ color: p.pawnColor }}>
      {label}
    </span>
  );
}

function citySpan(
  cityName: string,
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode {
  const tag = cityDistrict.get(cityName);
  if (!tag) return cityName;
  return (
    <span
      className="recent-actions__city"
      style={{ color: DISTRICT_FILL[tag] }}
    >
      {cityName}
    </span>
  );
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((part) => part[0]! + part.slice(1).toLowerCase())
    .join(" ");
}
