import { useState } from "react";
import { stepToLevel } from "../../../engine";
import { useGameState } from "../hooks/useGameState";
import { Modal } from "../overlays/Modal";
import { IncomeLadder } from "./IncomeTrackerPanel";
import { ACTION_HELP } from "./ActionsPanel";
import { ActionIcon } from "../icons/ActionIcon";

export function ReferenceTools() {
  const [open, setOpen] = useState<"income" | "guide" | "markets" | null>(null);
  const players = useGameState(s => s.players);
  const coal = useGameState(s => s.coalMarket);
  const iron = useGameState(s => s.ironMarket);
  const title = open === "income" ? "Income track" : open === "markets" ? "Resource markets" : "Action guide";
  return <>
    <div className="ci-reference-tools">
      <button type="button" className="action-btn" onClick={() => setOpen("income")}>Income track</button>
      <button type="button" className="action-btn" onClick={() => setOpen("markets")}>Markets</button>
      <button type="button" className="action-btn" onClick={() => setOpen("guide")}>Action guide</button>
    </div>
    {open ? <Modal className="ci-reference-dialog" label={title} onClose={() => setOpen(null)}>
      <div className="ci-section-heading"><h2>{title}</h2><button className="action-btn" onClick={() => setOpen(null)}>Close</button></div>
      {open === "income" ? <>
        <p className="ci-reference-intro">Income level determines payment at the end of each round. Tile bonuses move your marker by steps; a Loan loses three levels.</p>
        <div className="ci-income-reference"><IncomeLadder /><ul>{players.map(p => <li key={p.id}><strong>{p.displayName}</strong><span>£{stepToLevel(p.incomeStep)} income · step {p.incomeStep}</span></li>)}</ul></div>
      </> : open === "markets" ? <>
        <p className="ci-reference-intro">Prices are per cube. Your action's resource picker chooses the source; the rules determine which sources you may use.</p>
        {[{ name: "Coal", market: coal }, { name: "Iron", market: iron }].map(({ name, market }) => <table key={name} className="ci-score-table">
          <caption>{name} market</caption><thead><tr><th scope="col">Price per cube</th><th scope="col">Cubes available</th></tr></thead>
          <tbody>{market.tiers.map((price, i) => <tr key={i}><th scope="row">£{price}</th><td>{market.filled[i] ?? 0}</td></tr>)}
            <tr><th scope="row">£{market.overflowPrice} overflow</th><td>Unlimited</td></tr></tbody>
        </table>)}
      </> : <>
        <p className="ci-reference-intro">Each action uses a card. You can choose the action or its card first. Reset selection clears unfinished choices; Undo rolls back a completed action within this turn.</p>
        <dl className="ci-action-guide">{Object.entries(ACTION_HELP).map(([label, text]) => <div key={label}><dt><ActionIcon name={label} />{label}</dt><dd>{text}</dd></div>)}</dl>
        <p className="ci-reference-intro">End Action confirms a single Develop or Rail link, Scout, or Sell. Other complete selections submit automatically. Once no actions remain, choose End Turn (unless automatic ending is enabled).</p>
      </>}
    </Modal> : null}
  </>;
}
