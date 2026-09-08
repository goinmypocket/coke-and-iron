import { useActualSeatId, usePaused } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { INDUSTRY_ICON, INDUSTRY_LABEL } from "../industryIcons";
import { canPickIndustry, canTakeTurn, nextIndustryTile } from "../interactionPolicy";
import type { IndustryName } from "../../../engine";
import { useWizard } from "../wizards/WizardProvider";

const INDUSTRIES: readonly IndustryName[] = ["COTTON_MILL", "COAL_MINE", "IRON_WORKS", "MANUFACTURER", "POTTERY", "BREWERY"];
const NAMES = { ...INDUSTRY_LABEL, COTTON_MILL: "Cotton mill", COAL_MINE: "Coal mine", IRON_WORKS: "Iron works" };

export function NextIndustryPicker() {
  const wizard = useWizard();
  const seat = useActualSeatId();
  const paused = usePaused();
  const view = useGameState(s => ({
    player: s.players.find(p => p.id === seat), catalogue: s.tileCatalogue,
    canAct: canTakeTurn(s, seat, false) && s.actionsRemaining > 0,
  }), shallowEqual);
  const state = wizard.state;
  const build = state.phase === "AWAITING_BUILD_INPUTS";
  const develop = state.phase === "AWAITING_DEVELOP_INPUTS" || state.phase === "AWAITING_SELL_GLOUCESTER";
  if ((!build && !develop) || !view.player || seat === null) return null;
  const picks = develop ? state.industries : [];
  return <section className="ci-next-industries" aria-label="Next industries">
    <h3>{build ? "Next industries" : state.phase === "AWAITING_SELL_GLOUCESTER" ? "Free Develop" : "Choose tiles to develop"}</h3>
    <div className="ci-next-industries__grid">
      {INDUSTRIES.map(industry => {
        const count = picks.filter(p => p === industry).length;
        const spec = nextIndustryTile(view.player!.mat.stacks[industry], view.catalogue, build, count);
        const allowed = !paused && view.canAct && canPickIndustry(spec, build);
        const picked = build ? state.industry === industry : count > 0;
        return <button key={industry} type="button" className="ci-industry-choice"
          disabled={!allowed} aria-pressed={picked}
          onClick={() => wizard.pickIndustry(seat, industry)}>
          <img src={INDUSTRY_ICON[industry]} alt="" width={24} height={24} />
          <span><strong>{NAMES[industry]}{spec ? ` ${spec.level}` : ""}</strong>
            <small>{!spec ? "No tiles left" : !build && spec.lightBulb ? "Cannot develop" : build
              ? `£${spec.costMoney}${spec.coalCost ? ` · ${spec.coalCost} coal` : ""}${spec.ironCost ? ` · ${spec.ironCost} iron` : ""}`
              : `${count ? `${count} picked · ` : ""}${state.phase === "AWAITING_SELL_GLOUCESTER" ? "No iron cost" : "1 iron"}`}</small>
          </span>
        </button>;
      })}
    </div>
    {build ? <p>Printed costs · coal and iron may cost extra.</p> : <p>Pick the same industry again to develop its next tile. Crossed bulbs cannot be developed.</p>}
  </section>;
}
