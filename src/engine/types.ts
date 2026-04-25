// =============================================================================
// Brass Birmingham — engine domain types
//
// One TypeScript type per entity in docs/game-spec.md §2, plus the turn-flow
// primitives the engine tracks per §3 / §4. Pure types only — no functions,
// no constants.
//
// Conventions:
//   - readonly for fields the engine never mutates after setup
//   - mutable for fields the reducer changes during play
//   - discriminated unions for variant types (cards, results)
// =============================================================================

import type { Rng } from "./rng";


// -----------------------------------------------------------------------------
// Primitives
// -----------------------------------------------------------------------------

export type Seed = number;
export type PlayerCount = 2 | 3 | 4;

/** Stable across the game. Allocated 0..(playerCount-1) at setup. */
export type PlayerId = number;

/** Pawn colour — config-driven; the spec does not enumerate. */
export type PawnColor = string;

/** Money. Negative values not used in normal play; loans add £30 (§5.5). */
export type Money = number;

/** Victory points; bounded below by 0 (§2.17). */
export type Vp = number;

/** Income step on the 0..99 progress track (§2.16, §6.3). */
export type IncomeStep = number;

/** Income LEVEL derived non-uniformly from step (§6.3). Range -10..30. */
export type IncomeLevel = number;

/** Position on the board canvas (§2.2). Floats in board-local units. */
export type Position = readonly [number, number];


// -----------------------------------------------------------------------------
// Era, phase, turn flow (§3.4, §4)
// -----------------------------------------------------------------------------

export type Era = "CANAL" | "RAIL";
export type Phase = "PLAYER_TURNS" | "GAME_OVER";


// -----------------------------------------------------------------------------
// Industries and resources (§2.8, §2.9.2)
// -----------------------------------------------------------------------------

export type IndustryName =
  | "COAL_MINE"
  | "IRON_WORKS"
  | "BREWERY"
  | "COTTON_MILL"
  | "MANUFACTURER"
  | "POTTERY";

export type ResourceType = "COAL" | "IRON" | "BEER";


// -----------------------------------------------------------------------------
// Cities — district + merchant (§2.2, §2.3, §2.4)
// -----------------------------------------------------------------------------

/** Spec §2.2 enumerates purple/brown/red/blue/teal; cities.json also uses
 * "farm" for Farm Brewery cities. */
export type DistrictTag =
  | "purple"
  | "brown"
  | "red"
  | "blue"
  | "teal"
  | "farm";

/**
 * A slot on a district city (§2.3). The accept list determines which
 * industries can be built here:
 *   - empty array → wildcard slot (any industry)
 *   - one entry  → specific slot
 *   - many       → combo slot
 *
 * Slot order matters: Build prefers a specific slot for the chosen industry
 * over a combo slot, even when both are empty (§5.1 step 2).
 */
export interface SlotSpec {
  readonly acceptList: readonly IndustryName[];
}

export interface DistrictCity {
  readonly name: string;
  readonly districtTag: DistrictTag;
  readonly position: Position;
  readonly slots: readonly SlotSpec[];
  /** When true, accepts Brewery tiles ONLY via Brewery / Wild Industry
   * cards (§2.2, §5.1.2). */
  readonly farmBrewery: boolean;
}

/** Bonus fired when a player consumes the merchant beer during Sell
 * (§5.4.1). */
export type MerchantBonus = "VP" | "DEVELOP" | "INCOME" | "MONEY";

export interface MerchantCity {
  readonly name: string;
  readonly position: Position;
  readonly slotCount: 1 | 2;
  readonly bonus: MerchantBonus;
  readonly bonusValue: number;
  /** Always 2 per spec §2.4 — encoded as a literal so the engine never
   * has to remember it. */
  readonly linkPoints: 2;
  readonly activePlayerCounts: readonly PlayerCount[];
}


// -----------------------------------------------------------------------------
// Lines and link tiles (§2.6, §2.6.1, §2.7)
// -----------------------------------------------------------------------------

/** A canal or rail line. Endpoints are 2 OR 3 city names (triple links per
 * §2.6.1). The engine must never assume length 2. */
export type LineEndpoints =
  | readonly [string, string]
  | readonly [string, string, string];

export interface Line {
  readonly era: Era;
  readonly endpoints: LineEndpoints;
}

export interface PlacedLinkTile {
  readonly owner: PlayerId;
  /** Index into GameState.lines. */
  readonly lineIndex: number;
}


// -----------------------------------------------------------------------------
// Industry tiles (§2.9, §2.10)
// -----------------------------------------------------------------------------

/**
 * Catalogue entry loaded once from config/industry_tiles.json (§2.9.1).
 * Never mutated.
 */
export interface IndustryTileSpec {
  readonly industry: IndustryName;
  readonly level: number;
  /** Number of physical tiles of this (industry, level) on a player's mat. */
  readonly qty: number;
  readonly costMoney: Money;
  readonly coalCost: number;
  readonly ironCost: number;
  readonly vp: Vp;
  readonly incomeBonus: number;
  readonly linkPoints: number;
  readonly canalOnly: boolean;
  readonly railOnly: boolean;
  /** True → cannot be Develop-ed (§5.3 step 2; Pottery I, III). */
  readonly lightBulb: boolean;
  readonly beerToSell: number;
  readonly resourceCapacity: number;
  /** Rail-era override; null when same as canal. Only Breweries override
   * (1 → 2). */
  readonly resourceCapacityRail: number | null;
}

/**
 * An industry tile that has been Built onto a city slot (§2.9, §2.10).
 * Carries live mutable state on top of a reference to its catalogue entry.
 */
export interface PlacedIndustryTile {
  /** Stable id assigned at Build time so intents can reference this tile. */
  readonly id: string;
  readonly owner: PlayerId;
  readonly cityName: string;
  readonly slotIndex: number;
  /** Index into GameState.tileCatalogue. */
  readonly catalogueIndex: number;
  /** Live cube/barrel count. Decrements as resources are consumed. */
  resources: number;
  flipped: boolean;
}


// -----------------------------------------------------------------------------
// Merchant tiles + slots (§2.5)
// -----------------------------------------------------------------------------

/** Accept list for a merchant tile (§2.5). BLANK accepts nothing and has
 * no beer slot. */
export type MerchantTileAccept =
  | "COTTON_MILL"
  | "MANUFACTURER"
  | "POTTERY"
  | "ANY"
  | "BLANK";

/**
 * A merchant-city slot at runtime (§2.5). Each non-blank slot starts with
 * one beer barrel; refilled at end-of-Canal-era (§6.4 step 4); consumed by
 * Sell (§5.4 / §5.6.3 priority 3).
 */
export interface MerchantSlot {
  readonly merchantCityName: string;
  /** 0 or 1. */
  readonly slotIndex: number;
  readonly accept: MerchantTileAccept;
  /** True iff the adjacent beer barrel is currently present. Always false
   * for BLANK accepts. */
  hasBeer: boolean;
}


// -----------------------------------------------------------------------------
// Cards (§2.13)
// -----------------------------------------------------------------------------

export interface LocationCard {
  readonly kind: "LOCATION";
  readonly cityName: string;
}

/**
 * §2.13 — an industry card names one or more industries it authorises.
 * The standard cards (Iron Works, Coal Mine, Pottery, Brewery) carry
 * exactly one entry; the dual Cotton/Manufacturer card (3+ players)
 * carries two. The reducer treats both uniformly: card authorises a
 * Build of `intent.industry` iff `industries.includes(intent.industry)`.
 */
export interface IndustryCard {
  readonly kind: "INDUSTRY";
  readonly industries: readonly IndustryName[];
}

/** Wild cards return to the wild reserve (NOT the discard pile) on use. */
export interface WildLocationCard {
  readonly kind: "WILD_LOCATION";
}

export interface WildIndustryCard {
  readonly kind: "WILD_INDUSTRY";
}

export type Card =
  | LocationCard
  | IndustryCard
  | WildLocationCard
  | WildIndustryCard;


// -----------------------------------------------------------------------------
// Markets — Coal + Iron (§2.11)
// -----------------------------------------------------------------------------

/**
 * Generic market state. Coal Market: 8 tiers (£1..£8); Iron Market: 6 tiers
 * (£1..£6). Each tier holds 0..2 cubes (§2.11.1, §2.11.2).
 *
 * Buy: cheapest empty slot first; overflow price applies when empty.
 * Sell (auto on Build): most-expensive empty slot first.
 */
export interface Market {
  readonly resource: "COAL" | "IRON";
  /** Prices per tier, ascending. Length 8 for coal, 6 for iron. */
  readonly tiers: readonly number[];
  /** filled[t] is the cube count in tier t (0..2). */
  filled: number[];
  /** Price applied when buying from an empty market (£8 coal, £6 iron). */
  readonly overflowPrice: number;
}


// -----------------------------------------------------------------------------
// Player + mat (§2.12, §2.13–§2.17)
// -----------------------------------------------------------------------------

/**
 * Per-seat mat (§2.12). One stack per industry, ordered lowest-level-first;
 * stacks[ind][0] is the next tile to Build / Develop. Each entry is an
 * index into GameState.tileCatalogue.
 */
export interface Mat {
  readonly stacks: { readonly [K in IndustryName]: number[] };
}

export interface Player {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly pawnColor: PawnColor;
  money: Money;
  vp: Vp;
  incomeStep: IncomeStep;
  loansTaken: number;
  spentThisRound: number;
  /** Remaining link tiles in this seat's colour. Starts at 14 (§2.7). */
  linkSupply: number;
  hand: Card[];
  discardPile: Card[];
  mat: Mat;
}


// -----------------------------------------------------------------------------
// Wild reserve (§2.13)
// -----------------------------------------------------------------------------

export interface WildReserve {
  wildLocation: number;
  wildIndustry: number;
}


// -----------------------------------------------------------------------------
// Engine config + GameState
// -----------------------------------------------------------------------------

export interface EngineConfig {
  readonly seed: Seed;
  readonly playerCount: PlayerCount;
  /**
   * When true, the reducer automatically advances the turn whenever an
   * action brings actionsRemaining to 0 — callers don't need to dispatch
   * END_TURN explicitly. Spec §3.5 specifies default `true`; we default
   * `false` in code because individual action tests are self-contained
   * single-dispatches. The UI should set this explicitly.
   */
  readonly autoEndTurn?: boolean;
}

/**
 * Root state. One per game; mutated only by reduce() (§1.2).
 *
 * The board topology (district cities, merchant cities, lines) and the tile
 * catalogue are loaded once at setup and never change — they live on
 * GameState as readonly arrays so save/load and deterministic replay carry
 * them too.
 */
export interface GameState {
  // -- Setup invariants --
  readonly seed: Seed;
  readonly playerCount: PlayerCount;
  readonly districtCities: readonly DistrictCity[];
  readonly merchantCities: readonly MerchantCity[];
  readonly lines: readonly Line[];
  readonly tileCatalogue: readonly IndustryTileSpec[];

  /**
   * Seeded PRNG used for every random draw in the engine (deck shuffle,
   * merchant bag, future tie-breakers). Mutated in place by the reducer;
   * its internal state is serialisable via rng.getState() for save / load.
   * The reducer must never call Math.random() — it would lose determinism.
   */
  rng: Rng;

  // -- Era + turn flow --
  era: Era;
  round: number;
  phase: Phase;
  /** PlayerIds in the current round's seating order. */
  turnOrder: PlayerId[];
  /** Index into turnOrder. */
  currentPlayerIndex: number;
  /** 1 in the very first Canal-era round; 2 thereafter (§3.4). */
  actionsRemaining: number;

  // -- Per-seat (indexed by PlayerId) --
  readonly players: Player[];

  // -- Shared decks --
  drawDeck: Card[];
  /**
   * §3.2 — `playerCount` cards removed face-down at canal-era setup to
   * balance the first-round one-action rule (§3.4). Stay out of the
   * game permanently; not reshuffled at the era flip (§6.4 step 5).
   * Identities are unknown to all players.
   */
  removedCards: readonly Card[];
  wildReserve: WildReserve;

  // -- Markets --
  coalMarket: Market;
  ironMarket: Market;

  // -- Board live state --
  builtTiles: PlacedIndustryTile[];
  developedLinks: PlacedLinkTile[];
  merchantSlots: MerchantSlot[];
  /** Monotonically increasing counter used to stamp a unique, replay-stable
   * id onto each PlacedIndustryTile at Build time. Starts at 0, increments
   * on every successful Build (including overbuild replacements). */
  nextTileId: number;

  /** Spec §3.5. When true, the reducer auto-advances the turn when an
   * action exhausts actionsRemaining. Persisted on state so replay is
   * faithful. */
  autoEndTurn: boolean;

  /** §4.3 step 2 — players who couldn't cover their negative income at
   * end-of-round are queued here. While non-empty, every other intent
   * is rejected; the head player must dispatch RESOLVE_SHORTFALL until
   * their entry pops, then the next player resolves theirs, and so on. */
  pendingShortfalls: ShortfallEntry[];
}

/** One queued shortfall — the player owes `owed` after handing over all
 * the cash they had. */
export interface ShortfallEntry {
  readonly playerId: PlayerId;
  readonly owed: number;
}


// -----------------------------------------------------------------------------
// Resource source lists (§5.6)
//
// Every coal / iron / beer consumer spec in §5 takes a declared source
// list from the dispatching player. The engine is the sole validator: it
// walks the list in order, verifies each source is legal per §5.6's
// priority rules, and fails the whole dispatch if the list doesn't meet
// the requirement.
// -----------------------------------------------------------------------------

/** One coal cube for a consumer. Either from an unflipped Coal Mine tile
 * (free, §5.6.1 pri 1) or the Coal Market (paid, §5.6.1 pri 2). */
export type CoalSource =
  | { readonly kind: "TILE"; readonly tileId: string }
  | { readonly kind: "MARKET" };

/** One iron cube. Unflipped Iron Works (free, §5.6.2 pri 1) or Iron Market
 * (paid, no connection requirement, §5.6.2 pri 2). */
export type IronSource =
  | { readonly kind: "TILE"; readonly tileId: string }
  | { readonly kind: "MARKET" };

/** One beer barrel. BREWERY sources cover both own and opponent brewery
 * (§5.6.3 pri 1 / pri 2) — the reducer decides which sub-rule applies
 * from the tile owner. MERCHANT is Sell-only (§5.6.3 pri 3) and implicitly
 * references the buying merchant tile named on the enclosing SellOrder. */
export type BeerSource =
  | { readonly kind: "BREWERY"; readonly tileId: string }
  | { readonly kind: "MERCHANT" };


// -----------------------------------------------------------------------------
// Intents — one variant per §5 action + a test/admin noop.
//
// Each intent carries playerId so multiplayer transports can deliver from
// any seat and the engine can verify authorisation. cardIndex indexes into
// the dispatching seat's hand.
// -----------------------------------------------------------------------------

/** Admin / test escape hatch; NOT a §5 action. Succeeds unconditionally
 * without mutating state. Lets engine infrastructure (dispatch log, state
 * plumbing) be exercised before the real actions are implemented. */
export interface IntentNoop {
  readonly type: "noop";
}

/** §5.1 Build. */
export interface IntentBuild {
  readonly type: "BUILD";
  readonly playerId: PlayerId;
  readonly cardIndex: number;
  readonly cityName: string;
  readonly slotIndex: number;
  readonly industry: IndustryName;
  readonly coalSources: readonly CoalSource[];
  readonly ironSources: readonly IronSource[];
}

/** §5.2 Network — second link is Rail-era only and optional. */
export interface SecondRailLink {
  readonly lineIndex: number;
  readonly coalSources: readonly CoalSource[];
  /** Second rail beer per §5.6.3: BREWERY only. Merchant beer is never a
   * valid Network source. Typed to the brewery variant so the compiler
   * forbids {kind:"MERCHANT"} here. */
  readonly beerSource: { readonly kind: "BREWERY"; readonly tileId: string };
}

export interface IntentNetwork {
  readonly type: "NETWORK";
  readonly playerId: PlayerId;
  readonly cardIndex: number;
  readonly lineIndex: number;
  /** Canal era: []. Rail era: [one coal]. */
  readonly coalSources: readonly CoalSource[];
  readonly secondLink: SecondRailLink | null;
}

/** §5.3 Develop — remove 1 or 2 industry tiles from the mat, paying 1 iron
 * per removal. `industries[k]` is the k-th removal; `ironSources[k]` is
 * the iron list for that removal. */
export interface IntentDevelop {
  readonly type: "DEVELOP";
  readonly playerId: PlayerId;
  readonly cardIndex: number;
  readonly industries: readonly IndustryName[];
  readonly ironSources: readonly (readonly IronSource[])[];
}

/** §5.4 Sell — one order per tile flipped in this action. */
export interface SellOrder {
  /** Id of an own unflipped Cotton / Manufacturer / Pottery tile on the
   * board. */
  readonly tileId: string;
  readonly merchantCityName: string;
  readonly merchantSlotIndex: number;
  /** Exactly tile.beerToSell entries. MERCHANT sources are permitted
   * here, but ONLY consume from this order's own (merchantCityName,
   * merchantSlotIndex) slot — see §5.6.3 pri 3 / §5.4 step 2. */
  readonly beerSources: readonly BeerSource[];
}

export interface IntentSell {
  readonly type: "SELL";
  readonly playerId: PlayerId;
  readonly cardIndex: number;
  readonly orders: readonly SellOrder[];
  /** One industry per Gloucester merchant-beer consumed across the orders
   * (§5.4 step 3). Empty when no Gloucester beer was used. */
  readonly gloucesterDevelops: readonly IndustryName[];
}

/** §5.5 Loan. */
export interface IntentLoan {
  readonly type: "LOAN";
  readonly playerId: PlayerId;
  readonly cardIndex: number;
}

/** §5.7 Scout — discard 3 non-wild cards from hand for 1 Wild Location +
 * 1 Wild Industry. Indices must be distinct. */
export interface IntentScout {
  readonly type: "SCOUT";
  readonly playerId: PlayerId;
  readonly cardIndices: readonly [number, number, number];
}

/** §5.8 Pass. */
export interface IntentPass {
  readonly type: "PASS";
  readonly playerId: PlayerId;
  readonly cardIndex: number;
}

/**
 * §4.2 step 6 — explicitly end the dispatching seat's turn once
 * actionsRemaining hits 0. Triggers end-of-round processing when the last
 * seat in the round ends (§4.3). When state.autoEndTurn is true the
 * engine fires this implicitly on behalf of the UI.
 */
export interface IntentEndTurn {
  readonly type: "END_TURN";
  readonly playerId: PlayerId;
}

/**
 * §4.3 step 2 shortfall sub-flow. The income collection halted the
 * round-end pipeline because at least one player couldn't cover their
 * negative income. They now choose tiles to remove from the board, each
 * yielding half (rounded down) the printed build cost. Any remaining
 * unpaid debt converts to VP loss only when the player explicitly
 * finalizes — to allow them to spend more tiles first.
 */
export interface IntentResolveShortfall {
  readonly type: "RESOLVE_SHORTFALL";
  readonly playerId: PlayerId;
  /** Tile ids removed from the board for half their printed build cost
   * (rounded down). Each id must reference a tile owned by playerId,
   * with no duplicates. */
  readonly tilesToRemove: readonly string[];
  /** When true, any debt remaining after applying the proceeds becomes
   * VP loss (clamped at 0 VP), and the player's shortfall entry pops
   * off the queue. When false, the proceeds MUST cover the debt. */
  readonly finalize: boolean;
}

export type Intent =
  | IntentNoop
  | IntentBuild
  | IntentNetwork
  | IntentDevelop
  | IntentSell
  | IntentLoan
  | IntentScout
  | IntentPass
  | IntentEndTurn
  | IntentResolveShortfall;


// -----------------------------------------------------------------------------
// FailureReason — typed inventory of every dispatch reject path.
//
// Grouped by the spec section that introduces the check. Action milestones
// add entries here as they cover more rules; unimplemented actions reject
// with "not_implemented".
// -----------------------------------------------------------------------------

export type FailureReason =
  // --- Infrastructure ---
  | "not_implemented"
  // --- Turn flow (§4.2) ---
  | "not_current_turn"
  | "game_over"
  | "no_actions_remaining"
  | "actions_still_remaining"     // §4.2 step 6 — can't END_TURN yet
  // --- Shortfall sub-flow (§4.3 step 2) ---
  | "shortfall_resolution_required"
  | "no_pending_shortfall"
  | "shortfall_not_satisfied"
  | "shortfall_tile_not_owned"
  | "shortfall_duplicate_tile"
  // --- Card selection (common) ---
  | "card_not_in_hand"
  | "card_does_not_authorise"
  // --- Build §5.1 ---
  | "not_in_network"
  | "slot_does_not_accept_industry"
  | "specific_slot_available"
  | "mat_stack_empty"
  | "tile_wrong_era"
  | "insufficient_funds"
  | "farm_brewery_wrong_card"          // §5.1.2
  | "one_tile_per_city_canal"          // §5.1.4
  // --- Build overbuild §5.1.3 ---
  | "overbuild_industry_mismatch"
  | "overbuild_not_higher_level"
  | "overbuild_has_resources"
  | "overbuild_ownership_blocked"
  // --- Resource sources §5.6 ---
  | "coal_source_invalid"
  | "iron_source_invalid"
  | "beer_source_invalid"
  | "coal_market_not_connected"     // §5.6.1 pri 2
  | "brewery_not_connected"         // §5.6.3 pri 2
  | "merchant_beer_not_from_buyer"  // §5.6.3 pri 3 scope
  | "merchant_beer_in_network"      // §5.6.3 pri 3 exclusion
  // --- Network §5.2 ---
  | "line_already_developed"
  | "line_wrong_era"
  | "line_not_adjacent"
  | "link_supply_empty"
  // --- Develop §5.3 ---
  | "develop_count_invalid"
  | "develop_tile_has_lightbulb"
  // --- Sell §5.4 ---
  | "sell_tile_not_owned"
  | "sell_tile_wrong_industry"
  | "sell_tile_already_flipped"
  | "sell_merchant_invalid"
  | "sell_not_connected_to_merchant"
  // --- Loan §5.5 ---
  | "loan_income_floor"
  // --- Scout §5.7 ---
  | "scout_has_wild_in_hand"
  | "scout_duplicate_indices"
  | "scout_wild_reserve_exhausted";


export type Result =
  | { ok: true; state: GameState }
  | { ok: false; reason: FailureReason };
