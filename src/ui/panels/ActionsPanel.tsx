// =============================================================================
// §11.8 Actions panel — verbs + wizard controls.
//
// Buttons are wired only for actions that have a wizard at this milestone:
// Pass, Loan, Scout, plus End Turn. Build / Network / Develop / Sell are
// rendered greyed with a "wizard not yet implemented" tooltip so the
// inventory matches the spec.
// =============================================================================

import { toast } from "sonner";
import type { Card } from "../../engine";
import { reasonToText } from "../affordances/toast";
import { useCanUndo, useEngine } from "../hooks/useEngine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";
import { useWizard } from "../wizards/WizardProvider";

type MainAction = "BUILD" | "NETWORK" | "DEVELOP" | "SELL";

/** When the player has stashed a card card-first, we highlight only the
 * actions where that card naturally fits — e.g. a single-industry
 * Brewery card lights up Build + Develop and dims Network + Sell.
 * The dimmed actions are still clickable (the engine accepts any card
 * as discard fodder for Network / Sell / Develop), so this is a visual
 * hint rather than a hard gate. */
function suggestedActionsForCard(card: Card): ReadonlySet<MainAction> {
  switch (card.kind) {
    case "WILD_LOCATION":
    case "WILD_INDUSTRY":
      return new Set<MainAction>(["BUILD", "NETWORK", "DEVELOP", "SELL"]);
    case "LOCATION":
      return new Set<MainAction>(["BUILD"]);
    case "INDUSTRY":
      return new Set<MainAction>(["BUILD", "DEVELOP"]);
  }
}

export function ActionsPanel() {
  const engine = useEngine();
  const wizard = useWizard();
  const canUndo = useCanUndo();
  const flags = useGameState((s) => ({
    actionsRemaining: s.actionsRemaining,
    canAct: s.actionsRemaining > 0 && s.pendingShortfalls.length === 0 && s.phase === "PLAYER_TURNS",
    canEndTurn: s.actionsRemaining === 0 && s.pendingShortfalls.length === 0 && s.phase === "PLAYER_TURNS",
    activePlayerId: s.turnOrder[s.currentPlayerIndex] ?? null,
  }), shallowEqual);
  const activeHand = useGameState(
    (s) => {
      const id = s.turnOrder[s.currentPlayerIndex];
      if (id === undefined) return null;
      return s.players.find((p) => p.id === id)?.hand ?? null;
    },
    (a, b) => a === b,
  );

  const stashedIndex =
    wizard.state.phase === "IDLE" ? wizard.state.stashedCardIndex : null;
  const stashedCard =
    stashedIndex !== null && activeHand
      ? activeHand[stashedIndex] ?? null
      : null;
  const suggested = stashedCard
    ? suggestedActionsForCard(stashedCard)
    : null;

  const wizardActive = wizard.state.phase !== "IDLE";
  const isPass = wizard.state.phase === "AWAITING_CARD" && wizard.state.action === "PASS";
  const isLoan = wizard.state.phase === "AWAITING_CARD" && wizard.state.action === "LOAN";
  const isScout = wizard.state.phase === "AWAITING_CARDS_SCOUT";
  const isDevelop = wizard.state.phase === "AWAITING_DEVELOP_INPUTS";
  const canEndDevelop =
    wizard.state.phase === "AWAITING_DEVELOP_INPUTS" &&
    wizard.state.cardIndex !== null &&
    wizard.state.industries.length >= 1;
  const isBuild = wizard.state.phase === "AWAITING_BUILD_INPUTS";
  const canEndBuild =
    wizard.state.phase === "AWAITING_BUILD_INPUTS" &&
    wizard.state.cardIndex !== null &&
    wizard.state.slot !== null &&
    wizard.state.industry !== null;
  const isNetwork = wizard.state.phase === "AWAITING_NETWORK_INPUTS";
  const canEndNetwork =
    wizard.state.phase === "AWAITING_NETWORK_INPUTS" &&
    wizard.state.cardIndex !== null &&
    wizard.state.lineIndex !== null;
  const isSell =
    wizard.state.phase === "AWAITING_SELL_INPUTS" ||
    wizard.state.phase === "AWAITING_SELL_GLOUCESTER";
  const canEndSell =
    (wizard.state.phase === "AWAITING_SELL_INPUTS" &&
      wizard.state.cardIndex !== null &&
      wizard.state.tileIds.length >= 1) ||
    (wizard.state.phase === "AWAITING_SELL_GLOUCESTER" &&
      wizard.state.industries.length === wizard.state.need);

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
            active={isBuild}
            disabled={!flags.canAct}
            suggested={suggested?.has("BUILD") ?? false}
            dimmed={suggested ? !suggested.has("BUILD") : false}
            onClick={wizard.startBuild}
          />
          <ActionButton
            label="Network"
            active={isNetwork}
            disabled={!flags.canAct}
            suggested={suggested?.has("NETWORK") ?? false}
            dimmed={suggested ? !suggested.has("NETWORK") : false}
            onClick={wizard.startNetwork}
          />
          <ActionButton
            label="Develop"
            active={isDevelop}
            disabled={!flags.canAct}
            suggested={suggested?.has("DEVELOP") ?? false}
            dimmed={suggested ? !suggested.has("DEVELOP") : false}
            onClick={wizard.startDevelop}
          />
          <ActionButton
            label="Sell"
            active={isSell}
            disabled={!flags.canAct}
            suggested={suggested?.has("SELL") ?? false}
            dimmed={suggested ? !suggested.has("SELL") : false}
            onClick={wizard.startSell}
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
            tooltip="Clear the current wizard's picks (does not undo dispatched actions)."
          />
          <ActionButton
            label="End Action"
            disabled={
              !isScout &&
              !canEndDevelop &&
              !canEndBuild &&
              !canEndNetwork &&
              !canEndSell
            }
            onClick={wizard.endAction}
          />
          <ActionButton
            label="Undo"
            disabled={!canUndo || wizardActive}
            onClick={() => engine.undo()}
            tooltip={
              wizardActive
                ? "Reset the wizard first."
                : "Roll back your last action (within this turn only)."
            }
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
  suggested = false,
  dimmed = false,
  tooltip,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  suggested?: boolean;
  dimmed?: boolean;
  tooltip?: string;
}) {
  const className = [
    "action-btn",
    active ? "action-btn--active" : "",
    suggested && !active ? "action-btn--suggested" : "",
    dimmed && !active ? "action-btn--dimmed" : "",
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
