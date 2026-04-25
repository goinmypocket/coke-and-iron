// =============================================================================
// §11.3 Players panel — outer container with one sub-panel per seated
// player.
//
// Mat layout: every industry column shows one row per fixed level. The
// row carries the *flipped* TileFace (the side the player will see when
// the tile is sold or its resources drain — VP hex, link points, level
// in beige on a pawn-coloured field, industry icon) plus a side margin
// repeating the cost / coal / iron / beer-to-sell / era flag / no-dev
// fields that the flipped face drops. Only the lowest level still in
// the stack is clickable (mirrors stack[0], which the engine pops on
// Build / Develop). Manufacturer spans two columns (L1-5 / L6-8);
// every other industry is a single column. Tiles are square and the
// same TILE × TILE size everywhere — board, mat, and resource preview.
// =============================================================================
import { useEffect, useRef, useState, type ReactNode } from "react";
import { stepToLevel } from "../../engine";
import type {
  IndustryName,
  IndustryTileSpec,
  PlayerId,
} from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import {
  INDUSTRY_ICON,
  INDUSTRY_LABEL as INDUSTRY_FULL_LABEL,
} from "../industryIcons";
import { CoalIcon } from "../icons/CoalIcon";
import { CurrentIncomeIcon } from "../icons/CurrentIncomeIcon";
import { IronIcon } from "../icons/IronIcon";
import { LinkTileIcon } from "../icons/LinkTileIcon";
import { MoneyCoin } from "../icons/MoneyCoin";
import { VictoryPointsIcon } from "../icons/VictoryPointsIcon";
import { Panel } from "../layout/Panel";
import { TILE, TileFace } from "../tiles/TileFace";
import { TileSideColumn } from "../tiles/TileSideColumn";
import { useWizard } from "../wizards/WizardProvider";

interface IndustryColumnSpec {
  industry: IndustryName;
  label: string;
  levels: readonly number[];
  // Manufacturer only: split levels into two side-by-side columns.
  doubleColSplitAfter?: number;
}

const INDUSTRY_COLUMNS: readonly IndustryColumnSpec[] = [
  { industry: "COAL_MINE", label: "Coal", levels: [1, 2, 3, 4] },
  { industry: "IRON_WORKS", label: "Iron", levels: [1, 2, 3, 4] },
  { industry: "BREWERY", label: "Brewery", levels: [1, 2, 3, 4] },
  { industry: "COTTON_MILL", label: "Cotton", levels: [1, 2, 3, 4] },
  {
    industry: "MANUFACTURER",
    label: "Manufacturer",
    levels: [1, 2, 3, 4, 5, 6, 7, 8],
    doubleColSplitAfter: 5,
  },
  { industry: "POTTERY", label: "Pottery", levels: [1, 2, 3, 4, 5] },
];

export function PlayersPanel() {
  const turnOrder = useGameState((s) => s.turnOrder, shallowEqual);
  return (
    <Panel id="players" title="Players">
      <div className="players-panel">
        {turnOrder.map((seatId) => (
          <PlayerSubPanel key={seatId} seatId={seatId} />
        ))}
      </div>
    </Panel>
  );
}

function PlayerSubPanel({ seatId }: { seatId: PlayerId }) {
  const wizard = useWizard();
  const view = useGameState((s) => {
    const p = s.players.find((pp) => pp.id === seatId);
    if (!p) return null;
    const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
    return {
      name: p.displayName,
      pawnColor: p.pawnColor,
      money: p.money,
      vp: p.vp,
      incomeStep: p.incomeStep,
      linkSupply: p.linkSupply,
      isActive: activeId === seatId,
      stacks: p.mat.stacks,
      era: s.era,
      tileCatalogue: s.tileCatalogue,
    };
  }, shallowEqual);

  if (!view) return null;

  const wantingIndustry =
    (wizard.state.phase === "AWAITING_DEVELOP_INPUTS" &&
      wizard.state.developSeatId === seatId) ||
    (wizard.state.phase === "AWAITING_BUILD_INPUTS" && view.isActive) ||
    (wizard.state.phase === "AWAITING_SELL_GLOUCESTER" && view.isActive);
  const pickCounts = countBy(
    wizard.state.phase === "AWAITING_DEVELOP_INPUTS"
      ? wizard.state.industries
      : wizard.state.phase === "AWAITING_SELL_GLOUCESTER"
        ? wizard.state.industries
        : wizard.state.phase === "AWAITING_BUILD_INPUTS" &&
            wizard.state.industry !== null
          ? [wizard.state.industry]
          : [],
  );

  return (
    <Panel
      id={`player_${seatId + 1}`}
      title={`${view.name}${view.isActive ? " ←" : ""}`}
      borderColor={view.pawnColor}
      maximizable
    >
      <div className="seat-stats">
        <span title="Money" className="seat-stats__money">
          <MoneyCoin amount={view.money} size={13} />
        </span>
        <span title="Victory points">
          <VictoryPointsIcon amount={view.vp} size={14} />
        </span>
        <span title="Current income level">
          <CurrentIncomeIcon amount={stepToLevel(view.incomeStep)} size={14} />
        </span>
        <span
          className="seat-stats__link"
          title={`${view.era === "CANAL" ? "Canal" : "Rail"} link tiles remaining`}
        >
          <LinkTileIcon era={view.era} color={view.pawnColor} size={12} />
          ×{view.linkSupply}
        </span>
      </div>
      <MatScaler>
        <div className="mat-grid">
          {INDUSTRY_COLUMNS.map((col) => (
            <IndustryColumn
              key={col.industry}
              spec={col}
              stack={view.stacks[col.industry]}
              tileCatalogue={view.tileCatalogue}
              pawnColor={view.pawnColor}
              era={view.era}
              pickCount={pickCounts.get(col.industry) ?? 0}
              wantingIndustry={wantingIndustry}
              onPick={() => wizard.pickIndustry(seatId, col.industry)}
            />
          ))}
        </div>
      </MatScaler>
    </Panel>
  );
}

/** Scales the mat down to fit the host panel when the natural mat
 *  width exceeds the container, leaving the natural size when the
 *  panel is maximised and there's room to spare. The wrapper height
 *  collapses with the scaled content so adjacent rows in the panel
 *  stay tight against the mat. */
function MatScaler({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [innerH, setInnerH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const recompute = () => {
      const aw = outer.clientWidth;
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      if (aw === 0 || iw === 0) return;
      const next = Math.min(1, aw / iw);
      setScale(next);
      setInnerH(ih * next);
    };
    recompute();
    const obs = new ResizeObserver(recompute);
    obs.observe(outer);
    obs.observe(inner);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={outerRef} className="mat-scaler" style={{ height: innerH }}>
      <div
        ref={innerRef}
        className="mat-scaler__inner"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: "max-content",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function IndustryColumn({
  spec,
  stack,
  tileCatalogue,
  pawnColor,
  era,
  pickCount,
  wantingIndustry,
  onPick,
}: {
  spec: IndustryColumnSpec;
  stack: readonly number[];
  tileCatalogue: readonly IndustryTileSpec[];
  pawnColor: string;
  era: "CANAL" | "RAIL";
  pickCount: number;
  wantingIndustry: boolean;
  onPick: () => void;
}) {
  const counts = levelCounts(stack, tileCatalogue);
  const nextLevel = nextPopLevel(stack, tileCatalogue);
  const nextSpec =
    nextLevel === null
      ? null
      : specForLevel(spec.industry, nextLevel, tileCatalogue);
  const clickable =
    wantingIndustry && nextSpec !== null && !nextSpec.lightBulb;

  const classes = [
    "mat-stack",
    spec.doubleColSplitAfter !== undefined ? "mat-stack--double" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Document-order list for the level grid. Levels render top-to-
  // bottom in display, but we want LEVEL 1 AT THE BOTTOM so the
  // levels in the array are emitted highest-first. Manufacturer
  // splits across two columns (L1-5 / L6-8); the right column gets
  // ghost cells at the top so its bottom row aligns with L1's row
  // in the left column.
  const isDouble = spec.doubleColSplitAfter !== undefined;
  const renderCells: ({ kind: "level"; level: number } | { kind: "ghost" })[] =
    [];
  if (isDouble) {
    const split = spec.doubleColSplitAfter!;
    const leftLevels = spec.levels.slice(0, split).reverse();
    const rightLevels = spec.levels.slice(split).reverse();
    for (const lv of leftLevels) renderCells.push({ kind: "level", level: lv });
    const rightRows = leftLevels.length;
    const ghostsNeeded = rightRows - rightLevels.length;
    for (let i = 0; i < ghostsNeeded; i++) renderCells.push({ kind: "ghost" });
    for (const lv of rightLevels) renderCells.push({ kind: "level", level: lv });
  } else {
    for (const lv of [...spec.levels].reverse()) {
      renderCells.push({ kind: "level", level: lv });
    }
  }

  return (
    <div className={classes}>
      <div className={isDouble ? "mat-grid--double" : "mat-grid--single"}>
        {renderCells.map((cell, i) =>
          cell.kind === "ghost" ? (
            <div
              key={`ghost-${i}`}
              className="mat-level-row mat-level-row--ghost"
            />
          ) : (
            <MatLevelRow
              key={cell.level}
              level={cell.level}
              count={counts.get(cell.level) ?? 0}
              spec={specForLevel(spec.industry, cell.level, tileCatalogue)}
              pawnColor={pawnColor}
              era={era}
              isNext={cell.level === nextLevel}
              pickCount={cell.level === nextLevel ? pickCount : 0}
              clickable={clickable && cell.level === nextLevel}
              onClick={
                clickable && cell.level === nextLevel ? onPick : undefined
              }
            />
          ),
        )}
      </div>
      <div className="mat-stack__label">
        <img
          src={INDUSTRY_ICON[spec.industry]}
          alt={INDUSTRY_FULL_LABEL[spec.industry]}
          className="mat-stack__icon"
        />
        <span>{spec.label}</span>
      </div>
    </div>
  );
}

function MatLevelRow({
  level,
  count,
  spec,
  pawnColor,
  era,
  isNext,
  pickCount,
  clickable,
  onClick,
}: {
  level: number;
  count: number;
  spec: IndustryTileSpec | null;
  pawnColor: string;
  era: "CANAL" | "RAIL";
  isNext: boolean;
  pickCount: number;
  clickable: boolean;
  onClick: (() => void) | undefined;
}) {
  const cls = [
    "mat-level-row",
    count === 0 ? "mat-level-row--gone" : "",
    isNext ? "mat-level-row--next" : "",
    pickCount > 0 ? "mat-level-row--picked" : "",
    clickable ? "mat-level-row--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // Production count for Coal/Iron/Brewery: tile is "fresh" on the mat
  // so the BL count reads its level capacity (rail-era brewery uses
  // resourceCapacityRail when defined).
  const matResources = spec ? matCapacityFor(spec, era) : 0;
  return (
    <div
      className={cls}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="mat-level-row__costs">
        {spec ? (
          <>
            <MoneyCoin amount={spec.costMoney} size={13} />
            {Array.from({ length: spec.coalCost }).map((_, i) => (
              <CoalIcon key={`c${i}`} size={13} />
            ))}
            {Array.from({ length: spec.ironCost }).map((_, i) => (
              <IronIcon key={`i${i}`} size={13} />
            ))}
          </>
        ) : null}
      </div>
      {spec ? (
        <svg
          className="mat-level-row__tile"
          viewBox={`0 0 ${TILE} ${TILE}`}
          aria-hidden
        >
          <TileFace
            spec={spec}
            ownerColor={pawnColor}
            face="unflipped"
            resources={matResources}
            stackCount={count}
          />
        </svg>
      ) : (
        <div className="mat-level-row__tile mat-level-row__tile--placeholder" />
      )}
      {spec ? (
        <TileSideColumn spec={spec} />
      ) : (
        <div className="mat-side-col mat-side-col--placeholder" />
      )}
    </div>
  );
}

function matCapacityFor(
  spec: IndustryTileSpec,
  era: "CANAL" | "RAIL",
): number {
  if (
    spec.industry !== "COAL_MINE" &&
    spec.industry !== "IRON_WORKS" &&
    spec.industry !== "BREWERY"
  ) {
    return 0;
  }
  if (era === "RAIL" && spec.resourceCapacityRail !== null) {
    return spec.resourceCapacityRail;
  }
  return spec.resourceCapacity;
}

function countBy(
  industries: readonly IndustryName[],
): ReadonlyMap<IndustryName, number> {
  const m = new Map<IndustryName, number>();
  for (const ind of industries) m.set(ind, (m.get(ind) ?? 0) + 1);
  return m;
}

function levelCounts(
  stack: readonly number[],
  catalogue: readonly IndustryTileSpec[],
): ReadonlyMap<number, number> {
  const m = new Map<number, number>();
  for (const idx of stack) {
    const spec = catalogue[idx];
    if (!spec) continue;
    m.set(spec.level, (m.get(spec.level) ?? 0) + 1);
  }
  return m;
}

function specForLevel(
  industry: IndustryName,
  level: number,
  catalogue: readonly IndustryTileSpec[],
): IndustryTileSpec | null {
  return (
    catalogue.find((s) => s.industry === industry && s.level === level) ?? null
  );
}

function nextPopLevel(
  stack: readonly number[],
  catalogue: readonly IndustryTileSpec[],
): number | null {
  const idx = stack[0];
  if (idx === undefined) return null;
  return catalogue[idx]?.level ?? null;
}

