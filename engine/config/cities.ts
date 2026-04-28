import { z } from "zod";
import boardJsonRaw from "../../config/board.json";
import type {
  DistrictCity,
  DistrictTag,
  IndustryName,
  MerchantBonus,
  MerchantCity,
  MerchantTileAccept,
  PlayerCount,
  Position,
  SlotSpec,
} from "../types";
import { stripComments } from "./stripComments";

const IndustryNameSchema: z.ZodType<IndustryName> = z.enum([
  "COAL_MINE",
  "IRON_WORKS",
  "BREWERY",
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
]);

const SlotRawSchema = z.union([
  z.literal("ANY"),
  IndustryNameSchema,
  z.array(IndustryNameSchema).min(1),
]);

const DistrictTagSchema: z.ZodType<DistrictTag> = z.enum([
  "purple",
  "brown",
  "red",
  "blue",
  "teal",
  "farm",
]);

const PositionSchema: z.ZodType<Position> = z.tuple([z.number(), z.number()]);

const PlayerCountSchema: z.ZodType<PlayerCount> = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const MerchantBonusSchema: z.ZodType<MerchantBonus> = z.enum([
  "VP",
  "DEVELOP",
  "INCOME",
  "MONEY",
]);

const DistrictCityRawSchema = z.object({
  name: z.string(),
  district: DistrictTagSchema,
  position: PositionSchema,
  slots: z.array(SlotRawSchema),
  farmBrewery: z.boolean().optional(),
});

const MerchantCityRawSchema = z.object({
  name: z.string(),
  position: PositionSchema,
  slots: z.union([z.literal(1), z.literal(2)]),
  bonus: MerchantBonusSchema,
  bonusValue: z.number(),
  linkPoints: z.literal(2),
  activePlayerCounts: z.array(PlayerCountSchema),
});

const MerchantBagEntrySchema = z.object({
  any: z.number().min(0),
  cotton: z.number().min(0),
  empty: z.number().min(0),
  manufacturer: z.number().min(0),
  pottery: z.number().min(0),
});

const MerchantBagSchema = z.object({
  "2": MerchantBagEntrySchema,
  "3": MerchantBagEntrySchema,
  "4": MerchantBagEntrySchema,
});

export const CitiesConfigSchema = z.object({
  cities: z.array(DistrictCityRawSchema),
  industryNames: z.array(IndustryNameSchema),
  marketPlace: z.object({
    position: PositionSchema,
  }),
  // §11.2 widget anchors. roundTracker covers the era + round + per-seat
  // money-spent box pinned to the corner of the board canvas.
  roundTracker: z.object({
    position: PositionSchema,
  }),
  merchantBag: MerchantBagSchema,
  merchantCities: z.array(MerchantCityRawSchema),
});

export type CitiesConfig = z.infer<typeof CitiesConfigSchema>;

export function parseCitiesConfig(raw: unknown): CitiesConfig {
  return CitiesConfigSchema.parse(stripComments(raw));
}

export const DEFAULT_CITIES_CONFIG: CitiesConfig =
  parseCitiesConfig(boardJsonRaw);

/** Widget anchor positions extracted from the board config. Both
 *  default to the values in config/board.json; the engine surfaces
 *  them on GameState so BoardPanel doesn't have to know about config. */
export function extractMarketPlacePosition(config: CitiesConfig): Position {
  return config.marketPlace.position;
}

export function extractRoundTrackerPosition(config: CitiesConfig): Position {
  return config.roundTracker.position;
}

function rawSlotToSlotSpec(
  raw: "ANY" | IndustryName | readonly IndustryName[],
): SlotSpec {
  if (raw === "ANY") return { acceptList: [] };
  if (typeof raw === "string") return { acceptList: [raw] };
  return { acceptList: raw };
}

export function extractDistrictCities(config: CitiesConfig): DistrictCity[] {
  return config.cities.map((c): DistrictCity => ({
    name: c.name,
    districtTag: c.district,
    position: c.position,
    slots: c.slots.map(rawSlotToSlotSpec),
    farmBrewery: c.farmBrewery ?? false,
  }));
}

export function extractMerchantCities(config: CitiesConfig): MerchantCity[] {
  return config.merchantCities.map((m): MerchantCity => ({
    name: m.name,
    position: m.position,
    slotCount: m.slots,
    bonus: m.bonus,
    bonusValue: m.bonusValue,
    linkPoints: 2,
    activePlayerCounts: m.activePlayerCounts,
  }));
}

function bagKeyToAccept(key: string): MerchantTileAccept {
  switch (key) {
    case "any":
      return "ANY";
    case "cotton":
      return "COTTON_MILL";
    case "empty":
      return "BLANK";
    case "manufacturer":
      return "MANUFACTURER";
    case "pottery":
      return "POTTERY";
    default:
      throw new Error(`Unknown merchantBag key: ${key}`);
  }
}

/**
 * Build the unshuffled bag of merchant tiles for a given player count.
 * Setup shuffles this and distributes one tile per active merchant slot
 * (§3.1 step 4).
 */
export function buildMerchantBag(
  config: CitiesConfig,
  playerCount: PlayerCount,
): MerchantTileAccept[] {
  const key = String(playerCount) as "2" | "3" | "4";
  const counts = config.merchantBag[key];
  const bag: MerchantTileAccept[] = [];
  for (const [bagKey, count] of Object.entries(counts)) {
    const accept = bagKeyToAccept(bagKey);
    for (let i = 0; i < count; i++) bag.push(accept);
  }
  return bag;
}
