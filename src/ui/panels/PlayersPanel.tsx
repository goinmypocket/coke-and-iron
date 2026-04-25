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
import { Panel } from "../layout/Panel";
import { TILE, TileFace } from "../tiles/TileFace";
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
        <span title="Money">£{view.money}</span>
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
  pickCount,
  wantingIndustry,
  onPick,
}: {
  spec: IndustryColumnSpec;
  stack: readonly number[];
  tileCatalogue: readonly IndustryTileSpec[];
  pawnColor: string;
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
  isNext,
  pickCount,
  clickable,
  onClick,
}: {
  level: number;
  count: number;
  spec: IndustryTileSpec | null;
  pawnColor: string;
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
    spec?.lightBulb ? "mat-level-row--lightbulb" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {spec ? (
        <svg
          className="mat-level-row__tile"
          viewBox={`0 0 ${TILE} ${TILE}`}
          aria-hidden
        >
          <TileFace
            spec={spec}
            ownerColor={pawnColor}
            face="flipped"
            context="mat"
          />
        </svg>
      ) : (
        <div className="mat-level-row__tile mat-level-row__tile--placeholder" />
      )}
      <div className="mat-level-row__margin">
        {spec ? (
          <>
            <span className="mat-level-row__cost">£{spec.costMoney}</span>
            {spec.coalCost > 0 ? (
              <span className="mat-level-row__resource">{spec.coalCost}c</span>
            ) : null}
            {spec.ironCost > 0 ? (
              <span className="mat-level-row__resource">{spec.ironCost}i</span>
            ) : null}
            {spec.beerToSell > 0 ? (
              <span className="mat-level-row__resource">{spec.beerToSell}b</span>
            ) : null}
            {spec.canalOnly ? (
              <span className="mat-level-row__era">canal</span>
            ) : spec.railOnly ? (
              <span className="mat-level-row__era">rail</span>
            ) : null}
            {spec.lightBulb ? (
              <NoDevelopGlyph title="Cannot Develop" />
            ) : null}
          </>
        ) : null}
      </div>
      <div className="mat-level-row__count">
        {pickCount > 0 ? `×${pickCount}/${count}` : `×${count}`}
      </div>
    </div>
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

function NoDevelopGlyph({ title }: { title?: string }) {
  // Small bulb icon with a diagonal strike-through. Stands in for the
  // "light-bulb" property on tiles that cannot be Developed (§5.3).
  return (
    <svg
      className="no-dev-glyph"
      viewBox="0 0 12 12"
      width={12}
      height={12}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {/* Bulb body */}
      <path
        d="M6 1.5 C 4 1.5 2.7 3 2.7 4.6 C 2.7 5.7 3.3 6.3 3.9 7.2 L 3.9 8.4 L 8.1 8.4 L 8.1 7.2 C 8.7 6.3 9.3 5.7 9.3 4.6 C 9.3 3 8 1.5 6 1.5 Z"
        fill="#f0d050"
        stroke="#1a1a1a"
        strokeWidth={0.7}
      />
      {/* Bulb base */}
      <rect x={4.2} y={8.4} width={3.6} height={1.4} fill="#888" stroke="#1a1a1a" strokeWidth={0.5} />
      <rect x={4.6} y={9.8} width={2.8} height={0.8} fill="#888" stroke="#1a1a1a" strokeWidth={0.5} />
      {/* Strike-through */}
      <line
        x1={1}
        y1={11}
        x2={11}
        y2={1}
        stroke="#b03030"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
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
