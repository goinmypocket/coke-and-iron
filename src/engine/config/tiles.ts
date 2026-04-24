import { z } from "zod";
import tilesJsonRaw from "../../../config/industry_tiles.json";
import type { IndustryName, IndustryTileSpec } from "../types";
import { stripComments } from "./stripComments";

const IndustryNameSchema: z.ZodType<IndustryName> = z.enum([
  "COAL_MINE",
  "IRON_WORKS",
  "BREWERY",
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
]);

const TileEntrySchema = z.object({
  industry: IndustryNameSchema,
  level: z.number().int().positive(),
  qty: z.number().int().positive(),
  costMoney: z.number().int().min(0),
  coalCost: z.number().int().min(0),
  ironCost: z.number().int().min(0),
  vp: z.number().int().min(0),
  incomeBonus: z.number().int().min(0),
  linkPoints: z.number().int().min(0),
  canalOnly: z.boolean(),
  railOnly: z.boolean(),
  lightBulb: z.boolean(),
  beerToSell: z.number().int().min(0),
  resourceCapacity: z.number().int().min(0),
  resourceCapacityRail: z.number().int().positive().nullable(),
});

export const TilesConfigSchema = z.object({
  tiles: z.array(TileEntrySchema).min(1),
});

export type TilesConfig = z.infer<typeof TilesConfigSchema>;

export function parseTilesConfig(raw: unknown): TilesConfig {
  return TilesConfigSchema.parse(stripComments(raw));
}

/**
 * Default config — built from the bundled industry_tiles.json at module
 * load. Satisfies spec §9's "code ships defaults that mirror the configs"
 * requirement: when no other config source is wired up, this is what the
 * engine uses.
 */
export const DEFAULT_TILES_CONFIG: TilesConfig =
  parseTilesConfig(tilesJsonRaw);

/** Convert a parsed tiles config into the engine's catalogue. */
export function extractCatalogue(config: TilesConfig): IndustryTileSpec[] {
  return config.tiles.map((t): IndustryTileSpec => ({
    industry: t.industry,
    level: t.level,
    qty: t.qty,
    costMoney: t.costMoney,
    coalCost: t.coalCost,
    ironCost: t.ironCost,
    vp: t.vp,
    incomeBonus: t.incomeBonus,
    linkPoints: t.linkPoints,
    canalOnly: t.canalOnly,
    railOnly: t.railOnly,
    lightBulb: t.lightBulb,
    beerToSell: t.beerToSell,
    resourceCapacity: t.resourceCapacity,
    resourceCapacityRail: t.resourceCapacityRail,
  }));
}
