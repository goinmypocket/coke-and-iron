// =============================================================================
// Engine setup (spec §3).
//
// Given a seed + player count (+ optional config overrides), this builds a
// fully-populated GameState: board topology, shuffled draw deck, dealt
// hands, per-seat mat stacks, merchant slots on active merchant cities,
// coal/iron markets in their setup state, and a random turn order.
//
// Same (seed, bundle, playerCount) → identical GameState. Nothing here may
// call Math.random(); everything that needs randomness draws from the
// seeded Rng created from config.seed.
// =============================================================================

import {
  DEFAULT_CARDS_CONFIG,
  DEFAULT_CITIES_CONFIG,
  DEFAULT_LINKS_CONFIG,
  DEFAULT_TILES_CONFIG,
  buildDeck,
  buildMerchantBag,
  extractCatalogue,
  extractDistrictCities,
  extractLines,
  extractMarketPlacePosition,
  extractMerchantCities,
  extractRoundTrackerPosition,
  type CardsConfig,
  type CitiesConfig,
  type LinksConfig,
  type TilesConfig,
} from "./config";
import { makeRng, shuffle, type Rng } from "./rng";
import type {
  Card,
  DistrictCity,
  EngineConfig,
  GameState,
  IndustryName,
  IndustryTileSpec,
  Line,
  Mat,
  Market,
  MerchantCity,
  MerchantSlot,
  MerchantTileAccept,
  PawnColor,
  Player,
  PlayerCount,
  PlayerId,
  WildReserve,
} from "./types";

/** Per-seat identity overrides for setup. Lobby-supplied at host time;
 * the host writes these into the save file so reload restores the same
 * names + colours. */
export interface SeatIdentity {
  readonly displayName: string;
  readonly pawnColor: PawnColor;
}

/**
 * Config bundle injected into setup. Each field is optional; unspecified
 * entries fall back to the bundled default loaded from config/*.json.
 *
 * `seats[i]` overrides player i's auto-assigned `Player N` name and
 * default-palette colour. Length must match playerCount when present.
 */
export interface EngineConfigBundle {
  readonly tiles?: TilesConfig;
  readonly cards?: CardsConfig;
  readonly cities?: CitiesConfig;
  readonly links?: LinksConfig;
  readonly seats?: readonly SeatIdentity[];
}

const DEFAULT_PAWN_COLORS = ["red", "yellow", "green", "blue"] as const;
const ALL_INDUSTRIES: readonly IndustryName[] = [
  "COAL_MINE",
  "IRON_WORKS",
  "BREWERY",
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
];

export function initialState(
  config: EngineConfig,
  bundle: EngineConfigBundle = {},
): GameState {
  const tilesConfig = bundle.tiles ?? DEFAULT_TILES_CONFIG;
  const cardsConfig = bundle.cards ?? DEFAULT_CARDS_CONFIG;
  const citiesConfig = bundle.cities ?? DEFAULT_CITIES_CONFIG;
  const linksConfig = bundle.links ?? DEFAULT_LINKS_CONFIG;

  const rng = makeRng(config.seed);

  // --- Static topology (readonly after setup) ---
  const tileCatalogue: readonly IndustryTileSpec[] =
    extractCatalogue(tilesConfig);
  const districtCities: readonly DistrictCity[] =
    extractDistrictCities(citiesConfig);
  // All 5 merchant cities stay on the board for connectivity (§2.11.1
  // "active or inert"); only active ones receive slots (§3.1 step 2).
  const merchantCities: readonly MerchantCity[] =
    extractMerchantCities(citiesConfig);
  const lines: readonly Line[] = extractLines(linksConfig);

  // --- Shuffled merchant bag → active slots (§3.1 step 4) ---
  const bag = shuffle(
    buildMerchantBag(citiesConfig, config.playerCount),
    rng,
  );
  const merchantSlots = buildMerchantSlots(
    merchantCities,
    config.playerCount,
    bag,
  );

  // --- Shuffled draw deck + initial hands (§3.2) ---
  const deck = shuffle(buildDeck(cardsConfig, config.playerCount), rng);
  // §3.2 canal-setup removal — slice playerCount cards off the top of
  // the shuffled deck face-down. They stay out for the entire game;
  // §6.4 step 5's reshuffle does not include them.
  const removedCards: readonly Card[] = deck.splice(0, config.playerCount);
  const { hands, remaining } = dealStartingHands(
    deck,
    config.playerCount,
    cardsConfig.startingHandSize,
  );

  // --- Per-seat players (§3.2) ---
  if (bundle.seats && bundle.seats.length !== config.playerCount) {
    throw new Error(
      `bundle.seats has ${bundle.seats.length} entries; expected ${config.playerCount}`,
    );
  }
  const players: Player[] = buildPlayers(
    config.playerCount,
    tileCatalogue,
    hands,
    bundle.seats,
  );

  // --- Random seating order (§3.3) ---
  const turnOrder = shuffle(
    Array.from({ length: config.playerCount }, (_, i) => i as PlayerId),
    rng,
  );

  return {
    seed: config.seed,
    playerCount: config.playerCount,

    districtCities,
    merchantCities,
    lines,
    tileCatalogue,
    marketPlacePosition: extractMarketPlacePosition(citiesConfig),
    roundTrackerPosition: extractRoundTrackerPosition(citiesConfig),

    rng,

    era: "CANAL",
    round: 1,
    phase: "PLAYER_TURNS",
    turnOrder,
    currentPlayerIndex: 0,
    actionsRemaining: 1,

    players,

    drawDeck: remaining,
    removedCards,
    wildReserve: buildWildReserve(cardsConfig),

    coalMarket: buildCoalMarket(),
    ironMarket: buildIronMarket(),

    builtTiles: [],
    developedLinks: [],
    scoredEras: [],
    merchantSlots,
    nextTileId: 0,

    autoEndTurn: config.autoEndTurn ?? false,
    pendingShortfalls: [],
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Fisher-Yates the deck, then deal startingHandSize cards to each seat in
 * order. Remaining cards become the draw deck. */
function dealStartingHands(
  shuffledDeck: readonly Card[],
  playerCount: PlayerCount,
  startingHandSize: number,
): { hands: Card[][]; remaining: Card[] } {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const working = [...shuffledDeck];
  for (let i = 0; i < playerCount; i++) {
    for (let c = 0; c < startingHandSize; c++) {
      const card = working.shift();
      if (card === undefined) {
        throw new Error(
          `Deck too small for ${playerCount}p × ${startingHandSize} cards`,
        );
      }
      hands[i]!.push(card);
    }
  }
  return { hands, remaining: working };
}

function buildPlayers(
  playerCount: PlayerCount,
  catalogue: readonly IndustryTileSpec[],
  hands: Card[][],
  seats: readonly SeatIdentity[] | undefined,
): Player[] {
  return Array.from({ length: playerCount }, (_, i): Player => ({
    id: i,
    displayName: seats?.[i]?.displayName ?? `Player ${i + 1}`,
    pawnColor: seats?.[i]?.pawnColor ?? DEFAULT_PAWN_COLORS[i] ?? "red",
    money: 17,
    vp: 0,
    incomeStep: 10,
    loansTaken: 0,
    spentThisRound: 0,
    linkSupply: 14,
    hand: hands[i] ?? [],
    discardPile: [],
    mat: buildMat(catalogue),
  }));
}

/** One stack per industry, expanded by qty, sorted lowest-level-first
 * (§2.12). Each entry is an index into the shared tileCatalogue. */
function buildMat(catalogue: readonly IndustryTileSpec[]): Mat {
  const stacks: { [K in IndustryName]: number[] } = {
    COAL_MINE: [],
    IRON_WORKS: [],
    BREWERY: [],
    COTTON_MILL: [],
    MANUFACTURER: [],
    POTTERY: [],
  };

  const byIndustry = new Map<
    IndustryName,
    { idx: number; spec: IndustryTileSpec }[]
  >();
  for (const ind of ALL_INDUSTRIES) byIndustry.set(ind, []);
  catalogue.forEach((spec, idx) => {
    byIndustry.get(spec.industry)!.push({ idx, spec });
  });

  for (const ind of ALL_INDUSTRIES) {
    const entries = byIndustry.get(ind)!;
    entries.sort((a, b) => a.spec.level - b.spec.level);
    for (const { idx, spec } of entries) {
      for (let k = 0; k < spec.qty; k++) stacks[ind].push(idx);
    }
  }

  return { stacks };
}

/** Distribute one merchant tile per slot of each active merchant city in
 * declaration order; beer barrel present iff accept ≠ BLANK (§3.1 step 4). */
function buildMerchantSlots(
  merchantCities: readonly MerchantCity[],
  playerCount: PlayerCount,
  shuffledBag: readonly MerchantTileAccept[],
): MerchantSlot[] {
  const slots: MerchantSlot[] = [];
  let bagIdx = 0;
  for (const mc of merchantCities) {
    if (!mc.activePlayerCounts.includes(playerCount)) continue;
    for (let i = 0; i < mc.slotCount; i++) {
      const accept = shuffledBag[bagIdx++];
      if (accept === undefined) {
        throw new Error(
          `Merchant bag too small: ran out at ${mc.name} slot ${i}`,
        );
      }
      slots.push({
        merchantCityName: mc.name,
        slotIndex: i,
        accept,
        hasBeer: accept !== "BLANK",
      });
    }
  }
  return slots;
}

function buildWildReserve(cards: CardsConfig): WildReserve {
  return {
    wildLocation: cards.wild.location,
    wildIndustry: cards.wild.industry,
  };
}

/** Coal market (§2.11.1): 7 priced tiers £1..£7 (max 14 cubes) plus an
 * unlimited overflow at £8. Setup leaves one £1 slot empty so total
 * cubes at start = 13. */
function buildCoalMarket(): Market {
  return {
    resource: "COAL",
    tiers: [1, 2, 3, 4, 5, 6, 7],
    filled: [1, 2, 2, 2, 2, 2, 2],
    overflowPrice: 8,
  };
}

/** Iron market (§2.11.2): 5 priced tiers £1..£5 (max 10 cubes) plus an
 * unlimited overflow at £6. Setup leaves both £1 slots empty so total
 * cubes at start = 8. */
function buildIronMarket(): Market {
  return {
    resource: "IRON",
    tiers: [1, 2, 3, 4, 5],
    filled: [0, 2, 2, 2, 2],
    overflowPrice: 6,
  };
}

export type { Rng };
