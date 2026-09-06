import { Modal } from "./Modal";
// =============================================================================
// §4.3 step 2 shortfall sub-flow.
//
// Renders only while state.pendingShortfalls is non-empty. The head
// player picks their own built tiles to remove for proceeds (half cost
// rounded down per tile). When proceeds cover the debt they hit Submit.
// If they can't or won't, Finalize converts the remaining debt to VP
// loss (clamped at 0) and pops the entry.
//
// While this overlay is up, every other intent is rejected by the
// engine (`shortfall_resolution_required`), so the rest of the UI is
// effectively frozen.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { GameState, IndustryName, PlayerId } from "../../../engine";
import { reasonToText } from "../affordances/toast";
import { useEngine } from "../hooks/useEngine";
import { useActualSeatId } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { MoneyCoin } from "../icons/MoneyCoin";

const INDUSTRY_LABEL: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: "Coal",
  IRON_WORKS: "Iron",
  BREWERY: "Brewery",
  COTTON_MILL: "Cotton",
  MANUFACTURER: "Manuf.",
  POTTERY: "Pottery",
};

export function ShortfallOverlay() {
  const actualSeatId = useActualSeatId();
  // Subscribe to stable refs only (no fresh-filter inside the
  // selector) — we derive the per-player view via useMemo below so
  // the snapshot stays cache-stable.
  const view = useGameState((s) => {
    const head = s.pendingShortfalls[0];
    if (!head) return null;
    const player = s.players.find((p) => p.id === head.playerId);
    if (!player) return null;
    return {
      headPlayerId: head.playerId,
      headPlayerName: player.displayName,
      pawnColor: player.pawnColor,
      owed: head.owed,
      vp: player.vp,
      builtTiles: s.builtTiles,
      tileCatalogue: s.tileCatalogue,
    };
  }, shallowEqual);

  const ownTiles = useMemo(() => {
    if (!view) return [];
    return view.builtTiles.filter((t) => t.owner === view.headPlayerId);
  }, [view]);

  if (!view) return null;
  // A viewing perspective is not ownership. Other players and spectators must
  // retain platform controls so a hotseat host can select the actual debtor.
  if (actualSeatId !== view.headPlayerId) return (
    <p className="shortfall-waiting" role="status">
      Waiting for {view.headPlayerName} to resolve an income shortfall of £{view.owed}.
    </p>
  );
  return <ShortfallBody view={{ ...view, ownTiles }} />;
}

interface View {
  readonly headPlayerId: PlayerId;
  readonly headPlayerName: string;
  readonly pawnColor: string;
  readonly owed: number;
  readonly vp: number;
  readonly builtTiles: GameState["builtTiles"];
  readonly ownTiles: GameState["builtTiles"];
  readonly tileCatalogue: GameState["tileCatalogue"];
}

function ShortfallBody({ view }: { view: View }) {
  const engine = useEngine();
  const [picked, setPicked] = useState<readonly string[]>([]);

  // Head player can change as the queue advances — clear picks each time.
  useEffect(() => {
    setPicked([]);
  }, [view.headPlayerId]);

  const proceeds = picked.reduce((acc, id) => {
    const tile = view.ownTiles.find((t) => t.id === id);
    if (!tile) return acc;
    const spec = view.tileCatalogue[tile.catalogueIndex];
    if (!spec) return acc;
    return acc + Math.floor(spec.costMoney / 2);
  }, 0);

  const remaining = Math.max(0, view.owed - proceeds);
  const canSubmit = proceeds >= view.owed;

  const togglePick = (tileId: string) => {
    setPicked((cur) =>
      cur.includes(tileId)
        ? cur.filter((id) => id !== tileId)
        : [...cur, tileId],
    );
  };

  const submit = (finalize: boolean) => {
    const result = engine.dispatch({
      type: "RESOLVE_SHORTFALL",
      playerId: view.headPlayerId,
      tilesToRemove: [...picked],
      finalize,
    });
    if (!result.ok) {
      toast.error(reasonToText(result.reason));
      return;
    }
    setPicked([]);
  };

  return (
    <Modal className="shortfall-overlay" label="Resolve income shortfall">
        <header className="shortfall-overlay__title">
          Shortfall — {view.headPlayerName} owes{" "}
          <MoneyCoin amount={view.owed} size={14} />
        </header>
        <p className="shortfall-overlay__lead">
          Pick own tiles to remove for half their printed build cost.
          Submit once proceeds cover the debt, or Finalize to take VP loss
          for the remainder.
        </p>
        <div className="shortfall-overlay__totals">
          <span>
            Proceeds: <MoneyCoin amount={proceeds} size={14} />
          </span>
          <span>
            Remaining: <MoneyCoin amount={remaining} size={14} />
          </span>
          <span>VP loss if finalized: {Math.min(view.vp, remaining)}</span>
        </div>
        <ul className="shortfall-overlay__tiles">
          {view.ownTiles.length === 0 ? (
            <li className="shortfall-overlay__empty">
              No built tiles available — must Finalize.
            </li>
          ) : (
            view.ownTiles.map((tile) => {
              const spec = view.tileCatalogue[tile.catalogueIndex];
              if (!spec) return null;
              const isPicked = picked.includes(tile.id);
              return (
                <li
                  key={tile.id}
                  className={
                    isPicked
                      ? "shortfall-overlay__tile shortfall-overlay__tile--picked"
                      : "shortfall-overlay__tile"
                  }
                  onClick={() => togglePick(tile.id)}
                >
                  <span>
                    {INDUSTRY_LABEL[spec.industry]} L{spec.level} @ {tile.cityName}
                    {tile.flipped ? " (flipped)" : ""}
                  </span>
                  <MoneyCoin
                    amount={Math.floor(spec.costMoney / 2)}
                    size={14}
                  />
                </li>
              );
            })
          )}
        </ul>
        <div className="shortfall-overlay__buttons">
          <button
            type="button"
            className="action-btn"
            disabled={picked.length === 0}
            onClick={() => setPicked([])}
          >
            Reset
          </button>
          <button
            type="button"
            className="action-btn"
            disabled={!canSubmit}
            onClick={() => submit(false)}
            title={
              canSubmit
                ? "Pop the debt; surplus returns to your money."
                : "Pick more tiles until proceeds cover the debt."
            }
          >
            Submit (<MoneyCoin amount={proceeds} size={12} />)
          </button>
          <button
            type="button"
            className="action-btn action-btn--active"
            onClick={() => submit(true)}
            title="Convert remaining debt to VP loss (clamped at 0)."
          >
            Finalize ({Math.min(view.vp, remaining)} VP)
          </button>
        </div>
    </Modal>
  );
}
