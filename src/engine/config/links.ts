import { z } from "zod";
import linksJsonRaw from "../../../config/links.json";
import type { Line } from "../types";
import { stripComments } from "./stripComments";

const Endpoints2Schema = z.tuple([z.string(), z.string()]);
const Endpoints3Schema = z.tuple([z.string(), z.string(), z.string()]);
const EndpointsSchema = z.union([Endpoints2Schema, Endpoints3Schema]);

export const LinksConfigSchema = z.object({
  canal: z.array(EndpointsSchema),
  rail: z.array(EndpointsSchema),
});

export type LinksConfig = z.infer<typeof LinksConfigSchema>;

export function parseLinksConfig(raw: unknown): LinksConfig {
  return LinksConfigSchema.parse(stripComments(raw));
}

export const DEFAULT_LINKS_CONFIG: LinksConfig =
  parseLinksConfig(linksJsonRaw);

/** Flatten the per-era link arrays into a single tagged Line[]. */
export function extractLines(config: LinksConfig): Line[] {
  const fromCanal: Line[] = config.canal.map((endpoints) => ({
    era: "CANAL",
    endpoints,
  }));
  const fromRail: Line[] = config.rail.map((endpoints) => ({
    era: "RAIL",
    endpoints,
  }));
  return [...fromCanal, ...fromRail];
}
