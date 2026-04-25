// =============================================================================
// Resource picker — fires only when the wizard detects 2+ free board
// sources for a needed cube (per spec §5.6, user-confirmed UX). Single-
// source / market-only cases auto-resolve and never enter this phase.
//
// This milestone wires the Develop iron-source picker. Build / Network /
// Sell pickers will reuse the same overlay shell as they're built.
// =============================================================================

import {
  listUnflippedIronWorks,
  useWizard,
} from "../wizards/WizardProvider";
import type { IronSource } from "../../engine";
import { useEngine } from "../hooks/useEngine";

export function ResourcePickerOverlay() {
  const wizard = useWizard();
  if (wizard.state.phase === "AWAITING_DEVELOP_IRON_PICK") {
    return <DevelopIronPicker />;
  }
  return null;
}

function DevelopIronPicker() {
  const wizard = useWizard();
  const engine = useEngine();
  if (wizard.state.phase !== "AWAITING_DEVELOP_IRON_PICK") return null;
  const { picks, industries } = wizard.state;
  const need = industries.length;
  const left = need - picks.length;

  const tiles = listUnflippedIronWorks(engine.getState());
  // Apply local picks to compute remaining cubes per tile.
  const remainingByTile = new Map<string, number>();
  for (const t of tiles) remainingByTile.set(t.tileId, t.remaining);
  for (const p of picks) {
    if (p.kind === "TILE") {
      const cur = remainingByTile.get(p.tileId) ?? 0;
      remainingByTile.set(p.tileId, cur - 1);
    }
  }

  const onPickTile = (tileId: string) => {
    wizard.pickIronSource({ kind: "TILE", tileId } satisfies IronSource);
  };
  const onPickMarket = () => {
    wizard.pickIronSource({ kind: "MARKET" } satisfies IronSource);
  };

  return (
    <div className="overlay-backdrop">
      <div className="picker-overlay">
        <header className="picker-overlay__title">
          Develop iron — pick {left} more cube{left === 1 ? "" : "s"}
        </header>
        <p className="picker-overlay__lead">
          Multiple unflipped Iron Works tiles are available. Click each
          tile to spend one cube; the engine drains the cube on dispatch.
          Use Market to spend cash for any cubes you don't pull from
          tiles.
        </p>
        <div className="picker-overlay__progress">
          {picks.map((p, i) => (
            <span key={i} className="picker-overlay__chip">
              {p.kind === "TILE" ? `tile ${shortId(p.tileId)}` : "market"}
            </span>
          ))}
          {Array.from({ length: left }).map((_, i) => (
            <span
              key={`pending-${i}`}
              className="picker-overlay__chip picker-overlay__chip--pending"
            >
              ?
            </span>
          ))}
        </div>
        <ul className="picker-overlay__sources">
          {tiles.map((t) => {
            const remaining = remainingByTile.get(t.tileId) ?? 0;
            const disabled = remaining <= 0 || left === 0;
            return (
              <li key={t.tileId} className="picker-overlay__source">
                <button
                  type="button"
                  className="action-btn"
                  disabled={disabled}
                  onClick={() => onPickTile(t.tileId)}
                  title={`Drain one cube from ${t.cityName}'s Iron Works`}
                >
                  Iron Works @ {t.cityName} (×{remaining})
                </button>
                <span className="picker-overlay__owner">
                  seat {t.ownerId + 1}
                </span>
              </li>
            );
          })}
          <li className="picker-overlay__source">
            <button
              type="button"
              className="action-btn"
              disabled={left === 0}
              onClick={onPickMarket}
              title="Spend cash from the iron market for one cube"
            >
              Iron Market (paid)
            </button>
          </li>
        </ul>
        <div className="picker-overlay__buttons">
          <button
            type="button"
            className="action-btn"
            disabled={picks.length === 0}
            onClick={() => wizard.resetIronPicks()}
          >
            Reset
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => wizard.reset()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function shortId(tileId: string): string {
  // Tile ids include a stable counter; trim to last segment for display.
  const parts = tileId.split(":");
  return parts[parts.length - 1] ?? tileId;
}
