import { Modal } from "./Modal";
import { usePaused } from "../hooks/EngineProvider";
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
  listValidBeerSourcesForOrder,
  listValidBreweries,
  useWizard,
} from "../wizards/WizardProvider";
import type { BeerSource, CoalSource, IronSource } from "../../../engine";
import type { BreweryBeerSource } from "../wizards/wizardState";
import { useEngine } from "../hooks/useEngine";

export function ResourcePickerOverlay() {
  const wizard = useWizard();
  if (wizard.state.phase === "AWAITING_DEVELOP_IRON_PICK") {
    return <DevelopIronPicker />;
  }
  if (wizard.state.phase === "AWAITING_BUILD_RESOURCES") {
    return <BuildResourcePicker />;
  }
  if (wizard.state.phase === "AWAITING_NETWORK_RESOURCES") {
    return <NetworkResourcePicker />;
  }
  if (wizard.state.phase === "AWAITING_SELL_RESOURCES") {
    return <SellResourcePicker />;
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

function NetworkResourcePicker() {
  const wizard = useWizard();
  const engine = useEngine();
  if (wizard.state.phase !== "AWAITING_NETWORK_RESOURCES") return null;
  const live = wizard.state;
  const liveState = engine.getState();
  const playerId = liveState.turnOrder[liveState.currentPlayerIndex];

  const fcLeft = live.firstCoalNeed - live.firstCoalPicks.length;
  const scLeft = live.secondCoalNeed - live.secondCoalPicks.length;
  const beerLeft = live.beerNeed - live.beerPicks.length;
  const showFirstCoal = fcLeft > 0;
  const showSecondCoal = scLeft > 0;
  const showBeer = beerLeft > 0;

  const firstEndpoints = liveState.lines[live.lineIndex]?.endpoints ?? [];
  const secondEndpoints =
    live.secondLineIndex !== null
      ? (liveState.lines[live.secondLineIndex]?.endpoints ?? [])
      : [];

  const firstCoalSources = showFirstCoal
    ? listClosestCoalMines(liveState, firstEndpoints)
    : [];
  const secondCoalSources = showSecondCoal
    ? listClosestCoalMines(liveState, secondEndpoints)
    : [];
  const beerSources =
    showBeer && playerId !== undefined
      ? listValidBreweries(liveState, secondEndpoints, playerId)
      : [];
  const fcRemaining = applyTilePicks(firstCoalSources, live.firstCoalPicks);
  const scRemaining = applyTilePicks(secondCoalSources, live.secondCoalPicks);
  const beerRemaining = applyTilePicks(beerSources, live.beerPicks);

  const pickedChips: string[] = [];
  for (const p of live.firstCoalPicks) {
    pickedChips.push(
      p.kind === "TILE" ? `coal-1 @ ${shortId(p.tileId)}` : "coal-1 · market",
    );
  }
  for (const p of live.secondCoalPicks) {
    pickedChips.push(
      p.kind === "TILE" ? `coal-2 @ ${shortId(p.tileId)}` : "coal-2 · market",
    );
  }
  for (const p of live.beerPicks) {
    pickedChips.push(`beer @ ${shortId(p.tileId)}`);
  }

  return (
    <PickerShell
      title="Network resources — pick from multiple board sources"
      lead="Coal sources are restricted to mines tied at the closest hop distance from each line's endpoints. Beer must come from a brewery (own / connected opponent)."
      pickedChips={pickedChips}
      pendingChipCount={fcLeft + scLeft + beerLeft}
      onReset={
        live.firstCoalPicks.length +
          live.secondCoalPicks.length +
          live.beerPicks.length >
        0
          ? () => wizard.resetNetworkResources()
          : null
      }
      onCancel={() => wizard.reset()}
    >
      {showFirstCoal && (
        <SectionHeader>Coal — link 1 (closest mines)</SectionHeader>
      )}
      {showFirstCoal &&
        firstCoalSources.map((m) => {
          const remaining = fcRemaining.get(m.tileId) ?? 0;
          return (
            <SourceRow
              key={m.tileId}
              label={`Coal Mine @ ${m.cityName} (×${remaining})`}
              sub={`${m.distance} hop${m.distance === 1 ? "" : "s"} · seat ${m.ownerId + 1}`}
              disabled={remaining <= 0 || fcLeft === 0}
              onClick={() =>
                wizard.pickNetworkFirstCoal({
                  kind: "TILE",
                  tileId: m.tileId,
                } satisfies CoalSource)
              }
            />
          );
        })}
      {showFirstCoal && (
        <SourceRow
          label="Coal Market (paid)"
          disabled={fcLeft === 0}
          onClick={() =>
            wizard.pickNetworkFirstCoal({ kind: "MARKET" } satisfies CoalSource)
          }
        />
      )}
      {showSecondCoal && (
        <SectionHeader>Coal — link 2 (closest mines)</SectionHeader>
      )}
      {showSecondCoal &&
        secondCoalSources.map((m) => {
          const remaining = scRemaining.get(m.tileId) ?? 0;
          return (
            <SourceRow
              key={m.tileId}
              label={`Coal Mine @ ${m.cityName} (×${remaining})`}
              sub={`${m.distance} hop${m.distance === 1 ? "" : "s"} · seat ${m.ownerId + 1}`}
              disabled={remaining <= 0 || scLeft === 0}
              onClick={() =>
                wizard.pickNetworkSecondCoal({
                  kind: "TILE",
                  tileId: m.tileId,
                } satisfies CoalSource)
              }
            />
          );
        })}
      {showSecondCoal && (
        <SourceRow
          label="Coal Market (paid)"
          disabled={scLeft === 0}
          onClick={() =>
            wizard.pickNetworkSecondCoal({
              kind: "MARKET",
            } satisfies CoalSource)
          }
        />
      )}
      {showBeer && (
        <SectionHeader>Beer — second-rail brewery</SectionHeader>
      )}
      {showBeer &&
        beerSources.map((b) => {
          const remaining = beerRemaining.get(b.tileId) ?? 0;
          return (
            <SourceRow
              key={b.tileId}
              label={`Brewery @ ${b.cityName} (×${remaining})`}
              sub={`seat ${b.ownerId + 1}`}
              disabled={remaining <= 0 || beerLeft === 0}
              onClick={() =>
                wizard.pickNetworkBeer({
                  kind: "BREWERY",
                  tileId: b.tileId,
                } satisfies BreweryBeerSource)
              }
            />
          );
        })}
    </PickerShell>
  );
}

function SellResourcePicker() {
  const wizard = useWizard();
  const engine = useEngine();
  if (wizard.state.phase !== "AWAITING_SELL_RESOURCES") return null;
  const live = wizard.state;
  const liveState = engine.getState();
  const playerId = liveState.turnOrder[liveState.currentPlayerIndex];

  const totalLeft = live.orders.reduce(
    (a, o) => a + (o.beerNeed - o.beerPicks.length),
    0,
  );

  const pickedChips: string[] = [];
  for (const o of live.orders) {
    for (const p of o.beerPicks) {
      pickedChips.push(
        p.kind === "BREWERY"
          ? `beer @ ${shortId(p.tileId)}`
          : `merchant beer @ ${o.merchantCityName}`,
      );
    }
  }

  return (
    <PickerShell
      title="Sell beer — pick sources for each order"
      lead="Each tile being sold needs beer. Beer comes from your own breweries (no connection check), the buying merchant's own beer slot, or any opponent brewery connected to the tile's city."
      pickedChips={pickedChips}
      pendingChipCount={totalLeft}
      onReset={pickedChips.length > 0 ? () => wizard.resetSellResources() : null}
      onCancel={() => wizard.reset()}
    >
      {live.orders.map((order, idx) => {
        const left = order.beerNeed - order.beerPicks.length;
        const sources =
          left > 0 && playerId !== undefined
            ? listValidBeerSourcesForOrder(liveState, order, playerId)
            : [];
        // Track local cube counts so we don't double-claim a barrel
        // across orders within this dispatch.
        const remainingByKey = new Map<string, number>();
        for (const s of sources) {
          remainingByKey.set(beerKey(s), s.remaining);
        }
        for (const o of live.orders) {
          for (const p of o.beerPicks) {
            const k =
              p.kind === "BREWERY"
                ? `BREWERY:${p.tileId}`
                : `MERCHANT:${o.merchantCityName}#${o.merchantSlotIndex}`;
            remainingByKey.set(k, (remainingByKey.get(k) ?? 0) - 1);
          }
        }
        const tile = liveState.builtTiles.find((t) => t.id === order.tileId);
        const cityName = tile?.cityName ?? "?";
        return (
          <li key={order.tileId} className="picker-overlay__order">
            <div className="picker-overlay__order-head">
              <strong>
                Order {idx + 1}: {cityName} → {order.merchantCityName}
                {order.beerNeed > 0
                  ? ` (need ${order.beerNeed} beer)`
                  : " (no beer needed)"}
              </strong>
            </div>
            {left > 0 ? (
              <ul className="picker-overlay__sources">
                {sources.map((s) => {
                  const remaining = remainingByKey.get(beerKey(s)) ?? 0;
                  if (s.kind === "BREWERY" && s.tileId !== undefined) {
                    const sub =
                      s.ownerId !== undefined
                        ? `seat ${s.ownerId + 1}`
                        : "";
                    return (
                      <SourceRow
                        key={beerKey(s)}
                        label={`Brewery @ ${s.cityName} (×${remaining})`}
                        sub={sub}
                        disabled={remaining <= 0}
                        onClick={() =>
                          wizard.pickSellBeer(idx, {
                            kind: "BREWERY",
                            tileId: s.tileId!,
                          } satisfies BeerSource)
                        }
                      />
                    );
                  }
                  return (
                    <SourceRow
                      key={beerKey(s)}
                      label={`Merchant beer @ ${s.cityName}`}
                      sub={`fires merchant bonus`}
                      disabled={remaining <= 0}
                      onClick={() =>
                        wizard.pickSellBeer(idx, {
                          kind: "MERCHANT",
                        } satisfies BeerSource)
                      }
                    />
                  );
                })}
              </ul>
            ) : (
              <div className="picker-overlay__order-done">
                Beer picks complete.
              </div>
            )}
          </li>
        );
      })}
    </PickerShell>
  );
}

function beerKey(s: {
  kind: string;
  tileId?: string;
  cityName: string;
  merchantSlotIndex?: number;
}): string {
  if (s.kind === "BREWERY") return `BREWERY:${s.tileId ?? ""}`;
  return `MERCHANT:${s.cityName}#${s.merchantSlotIndex ?? 0}`;
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
  const paused = usePaused();
  return (
    <Modal className="picker-overlay" label={title} onClose={onCancel}>
        <header className="picker-overlay__title">{title}</header>
        <p className="picker-overlay__lead">{lead}</p>
        {paused ? <p role="status">Game paused. Resource choices are locked; you can cancel this selection.</p> : null}
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
    </Modal>
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
  sub?: string | undefined;
  disabled: boolean;
  onClick: () => void;
}) {
  const paused = usePaused();
  return (
    <li className="picker-overlay__source">
      <button
        type="button"
        className="action-btn"
        disabled={paused || disabled}
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
