import { useId, useState } from "react";
import type { IndustryName, IndustryTileSpec } from "../../../engine";
import { INDUSTRY_ICON, INDUSTRY_LABEL } from "../industryIcons";
import { canPickIndustry, nextIndustryTile } from "../interactionPolicy";
import { VictoryPointsValue } from "../icons/VictoryPointsIcon";

const NAMES: Record<IndustryName, string> = {
  ...INDUSTRY_LABEL, COAL_MINE: "Coal mine", IRON_WORKS: "Iron works", COTTON_MILL: "Cotton mill",
};

/** Readable planning reference for every level, including opponents and exhausted tiles. */
export function IndustryReference({ playerName, stacks, catalogue, era, building, wantingIndustry, pickCounts, onPick }: {
  playerName: string;
  stacks: Record<IndustryName, readonly number[]>;
  catalogue: readonly IndustryTileSpec[];
  era: "CANAL" | "RAIL";
  building: boolean;
  wantingIndustry: boolean;
  pickCounts: ReadonlyMap<IndustryName, number>;
  onPick: (industry: IndustryName) => void;
}) {
  const [industry, setIndustry] = useState<IndustryName>("COTTON_MILL");
  const inputId = useId();
  const stack = stacks[industry];
  const picked = pickCounts.get(industry) ?? 0;
  const next = nextIndustryTile(stack, catalogue, building, picked);
  const levels = catalogue.filter(spec => spec.industry === industry);
  const resource = industry === "COAL_MINE" ? "coal" : industry === "IRON_WORKS" ? "iron" : "beer";
  return <section className="ci-industry-reference" aria-label={`${playerName} industry reference`}>
    <div className="ci-reference-selector">
      <label htmlFor={inputId}>Industry</label>
      <select id={inputId} aria-label={`${playerName} industry`} value={industry} onChange={event => setIndustry(event.target.value as IndustryName)}>
        {Object.entries(NAMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
    </div>
    <div className="ci-industry-levels">
      {levels.map(spec => {
        const count = stack.filter(index => catalogue[index] === spec).length;
        const pickedAtLevel = stack.slice(0, picked).filter(index => catalogue[index] === spec).length;
        const isNext = next === spec;
        const capacity = era === "RAIL" ? spec.resourceCapacityRail ?? spec.resourceCapacity : spec.resourceCapacity;
        const costs = [`£${spec.costMoney}`, ...(spec.coalCost ? [`${spec.coalCost} coal`] : []), ...(spec.ironCost ? [`${spec.ironCost} iron`] : [])];
        return <article className="ci-industry-level" key={spec.level} data-next={isNext}>
          <header>
            <h3><img src={INDUSTRY_ICON[industry]} alt="" width={24} height={24} />{NAMES[industry]} · Level {spec.level}</h3>
            <span>{count} left{isNext ? " · Next tile" : ""}{pickedAtLevel ? ` · ${pickedAtLevel} picked` : ""}</span>
            {wantingIndustry && isNext ? <button className="action-btn" type="button" disabled={!canPickIndustry(spec, building)} onClick={() => onPick(industry)}>
              {building ? "Choose for Build" : spec.lightBulb ? "Cannot develop" : "Choose to Develop"}
            </button> : null}
          </header>
          <dl>
            <div><dt>Build cost</dt><dd>{costs.join(" + ")}</dd></div>
            <div><dt>Available in</dt><dd>{spec.canalOnly ? "Canal only" : spec.railOnly ? "Rail only" : "Both eras"}</dd></div>
            <div><dt>{capacity ? "Produces" : "Beer to sell"}</dt><dd>{capacity ? `${capacity} ${resource}` : `${spec.beerToSell} beer`}</dd></div>
            <div><dt>Industry VP at era end</dt><dd><VictoryPointsValue amount={spec.vp} /></dd></div>
            <div><dt>Income gained</dt><dd>+{spec.incomeBonus} steps</dd></div>
            <div><dt>VP per adjacent link</dt><dd><VictoryPointsValue amount={spec.linkPoints} /></dd></div>
            <div><dt>Develop</dt><dd>{spec.lightBulb ? "Not allowed" : "Allowed"}</dd></div>
          </dl>
        </article>;
      })}
    </div>
    <p className="ci-reference-footnote">Printed build costs exclude market purchases. VP and link values count at era scoring; income gains move your marker when the industry flips.</p>
  </section>;
}
