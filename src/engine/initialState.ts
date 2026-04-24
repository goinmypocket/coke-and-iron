import { makeRng } from "./rng";
import type {
  EngineConfig,
  GameState,
  Mat,
  Market,
  Player,
  PlayerCount,
  PlayerId,
} from "./types";

/**
 * Build the initial GameState for a new game.
 *
 * Until the config-loader milestone wires the JSON / CSV configs in, the
 * board topology and tile catalogue are returned as empty arrays — the
 * shape is correct, the data is not. Per-seat defaults follow §3.2.
 */
export function initialState(config: EngineConfig): GameState {
  return {
    seed: config.seed,
    playerCount: config.playerCount,

    districtCities: [],
    merchantCities: [],
    lines: [],
    tileCatalogue: [],

    rng: makeRng(config.seed),

    era: "CANAL",
    round: 1,
    phase: "PLAYER_TURNS",
    turnOrder: defaultTurnOrder(config.playerCount),
    currentPlayerIndex: 0,
    actionsRemaining: 1,

    players: defaultPlayers(config.playerCount),

    drawDeck: [],
    wildReserve: { wildLocation: 4, wildIndustry: 4 },

    coalMarket: defaultCoalMarket(),
    ironMarket: defaultIronMarket(),

    builtTiles: [],
    developedLinks: [],
    merchantSlots: [],
  };
}

const DEFAULT_PAWN_COLORS = ["red", "yellow", "green", "blue"] as const;

function defaultTurnOrder(count: PlayerCount): PlayerId[] {
  return Array.from({ length: count }, (_, i) => i);
}

function defaultPlayers(count: PlayerCount): Player[] {
  return Array.from({ length: count }, (_, i): Player => ({
    id: i,
    displayName: `Player ${i + 1}`,
    pawnColor: DEFAULT_PAWN_COLORS[i] ?? "red",
    money: 17,
    vp: 0,
    incomeStep: 10,
    loansTaken: 0,
    spentThisRound: 0,
    linkSupply: 14,
    hand: [],
    discardPile: [],
    mat: emptyMat(),
  }));
}

function emptyMat(): Mat {
  return {
    stacks: {
      COAL_MINE: [],
      IRON_WORKS: [],
      BREWERY: [],
      COTTON_MILL: [],
      MANUFACTURER: [],
      POTTERY: [],
    },
  };
}

function defaultCoalMarket(): Market {
  return {
    resource: "COAL",
    tiers: [1, 2, 3, 4, 5, 6, 7, 8],
    filled: [0, 0, 0, 0, 0, 0, 0, 0],
    overflowPrice: 8,
  };
}

function defaultIronMarket(): Market {
  return {
    resource: "IRON",
    tiers: [1, 2, 3, 4, 5, 6],
    filled: [0, 0, 0, 0, 0, 0],
    overflowPrice: 6,
  };
}
