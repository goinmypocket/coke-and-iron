// =============================================================================
// §11.9 Recent actions — newest-first scrolling list of dispatched intents.
//
// Each row resolves the intent against the GAME STATE AT TIME OF DISPATCH so
// it can show what the active intent log alone doesn't carry: which card was
// discarded, which mat tile got built / developed, which line endpoints
// were linked, which built tile was sold or removed for shortfall, and where
// each resource (coal, iron, beer) was sourced from.
//
// To recover that history we replay the intent log from initialState() and
// snapshot pre-reduce state for every step. The replay is memoised on the
// log length, so it runs once per dispatch — not on every render.
//
// Player names render in the player's pawn colour, city references in their
// district colour, so a glance can answer "who did what where" without
// reading the full sentence.
// =============================================================================

import { Fragment, useMemo, type ReactNode } from "react";
import {
  initialState,
  reduce,
  type BeerSource,
  type Card,
  type CoalSource,
  type DistrictTag,
  type GameState,
  type IndustryName,
  type Intent,
  type IronSource,
  type LineEndpoints,
  type PlayerId,
} from "../../engine";
import { useEngine, useIntentLogVersion } from "../hooks/useEngine";
import { DISTRICT_FILL, INDUSTRY_LABEL } from "../industryIcons";
import { Panel } from "../layout/Panel";

const MAX_ENTRIES = 200;

// -----------------------------------------------------------------------------
// Detail captured by replaying the log to state-at-time-of-dispatch. One
// per intent in dispatch order; rendered newest-first by the component.
// -----------------------------------------------------------------------------

interface ResolvedTile {
  readonly tileId: string;
  readonly industry: IndustryName;
  readonly cityName: string;
  readonly level: number;
}

interface ResolvedSellOrder extends ResolvedTile {
  readonly merchantCityName: string;
  readonly merchantSlotIndex: number;
  readonly beerLocations: readonly string[];
}

interface IntentDetail {
  readonly intent: Intent;
  /** Card(s) discarded from hand for this dispatch. SCOUT discards 3;
   *  BUILD/NETWORK/DEVELOP/SELL/LOAN/PASS discard 1; END_TURN/noop/
   *  RESOLVE_SHORTFALL discard none. */
  readonly cardsConsumed: readonly Card[];
  /** BUILD: mat-stack level of the tile that landed on the slot. */
  readonly buildTileLevel?: number;
  /** DEVELOP: per-removal level, in dispatch order. */
  readonly developLevels?: readonly number[];
  /** NETWORK: line endpoints (canal/rail), and the optional second-link
   *  endpoints in rail era. */
  readonly networkLine?: LineEndpoints;
  readonly networkSecondLine?: LineEndpoints;
  /** BUILD: city of each coal/iron source ("market" if from market). */
  readonly coalSourceLabels?: readonly string[];
  readonly ironSourceLabels?: readonly string[];
  /** NETWORK: rail-era coal source (canal era is empty). */
  readonly networkCoalLabels?: readonly string[];
  /** NETWORK: brewery city for second-link beer if present. */
  readonly networkSecondBeerLabel?: string;
  /** SELL: per-order industry/city/level of the flipped tile + merchant
   *  + beer source labels. */
  readonly sellOrders?: readonly ResolvedSellOrder[];
  /** RESOLVE_SHORTFALL: industry / city / level of each removed tile. */
  readonly removedTiles?: readonly ResolvedTile[];
}

function buildDetailedLog(
  config: ReturnType<ReturnType<typeof useEngine>["getInitialConfig"]>,
  bundle: ReturnType<ReturnType<typeof useEngine>["getInitialBundle"]>,
  log: readonly Intent[],
): IntentDetail[] {
  let state = initialState(config, bundle);
  const out: IntentDetail[] = [];
  for (const intent of log) {
    out.push(describeIntent(intent, state));
    const r = reduce(state, intent);
    if (!r.ok) break;
    state = r.state;
  }
  return out;
}

function describeIntent(intent: Intent, state: GameState): IntentDetail {
  if (intent.type === "noop" || intent.type === "END_TURN") {
    return { intent, cardsConsumed: [] };
  }
  const player = state.players[intent.playerId];
  if (!player) return { intent, cardsConsumed: [] };

  switch (intent.type) {
    case "BUILD": {
      const card = player.hand[intent.cardIndex];
      const stack = player.mat.stacks[intent.industry];
      const top = stack.length > 0 ? stack[0] : undefined;
      const level =
        top !== undefined ? state.tileCatalogue[top]?.level : undefined;
      const detail: IntentDetail = {
        intent,
        cardsConsumed: card ? [card] : [],
        coalSourceLabels: intent.coalSources.map((s) =>
          coalLabel(s, state),
        ),
        ironSourceLabels: intent.ironSources.map((s) =>
          ironLabel(s, state),
        ),
      };
      return level !== undefined ? { ...detail, buildTileLevel: level } : detail;
    }
    case "NETWORK": {
      const card = player.hand[intent.cardIndex];
      const line = state.lines[intent.lineIndex]?.endpoints;
      const second = intent.secondLink
        ? state.lines[intent.secondLink.lineIndex]?.endpoints
        : undefined;
      let detail: IntentDetail = {
        intent,
        cardsConsumed: card ? [card] : [],
        networkCoalLabels: intent.coalSources.map((s) =>
          coalLabel(s, state),
        ),
      };
      if (line) detail = { ...detail, networkLine: line };
      if (second) detail = { ...detail, networkSecondLine: second };
      if (intent.secondLink) {
        detail = {
          ...detail,
          networkSecondBeerLabel: brewerySourceLabel(
            intent.secondLink.beerSource.tileId,
            state,
          ),
        };
      }
      return detail;
    }
    case "DEVELOP": {
      const card = player.hand[intent.cardIndex];
      // Walk industry by industry: the k-th DEVELOP of industry I targets
      // mat.stacks[I][k] at the snapshot's time. The reducer pops the top
      // each time, so tracking per-industry consumption keeps the levels
      // reported to the user in the same order they're physically removed.
      const consumed: Record<string, number> = {};
      const levels: number[] = [];
      for (const ind of intent.industries) {
        const idx = consumed[ind] ?? 0;
        const stack = player.mat.stacks[ind];
        const cat = stack[idx];
        levels.push(
          cat !== undefined ? state.tileCatalogue[cat]?.level ?? -1 : -1,
        );
        consumed[ind] = idx + 1;
      }
      return {
        intent,
        cardsConsumed: card ? [card] : [],
        developLevels: levels,
      };
    }
    case "SELL": {
      const card = player.hand[intent.cardIndex];
      const orders: ResolvedSellOrder[] = [];
      for (const o of intent.orders) {
        const tile = state.builtTiles.find((t) => t.id === o.tileId);
        if (!tile) continue;
        const spec = state.tileCatalogue[tile.catalogueIndex];
        if (!spec) continue;
        orders.push({
          tileId: o.tileId,
          industry: spec.industry,
          cityName: tile.cityName,
          level: spec.level,
          merchantCityName: o.merchantCityName,
          merchantSlotIndex: o.merchantSlotIndex,
          beerLocations: o.beerSources.map((b) =>
            beerLabel(b, o.merchantCityName, state),
          ),
        });
      }
      return { intent, cardsConsumed: card ? [card] : [], sellOrders: orders };
    }
    case "LOAN":
    case "PASS": {
      const card = player.hand[intent.cardIndex];
      return { intent, cardsConsumed: card ? [card] : [] };
    }
    case "SCOUT": {
      const cards: Card[] = [];
      for (const i of intent.cardIndices) {
        const c = player.hand[i];
        if (c) cards.push(c);
      }
      return { intent, cardsConsumed: cards };
    }
    case "RESOLVE_SHORTFALL": {
      const tiles: ResolvedTile[] = [];
      for (const id of intent.tilesToRemove) {
        const tile = state.builtTiles.find((t) => t.id === id);
        if (!tile) continue;
        const spec = state.tileCatalogue[tile.catalogueIndex];
        if (!spec) continue;
        tiles.push({
          tileId: id,
          industry: spec.industry,
          cityName: tile.cityName,
          level: spec.level,
        });
      }
      return { intent, cardsConsumed: [], removedTiles: tiles };
    }
  }
}

function coalLabel(s: CoalSource, state: GameState): string {
  if (s.kind === "MARKET") return "market";
  return brewerySourceLabel(s.tileId, state); // same lookup pattern works for any tile id
}
function ironLabel(s: IronSource, state: GameState): string {
  if (s.kind === "MARKET") return "market";
  return brewerySourceLabel(s.tileId, state);
}
function beerLabel(
  s: BeerSource,
  merchantCityName: string,
  state: GameState,
): string {
  if (s.kind === "MERCHANT") return `merchant ${merchantCityName}`;
  return brewerySourceLabel(s.tileId, state);
}
function brewerySourceLabel(tileId: string, state: GameState): string {
  const tile = state.builtTiles.find((t) => t.id === tileId);
  return tile ? tile.cityName : "?";
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function RecentActionsPanel() {
  const engine = useEngine();
  useIntentLogVersion();
  const log = engine.getIntentLog();
  // useMemo cache key: log length (engine appends; undo replays from start
  // and pops). A length change is the only signal we need.
  const detailedLog = useMemo(
    () => buildDetailedLog(engine.getInitialConfig(), engine.getInitialBundle(), log),
    [engine, log, log.length],
  );

  // Pull current player metadata from live state — names & pawn colours
  // never change post-setup, so reading the latest is fine.
  const state = engine.getState();
  const cityDistrict = useMemo(() => {
    const m = new Map<string, DistrictTag>();
    for (const c of state.districtCities) m.set(c.name, c.districtTag);
    return m;
  }, [state.districtCities]);

  const view = detailedLog.slice(-MAX_ENTRIES).slice().reverse();

  return (
    <Panel id="recent_actions" title="Recent actions">
      {view.length === 0 ? (
        <div className="recent-actions__empty">No actions yet.</div>
      ) : (
        <ol className="recent-actions">
          {view.map((entry, i) => (
            <li
              key={detailedLog.length - i}
              className="recent-actions__row"
            >
              <Row entry={entry} state={state} cityDistrict={cityDistrict} />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Row({
  entry,
  state,
  cityDistrict,
}: {
  entry: IntentDetail;
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
  entry: IntentDetail,
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
  entry: IntentDetail,
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
  if (!tag) {
    // Merchant cities and the "market" placeholder fall through with no tint.
    return <span className="recent-actions__city">{cityName}</span>;
  }
  return (
    <span
      className="recent-actions__city"
      style={{ color: DISTRICT_FILL[tag] }}
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
