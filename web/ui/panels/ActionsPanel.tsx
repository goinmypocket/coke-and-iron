// =============================================================================
// §11.8 Actions banner — verbs + wizard controls + selection chips.
//
// Renders as a chrome-less horizontal banner that sits in the top
// affordance area (above the game stack). Action verbs on the left,
// wizard controls on the right. When a wizard is active the banner
// also shows a row of chips describing the player's current picks
// (card, industry, slot, links, etc.) — that summary used to live in
// a separate ContextBar; it now lives here so the top of the screen
// always has just three things: Prompt, Actions, Hand.
// =============================================================================

import { useState } from "react";
import { toast } from "sonner";
import type {
  Card,
  DistrictCity,
  IndustryName,
  Player,
} from "../../../engine";
import { reasonToText } from "../affordances/toast";
import {
  useActualSeatId,
  useMySeatId,
  useRejection,
} from "../hooks/EngineProvider";
import { useCanUndo, useEngine } from "../hooks/useEngine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { RecentActionsOverlay } from "../overlays/RecentActionsOverlay";
import { useWizard } from "../wizards/WizardProvider";

interface ChipDef {
  readonly key: string;
  readonly label: string;
}

export function ActionsPanel() {
  const engine = useEngine();
  const wizard = useWizard();
  const canUndo = useCanUndo();
  const mySeatId = useMySeatId();
  // For dispatch eligibility we use the seat the user actually owns —
  // never the spectator-view override seat. A spectator viewing player
  // N's hand should NOT be able to click Build for them.
  const actualSeatId = useActualSeatId();
  const rejection = useRejection();
  const [logOpen, setLogOpen] = useState(false);
  const flags = useGameState((s) => {
    const activePlayerId = s.turnOrder[s.currentPlayerIndex] ?? null;
    const isMyTurn =
      actualSeatId !== null && activePlayerId === actualSeatId;
    const baseCanAct =
      s.actionsRemaining > 0 &&
      s.pendingShortfalls.length === 0 &&
      s.phase === "PLAYER_TURNS";
    return {
      actionsRemaining: s.actionsRemaining,
      // Round 1 of the Canal era is a single-action round; every other
      // round gives 2 actions (mirrors actionsForRound() in the engine's
      // end-turn module). Used for the k/n indicator on the banner.
      actionsTotal: s.era === "CANAL" && s.round === 1 ? 1 : 2,
      // Only the seat-holding viewer may drive the wizard / dispatch.
      // This prevents one client's UI from poking at another client's
      // hand or actions during their turn.
      canAct: baseCanAct && isMyTurn,
      canEndTurn:
        s.actionsRemaining === 0 &&
        s.pendingShortfalls.length === 0 &&
        s.phase === "PLAYER_TURNS" &&
        isMyTurn,
      activePlayerId,
      isMyTurn,
    };
  }, shallowEqual);
  // Wizard chips and issue checks are driven by MY hand and MY mat —
  // not the active player's. The wizard can only be started on my own
  // turn (canAct gates that), so for normal play these are equivalent;
  // reading them by mySeatId is defence-in-depth that keeps another
  // player's data from ever flowing into the chip / issue selectors.
  const myHand = useGameState(
    (s) => {
      if (mySeatId === null) return null;
      return s.players.find((p) => p.id === mySeatId)?.hand ?? null;
    },
    (a, b) => a === b,
  );
  const myPlayer = useGameState(
    (s) => {
      if (mySeatId === null) return null;
      return s.players.find((p) => p.id === mySeatId) ?? null;
    },
    (a, b) => a === b,
  );
  const districtCities = useGameState((s) => s.districtCities, shallowEqual);

  const stashedIndex =
    wizard.state.phase === "IDLE" ? wizard.state.stashedCardIndex : null;

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

  const bannerCls =
    "actions-banner" + (wizardActive ? "" : " actions-banner--emphasized");
  // k/n indicator. k = actions used so far this turn = total - remaining.
  // Reads naturally as "1/2" once the player has spent one of two actions.
  const actionsUsed = Math.max(0, flags.actionsTotal - flags.actionsRemaining);
  const chips = describeChips(wizard.state, myHand);
  const issues = describeIssues(
    wizard.state,
    myHand,
    myPlayer,
    districtCities,
  );
  // Reset clears either an active wizard's picks or the IDLE-with-stash
  // state — both are user-meaningful "undo my partial selection" gestures.
  const canReset = wizardActive || stashedIndex !== null;
  return (
    <div className={bannerCls}>
      <div className="actions-banner__row actions-banner__row--verbs">
        <div
          className="actions-banner__counter"
          title={`${flags.actionsRemaining} action${
            flags.actionsRemaining === 1 ? "" : "s"
          } left this turn`}
        >
          Actions {actionsUsed}/{flags.actionsTotal}
        </div>
        <div className="actions-banner__verbs">
          <ActionButton
            label="Build"
            active={isBuild}
            disabled={!flags.canAct}
            onClick={wizard.startBuild}
          />
          <ActionButton
            label="Network"
            active={isNetwork}
            disabled={!flags.canAct}
            onClick={wizard.startNetwork}
          />
          <ActionButton
            label="Develop"
            active={isDevelop}
            disabled={!flags.canAct}
            onClick={wizard.startDevelop}
          />
          <ActionButton
            label="Sell"
            active={isSell}
            disabled={!flags.canAct}
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
      </div>
      <div className="actions-banner__row actions-banner__row--controls">
        <div className="actions-banner__controls">
          <ActionButton
            label="Reset"
            disabled={!canReset}
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
            disabled={!canUndo || wizardActive || !flags.isMyTurn}
            onClick={() => engine.undo()}
            tooltip={
              wizardActive
                ? "Reset the wizard first."
                : !flags.isMyTurn
                  ? "Only the active player can undo."
                  : "Roll back your last action (within this turn only)."
            }
          />
          <ActionButton
            label="End Turn"
            disabled={!flags.canEndTurn}
            onClick={onEndTurn}
          />
          <ActionButton
            label="Log"
            variant="neutral"
            onClick={() => setLogOpen(true)}
            tooltip="Show the recent actions log."
          />
        </div>
        {chips.length > 0 || issues.length > 0 || rejection.text !== null ? (
          <div className="actions-banner__chips">
            {chips.map((c) => (
              <span key={c.key} className="actions-banner__chip">
                {c.label}
              </span>
            ))}
            {issues.map((label, idx) => (
              <span
                key={`issue-${idx}`}
                className="actions-banner__chip actions-banner__chip--error"
                role="alert"
              >
                ⚠ {label}
              </span>
            ))}
            {rejection.text !== null ? (
              <button
                type="button"
                className="actions-banner__chip actions-banner__chip--error actions-banner__chip--dismissable"
                role="alert"
                onClick={rejection.dismiss}
                title="Click to dismiss"
              >
                ⚠ {rejection.text} ×
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <RecentActionsOverlay
        open={logOpen}
        onClose={() => setLogOpen(false)}
      />
    </div>
  );
}

/** Build the list of "your current picks" chips for the active wizard
 *  state. Mirrors the old ContextBar describeChips logic so the
 *  selection summary lives next to the controls that act on it. */
function describeChips(
  state: ReturnType<typeof useWizard>["state"],
  hand: readonly Card[] | null,
): ChipDef[] {
  const out: ChipDef[] = [];
  const card = (idx: number | null): string =>
    idx === null
      ? ""
      : prettyCard(hand?.[idx] ?? null) ?? `Card #${idx + 1}`;
  switch (state.phase) {
    case "AWAITING_CARD":
      // Pass / Loan only need a card; the prompt covers it.
      break;
    case "AWAITING_CARDS_SCOUT":
      for (let i = 0; i < state.cardIndices.length; i++) {
        out.push({
          key: `scout-${i}`,
          label: `Card ${i + 1}: ${card(state.cardIndices[i]!)}`,
        });
      }
      break;
    case "AWAITING_DEVELOP_INPUTS":
      if (state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(state.cardIndex)}` });
      }
      for (let i = 0; i < state.industries.length; i++) {
        out.push({
          key: `ind-${i}`,
          label: `Develop: ${prettyIndustry(state.industries[i]!)}`,
        });
      }
      break;
    case "AWAITING_BUILD_INPUTS":
      if (state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(state.cardIndex)}` });
      }
      if (state.industry !== null) {
        out.push({
          key: "industry",
          label: `Industry: ${prettyIndustry(state.industry)}`,
        });
      }
      if (state.slot !== null) {
        out.push({
          key: "slot",
          label: `Slot: ${state.slot.cityName} #${state.slot.slotIndex + 1}`,
        });
      }
      break;
    case "AWAITING_NETWORK_INPUTS":
      if (state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(state.cardIndex)}` });
      }
      if (state.lineIndex !== null) {
        out.push({ key: "line1", label: `Link 1 picked` });
      }
      if (state.secondLineIndex !== null) {
        out.push({ key: "line2", label: `Link 2 picked` });
      }
      break;
    case "AWAITING_SELL_INPUTS":
      if (state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(state.cardIndex)}` });
      }
      if (state.tileIds.length > 0) {
        out.push({ key: "tiles", label: `Tiles: ${state.tileIds.length}` });
      }
      break;
    case "AWAITING_SELL_GLOUCESTER":
      out.push({
        key: "gloucester",
        label: `Gloucester: ${state.industries.length}/${state.need}`,
      });
      break;
    case "AWAITING_DEVELOP_IRON_PICK":
      out.push({
        key: "ironpick",
        label: `Iron: ${state.picks.length}/${state.industries.length}`,
      });
      break;
    case "AWAITING_BUILD_RESOURCES": {
      const c = state.coalPicks.length;
      const i = state.ironPicks.length;
      if (state.coalNeed > 0) {
        out.push({ key: "build-coal", label: `Coal: ${c}/${state.coalNeed}` });
      }
      if (state.ironNeed > 0) {
        out.push({ key: "build-iron", label: `Iron: ${i}/${state.ironNeed}` });
      }
      break;
    }
    case "AWAITING_NETWORK_RESOURCES": {
      const fc = state.firstCoalPicks.length;
      const sc = state.secondCoalPicks.length;
      const beer = state.beerPicks.length;
      if (state.firstCoalNeed > 0) {
        out.push({
          key: "net-coal1",
          label: `Coal (link 1): ${fc}/${state.firstCoalNeed}`,
        });
      }
      if (state.secondCoalNeed > 0) {
        out.push({
          key: "net-coal2",
          label: `Coal (link 2): ${sc}/${state.secondCoalNeed}`,
        });
      }
      if (state.beerNeed > 0) {
        out.push({ key: "net-beer", label: `Beer: ${beer}/${state.beerNeed}` });
      }
      break;
    }
    case "AWAITING_SELL_RESOURCES": {
      const totalBeer = state.orders.reduce(
        (a, o) => a + o.beerPicks.length,
        0,
      );
      const need = state.orders.reduce((a, o) => a + o.beerNeed, 0);
      if (need > 0) {
        out.push({ key: "sell-beer", label: `Beer: ${totalBeer}/${need}` });
      }
      break;
    }
    case "IDLE":
      if (state.stashedCardIndex !== null) {
        out.push({
          key: "stashed",
          label: `Card: ${card(state.stashedCardIndex)}`,
        });
      }
      break;
  }
  return out;
}

function prettyCard(card: Card | null): string | null {
  if (!card) return null;
  switch (card.kind) {
    case "LOCATION":
      return card.cityName;
    case "INDUSTRY":
      return card.industries.map(prettyIndustry).join("/");
    case "WILD_LOCATION":
      return "Wild Location";
    case "WILD_INDUSTRY":
      return "Wild Industry";
    case "HIDDEN":
      return null;
  }
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((p) => p[0]! + p.slice(1).toLowerCase())
    .join(" ");
}

/** Inspect the wizard's current picks against the engine state and
 *  return short, single-line descriptions of any combination errors.
 *  Surfaced as red chips next to the regular selection chips so the
 *  player sees the problem inline instead of as a transient toast. */
function describeIssues(
  state: ReturnType<typeof useWizard>["state"],
  hand: readonly Card[] | null,
  player: Player | null,
  districtCities: readonly DistrictCity[],
): string[] {
  if (state.phase !== "AWAITING_BUILD_INPUTS") return [];
  const out: string[] = [];

  const card = state.cardIndex !== null ? hand?.[state.cardIndex] ?? null : null;
  const slotSpec =
    state.slot !== null
      ? districtCities
          .find((c) => c.name === state.slot!.cityName)
          ?.slots[state.slot.slotIndex] ?? null
      : null;

  const cardSingleIndustry =
    card?.kind === "INDUSTRY" && card.industries.length === 1
      ? card.industries[0]!
      : null;
  const slotSingleIndustry =
    slotSpec && slotSpec.acceptList.length === 1
      ? slotSpec.acceptList[0]!
      : null;

  // Track which industries we've already complained about so the same
  // problem doesn't generate two chips (e.g. card pins X + slot pins
  // X + chosen industry X all empty → one chip, not three).
  const reportedEmpty = new Set<IndustryName>();
  const reportEmpty = (ind: IndustryName) => {
    if (reportedEmpty.has(ind)) return;
    reportedEmpty.add(ind);
    out.push(`No ${prettyIndustry(ind)} tiles left on your mat`);
  };

  const stackOf = (ind: IndustryName) =>
    player?.mat.stacks[ind]?.length ?? 0;

  if (cardSingleIndustry && stackOf(cardSingleIndustry) === 0) {
    reportEmpty(cardSingleIndustry);
  }
  if (slotSingleIndustry && stackOf(slotSingleIndustry) === 0) {
    reportEmpty(slotSingleIndustry);
  }
  if (state.industry !== null && stackOf(state.industry) === 0) {
    reportEmpty(state.industry);
  }

  // Card industry vs slot industry disagreement (both pinned, both
  // legal-on-their-own, but they don't match).
  if (
    cardSingleIndustry !== null &&
    slotSingleIndustry !== null &&
    cardSingleIndustry !== slotSingleIndustry
  ) {
    out.push(
      `Card industry (${prettyIndustry(cardSingleIndustry)}) doesn't match slot (${prettyIndustry(slotSingleIndustry)})`,
    );
  }

  // Chosen industry isn't in the slot's accept list (and the slot
  // isn't an ANY/wild slot).
  if (
    state.industry !== null &&
    slotSpec &&
    slotSpec.acceptList.length > 0 &&
    !slotSpec.acceptList.includes(state.industry)
  ) {
    out.push(
      `This slot doesn't accept ${prettyIndustry(state.industry)}`,
    );
  }

  // Location card pins the city — slot must be in that city.
  if (
    card?.kind === "LOCATION" &&
    state.slot !== null &&
    card.cityName !== state.slot.cityName
  ) {
    out.push(`Card requires building in ${card.cityName}`);
  }

  return out;
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  active = false,
  variant,
  tooltip,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  /** "neutral" demotes the button visually for non-game utilities
   *  (currently only the Log toggle). Default styling reads as a
   *  game-verb button. */
  variant?: "neutral";
  tooltip?: string;
}) {
  const className = [
    "action-btn",
    active ? "action-btn--active" : "",
    variant ? `action-btn--${variant}` : "",
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
