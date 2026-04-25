// =============================================================================
// §11.3 Players panel — outer container with one sub-panel per seated
// player. Each sub-panel paints its outer border in the seat's pawn colour
// and exposes a stats bar + mat grid.
//
// Mat layout (per published mat shape):
//   Coal / Iron / Brewery / Cotton — single-column stack: top-of-stack
//      tile + remaining count below. Top tile is the click-target when
//      a wizard is asking for an industry pick.
//   Manufacturer — spans two columns. Eight fixed level rows laid out
//      L1..L5 in the left column, L6..L8 in the right. Each row shows
//      the level's full cost / VP / income / link-points / beer-to-sell
//      with a count badge. The lowest level with any remaining tile is
//      the click-target (mirrors stack[0]).
//   Pottery — single column with five fixed level rows (L1..L5). Same
//      click-target semantics. L1 / L3 are light-bulb (no Develop).
//
// Picking a tile dispatches wizard.pickIndustry(seatId, industry); the
// engine pops stack[0] regardless of which row the user clicked, so the
// click target is the row the engine would actually consume.
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
import { useWizard } from "../wizards/WizardProvider";

const SIMPLE_INDUSTRY_ORDER: readonly IndustryName[] = [
  "COAL_MINE",
  "IRON_WORKS",
  "BREWERY",
  "COTTON_MILL",
];

const INDUSTRY_LABEL: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: "Coal",
  IRON_WORKS: "Iron",
  BREWERY: "Brewery",
  COTTON_MILL: "Cotton",
  MANUFACTURER: "Manuf.",
  POTTERY: "Pottery",
};

const MANUFACTURER_LEFT: readonly number[] = [1, 2, 3, 4, 5];
const MANUFACTURER_RIGHT: readonly number[] = [6, 7, 8];
const POTTERY_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

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

  // The mat accepts industry picks during Develop (any number of times,
  // up to 2), Build (just once — engine pops the lowest tile of the
  // chosen industry), and the Sell-Gloucester sub-state (one pick per
  // Gloucester beer consumed). All three flows scope to the active seat.
  const wantingIndustry =
    (wizard.state.phase === "AWAITING_DEVELOP_INPUTS" &&
      wizard.state.developSeatId === seatId) ||
    (wizard.state.phase === "AWAITING_BUILD_INPUTS" && view.isActive) ||
    (wizard.state.phase === "AWAITING_SELL_GLOUCESTER" && view.isActive);
  // industries can repeat (Develop allows 2-of-same per §5.3) — so render a
  // count rather than a binary picked / not-picked state.
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
        {SIMPLE_INDUSTRY_ORDER.map((industry) => {
          const stack = view.stacks[industry];
          const topIdx = stack[0];
          const topSpec =
            topIdx === undefined ? null : view.tileCatalogue[topIdx] ?? null;
          const pickCount = pickCounts.get(industry) ?? 0;
          const clickable =
            wantingIndustry && topSpec !== null && !topSpec.lightBulb;
          return (
            <MatStack
              key={industry}
              industry={industry}
              topSpec={topSpec}
              remaining={stack.length}
              pickCount={pickCount}
              clickable={clickable}
              onClick={
                clickable
                  ? () => wizard.pickIndustry(seatId, industry)
                  : undefined
              }
            />
          );
        })}
        <ManufacturerMat
          stack={view.stacks.MANUFACTURER}
          tileCatalogue={view.tileCatalogue}
          pickCount={pickCounts.get("MANUFACTURER") ?? 0}
          wantingIndustry={wantingIndustry}
          onPick={() => wizard.pickIndustry(seatId, "MANUFACTURER")}
        />
        <PotteryMat
          stack={view.stacks.POTTERY}
          tileCatalogue={view.tileCatalogue}
          pickCount={pickCounts.get("POTTERY") ?? 0}
          wantingIndustry={wantingIndustry}
          onPick={() => wizard.pickIndustry(seatId, "POTTERY")}
        />
      </div>
    </Panel>
  );
}

function MatStack({
  industry,
  topSpec,
  remaining,
  pickCount,
  clickable,
  onClick,
}: {
  industry: IndustryName;
  topSpec: IndustryTileSpec | null;
  remaining: number;
  pickCount: number;
  clickable: boolean;
  onClick: (() => void) | undefined;
}) {
  const tileClassName = [
    "mat-tile",
    pickCount > 0 ? "mat-tile--picked" : "",
    clickable ? "mat-tile--clickable" : "",
    topSpec?.lightBulb ? "mat-tile--lightbulb" : "",
    topSpec === null ? "mat-tile--empty" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const role = clickable ? "button" : undefined;
  const tabIndex = clickable ? 0 : undefined;

  return (
    <div className="mat-stack">
      <div className="mat-stack__label">
        <img
          src={INDUSTRY_ICON[industry]}
          alt={INDUSTRY_FULL_LABEL[industry]}
          className="mat-stack__icon"
        />
        <span>{INDUSTRY_LABEL[industry]}</span>
      </div>
      <div
        className={tileClassName}
        onClick={onClick}
        role={role}
        tabIndex={tabIndex}
      >
        {topSpec === null ? (
          <span className="mat-tile__empty">—</span>
        ) : (
          <>
            <div className="mat-tile__level">L{topSpec.level}</div>
            <div className="mat-tile__cost">
              £{topSpec.costMoney}
              {topSpec.coalCost > 0 ? ` · ${topSpec.coalCost}c` : ""}
              {topSpec.ironCost > 0 ? ` · ${topSpec.ironCost}i` : ""}
            </div>
            <div className="mat-tile__bonus">
              {topSpec.vp > 0 ? `${topSpec.vp}VP` : ""}
              {topSpec.incomeBonus > 0 ? ` +${topSpec.incomeBonus}inc` : ""}
              {topSpec.linkPoints > 0 ? ` ${topSpec.linkPoints}lp` : ""}
            </div>
            {topSpec.lightBulb ? (
              <div
                className="mat-tile__flag"
                title="Light-bulb — cannot Develop"
              >
                no-dev
              </div>
            ) : null}
            {pickCount > 0 ? (
              <div className="mat-tile__pick-count">×{pickCount}</div>
            ) : null}
          </>
        )}
      </div>
      <div className="mat-stack__remaining">×{remaining}</div>
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

/** The next-to-pop level — i.e. the level of stack[0]. */
function nextPopLevel(
  stack: readonly number[],
  catalogue: readonly IndustryTileSpec[],
): number | null {
  const idx = stack[0];
  if (idx === undefined) return null;
  return catalogue[idx]?.level ?? null;
}

function ManufacturerMat({
  stack,
  tileCatalogue,
  pickCount,
  wantingIndustry,
  onPick,
}: {
  stack: readonly number[];
  tileCatalogue: readonly IndustryTileSpec[];
  pickCount: number;
  wantingIndustry: boolean;
  onPick: () => void;
}) {
  const counts = levelCounts(stack, tileCatalogue);
  const nextLevel = nextPopLevel(stack, tileCatalogue);
  const nextSpec =
    nextLevel === null
      ? null
      : specForLevel("MANUFACTURER", nextLevel, tileCatalogue);
  const clickable =
    wantingIndustry && nextSpec !== null && !nextSpec.lightBulb;
  return (
    <div className="mat-stack mat-stack--mfg">
      <div className="mat-stack__label">
        <img
          src={INDUSTRY_ICON.MANUFACTURER}
          alt={INDUSTRY_FULL_LABEL.MANUFACTURER}
          className="mat-stack__icon"
        />
        <span>Manufacturer</span>
      </div>
      <div className="mat-mfg-grid">
        {MANUFACTURER_LEFT.map((level) => (
          <LevelRow
            key={`L${level}`}
            level={level}
            count={counts.get(level) ?? 0}
            spec={specForLevel("MANUFACTURER", level, tileCatalogue)}
            isNext={level === nextLevel}
            picked={level === nextLevel && pickCount > 0}
            pickCount={level === nextLevel ? pickCount : 0}
            clickable={clickable && level === nextLevel}
            onClick={clickable && level === nextLevel ? onPick : undefined}
          />
        ))}
        {MANUFACTURER_RIGHT.map((level) => (
          <LevelRow
            key={`R${level}`}
            level={level}
            count={counts.get(level) ?? 0}
            spec={specForLevel("MANUFACTURER", level, tileCatalogue)}
            isNext={level === nextLevel}
            picked={level === nextLevel && pickCount > 0}
            pickCount={level === nextLevel ? pickCount : 0}
            clickable={clickable && level === nextLevel}
            onClick={clickable && level === nextLevel ? onPick : undefined}
          />
        ))}
        {/* Two empty cells in the right column so col 2 row 4-5 stay blank. */}
        <div className="mat-row mat-row--ghost" />
        <div className="mat-row mat-row--ghost" />
      </div>
      <div className="mat-stack__remaining">×{stack.length}</div>
    </div>
  );
}

function PotteryMat({
  stack,
  tileCatalogue,
  pickCount,
  wantingIndustry,
  onPick,
}: {
  stack: readonly number[];
  tileCatalogue: readonly IndustryTileSpec[];
  pickCount: number;
  wantingIndustry: boolean;
  onPick: () => void;
}) {
  const counts = levelCounts(stack, tileCatalogue);
  const nextLevel = nextPopLevel(stack, tileCatalogue);
  const nextSpec =
    nextLevel === null
      ? null
      : specForLevel("POTTERY", nextLevel, tileCatalogue);
  const clickable =
    wantingIndustry && nextSpec !== null && !nextSpec.lightBulb;
  return (
    <div className="mat-stack mat-stack--pottery">
      <div className="mat-stack__label">
        <img
          src={INDUSTRY_ICON.POTTERY}
          alt={INDUSTRY_FULL_LABEL.POTTERY}
          className="mat-stack__icon"
        />
        <span>Pottery</span>
      </div>
      <div className="mat-pottery-grid">
        {POTTERY_LEVELS.map((level) => (
          <LevelRow
            key={level}
            level={level}
            count={counts.get(level) ?? 0}
            spec={specForLevel("POTTERY", level, tileCatalogue)}
            isNext={level === nextLevel}
            picked={level === nextLevel && pickCount > 0}
            pickCount={level === nextLevel ? pickCount : 0}
            clickable={clickable && level === nextLevel}
            onClick={clickable && level === nextLevel ? onPick : undefined}
          />
        ))}
      </div>
      <div className="mat-stack__remaining">×{stack.length}</div>
    </div>
  );
}

function LevelRow({
  level,
  count,
  spec,
  isNext,
  picked,
  pickCount,
  clickable,
  onClick,
}: {
  level: number;
  count: number;
  spec: IndustryTileSpec | null;
  isNext: boolean;
  picked: boolean;
  pickCount: number;
  clickable: boolean;
  onClick: (() => void) | undefined;
}) {
  const cls = [
    "mat-row",
    count === 0 ? "mat-row--gone" : "",
    isNext ? "mat-row--next" : "",
    picked ? "mat-row--picked" : "",
    clickable ? "mat-row--clickable" : "",
    spec?.lightBulb ? "mat-row--lightbulb" : "",
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
      <span className="mat-row__level">L{level}</span>
      {spec ? (
        <span className="mat-row__margins">
          £{spec.costMoney}
          {spec.coalCost > 0 ? ` ${spec.coalCost}c` : ""}
          {spec.ironCost > 0 ? ` ${spec.ironCost}i` : ""}
          {spec.beerToSell > 0 ? ` ${spec.beerToSell}b` : ""}
          {" · "}
          {spec.vp > 0 ? `${spec.vp}VP ` : ""}
          {spec.incomeBonus > 0 ? `+${spec.incomeBonus}inc ` : ""}
          {spec.linkPoints > 0 ? `${spec.linkPoints}lp ` : ""}
          {spec.canalOnly ? "·canal" : spec.railOnly ? "·rail" : ""}
          {spec.lightBulb ? " ·no-dev" : ""}
        </span>
      ) : (
        <span className="mat-row__margins">—</span>
      )}
      <span className="mat-row__count">
        {pickCount > 0 ? `×${pickCount}/${count}` : `×${count}`}
      </span>
    </div>
  );
}

function LinkSupplyGlyph({
  era,
  color,
}: {
  era: "CANAL" | "RAIL";
  color: string;
}) {
  // Boat-ish stub for canal era, train-ish rect for rail era. Both sit
  // inline with the stats text and pick up the seat's pawn colour.
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
