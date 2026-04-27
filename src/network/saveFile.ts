// =============================================================================
// Save-file format (v1).
//
// A save captures everything needed to reconstruct a game deterministically:
//   - seed + player count (engine setup args)
//   - the resolved EngineConfigBundle (tiles/cards/cities/links + seats)
//   - the full intent log
//
// Replay = `new Engine({seed, playerCount, ...}, bundle)` then dispatch
// every intent in order. Same seed + bundle + intent log → byte-identical
// GameState. Determinism is the engine's responsibility (see rng.ts and
// reduce.ts); the save file just persists the inputs.
//
// We embed the resolved bundle on save so changes to bundled config files
// after a save don't break replay. Defaults are looked up exactly once,
// at game-start time, and frozen into the save.
// =============================================================================
import { z } from "zod";
import {
  DEFAULT_CARDS_CONFIG,
  DEFAULT_CITIES_CONFIG,
  DEFAULT_LINKS_CONFIG,
  DEFAULT_TILES_CONFIG,
  type CardsConfig,
  type CitiesConfig,
  type EngineConfigBundle,
  type LinksConfig,
  type SeatIdentity,
  type TilesConfig,
} from "../engine";
import type { Intent, PlayerCount } from "../engine/types";

export const SAVE_VERSION = 2 as const;

/** A bundle with every field populated. Saves always store this shape. */
export interface ResolvedBundle {
  readonly tiles: TilesConfig;
  readonly cards: CardsConfig;
  readonly cities: CitiesConfig;
  readonly links: LinksConfig;
  readonly seats: readonly SeatIdentity[];
}

export interface SaveFile {
  readonly version: typeof SAVE_VERSION;
  readonly createdAt: string;
  readonly savedAt: string;
  readonly seed: number;
  readonly playerCount: PlayerCount;
  readonly autoEndTurn: boolean;
  readonly allowUndo: boolean;
  readonly bundle: ResolvedBundle;
  /** Opaque to the schema — validated by replay through the engine. */
  readonly intentLog: readonly Intent[];
  /** Per-seat reconnect tokens. seatTokens[seatId] is the token any
   *  client that owns that seat presents in C2S RESUME. Persisted so
   *  the host can be Ctrl-C'd and resumed without invalidating the
   *  players' bookmarks. */
  readonly seatTokens: readonly string[];
}

const SeatIdentitySchema = z.object({
  displayName: z.string().min(1).max(40),
  pawnColor: z.string().min(1).max(40),
});

const PlayerCountSchema = z.union([z.literal(2), z.literal(3), z.literal(4)]);

const SaveFileSchema = z.object({
  version: z.literal(SAVE_VERSION),
  createdAt: z.string(),
  savedAt: z.string(),
  seed: z.number().int(),
  playerCount: PlayerCountSchema,
  autoEndTurn: z.boolean(),
  allowUndo: z.boolean(),
  bundle: z.object({
    tiles: z.unknown(),
    cards: z.unknown(),
    cities: z.unknown(),
    links: z.unknown(),
    seats: z.array(SeatIdentitySchema),
  }),
  intentLog: z.array(z.unknown()),
  seatTokens: z.array(z.string()),
});

/** Fill in defaults for any unspecified bundle field. Saves always store
 *  the resolved bundle so subsequent edits to the on-disk config don't
 *  drift the replay. */
export function resolveBundle(
  partial: EngineConfigBundle,
  seats: readonly SeatIdentity[],
): ResolvedBundle {
  return {
    tiles: partial.tiles ?? DEFAULT_TILES_CONFIG,
    cards: partial.cards ?? DEFAULT_CARDS_CONFIG,
    cities: partial.cities ?? DEFAULT_CITIES_CONFIG,
    links: partial.links ?? DEFAULT_LINKS_CONFIG,
    seats,
  };
}

export interface BuildSaveArgs {
  readonly createdAt: string;
  readonly seed: number;
  readonly playerCount: PlayerCount;
  readonly autoEndTurn: boolean;
  readonly allowUndo: boolean;
  readonly bundle: ResolvedBundle;
  readonly intentLog: readonly Intent[];
  readonly seatTokens: readonly string[];
}

export function buildSaveFile(args: BuildSaveArgs): SaveFile {
  return {
    version: SAVE_VERSION,
    createdAt: args.createdAt,
    savedAt: new Date().toISOString(),
    seed: args.seed,
    playerCount: args.playerCount,
    autoEndTurn: args.autoEndTurn,
    allowUndo: args.allowUndo,
    bundle: args.bundle,
    intentLog: args.intentLog,
    seatTokens: args.seatTokens,
  };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save, null, 2) + "\n";
}

export class SaveFileError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SaveFileError";
  }
}

/**
 * Parse and validate a JSON string as a v1 save file. Throws SaveFileError
 * with a descriptive message on any structural problem. Intent shapes are
 * NOT validated here — that happens when the host replays them through the
 * engine, which is the only place that knows the full discriminated union.
 */
export function parseSaveFile(json: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new SaveFileError("save file is not valid JSON", err);
  }
  // Accept missing autoEndTurn/allowUndo/seatTokens for
  // forward-leniency. Pre-v2 saves predate seat tokens; we synthesise
  // an empty array so resuming such a save just means everyone
  // re-claims by name from the lobby (the existing fromSave flow).
  const withDefaults =
    typeof raw === "object" && raw !== null
      ? {
          autoEndTurn: false,
          allowUndo: true,
          seatTokens: [] as string[],
          version: SAVE_VERSION,
          ...(raw as Record<string, unknown>),
        }
      : raw;
  // If we just defaulted seatTokens to [] but the original save was
  // version 1, also rewrite version so the schema accepts it.
  if (
    typeof withDefaults === "object" &&
    withDefaults !== null &&
    (withDefaults as { version?: unknown }).version === 1
  ) {
    (withDefaults as Record<string, unknown>).version = SAVE_VERSION;
  }
  const parsed = SaveFileSchema.safeParse(withDefaults);
  if (!parsed.success) {
    throw new SaveFileError(
      `save file failed schema validation: ${parsed.error.message}`,
      parsed.error,
    );
  }
  return parsed.data as SaveFile;
}
