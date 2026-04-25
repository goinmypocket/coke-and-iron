// =============================================================================
// §11.3 Players panel — outer container with one sub-panel per seated
// player. Each sub-panel paints its outer border in the seat's pawn colour
// and exposes a stats bar + mat grid.
//
// Mat grid (this milestone): six vertical stacks, one per industry, each
// showing the top-of-stack tile and the count of remaining tiles. Top
// tiles are click-targets when a wizard is asking for an industry pick;
// lit with a warm-gold border when picked. Light-bulb tiles render with a
// muted marker.
//
// Out of scope here (deferred): Manufacturer spanning two columns,
// Pottery as 5 fixed level rows, full cost / bonus margins, link-supply
// icon. The wizard logic only needs the top tile to be clickable.
// =============================================================================
import { stepToLevel } from "../../engine";
import type {
  IndustryName,
  IndustryTileSpec,
  PlayerId,
} from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";
import { useWizard } from "../wizards/WizardProvider";

const INDUSTRY_ORDER: readonly IndustryName[] = [
  "COAL_MINE",
  "IRON_WORKS",
  "BREWERY",
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
];

const INDUSTRY_LABEL: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: "Coal",
  IRON_WORKS: "Iron",
  BREWERY: "Brewery",
  COTTON_MILL: "Cotton",
  MANUFACTURER: "Manuf.",
  POTTERY: "Pottery",
};

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
      tileCatalogue: s.tileCatalogue,
    };
  }, shallowEqual);

  if (!view) return null;

  const wantingIndustry =
    wizard.state.phase === "AWAITING_DEVELOP_INDUSTRIES" &&
    wizard.state.developSeatId === seatId;
  const pickedIndustries =
    wizard.state.phase === "AWAITING_DEVELOP_INDUSTRIES"
      ? wizard.state.industries
      : [];

  return (
    <Panel
      id={`player_${seatId + 1}`}
      title={`${view.name}${view.isActive ? " ←" : ""}`}
      borderColor={view.pawnColor}
      maximizable
    >
      <div className="seat-stats">
        <span>£{view.money}</span>
        <span>{view.vp} VP</span>
        <span>L{stepToLevel(view.incomeStep)}</span>
        <span>×{view.linkSupply}</span>
      </div>
      <div className="mat-grid">
        {INDUSTRY_ORDER.map((industry) => {
          const stack = view.stacks[industry];
          const topIdx = stack[0];
          const topSpec =
            topIdx === undefined ? null : view.tileCatalogue[topIdx] ?? null;
          const picked = pickedIndustries.includes(industry);
          const clickable =
            wantingIndustry && topSpec !== null && !topSpec.lightBulb;
          return (
            <MatStack
              key={industry}
              industry={industry}
              topSpec={topSpec}
              remaining={stack.length}
              picked={picked}
              clickable={clickable}
              onClick={
                clickable
                  ? () => wizard.pickIndustry(seatId, industry)
                  : undefined
              }
            />
          );
        })}
      </div>
    </Panel>
  );
}

function MatStack({
  industry,
  topSpec,
  remaining,
  picked,
  clickable,
  onClick,
}: {
  industry: IndustryName;
  topSpec: IndustryTileSpec | null;
  remaining: number;
  picked: boolean;
  clickable: boolean;
  onClick: (() => void) | undefined;
}) {
  const tileClassName = [
    "mat-tile",
    picked ? "mat-tile--picked" : "",
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
      <div className="mat-stack__label">{INDUSTRY_LABEL[industry]}</div>
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
          </>
        )}
      </div>
      <div className="mat-stack__remaining">×{remaining}</div>
    </div>
  );
}
