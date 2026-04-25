import { useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";

const ORDINALS = ["1st", "2nd", "3rd", "4th"] as const;

/**
 * §11.5 Player state — one row per seat in CURRENT turn order
 * (first-to-act at the top; active seat tinted warm gold). Columns:
 * pawn swatch, name, money, VP, income step + level, spent_this_round,
 * turn ordinal.
 */
export function PlayerStatePanel() {
  const rows = useGameState((s) => {
    return s.turnOrder.map((id, idx) => {
      const player = s.players.find((p) => p.id === id);
      if (!player) {
        return null;
      }
      const isActive = idx === s.currentPlayerIndex;
      return {
        id: player.id,
        name: player.displayName,
        pawnColor: player.pawnColor,
        money: player.money,
        vp: player.vp,
        incomeStep: player.incomeStep,
        spentThisRound: player.spentThisRound,
        ordinal: ORDINALS[idx] ?? `${idx + 1}th`,
        isActive,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  });

  return (
    <Panel id="player_state" title="Players">
      <table className="player-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>£</th>
            <th>VP</th>
            <th>Inc step</th>
            <th>Spent</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={r.isActive ? "player-row--active" : ""}
            >
              <td>
                <span
                  className="pawn-swatch"
                  style={{ background: r.pawnColor }}
                />
              </td>
              <td>{r.name}</td>
              <td>£{r.money}</td>
              <td>{r.vp}</td>
              <td>{r.incomeStep}</td>
              <td>{r.spentThisRound}</td>
              <td>
                {r.ordinal}
                {r.isActive ? " ←" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
