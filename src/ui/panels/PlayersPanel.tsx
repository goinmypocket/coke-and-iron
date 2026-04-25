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
import { MoneyCoin } from "../icons/MoneyCoin";
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
        <span title="Victory points">{view.vp} VP</span>
        <span title="Income level (step)">
          L{stepToLevel(view.incomeStep)}
        </span>
        <span
          className="seat-stats__link"
          title={`${view.era === "CANAL" ? "Canal" : "Rail"} link tiles remaining`}
        >
          <LinkSupplyGlyph era={view.era} color={view.pawnColor} />
          ×{view.linkSupply}
        </span>
      </div>
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
    </Panel>
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

  // Manufacturer-style 2-col grid with grid-auto-flow: column. We render
  // every level row in document order; CSS lays out left column first
  // (5 rows) then right column (3 rows + 2 ghost cells to keep the
  // grid square).
  const levels = spec.levels;
  const isDouble = spec.doubleColSplitAfter !== undefined;

  return (
    <div className={classes}>
      <div className="mat-stack__label">
        <img
          src={INDUSTRY_ICON[spec.industry]}
          alt={INDUSTRY_FULL_LABEL[spec.industry]}
          className="mat-stack__icon"
        />
        <span>{spec.label}</span>
      </div>
      <div
        className={isDouble ? "mat-grid--double" : "mat-grid--single"}
      >
        {levels.map((level) => (
          <MatLevelRow
            key={level}
            level={level}
            count={counts.get(level) ?? 0}
            spec={specForLevel(spec.industry, level, tileCatalogue)}
            pawnColor={pawnColor}
            era={era}
            isNext={level === nextLevel}
            pickCount={level === nextLevel ? pickCount : 0}
            clickable={clickable && level === nextLevel}
            onClick={clickable && level === nextLevel ? onPick : undefined}
          />
        ))}
        {isDouble
          ? // 2 ghost cells so the right column ends with two blanks
            // beneath L8 and the grid stays a 2 × 5 rectangle.
            [0, 1].map((i) => (
              <div key={`ghost-${i}`} className="mat-level-row mat-level-row--ghost" />
            ))
          : null}
      </div>
      <div className="mat-stack__remaining">×{stack.length}</div>
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
            <CostCoin amount={spec.costMoney} />
            {spec.coalCost > 0 ? (
              <CostCube kind="coal" count={spec.coalCost} />
            ) : null}
            {spec.ironCost > 0 ? (
              <CostCube kind="iron" count={spec.ironCost} />
            ) : null}
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
      <div className="mat-level-row__count" title="Tiles remaining at this level">
        {pickCount > 0 ? `×${pickCount}/${count}` : `×${count}`}
      </div>
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

const COST_ICON = 14;

function CostCoin({ amount }: { amount: number }) {
  return (
    <svg
      className="mat-cost__icon"
      viewBox={`0 0 ${COST_ICON} ${COST_ICON}`}
      width={COST_ICON}
      height={COST_ICON}
      aria-hidden
    >
      <circle
        cx={COST_ICON / 2}
        cy={COST_ICON / 2}
        r={COST_ICON / 2 - 0.6}
        fill="#d4a017"
        stroke="#1a1a1a"
        strokeWidth={0.7}
      />
      <text
        x={COST_ICON / 2}
        y={COST_ICON / 2 + 2.6}
        textAnchor="middle"
        fontSize={7}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {amount}
      </text>
    </svg>
  );
}

function CostCube({
  kind,
  count,
}: {
  kind: "coal" | "iron";
  count: number;
}) {
  const fill = kind === "coal" ? "#1a1a1a" : "#a8825a";
  const strokeColor = kind === "coal" ? "#fffdf6" : "#1a1a1a";
  const textColor = kind === "coal" ? "#fffdf6" : "#1a1a1a";
  return (
    <svg
      className="mat-cost__icon"
      viewBox={`0 0 ${COST_ICON} ${COST_ICON}`}
      width={COST_ICON}
      height={COST_ICON}
      aria-hidden
    >
      <rect
        x={1}
        y={1}
        width={COST_ICON - 2}
        height={COST_ICON - 2}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={0.7}
      />
      <text
        x={COST_ICON / 2}
        y={COST_ICON / 2 + 2.4}
        textAnchor="middle"
        fontSize={6.5}
        fontWeight={700}
        fill={textColor}
      >
        {count}
      </text>
    </svg>
  );
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

function LinkSupplyGlyph({
  era,
  color,
}: {
  era: "CANAL" | "RAIL";
  color: string;
}) {
  if (era === "CANAL") {
    return (
      <svg
        width={16}
        height={10}
        viewBox="0 0 16 10"
        aria-hidden
        style={{ verticalAlign: "middle" }}
      >
        <path
          d="M1 5 Q1 8 4 8 L12 8 Q15 8 15 5 Z"
          fill={color}
          stroke="#1a1a1a"
          strokeWidth={0.8}
        />
        <line x1="8" y1="2" x2="8" y2="5" stroke="#1a1a1a" strokeWidth={1} />
        <polygon points="8,2 13,3.5 8,5" fill={color} stroke="#1a1a1a" strokeWidth={0.6} />
      </svg>
    );
  }
  return (
    <svg
      width={18}
      height={10}
      viewBox="0 0 18 10"
      aria-hidden
      style={{ verticalAlign: "middle" }}
    >
      <rect
        x={1}
        y={2}
        width={14}
        height={6}
        rx={1}
        fill={color}
        stroke="#1a1a1a"
        strokeWidth={0.8}
      />
      <circle cx={5} cy={9} r={1.4} fill="#1a1a1a" />
      <circle cx={11} cy={9} r={1.4} fill="#1a1a1a" />
    </svg>
  );
}
