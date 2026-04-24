import { z } from "zod";
import layoutJsonRaw from "../../../config/layout.json";
import { stripComments } from "./stripComments";

/**
 * Per-panel placement entry. The exact shape is intentionally permissive
 * for now — the §11 panel set is fixed at the engine level, but the grid
 * placement rules are a UI concern that the layout editor (§10.3) will
 * shape during the UI milestone. `passthrough` keeps any UI-specific
 * fields the editor adds.
 */
const PanelPlacementSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export const LayoutConfigSchema = z.object({
  columns: z.string().optional(),
  rows: z.string().optional(),
  panels: z.array(PanelPlacementSchema),
});

export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;

export function parseLayoutConfig(raw: unknown): LayoutConfig {
  return LayoutConfigSchema.parse(stripComments(raw));
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig =
  parseLayoutConfig(layoutJsonRaw);
