// =============================================================================
// Coke and Iron — the GameDefinition exported to the In My Pocket platform.
//
// The platform's game registry imports `def` from this file and uses
// `def.createSession(opts)` to materialise a per-table session.
//
// Authoritative documentation:
//   ../in-my-pocket/docs/in-my-pocket-game-author-guide.md
// =============================================================================

import { asGameId, type GameDefinition } from "./shared";
import {
  createFromOpts,
  loadFromOpts,
  type CokeAndIronSave,
} from "./server/CokeAndIronSession";

export const def: GameDefinition<CokeAndIronSave> = {
  id: asGameId("coke-and-iron"),
  displayName: "Coke and Iron",
  minPlayers: 2,
  maxPlayers: 4,
  supportsSpectators: true,
  optionsSchema: [
    {
      kind: "number",
      key: "seed",
      label: "Random seed (0 = pick one for me)",
      default: 0,
    },
    {
      kind: "boolean",
      key: "autoEndTurn",
      label: "Auto end turn after second action",
      default: false,
    },
    {
      kind: "boolean",
      key: "allowUndo",
      label: "Allow undo",
      default: true,
    },
  ],
  normalizeOptions(options) {
    const out = { ...options };
    if (typeof out["seed"] !== "number" || out["seed"] === 0) {
      // 0 / missing means "give me a fresh seed". Use a value that fits
      // in a positive 32-bit int — the engine's seeded RNG handles
      // anything in that range.
      out["seed"] = Math.floor(Math.random() * 0x7fffffff) + 1;
    }
    if (typeof out["autoEndTurn"] !== "boolean") out["autoEndTurn"] = false;
    if (typeof out["allowUndo"] !== "boolean") out["allowUndo"] = true;
    return out;
  },
  createSession(opts) {
    return createFromOpts(opts);
  },
  loadSession(blob, opts) {
    return loadFromOpts(blob, opts);
  },
};
