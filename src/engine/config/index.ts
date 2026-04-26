// Public surface of the engine's config layer. Every loader follows the
// same pattern: a zod schema, a parseXxx(raw) function, a DEFAULT_X_CONFIG
// constant built from the bundled JSON at module load, plus extraction
// helpers that lower the parsed config into engine domain types.

export { stripComments } from "./stripComments";

export {
  CardsConfigSchema,
  DEFAULT_CARDS_CONFIG,
  parseCardsConfig,
  buildDeck,
} from "./cards";
export type { CardsConfig } from "./cards";

export {
  CitiesConfigSchema,
  DEFAULT_CITIES_CONFIG,
  parseCitiesConfig,
  extractDistrictCities,
  extractMerchantCities,
  buildMerchantBag,
} from "./cities";
export type { CitiesConfig } from "./cities";

export {
  LinksConfigSchema,
  DEFAULT_LINKS_CONFIG,
  parseLinksConfig,
  extractLines,
} from "./links";
export type { LinksConfig } from "./links";

export {
  TilesConfigSchema,
  DEFAULT_TILES_CONFIG,
  parseTilesConfig,
  extractCatalogue,
} from "./tiles";
export type { TilesConfig } from "./tiles";
