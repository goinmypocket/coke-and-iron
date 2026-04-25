import { stepToLevel } from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { CurrentIncomeIcon } from "../icons/CurrentIncomeIcon";
import { MoneyCoin } from "../icons/MoneyCoin";
import { VictoryPointsIcon } from "../icons/VictoryPointsIcon";
import { Panel } from "../layout/Panel";
import type { PlayerId } from "../../engine";

const ORDINALS = ["1st", "2nd", "3rd", "4th"] as const;

/**
 * §11.5 Player state — one row per seat in CURRENT turn order
 * (first-to-act at the top; active seat tinted warm gold).
 *
 * The outer component subscribes to the seat list + active-index only,
 * so a re-seat or active-change is the only thing that re-renders the
 * table layout. Each row is its own component that subscribes
 * independently to that seat's primitives — money / VP / income / spent
 * — so a per-action mutation re-renders just that row.
 */
export function PlayerStatePanel() {
  const turnOrder = useGameState((s) => s.turnOrder, shallowEqual);
  const currentPlayerIndex = useGameState((s) => s.currentPlayerIndex);

  return (
    <Panel id="player_info" title="Player Info">
      <table className="player-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>£</th>
            <th>VP</th>
            <th>Inc step</th>
            <th>Inc level</th>
            <th>Spent</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {turnOrder.map((seatId, idx) => (
            <PlayerRow
              key={seatId}
              seatId={seatId}
              ordinal={ORDINALS[idx] ?? `${idx + 1}th`}
              isActive={idx === currentPlayerIndex}
            />
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function PlayerRow({
  seatId,
  ordinal,
  isActive,
}: {
  seatId: PlayerId;
  ordinal: string;
  isActive: boolean;
}) {
  const row = useGameState((s) => {
    const p = s.players.find((pp) => pp.id === seatId);
    if (!p) return null;
    return {
      name: p.displayName,
      pawnColor: p.pawnColor,
      money: p.money,
      vp: p.vp,
      incomeStep: p.incomeStep,
      spentThisRound: p.spentThisRound,
    };
  }, shallowEqual);

  if (!row) return null;
  return (
    <tr className={isActive ? "player-row--active" : ""}>
      <td>
        <span
          className="pawn-swatch"
          style={{ background: row.pawnColor }}
        />
      </td>
      <td>{row.name}</td>
      <td>
        <MoneyCoin amount={row.money} size={14} />
      </td>
      <td>
        <VictoryPointsIcon amount={row.vp} size={14} />
      </td>
      <td>{row.incomeStep}</td>
      <td>
        <CurrentIncomeIcon amount={stepToLevel(row.incomeStep)} size={14} />
      </td>
      <td>{row.spentThisRound}</td>
      <td>
        {ordinal}
        {isActive ? " ←" : ""}
      </td>
    </tr>
  );
}
