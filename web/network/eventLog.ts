// =============================================================================
// Client-side observable event log.
//
// Every connected client maintains the SAME log — it's the public
// history of dispatched intents — but each client computes it
// independently from the per-recipient STATE messages it receives.
// No extra round-trips, no server-driven history stream; the math is:
//
//   - cardsConsumed = (post-state discardPile of acting seat) minus
//                     (pre-state discardPile of acting seat).
//                     Catches BUILD / NETWORK / DEVELOP / SELL /
//                     PASS / LOAN / SCOUT — every action that puts
//                     a card into a publicly-visible pile.
//
//   - buildTileLevel, developLevels, networkLine etc. come from
//     diffs in public board surfaces (builtTiles, developedLinks,
//     mat stacks, merchantSlots) — none of which are redacted.
//
// Wild cards are an edge case: they leave the actor's hand but go
// to the wild reserve, not the discard pile. That diff lives on the
// view's wildReserve counts; for now we surface that as a label and
// keep the cardsConsumed array short — UI text does the right thing.
//
// The log is appended on STATE { kind: "intent" }, popped on
// STATE { kind: "undo" }, and reset on STATE { kind: "snapshot" }
// (a fresh snapshot means we joined or someone reloaded a save —
// the prior chain we held no longer applies).
// =============================================================================

import type {
  BeerSource,
  Card,
  CoalSource,
  Era,
  IndustryName,
  Intent,
  IronSource,
  LineEndpoints,
  PlayerId,
} from "../../engine/types";
import type { PlayerView } from "../../engine/view";

/** One row in the recent-actions overlay — same fields the original
 * `IntentDetail` carried, just derived from STATE diffs instead of
 * an authoritative replay. */
export interface ObservableEvent {
  readonly intent: Intent;
  readonly era: Era;
  readonly round: number;
  readonly cardsConsumed: readonly Card[];
  readonly buildTileLevel?: number;
  readonly developLevels?: readonly number[];
  readonly networkLine?: LineEndpoints;
  readonly networkSecondLine?: LineEndpoints;
  readonly coalSourceLabels?: readonly string[];
  readonly ironSourceLabels?: readonly string[];
  readonly networkCoalLabels?: readonly string[];
  readonly networkSecondBeerLabel?: string;
  readonly sellOrders?: readonly SellOrderDetail[];
  readonly removedTiles?: readonly TileRef[];
}

export interface TileRef {
  readonly tileId: string;
  readonly cityName: string;
  readonly industry: IndustryName;
  readonly level: number;
}

export interface SellOrderDetail extends TileRef {
  readonly merchantCityName: string;
  readonly merchantSlotIndex: number;
  readonly beerLocations: readonly string[];
}

/** Compute the observable event for an intent given the views before
 * and after the host applied it. `pre` may be null for the very first
 * intent after a fresh SNAPSHOT — in that case we fall back to the
 * post view for things that need the prior shape (which only matters
 * for cardsConsumed; the diff degrades to a length-based read). */
export function buildEvent(
  pre: PlayerView | null,
  post: PlayerView,
  intent: Intent,
): ObservableEvent {
  // Era / round come from the pre-state — the round number an action
  // belongs to is the one it was dispatched IN, even if END_TURN
  // crosses the boundary at the end.
  const era: Era = pre?.era ?? post.era;
  const round: number = pre?.round ?? post.round;

  if (intent.type === "noop" || intent.type === "END_TURN") {
    return { intent, era, round, cardsConsumed: [] };
  }
  if (intent.type === "RESOLVE_SHORTFALL") {
    return {
      intent,
      era,
      round,
      cardsConsumed: [],
      removedTiles: removedTilesFor(intent.tilesToRemove, pre ?? post),
    };
  }

  const playerId = intent.playerId;
  const cardsConsumed = diffDiscard(pre, post, playerId);

  switch (intent.type) {
    case "PASS":
    case "LOAN":
      return { intent, era, round, cardsConsumed };
    case "SCOUT":
      return { intent, era, round, cardsConsumed };
    case "BUILD": {
      const newTile = lastBuiltOf(pre, post, playerId);
      const buildTileLevel =
        newTile !== undefined
          ? post.tileCatalogue[newTile.catalogueIndex]?.level
          : undefined;
      return {
        intent,
        era,
        round,
        cardsConsumed,
        ...(buildTileLevel !== undefined ? { buildTileLevel } : {}),
        coalSourceLabels: intent.coalSources.map((s) =>
          coalLabel(s, pre ?? post),
        ),
        ironSourceLabels: intent.ironSources.map((s) =>
          ironLabel(s, pre ?? post),
        ),
      };
    }
    case "NETWORK": {
      const line = post.lines[intent.lineIndex]?.endpoints;
      const second = intent.secondLink
        ? post.lines[intent.secondLink.lineIndex]?.endpoints
        : undefined;
      return {
        intent,
        era,
        round,
        cardsConsumed,
        ...(line ? { networkLine: line } : {}),
        ...(second ? { networkSecondLine: second } : {}),
        networkCoalLabels: intent.coalSources.map((s) =>
          coalLabel(s, pre ?? post),
        ),
        ...(intent.secondLink
          ? {
              networkSecondBeerLabel: brewerySourceLabel(
                intent.secondLink.beerSource.tileId,
                pre ?? post,
              ),
            }
          : {}),
      };
    }
    case "DEVELOP": {
      // Each industry pop reduces that mat-stack by one level. Read
      // levels from the PRE view's mat catalogue indices for the
      // popped slots, in the same per-industry order the engine
      // applies them.
      const developLevels = developLevelsFor(intent.industries, pre ?? post, playerId);
      return { intent, era, round, cardsConsumed, developLevels };
    }
    case "SELL": {
      return {
        intent,
        era,
        round,
        cardsConsumed,
        sellOrders: sellOrdersFor(intent.orders, pre ?? post),
      };
    }
  }
}

// -----------------------------------------------------------------------------
// Diffing helpers — all read from public surfaces only.
// -----------------------------------------------------------------------------

function diffDiscard(
  pre: PlayerView | null,
  post: PlayerView,
  playerId: PlayerId,
): readonly Card[] {
  const postPile = post.players[playerId]?.discardPile ?? [];
  if (!pre) return postPile.slice(-1);
  const prePile = pre.players[playerId]?.discardPile ?? [];
  if (postPile.length <= prePile.length) return [];
  return postPile.slice(prePile.length);
}

function lastBuiltOf(
  pre: PlayerView | null,
  post: PlayerView,
  playerId: PlayerId,
): PlayerView["builtTiles"][number] | undefined {
  // Find tiles owned by the acting seat that didn't exist (or had a
  // different id at the same slot) in the pre-view. Build is always
  // appending to builtTiles or replacing an entry at the same id, so
  // the highest nextTileId tile owned by this seat is the one.
  const myTiles = post.builtTiles
    .filter((t) => t.owner === playerId)
    .sort((a, b) => idNum(b.id) - idNum(a.id));
  return myTiles[0];
}

function idNum(id: string): number {
  // PlacedIndustryTile ids are stamped from a monotonic counter
  // (engine: nextTileId). The stamping format is implementation
  // detail, but a numeric tail is good enough to find the newest.
  const m = id.match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function developLevelsFor(
  industries: readonly string[],
  pre: PlayerView,
  playerId: PlayerId,
): number[] {
  const consumed: Record<string, number> = {};
  const out: number[] = [];
  const player = pre.players[playerId];
  if (!player) return out;
  for (const ind of industries) {
    const idx = consumed[ind] ?? 0;
    const stack = player.mat.stacks[ind as keyof typeof player.mat.stacks];
    const cat = stack[idx];
    if (cat !== undefined) {
      const spec = pre.tileCatalogue[cat];
      out.push(spec?.level ?? -1);
    } else {
      out.push(-1);
    }
    consumed[ind] = idx + 1;
  }
  return out;
}

function sellOrdersFor(
  orders: readonly { tileId: string; merchantCityName: string; merchantSlotIndex: number; beerSources: readonly BeerSource[] }[],
  view: PlayerView,
): SellOrderDetail[] {
  const out: SellOrderDetail[] = [];
  for (const o of orders) {
    const tile = view.builtTiles.find((t) => t.id === o.tileId);
    if (!tile) continue;
    const spec = view.tileCatalogue[tile.catalogueIndex];
    if (!spec) continue;
    out.push({
      tileId: o.tileId,
      industry: spec.industry,
      cityName: tile.cityName,
      level: spec.level,
      merchantCityName: o.merchantCityName,
      merchantSlotIndex: o.merchantSlotIndex,
      beerLocations: o.beerSources.map((s) => beerLabel(s, o.merchantCityName, view)),
    });
  }
  return out;
}

function removedTilesFor(
  ids: readonly string[],
  view: PlayerView,
): TileRef[] {
  const out: TileRef[] = [];
  for (const id of ids) {
    const tile = view.builtTiles.find((t) => t.id === id);
    if (!tile) continue;
    const spec = view.tileCatalogue[tile.catalogueIndex];
    if (!spec) continue;
    out.push({
      tileId: id,
      industry: spec.industry,
      cityName: tile.cityName,
      level: spec.level,
    });
  }
  return out;
}

function coalLabel(s: CoalSource, view: PlayerView): string {
  if (s.kind === "MARKET") return "market";
  const tile = view.builtTiles.find((t) => t.id === s.tileId);
  return tile?.cityName ?? "?";
}

function ironLabel(s: IronSource, view: PlayerView): string {
  if (s.kind === "MARKET") return "market";
  const tile = view.builtTiles.find((t) => t.id === s.tileId);
  return tile?.cityName ?? "?";
}

function brewerySourceLabel(tileId: string, view: PlayerView): string {
  const tile = view.builtTiles.find((t) => t.id === tileId);
  return tile?.cityName ?? "?";
}

function beerLabel(s: BeerSource, merchantCityName: string, view: PlayerView): string {
  if (s.kind === "MERCHANT") return merchantCityName;
  const tile = view.builtTiles.find((t) => t.id === s.tileId);
  return tile?.cityName ?? "?";
}
