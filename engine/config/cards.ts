import { z } from "zod";
import cardsJsonRaw from "../../config/cards.json";
import type { Card, IndustryName, PlayerCount } from "../types";
import { stripComments } from "./stripComments";

const PerPlayerCountSchema = z.object({
  "2": z.number().int().min(0),
  "3": z.number().int().min(0),
  "4": z.number().int().min(0),
});

export const CardsConfigSchema = z.object({
  startingHandSize: z.number().int().positive(),
  location: z.record(z.string(), PerPlayerCountSchema),
  industry: z.object({
    IRON_WORKS: PerPlayerCountSchema,
    COAL_MINE: PerPlayerCountSchema,
    POTTERY: PerPlayerCountSchema,
    BREWERY: PerPlayerCountSchema,
  }),
  dualCottonManufacturer: PerPlayerCountSchema,
  wild: z.object({
    location: z.number().int().min(0),
    industry: z.number().int().min(0),
  }),
});

export type CardsConfig = z.infer<typeof CardsConfigSchema>;

export function parseCardsConfig(raw: unknown): CardsConfig {
  return CardsConfigSchema.parse(stripComments(raw));
}

export const DEFAULT_CARDS_CONFIG: CardsConfig =
  parseCardsConfig(cardsJsonRaw);

/**
 * Build the unshuffled draw deck for a given player count. Wild cards live
 * in the wild reserve (§2.13), not the deck, and are not included here.
 *
 * Both single-industry cards and the dual Cotton/Manufacturer card
 * collapse to the same shape — IndustryCard with an `industries` list.
 * The reducer's authorisation check is uniform: industry must appear in
 * the list.
 */
export function buildDeck(
  config: CardsConfig,
  playerCount: PlayerCount,
): Card[] {
  const key = String(playerCount) as "2" | "3" | "4";
  const deck: Card[] = [];

  for (const [cityName, counts] of Object.entries(config.location)) {
    for (let i = 0; i < counts[key]; i++) {
      deck.push({ kind: "LOCATION", cityName });
    }
  }

  const industries: readonly IndustryName[] = [
    "IRON_WORKS",
    "COAL_MINE",
    "POTTERY",
    "BREWERY",
  ];
  for (const industry of industries) {
    const counts = config.industry[industry as "IRON_WORKS" | "COAL_MINE" | "POTTERY" | "BREWERY"];
    for (let i = 0; i < counts[key]; i++) {
      deck.push({ kind: "INDUSTRY", industries: [industry] });
    }
  }

  for (let i = 0; i < config.dualCottonManufacturer[key]; i++) {
    deck.push({
      kind: "INDUSTRY",
      industries: ["COTTON_MILL", "MANUFACTURER"],
    });
  }

  return deck;
}
