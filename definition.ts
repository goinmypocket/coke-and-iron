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
import { CokeAndIronSession, type CokeAndIronSave } from "./server/CokeAndIronSession";

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
      label: "Random seed",
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
  createSession(opts) {
    return new CokeAndIronSession(opts);
  },
  loadSession(_blob, opts) {
    // TODO: hydrate from the saved blob (replay intents through the
    // engine, restore seat assignments, etc.). For now this just
    // creates a fresh session — load is wired up but does nothing.
    return new CokeAndIronSession(opts);
  },
};
