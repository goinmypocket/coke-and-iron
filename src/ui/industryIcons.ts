// =============================================================================
// Shared industry icon URLs (per spec §2.9.2). Vite turns each .svg
// import into a hashed URL at build time so multiple consumers share one
// asset. Components embed via <image href={...}> inside SVG, or <img>
// inside HTML.
// =============================================================================

import iconBrewery from "../../assets/industry_icons/icon_beer.svg";
import iconCoal from "../../assets/industry_icons/icon_coal.svg";
import iconCotton from "../../assets/industry_icons/icon_cotton.svg";
import iconIron from "../../assets/industry_icons/icon_iron.svg";
import iconManufacturer from "../../assets/industry_icons/icon_manufacturer.svg";
import iconPottery from "../../assets/industry_icons/icon_pottery.svg";
import type { DistrictTag, IndustryName } from "../engine";

export const INDUSTRY_ICON: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: iconCoal,
  IRON_WORKS: iconIron,
  BREWERY: iconBrewery,
  COTTON_MILL: iconCotton,
  MANUFACTURER: iconManufacturer,
  POTTERY: iconPottery,
};

export const INDUSTRY_LABEL: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: "Coal",
  IRON_WORKS: "Iron",
  BREWERY: "Brewery",
  COTTON_MILL: "Cotton",
  MANUFACTURER: "Manufacturer",
  POTTERY: "Pottery",
};

// District swatch colours used wherever the UI needs to colour-code a
// city or district reference (board, remaining-cards labels, recent
// actions). Mirrored in the dev editor at src/editor/types.ts.
export const DISTRICT_FILL: Readonly<Record<DistrictTag, string>> = {
  purple: "#8a6fb0",
  brown: "#9c7656",
  red: "#c75e5e",
  blue: "#5e8fc7",
  teal: "#5eb0a8",
  farm: "#a89568",
};

export const DISTRICT_LABEL: Readonly<Record<DistrictTag, string>> = {
  purple: "Purple",
  brown: "Brown",
  red: "Red",
  blue: "Blue",
  teal: "Teal",
  farm: "Farm",
};
