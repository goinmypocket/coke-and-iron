// =============================================================================
// §11.8 Actions panel — verbs + wizard controls.
//
// Buttons are wired only for actions that have a wizard at this milestone:
// Pass, Loan, Scout, plus End Turn. Build / Network / Develop / Sell are
// rendered greyed with a "wizard not yet implemented" tooltip so the
// inventory matches the spec.
// =============================================================================

import { toast } from "sonner";
import { reasonToText } from "../affordances/toast";
import { useEngine } from "../hooks/useEngine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";
import { useWizard } from "../wizards/WizardProvider";

const NOT_IMPLEMENTED = "Wizard not yet implemented in this milestone.";

export function ActionsPanel() {
  const engine = useEngine();
  const wizard = useWizard();
  const flags = useGameState((s) => ({
    actionsRemaining: s.actionsRemaining,
    canAct: s.actionsRemaining > 0 && s.pendingShortfalls.length === 0 && s.phase === "PLAYER_TURNS",
    canEndTurn: s.actionsRemaining === 0 && s.pendingShortfalls.length === 0 && s.phase === "PLAYER_TURNS",
    activePlayerId: s.turnOrder[s.currentPlayerIndex] ?? null,
  }), shallowEqual);

  const wizardActive = wizard.state.phase !== "IDLE";
  const isPass = wizard.state.phase === "AWAITING_CARD" && wizard.state.action === "PASS";
  const isLoan = wizard.state.phase === "AWAITING_CARD" && wizard.state.action === "LOAN";
  const isScout = wizard.state.phase === "AWAITING_CARDS_SCOUT";

  const onEndTurn = () => {
    if (flags.activePlayerId === null) return;
    const result = engine.dispatch({
      type: "END_TURN",
      playerId: flags.activePlayerId,
    });
    if (!result.ok) toast.error(reasonToText(result.reason));
  };

  return (
    <Panel id="actions" title="Actions" emphasized={!wizardActive}>
      <div className="actions-panel">
        <div className="actions-panel__verbs">
          <ActionButton
            label="Build"
            disabled
            tooltip={NOT_IMPLEMENTED}
            onClick={() => {}}
          />
          <ActionButton
            label="Network"
            disabled
            tooltip={NOT_IMPLEMENTED}
            onClick={() => {}}
          />
          <ActionButton
            label="Develop"
            disabled
            tooltip={NOT_IMPLEMENTED}
            onClick={() => {}}
          />
          <ActionButton
            label="Sell"
            disabled
            tooltip={NOT_IMPLEMENTED}
            onClick={() => {}}
          />
          <ActionButton
            label="Loan"
            active={isLoan}
            disabled={!flags.canAct}
            onClick={wizard.startLoan}
          />
          <ActionButton
            label="Scout"
            active={isScout}
            disabled={!flags.canAct}
            onClick={wizard.startScout}
          />
          <ActionButton
            label="Pass"
            active={isPass}
            disabled={!flags.canAct}
            onClick={wizard.startPass}
          />
        </div>
        <div className="actions-panel__controls">
          <ActionButton
            label="Reset Selection"
            disabled={!wizardActive}
            onClick={wizard.reset}
          />
          <ActionButton
            label="End Action"
            disabled={!isScout}
            onClick={wizard.endAction}
          />
          <ActionButton
            label="End Turn"
            disabled={!flags.canEndTurn}
            onClick={onEndTurn}
          />
        </div>
      </div>
    </Panel>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  active = false,
  tooltip,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tooltip?: string;
}) {
  const className = [
    "action-btn",
    active ? "action-btn--active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={tooltip}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
