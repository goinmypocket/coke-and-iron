// =============================================================================
// PlayerView — a redacted projection of GameState scoped to one viewer.
//
// The host's authoritative engine holds *every* player's hand, the
// shuffled draw deck, and the canal-era removed cards. Sending that
// blob to clients (the way SNAPSHOT used to ship `seed + intentLog`)
// hands them everything they could ever need to reconstruct hidden
// information offline. PlayerView is the per-viewer facade we send
// instead: same structure where the data is public, redacted where it
// isn't.
//
// Conventions:
//
//   - `viewerSeatId` is the seat this view was projected for. The
//     viewer's own hand is intact; every other seat's `hand` is `[]`
//     and the count moves to `handSize`. drawDeck / removedCards are
//     replaced by plain integers.
//
//   - The wire format for a STATE update is *just a PlayerView*. The
//     client doesn't need to apply intents — it adopts the view it's
//     handed and rerenders. Optimistic dispatch (if/when added) lives
//     above this layer.
//
//   - This file is pure. No I/O, no React, no engine internals beyond
//     the type definitions in `./types`. Safe to import from both the
//     host and the browser.
// =============================================================================

import type {
  DistrictCity,
  Era,
  GameState,
  IndustryTileSpec,
  Line,
  Market,
  Mat,
  MerchantCity,
  MerchantSlot,
  Money,
  PawnColor,
  Phase,
  PlacedIndustryTile,
  PlacedLinkTile,
  PlayerCount,
  PlayerId,
  Position,
  ShortfallEntry,
  Vp,
  Card,
  IncomeStep,
  WildReserve,
} from "./types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Per-seat fields in a view. The viewer's own seat carries `hand`
 *  populated with their actual cards; every other seat carries
 *  `hand: []` and reports the size via `handSize`.
 *
 *  Money / VP / income / link supply / mat / discardPile / loansTaken
 *  / spentThisRound are public — the physical board reveals all of
 *  them — so we copy them verbatim. */
export interface PlayerInView {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly pawnColor: PawnColor;
  readonly money: Money;
  readonly vp: Vp;
  readonly incomeStep: IncomeStep;
  readonly loansTaken: number;
  readonly spentThisRound: number;
  readonly linkSupply: number;
  /** The viewer's actual hand for their own seat; `[]` for everyone
   *  else. UI selectors that need to render cards should branch on
   *  `id === view.viewerSeatId` (or use `view.myHand` directly). */
  readonly hand: readonly Card[];
  /** The actual hand size — populated for every seat regardless of
   *  whether `hand` is redacted. Use this when you need a count. */
  readonly handSize: number;
  /** Played-and-resolved cards. Public information (the discard pile
   *  is open on the table). */
  readonly discardPile: readonly Card[];
  readonly mat: Mat;
}

/** What one connected client sees of the game. Structurally close to
 *  GameState so most selectors keep their shape; differences are
 *  flagged explicitly above each field. */
export interface PlayerView {
  // ---- Setup invariants (public) ----
  readonly playerCount: PlayerCount;
  readonly districtCities: readonly DistrictCity[];
  readonly merchantCities: readonly MerchantCity[];
  readonly lines: readonly Line[];
  readonly tileCatalogue: readonly IndustryTileSpec[];
  readonly marketPlacePosition: Position;
  readonly roundTrackerPosition: Position;

  // ---- Era + turn flow (public) ----
  readonly era: Era;
  readonly round: number;
  readonly phase: Phase;
  readonly turnOrder: readonly PlayerId[];
  readonly currentPlayerIndex: number;
  readonly actionsRemaining: number;

  // ---- Per-seat (redacted: viewer's own hand intact, others stripped) ----
  readonly players: readonly PlayerInView[];

  // ---- Shared decks (REDACTED) ----
  /** drawDeck contents are hidden from every viewer. Only the count
   *  is public — the physical pile is face-down on the table. */
  readonly drawDeckCount: number;
  /** Canal-era removed cards stay face-down for the rest of the game
   *  (§3.2). Only the count is observable. */
  readonly removedCardsCount: number;
  readonly wildReserve: WildReserve;

  // ---- Markets (public) ----
  readonly coalMarket: Market;
  readonly ironMarket: Market;

  // ---- Board live state (public) ----
  readonly builtTiles: readonly PlacedIndustryTile[];
  readonly developedLinks: readonly PlacedLinkTile[];
  readonly merchantSlots: readonly MerchantSlot[];
  readonly nextTileId: number;

  readonly autoEndTurn: boolean;
  readonly pendingShortfalls: readonly ShortfallEntry[];

  // ---- Viewer identity ----
  /** The seat this view was projected for. -1 for spectator views
   *  (no seat claimed); spectators see no hidden information at all. */
  readonly viewerSeatId: PlayerId | -1;
  /** Convenience alias for `players[viewerSeatId]?.hand`. `[]` for
   *  spectators. */
  readonly myHand: readonly Card[];
}

// -----------------------------------------------------------------------------
// Projection
// -----------------------------------------------------------------------------

const SPECTATOR: PlayerId | -1 = -1;

/** Project the authoritative GameState onto the per-viewer view that
 *  goes over the wire. Pass `viewerSeatId = -1` (or use the
 *  `projectForSpectator` helper) for spectator views — every hand is
 *  redacted and `myHand` is empty.
 *
 *  The projected view shares no mutable references with the input
 *  state for the redacted slots (so a malicious client deserializer
 *  can't, e.g., mutate the host's state through aliasing); public
 *  array slots are returned by reference for cheapness. */
export function projectFor(
  state: GameState,
  viewerSeatId: PlayerId | -1,
): PlayerView {
  const players: PlayerInView[] = state.players.map((p) =>
    projectPlayer(p, viewerSeatId === p.id),
  );
  const myHand =
    viewerSeatId === SPECTATOR
      ? ([] as readonly Card[])
      : (players[viewerSeatId]?.hand ?? []);
  return {
    playerCount: state.playerCount,
    districtCities: state.districtCities,
    merchantCities: state.merchantCities,
    lines: state.lines,
    tileCatalogue: state.tileCatalogue,
    marketPlacePosition: state.marketPlacePosition,
    roundTrackerPosition: state.roundTrackerPosition,
    era: state.era,
    round: state.round,
    phase: state.phase,
    turnOrder: state.turnOrder,
    currentPlayerIndex: state.currentPlayerIndex,
    actionsRemaining: state.actionsRemaining,
    players,
    drawDeckCount: state.drawDeck.length,
    removedCardsCount: state.removedCards.length,
    wildReserve: { ...state.wildReserve },
    coalMarket: state.coalMarket,
    ironMarket: state.ironMarket,
    builtTiles: state.builtTiles,
    developedLinks: state.developedLinks,
    merchantSlots: state.merchantSlots,
    nextTileId: state.nextTileId,
    autoEndTurn: state.autoEndTurn,
    pendingShortfalls: state.pendingShortfalls,
    viewerSeatId,
    myHand,
  };
}

/** Convenience for views with no claimed seat. Equivalent to
 *  `projectFor(state, -1)`. */
export function projectForSpectator(state: GameState): PlayerView {
  return projectFor(state, SPECTATOR);
}

function projectPlayer(
  p: GameState["players"][number],
  isViewer: boolean,
): PlayerInView {
  return {
    id: p.id,
    displayName: p.displayName,
    pawnColor: p.pawnColor,
    money: p.money,
    vp: p.vp,
    incomeStep: p.incomeStep,
    loansTaken: p.loansTaken,
    spentThisRound: p.spentThisRound,
    linkSupply: p.linkSupply,
    // The cards themselves are immutable Card discriminated unions —
    // no need to deep-clone, but we copy the array so an external
    // mutation can't grow the receiver's hand by reference.
    hand: isViewer ? [...p.hand] : [],
    handSize: p.hand.length,
    discardPile: p.discardPile,
    mat: p.mat,
  };
}

// -----------------------------------------------------------------------------
// Type-narrowing helper for selectors
// -----------------------------------------------------------------------------

/** True when this seat's hand contents are populated in the view (i.e.
 *  the seat IS the viewer). UI selectors that read `hand[]` should
 *  guard on this so a typo never accidentally treats `[]` as "the
 *  player has no cards". */
export function isOwnSeat(
  player: PlayerInView,
  view: PlayerView,
): boolean {
  return player.id === view.viewerSeatId;
}
