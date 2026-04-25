// Mirror of the on-disk shape of config/cities.json and config/links.json.
// The editor parses JSON straight into these types and serializes them
// back unchanged on save, so any unknown fields like "_comment" round-trip.

export type IndustryName =
  | "COAL_MINE"
  | "IRON_WORKS"
  | "BREWERY"
  | "COTTON_MILL"
  | "MANUFACTURER"
  | "POTTERY";

export const INDUSTRY_NAMES: readonly IndustryName[] = [
  "COAL_MINE",
  "IRON_WORKS",
  "BREWERY",
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
];

export type DistrictTag =
  | "purple"
  | "brown"
  | "red"
  | "blue"
  | "teal"
  | "farm";

export const DISTRICT_TAGS: readonly DistrictTag[] = [
  "purple",
  "brown",
  "red",
  "blue",
  "teal",
  "farm",
];

export type PlayerCount = 2 | 3 | 4;

export type MerchantBonus = "VP" | "DEVELOP" | "INCOME" | "MONEY";

export const MERCHANT_BONUSES: readonly MerchantBonus[] = [
  "VP",
  "DEVELOP",
  "INCOME",
  "MONEY",
];

export type Position = [number, number];

export type RawSlot = "ANY" | IndustryName | IndustryName[];

export interface CityRaw {
  name: string;
  district: DistrictTag;
  position: Position;
  slots: RawSlot[];
  farmBrewery?: boolean;
}

export interface MerchantCityRaw {
  name: string;
  position: Position;
  slots: 1 | 2;
  bonus: MerchantBonus;
  bonusValue: number;
  linkPoints: 2;
  activePlayerCounts: PlayerCount[];
}

export interface CitiesConfigRaw {
  _comment?: string;
  cities: CityRaw[];
  industryNames: IndustryName[];
  marketPlace: { position: Position };
  merchantBag: unknown;
  merchantCities: MerchantCityRaw[];
}

export interface LinksConfigRaw {
  _comment?: string;
  canal: string[][];
  rail: string[][];
}

export type LinkEra = "canal" | "rail";

export type EditorMode = "cities" | "merchants" | "canal" | "rail";

export const DISTRICT_FILL: Readonly<Record<DistrictTag, string>> = {
  purple: "#8a6fb0",
  brown: "#9c7656",
  red: "#c75e5e",
  blue: "#5e8fc7",
  teal: "#5eb0a8",
  farm: "#a89568",
};

export const INDUSTRY_GLYPH: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: "C",
  IRON_WORKS: "I",
  BREWERY: "B",
  COTTON_MILL: "Co",
  MANUFACTURER: "M",
  POTTERY: "P",
};

export const INDUSTRY_LABEL: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: "Coal Mine",
  IRON_WORKS: "Iron Works",
  BREWERY: "Brewery",
  COTTON_MILL: "Cotton Mill",
  MANUFACTURER: "Manufacturer",
  POTTERY: "Pottery",
};

export const SNAP = 5;
export const CANVAS = 900;

export function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

export function clampToCanvas(v: number): number {
  if (v < 0) return 0;
  if (v > CANVAS) return CANVAS;
  return v;
}

export function slotAcceptList(slot: RawSlot): IndustryName[] {
  if (slot === "ANY") return [];
  if (typeof slot === "string") return [slot];
  return [...slot];
}

export function acceptListToSlot(accept: IndustryName[]): RawSlot {
  if (accept.length === 0) return "ANY";
  if (accept.length === 1) return accept[0]!;
  return [...accept];
}
