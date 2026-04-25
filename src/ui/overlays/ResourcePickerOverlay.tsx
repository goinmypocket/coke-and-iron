// =============================================================================
// Resource picker — fires only when the wizard detects 2+ free board
// sources for a needed cube (per spec §5.6, user-confirmed UX). Single-
// source / market-only cases auto-resolve and never enter this phase.
//
// One overlay shell, one picker per supported phase:
//   - Develop: iron picker.
//   - Build:   coal + iron picker (rows shown only when ambiguous).
// Network and Sell pickers will reuse the same shell as they're built.
// =============================================================================

import {
  listClosestCoalMines,
  listUnflippedIronWorks,
  useWizard,
} from "../wizards/WizardProvider";
import type { CoalSource, IronSource } from "../../engine";
import { useEngine } from "../hooks/useEngine";

export function ResourcePickerOverlay() {
  const wizard = useWizard();
  if (wizard.state.phase === "AWAITING_DEVELOP_IRON_PICK") {
    return <DevelopIronPicker />;
  }
  if (wizard.state.phase === "AWAITING_BUILD_RESOURCES") {
    return <BuildResourcePicker />;
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
  const remainingByTile = applyTilePicks(tiles, picks);

  return (
    <PickerShell
      title={`Develop iron — pick ${left} more cube${left === 1 ? "" : "s"}`}
      lead="Multiple unflipped Iron Works tiles are available. Click each tile to spend one cube; use Market to spend cash for the rest."
      pickedChips={picks.map((p) =>
        p.kind === "TILE" ? `tile @ ${shortId(p.tileId)}` : "market",
      )}
      pendingChipCount={left}
      onReset={picks.length > 0 ? () => wizard.resetIronPicks() : null}
      onCancel={() => wizard.reset()}
    >
      {tiles.map((t) => {
        const remaining = remainingByTile.get(t.tileId) ?? 0;
        return (
          <SourceRow
            key={t.tileId}
            label={`Iron Works @ ${t.cityName} (×${remaining})`}
            sub={`seat ${t.ownerId + 1}`}
            disabled={remaining <= 0 || left === 0}
            onClick={() =>
              wizard.pickIronSource({
                kind: "TILE",
                tileId: t.tileId,
              } satisfies IronSource)
            }
          />
        );
      })}
      <SourceRow
        label="Iron Market (paid)"
        disabled={left === 0}
        onClick={() =>
          wizard.pickIronSource({ kind: "MARKET" } satisfies IronSource)
        }
      />
    </PickerShell>
  );
}

function BuildResourcePicker() {
  const wizard = useWizard();
  const engine = useEngine();
  if (wizard.state.phase !== "AWAITING_BUILD_RESOURCES") return null;
  const live = wizard.state;
  const liveState = engine.getState();
  const coalLeft = live.coalNeed - live.coalPicks.length;
  const ironLeft = live.ironNeed - live.ironPicks.length;

  const showCoal = coalLeft > 0;
  const showIron = ironLeft > 0;

  const coalSources = showCoal
    ? listClosestCoalMines(liveState, [live.slot.cityName])
    : [];
  const ironSources = showIron ? listUnflippedIronWorks(liveState) : [];
  const coalRemaining = applyTilePicks(coalSources, live.coalPicks);
  const ironRemaining = applyTilePicks(ironSources, live.ironPicks);

  const pickedChips: string[] = [];
  for (const p of live.coalPicks) {
    pickedChips.push(
      p.kind === "TILE" ? `coal @ ${shortId(p.tileId)}` : "coal · market",
    );
  }
  for (const p of live.ironPicks) {
    pickedChips.push(
      p.kind === "TILE" ? `iron @ ${shortId(p.tileId)}` : "iron · market",
    );
  }

  return (
    <PickerShell
      title={`Build — pick ${pluralPicks(coalLeft, "coal")}${coalLeft && ironLeft ? " and " : ""}${pluralPicks(ironLeft, "iron")}`}
      lead={
        coalSources.length > 1 && ironSources.length > 1
          ? "Multiple coal and iron sources are tied at the closest distance. Pick which to drain."
          : showCoal
            ? "Multiple coal mines are tied at the closest distance. Pick which to drain."
            : "Multiple unflipped Iron Works tiles are available. Pick which to drain."
      }
      pickedChips={pickedChips}
      pendingChipCount={coalLeft + ironLeft}
      onReset={
        live.coalPicks.length + live.ironPicks.length > 0
          ? () => wizard.resetBuildResources()
          : null
      }
      onCancel={() => wizard.reset()}
    >
      {showCoal && (
        <SectionHeader>Coal — closest mines</SectionHeader>
      )}
      {showCoal &&
        coalSources.map((m) => {
          const remaining = coalRemaining.get(m.tileId) ?? 0;
          return (
            <SourceRow
              key={m.tileId}
              label={`Coal Mine @ ${m.cityName} (×${remaining})`}
              sub={`${m.distance} hop${m.distance === 1 ? "" : "s"} · seat ${m.ownerId + 1}`}
              disabled={remaining <= 0 || coalLeft === 0}
              onClick={() =>
                wizard.pickBuildCoal({
                  kind: "TILE",
                  tileId: m.tileId,
                } satisfies CoalSource)
              }
            />
          );
        })}
      {showCoal && (
        <SourceRow
          label="Coal Market (paid)"
          disabled={coalLeft === 0}
          onClick={() =>
            wizard.pickBuildCoal({ kind: "MARKET" } satisfies CoalSource)
          }
        />
      )}
      {showIron && (
        <SectionHeader>Iron — unflipped Iron Works</SectionHeader>
      )}
      {showIron &&
        ironSources.map((t) => {
          const remaining = ironRemaining.get(t.tileId) ?? 0;
          return (
            <SourceRow
              key={t.tileId}
              label={`Iron Works @ ${t.cityName} (×${remaining})`}
              sub={`seat ${t.ownerId + 1}`}
              disabled={remaining <= 0 || ironLeft === 0}
              onClick={() =>
                wizard.pickBuildIron({
                  kind: "TILE",
                  tileId: t.tileId,
                } satisfies IronSource)
              }
            />
          );
        })}
      {showIron && (
        <SourceRow
          label="Iron Market (paid)"
          disabled={ironLeft === 0}
          onClick={() =>
            wizard.pickBuildIron({ kind: "MARKET" } satisfies IronSource)
          }
        />
      )}
    </PickerShell>
  );
}

// -----------------------------------------------------------------------------
// Shared UI primitives

function PickerShell({
  title,
  lead,
  pickedChips,
  pendingChipCount,
  onReset,
  onCancel,
  children,
}: {
  title: string;
  lead: string;
  pickedChips: readonly string[];
  pendingChipCount: number;
  onReset: (() => void) | null;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay-backdrop">
      <div className="picker-overlay">
        <header className="picker-overlay__title">{title}</header>
        <p className="picker-overlay__lead">{lead}</p>
        <div className="picker-overlay__progress">
          {pickedChips.map((c, i) => (
            <span key={i} className="picker-overlay__chip">
              {c}
            </span>
          ))}
          {Array.from({ length: pendingChipCount }).map((_, i) => (
            <span
              key={`pending-${i}`}
              className="picker-overlay__chip picker-overlay__chip--pending"
            >
              ?
            </span>
          ))}
        </div>
        <ul className="picker-overlay__sources">{children}</ul>
        <div className="picker-overlay__buttons">
          {onReset ? (
            <button type="button" className="action-btn" onClick={onReset}>
              Reset
            </button>
          ) : null}
          <button type="button" className="action-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <li className="picker-overlay__section">{children}</li>;
}

function SourceRow({
  label,
  sub,
  disabled,
  onClick,
}: {
  label: string;
  sub?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <li className="picker-overlay__source">
      <button
        type="button"
        className="action-btn"
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </button>
      {sub ? <span className="picker-overlay__owner">{sub}</span> : null}
    </li>
  );
}

// -----------------------------------------------------------------------------
// Helpers

function applyTilePicks<T extends { tileId: string; remaining: number }>(
  tiles: readonly T[],
  picks: readonly { kind: string; tileId?: string }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tiles) m.set(t.tileId, t.remaining);
  for (const p of picks) {
    if (p.kind === "TILE" && p.tileId) {
      m.set(p.tileId, (m.get(p.tileId) ?? 0) - 1);
    }
  }
  return m;
}

function shortId(tileId: string): string {
  const parts = tileId.split(":");
  return parts[parts.length - 1] ?? tileId;
}

function pluralPicks(n: number, label: string): string {
  if (n === 0) return "";
  return `${n} ${label}`;
}
