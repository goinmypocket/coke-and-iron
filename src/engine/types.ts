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

export interface IndustryCard {
  readonly kind: "INDUSTRY";
  readonly industry: IndustryName;
}

/** 3+ player only (§2.13). One physical card; either Cotton Mill or
 * Manufacturer can be authorised by it. */
export interface DualCottonManufacturerCard {
  readonly kind: "DUAL_COTTON_MANUFACTURER";
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
  | DualCottonManufacturerCard
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
  wildReserve: WildReserve;

  // -- Markets --
  coalMarket: Market;
  ironMarket: Market;

  // -- Board live state --
  builtTiles: PlacedIndustryTile[];
  developedLinks: PlacedLinkTile[];
  merchantSlots: MerchantSlot[];
}


// -----------------------------------------------------------------------------
// Intents and results
//
// Placeholder Intent + FailureReason. The next milestone expands these to
// discriminated unions covering every §5 action and every reject path.
// -----------------------------------------------------------------------------

export type Intent = { type: "noop" };

export type FailureReason = "not_implemented";

export type Result =
  | { ok: true; state: GameState }
  | { ok: false; reason: FailureReason };
