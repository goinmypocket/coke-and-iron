// =============================================================================
// §11.3 Players panel — outer container with one sub-panel per seated
// player.
//
// Mat layout: every industry column shows one row per fixed level. Each
// row carries the *flipped* TileFace plus a side margin showing the
// cost/coal/iron/era/etc. fields the flipped face drops, with a side
// column for VP/income/link-points bonuses on the right. Only the
// lowest level still in the stack is clickable. Manufacturer spans two
// sub-columns (L1-5 / L6-8); every other industry is a single column.
//
// The whole mat is rendered as ONE SVG per seat with a viewBox in
// fixed units (TILE = 40). The SVG's CSS width fills the seat
// sub-panel; the viewBox means everything inside scales uniformly with
// browser zoom and panel resize, with no overflow possible (containment
// is enforced by SVG semantics, not by `overflow: hidden`).
// =============================================================================
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
import { SIDE_COL_W, TileSideColumn } from "../tiles/TileSideColumn";
import { useWizard } from "../wizards/WizardProvider";

// Mat geometry in viewBox units (same scale as TILE on the board).
const ROW_H = TILE;                                    // 40
const COST_W = 14;                                     // money + coal + iron column
const SIDE_W = SIDE_COL_W;                             // 17.14
const COL_W = COST_W + TILE + SIDE_W;                  // ~71
const LABEL_BAND = 14;                                 // industry icon + name strip
const COST_ICON = COST_W * 0.95;                       // cost-column icon size
const COL_SEPARATOR = "#1a1a1a";

interface IndustryColumnSpec {
  industry: IndustryName;
  label: string;
  levels: readonly number[];
  // Manufacturer only: split levels into two side-by-side sub-columns.
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

// Maximum visible levels in any single column (drives mat height).
const MAX_VISIBLE_LEVELS = INDUSTRY_COLUMNS.reduce((m, c) => {
  const visible = c.doubleColSplitAfter ?? c.levels.length;
  return Math.max(m, visible);
}, 0);

// Total horizontal extent of the mat: every column is COL_W; double
// columns count twice.
const MAT_W = INDUSTRY_COLUMNS.reduce(
  (sum, c) => sum + (c.doubleColSplitAfter !== undefined ? COL_W * 2 : COL_W),
  0,
);
const MAT_H = MAX_VISIBLE_LEVELS * ROW_H + LABEL_BAND;

export function PlayersPanel() {
  const turnOrder = useGameState((s) => s.turnOrder, shallowEqual);
  return (
    <Panel id="player_mats" title="Player Mats">
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
    >
      <SeatStats
        money={view.money}
        vp={view.vp}
        incomeStep={view.incomeStep}
        linkSupply={view.linkSupply}
        era={view.era}
        pawnColor={view.pawnColor}
      />
      <MatSvg
        stacks={view.stacks}
        tileCatalogue={view.tileCatalogue}
        pawnColor={view.pawnColor}
        era={view.era}
        wantingIndustry={wantingIndustry}
        pickCounts={pickCounts}
        onPickIndustry={(ind) => wizard.pickIndustry(seatId, ind)}
      />
    </Panel>
  );
}

function SeatStats({
  money,
  vp,
  incomeStep,
  linkSupply,
  era,
  pawnColor,
}: {
  money: number;
  vp: number;
  incomeStep: number;
  linkSupply: number;
  era: "CANAL" | "RAIL";
  pawnColor: string;
}) {
  return (
    <div className="seat-stats">
      <span title="Money">
        <MoneyCoin amount={money} size={13} />
      </span>
      <span title="Victory points">
        <VictoryPointsIcon amount={vp} size={14} />
      </span>
      <span title="Current income level">
        <CurrentIncomeIcon amount={stepToLevel(incomeStep)} size={14} />
      </span>
      <span
        className="seat-stats__link"
        title={`${era === "CANAL" ? "Canal" : "Rail"} link tiles remaining`}
      >
        <LinkTileIcon era={era} color={pawnColor} size={12} />
        ×{linkSupply}
      </span>
    </div>
  );
}

function MatSvg({
  stacks,
  tileCatalogue,
  pawnColor,
  era,
  wantingIndustry,
  pickCounts,
  onPickIndustry,
}: {
  stacks: Record<IndustryName, readonly number[]>;
  tileCatalogue: readonly IndustryTileSpec[];
  pawnColor: string;
  era: "CANAL" | "RAIL";
  wantingIndustry: boolean;
  pickCounts: ReadonlyMap<IndustryName, number>;
  onPickIndustry: (ind: IndustryName) => void;
}) {
  // Walk columns left-to-right, accumulating x offsets. Single columns
  // advance by COL_W; doubles advance by 2 * COL_W. The label band sits
  // in the bottom LABEL_BAND units of the viewBox.
  let x = 0;
  const columns: { x: number; w: number; spec: IndustryColumnSpec }[] = [];
  for (const spec of INDUSTRY_COLUMNS) {
    const w = spec.doubleColSplitAfter !== undefined ? COL_W * 2 : COL_W;
    columns.push({ x, w, spec });
    x += w;
  }
  return (
    <svg
      className="mat-svg"
      viewBox={`0 0 ${MAT_W} ${MAT_H}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {columns.map((col, i) => (
        <g key={col.spec.industry} transform={`translate(${col.x}, 0)`}>
          {i > 0 ? (
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={MAX_VISIBLE_LEVELS * ROW_H}
              stroke={COL_SEPARATOR}
              strokeWidth={0.6}
            />
          ) : null}
          <IndustryColumnSvg
            spec={col.spec}
            stack={stacks[col.spec.industry]}
            tileCatalogue={tileCatalogue}
            pawnColor={pawnColor}
            era={era}
            pickCount={pickCounts.get(col.spec.industry) ?? 0}
            wantingIndustry={wantingIndustry}
            onPick={() => onPickIndustry(col.spec.industry)}
          />
          <ColumnLabel
            industry={col.spec.industry}
            label={col.spec.label}
            width={col.w}
          />
        </g>
      ))}
    </svg>
  );
}

function IndustryColumnSvg({
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

  // Render levels highest-at-top so L1 sits at the bottom (where the
  // engine pops from). Manufacturer's right sub-column has L8 at top
  // and L6 at bottom, with two ghost rows above L8 so its bottom row
  // shares a baseline with L1 in the left sub-column.
  if (spec.doubleColSplitAfter !== undefined) {
    const split = spec.doubleColSplitAfter;
    const leftLevels = spec.levels.slice(0, split).reverse(); // L5..L1
    const rightLevels = spec.levels.slice(split).reverse();   // L8..L6
    const leftRows = leftLevels.length;
    const rightGhosts = leftRows - rightLevels.length;
    return (
      <g>
        {leftLevels.map((lv, i) => (
          <MatLevelRowSvg
            key={`L${lv}`}
            x={0}
            y={i * ROW_H}
            level={lv}
            count={counts.get(lv) ?? 0}
            spec={specForLevel(spec.industry, lv, tileCatalogue)}
            pawnColor={pawnColor}
            era={era}
            isNext={lv === nextLevel}
            pickCount={lv === nextLevel ? pickCount : 0}
            clickable={clickable && lv === nextLevel}
            onClick={
              clickable && lv === nextLevel ? onPick : undefined
            }
          />
        ))}
        {rightLevels.map((lv, i) => (
          <MatLevelRowSvg
            key={`R${lv}`}
            x={COL_W}
            y={(i + rightGhosts) * ROW_H}
            level={lv}
            count={counts.get(lv) ?? 0}
            spec={specForLevel(spec.industry, lv, tileCatalogue)}
            pawnColor={pawnColor}
            era={era}
            isNext={lv === nextLevel}
            pickCount={lv === nextLevel ? pickCount : 0}
            clickable={clickable && lv === nextLevel}
            onClick={
              clickable && lv === nextLevel ? onPick : undefined
            }
          />
        ))}
      </g>
    );
  }
  // Single-column industry.
  const reversed = [...spec.levels].reverse();
  const ghosts = MAX_VISIBLE_LEVELS - reversed.length;
  return (
    <g>
      {reversed.map((lv, i) => (
        <MatLevelRowSvg
          key={lv}
          x={0}
          y={(i + ghosts) * ROW_H}
          level={lv}
          count={counts.get(lv) ?? 0}
          spec={specForLevel(spec.industry, lv, tileCatalogue)}
          pawnColor={pawnColor}
          era={era}
          isNext={lv === nextLevel}
          pickCount={lv === nextLevel ? pickCount : 0}
          clickable={clickable && lv === nextLevel}
          onClick={clickable && lv === nextLevel ? onPick : undefined}
        />
      ))}
    </g>
  );
}

function MatLevelRowSvg({
  x,
  y,
  level: _level,
  count,
  spec,
  pawnColor,
  era,
  isNext,
  pickCount,
  clickable,
  onClick,
}: {
  x: number;
  y: number;
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
    "mat-row",
    count === 0 ? "mat-row--gone" : "",
    isNext ? "mat-row--next" : "",
    pickCount > 0 ? "mat-row--picked" : "",
    clickable ? "mat-row--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const matResources = spec ? matCapacityFor(spec, era) : 0;
  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={cls}
      onClick={onClick}
    >
      {/* Background — picks up hover/pick styling via CSS. */}
      <rect
        x={0}
        y={0}
        width={COL_W}
        height={ROW_H}
        fill="var(--panel-bg)"
        stroke="#1a1a1a"
        strokeWidth={isNext ? 0.8 : 0.4}
      />
      {spec ? (
        <>
          <CostStack spec={spec} />
          <g transform={`translate(${COST_W}, 0)`}>
            <TileFace
              spec={spec}
              ownerColor={pawnColor}
              face="unflipped"
              resources={matResources}
              stackCount={count}
            />
          </g>
          <g transform={`translate(${COST_W + TILE}, 0)`}>
            <TileSideColumn spec={spec} />
          </g>
        </>
      ) : null}
      {pickCount > 0 ? (
        <rect
          x={0.5}
          y={0.5}
          width={COL_W - 1}
          height={ROW_H - 1}
          fill="none"
          stroke="var(--warm-gold)"
          strokeWidth={1.6}
        />
      ) : null}
    </g>
  );
}

function CostStack({ spec }: { spec: IndustryTileSpec }) {
  // Vertical stack centred in COST_W: money on top, then coal cubes,
  // then iron cubes. Total height is ROW_H; items are evenly spaced.
  const items: { kind: "money" | "coal" | "iron" }[] = [{ kind: "money" }];
  for (let i = 0; i < spec.coalCost; i++) items.push({ kind: "coal" });
  for (let i = 0; i < spec.ironCost; i++) items.push({ kind: "iron" });
  const n = items.length;
  // Pack inside ROW_H with even gaps. Each glyph is COST_ICON tall.
  const totalGlyph = n * COST_ICON;
  const gap = n > 1 ? Math.max(0, (ROW_H - totalGlyph) / (n + 1)) : 0;
  const startY =
    n === 1 ? (ROW_H - COST_ICON) / 2 : gap;
  return (
    <g>
      {items.map((item, i) => {
        const cy = startY + i * (COST_ICON + gap);
        const cx = (COST_W - COST_ICON) / 2;
        if (item.kind === "money") {
          return (
            <MoneyCoin
              key={i}
              amount={spec.costMoney}
              size={COST_ICON}
              x={cx}
              y={cy}
            />
          );
        }
        if (item.kind === "coal") {
          return <CoalIcon key={i} size={COST_ICON} x={cx} y={cy} />;
        }
        return <IronIcon key={i} size={COST_ICON} x={cx} y={cy} />;
      })}
    </g>
  );
}

function ColumnLabel({
  industry,
  label,
  width,
}: {
  industry: IndustryName;
  label: string;
  width: number;
}) {
  // Label band sits at the bottom of the viewBox: industry icon on the
  // left, label text to its right, both centred horizontally.
  const y = MAX_VISIBLE_LEVELS * ROW_H;
  const iconSize = LABEL_BAND - 2;
  const labelFontSize = LABEL_BAND * 0.62;
  // Approximate text width so we can centre icon + text together.
  const textWidth = label.length * labelFontSize * 0.5;
  const totalW = iconSize + 2 + textWidth;
  const startX = (width - totalW) / 2;
  return (
    <g transform={`translate(0, ${y})`}>
      <image
        href={INDUSTRY_ICON[industry]}
        x={startX}
        y={1}
        width={iconSize}
        height={iconSize}
        preserveAspectRatio="xMidYMid meet"
        aria-label={INDUSTRY_FULL_LABEL[industry]}
      />
      <text
        x={startX + iconSize + 2}
        y={LABEL_BAND - 3}
        fontSize={labelFontSize}
        fontWeight={600}
        fill="var(--muted)"
        style={{ textTransform: "uppercase" }}
      >
        {label}
      </text>
    </g>
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
