import { Modal } from "./Modal";
// =============================================================================
// §11.9 Recent actions — modal overlay showing a newest-first scrolling list
// of dispatched intents.
//
// Shape:
//   - Toggled from the "Log" button in the ActionsPanel controls row.
//   - Dismissed via the backdrop / close button / ESC key (mirrors
//     RemainingCardsOverlay).
//
// Source of truth:
//   - The host (CokeAndIronSession) maintains the authoritative public
//     `ObservableEvent[]` log, derived from spectator-view diffs as
//     intents dispatch. SNAPSHOT messages ship the entire log; STATE
//     messages with cause `intent` ship one new event apiece.
//   - The browser ClientEngine just stores what the host sends (push
//     on intent, pop on undo, replace on snapshot). This means a page
//     refresh rebuilds the log from the snapshot rather than starting
//     from empty.
//   - This overlay reads that log via `useRecentEvents()`.
//
// Each row resolves player names + city districts from the live view so
// styling matches the rest of the UI (player name in pawn colour, city
// name in district colour).
// =============================================================================

import { Fragment, useMemo, type ReactNode } from "react";
import {
  type Card,
  type DistrictTag,
  type GameState,
  type IndustryName,
  type LineEndpoints,
  type PlayerId,
} from "../../../engine";
import type { ObservableEvent } from "../../../engine/eventLog";
import { useEngine, useRecentEvents } from "../hooks/useEngine";
import { DISTRICT_FILL, INDUSTRY_LABEL } from "../industryIcons";

const MAX_ENTRIES = 200;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function RecentActionsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Modal className="recent-actions-overlay" label="Recent actions" onClose={onClose}>
        <RecentActionsBody onClose={onClose} />
    </Modal>
  );
}

function RecentActionsBody({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const events = useRecentEvents();

  // Pull current player metadata from live state — names & pawn colours
  // never change post-setup, so reading the latest is fine.
  const state = engine.getState();
  const cityDistrict = useMemo(() => {
    const m = new Map<string, DistrictTag>();
    for (const c of state.districtCities) m.set(c.name, c.districtTag);
    return m;
  }, [state.districtCities]);

  const view = events.slice(-MAX_ENTRIES).slice().reverse();

  return (
    <>
      <div className="recent-actions-overlay__head">
        <div className="recent-actions-overlay__title">Recent actions</div>
        <button
          type="button"
          className="action-btn"
          onClick={onClose}
          aria-label="Close recent actions"
        >
          Close
        </button>
      </div>
      {view.length === 0 ? (
        <div className="recent-actions__empty">No actions yet.</div>
      ) : (
        <ol className="recent-actions">
          {view.map((entry, i) => {
            // Insert a section divider BETWEEN entries when era or
            // round differs from the newer (i-1) neighbour. The view
            // is newest-first, so the divider visually separates the
            // newer block (above) from the older block (below) and
            // labels the boundary itself — "Round N" for round
            // transitions, "Rail era begins" for the canal→rail flip.
            const newer = i > 0 ? view[i - 1] : null;
            let divider: ReactNode = null;
            if (newer) {
              if (newer.era !== entry.era) {
                divider = (
                  <li className="recent-actions__divider recent-actions__divider--era">
                    {newer.era === "RAIL"
                      ? "Rail era begins"
                      : "Canal era begins"}
                  </li>
                );
              } else if (newer.round !== entry.round) {
                divider = (
                  <li className="recent-actions__divider">
                    Round {newer.round}
                  </li>
                );
              }
            }
            return (
              <Fragment key={events.length - i}>
                {divider}
                <li className="recent-actions__row">
                  <Row entry={entry} state={state} cityDistrict={cityDistrict} />
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </>
  );
}

function Row({
  entry,
  state,
  cityDistrict,
}: {
  entry: ObservableEvent;
  state: GameState;
  cityDistrict: ReadonlyMap<string, DistrictTag>;
}) {
  const { intent } = entry;
  const who = intent.type === "noop" ? null : playerSpan(state, intent.playerId);
  const headline = renderHeadline(entry, who, cityDistrict);
  const details = renderDetails(entry, cityDistrict);
  return (
    <>
      <div className="recent-actions__headline">{headline}</div>
      {details.length > 0 ? (
        <ul className="recent-actions__detail">
          {details.map((node, k) => (
            <li key={k}>{node}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function renderHeadline(
  entry: ObservableEvent,
  who: ReactNode,
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode {
  const { intent } = entry;
  if (intent.type === "noop") return "(noop)";
  if (intent.type === "END_TURN") return <>{who} ended turn</>;

  const cardChip =
    entry.cardsConsumed.length > 0 ? (
      <CardsChip cards={entry.cardsConsumed} cityDistrict={cityDistrict} />
    ) : null;

  switch (intent.type) {
    case "BUILD":
      return (
        <>
          {who} built{" "}
          <strong>
            {prettyIndustry(intent.industry)}
            {entry.buildTileLevel !== undefined
              ? ` ${roman(entry.buildTileLevel)}`
              : ""}
          </strong>{" "}
          at {citySpan(intent.cityName, cityDistrict)} {cardChip}
        </>
      );
    case "NETWORK":
      return (
        <>
          {who} laid{" "}
          {entry.networkLine ? linkSpan(entry.networkLine, cityDistrict) : "link"}
          {entry.networkSecondLine ? (
            <>
              {" "}+ {linkSpan(entry.networkSecondLine, cityDistrict)}
            </>
          ) : null}{" "}
          {cardChip}
        </>
      );
    case "DEVELOP":
      return (
        <>
          {who} developed{" "}
          {intent.industries.map((ind, idx) => (
            <Fragment key={idx}>
              {idx > 0 ? ", " : ""}
              <strong>
                {prettyIndustry(ind)}
                {entry.developLevels && entry.developLevels[idx] !== undefined
                  ? ` ${roman(entry.developLevels[idx]!)}`
                  : ""}
              </strong>
            </Fragment>
          ))}{" "}
          {cardChip}
        </>
      );
    case "SELL": {
      const orders = entry.sellOrders ?? [];
      return (
        <>
          {who} sold{" "}
          {orders.length === 0
            ? `${intent.orders.length} tile${intent.orders.length === 1 ? "" : "s"}`
            : orders.map((o, idx) => (
                <Fragment key={idx}>
                  {idx > 0 ? ", " : ""}
                  <strong>
                    {prettyIndustry(o.industry)} {roman(o.level)}
                  </strong>
                  {" @ "}
                  {citySpan(o.cityName, cityDistrict)}
                </Fragment>
              ))}{" "}
          {cardChip}
        </>
      );
    }
    case "LOAN":
      return (
        <>
          {who} took a loan {cardChip}
        </>
      );
    case "SCOUT":
      return (
        <>
          {who} scouted {cardChip}
        </>
      );
    case "PASS":
      return (
        <>
          {who} passed {cardChip}
        </>
      );
    case "RESOLVE_SHORTFALL": {
      const tiles = entry.removedTiles ?? [];
      return (
        <>
          {who} resolved shortfall{" "}
          {tiles.length > 0
            ? tiles.map((t, idx) => (
                <Fragment key={idx}>
                  {idx > 0 ? ", " : ""}
                  removed{" "}
                  <strong>
                    {prettyIndustry(t.industry)} {roman(t.level)}
                  </strong>
                  {" @ "}
                  {citySpan(t.cityName, cityDistrict)}
                </Fragment>
              ))
            : null}
          {intent.finalize ? " (finalized)" : ""}
        </>
      );
    }
  }
}

function renderDetails(
  entry: ObservableEvent,
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode[] {
  const lines: ReactNode[] = [];
  const { intent } = entry;
  if (intent.type === "BUILD") {
    if (entry.coalSourceLabels && entry.coalSourceLabels.length > 0) {
      lines.push(
        <>
          coal: {sourceList(entry.coalSourceLabels, cityDistrict)}
        </>,
      );
    }
    if (entry.ironSourceLabels && entry.ironSourceLabels.length > 0) {
      lines.push(
        <>
          iron: {sourceList(entry.ironSourceLabels, cityDistrict)}
        </>,
      );
    }
  }
  if (intent.type === "NETWORK") {
    if (entry.networkCoalLabels && entry.networkCoalLabels.length > 0) {
      lines.push(
        <>
          coal: {sourceList(entry.networkCoalLabels, cityDistrict)}
        </>,
      );
    }
    if (entry.networkSecondBeerLabel) {
      lines.push(
        <>
          2nd link beer:{" "}
          {citySpan(entry.networkSecondBeerLabel, cityDistrict)}
        </>,
      );
    }
  }
  if (intent.type === "SELL") {
    for (const order of entry.sellOrders ?? []) {
      const merchantTag = (
        <>
          {citySpan(order.merchantCityName, cityDistrict)}
          {order.merchantSlotIndex > 0 ? ` #${order.merchantSlotIndex + 1}` : ""}
        </>
      );
      lines.push(
        <>
          <strong>{prettyIndustry(order.industry)}</strong> →{" "}
          {merchantTag}
          {order.beerLocations.length > 0 ? (
            <>
              {" "}· beer: {sourceList(order.beerLocations, cityDistrict)}
            </>
          ) : null}
        </>,
      );
    }
    if (intent.gloucesterDevelops.length > 0) {
      lines.push(
        <>
          Gloucester develops:{" "}
          {intent.gloucesterDevelops
            .map((ind) => prettyIndustry(ind))
            .join(", ")}
        </>,
      );
    }
  }
  return lines;
}

// -----------------------------------------------------------------------------
// Small renderers
// -----------------------------------------------------------------------------

function playerSpan(state: GameState, id: PlayerId): ReactNode {
  const p = state.players.find((x) => x.id === id);
  const label = p?.displayName ?? `P${id + 1}`;
  if (!p) return label;
  return (
    <span className="recent-actions__player" style={{ borderLeft: `3px solid ${p.pawnColor}`, paddingLeft: "0.35em" }}>
      {label}
    </span>
  );
}

function citySpan(
  cityName: string,
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode {
  const tag = cityDistrict.get(cityName);
  if (!tag) {
    // Merchant cities and the "market" placeholder fall through with no tint.
    return <span className="recent-actions__city">{cityName}</span>;
  }
  return (
    <span
      className="recent-actions__city"
      style={{ borderBottom: `2px solid ${DISTRICT_FILL[tag]}` }}
    >
      {cityName}
    </span>
  );
}

function linkSpan(
  endpoints: LineEndpoints,
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode {
  return (
    <span className="recent-actions__link">
      {endpoints.map((e, idx) => (
        <Fragment key={idx}>
          {idx > 0 ? "↔" : ""}
          {citySpan(e, cityDistrict)}
        </Fragment>
      ))}
    </span>
  );
}

function sourceList(
  labels: readonly string[],
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode {
  return labels.map((label, idx) => (
    <Fragment key={idx}>
      {idx > 0 ? ", " : ""}
      {label === "market" ? (
        <em>market</em>
      ) : label.startsWith("merchant ") ? (
        <em>{label}</em>
      ) : (
        citySpan(label, cityDistrict)
      )}
    </Fragment>
  ));
}

function CardsChip({
  cards,
  cityDistrict,
}: {
  cards: readonly Card[];
  cityDistrict: ReadonlyMap<string, DistrictTag>;
}) {
  return (
    <span className="recent-actions__card">
      {cards.map((c, idx) => (
        <Fragment key={idx}>
          {idx > 0 ? ", " : ""}
          {cardLabel(c, cityDistrict)}
        </Fragment>
      ))}
    </span>
  );
}

function cardLabel(
  card: Card,
  cityDistrict: ReadonlyMap<string, DistrictTag>,
): ReactNode {
  switch (card.kind) {
    case "LOCATION":
      return citySpan(card.cityName, cityDistrict);
    case "INDUSTRY":
      return card.industries.map((ind) => INDUSTRY_LABEL[ind]).join("/");
    case "WILD_LOCATION":
      return <em>wild loc</em>;
    case "WILD_INDUSTRY":
      return <em>wild ind</em>;
    case "HIDDEN":
      // Should not occur — events derive cards from the actor's
      // discard pile, which is public. Defensive fallback.
      return <em>?</em>;
  }
}

function prettyIndustry(name: IndustryName): string {
  return INDUSTRY_LABEL[name];
}

const ROMAN: readonly string[] = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
];

function roman(level: number): string {
  return ROMAN[level] ?? String(level);
}
