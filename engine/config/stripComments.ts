/**
 * Recursively strips `_comment` keys from a JSON-like value. The config
 * files (per spec §9) use `_comment` strings as inline documentation;
 * stripping them up front lets every zod schema in this module ignore the
 * field instead of acknowledging it at every nesting level.
 *
 * Pure function. The input is treated as a JSON value; primitives and
 * unknown shapes pass through unchanged.
 */
export function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripComments);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "_comment") continue;
      out[k] = stripComments(v);
    }
    return out;
  }
  return value;
}
