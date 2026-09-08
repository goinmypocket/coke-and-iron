// =============================================================================
// §11.10 Prompt — single line of text above the main board describing
// what the active wizard expects next, OR (when nothing is going on)
// whose turn it currently is.
//
// Read-only derivation from wizard + engine state; never owns state.
// The message is always one short imperative sentence so the player
// can glance at it without reading prose.
// =============================================================================

import type { ReactNode } from "react";
import { useActualSeatId, usePaused } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { useWizard } from "../wizards/WizardProvider";

interface TurnInfo {
  readonly activeName: string | null;
  readonly activeColor: string | null;
  readonly isMyTurn: boolean;
}

export function PromptStrip() {
  const wizard = useWizard();
  const paused = usePaused();
  const actualSeatId = useActualSeatId();
  const turn = useGameState(
    (s) => {
      const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
      const active =
        activeId !== null ? s.players.find((p) => p.id === activeId) : null;
      return {
        activeId,
        phase: s.phase,
        actionsRemaining: s.actionsRemaining,
        activeName: active?.displayName ?? null,
        activeColor: active?.pawnColor ?? null,
      };
    },
    shallowEqual,
  );
  const info: TurnInfo = {
    activeName: turn.activeName,
    activeColor: turn.activeColor,
    isMyTurn: turn.activeId !== null && turn.activeId === actualSeatId,
  };
  const prompt = paused ? "Game paused. Choices are locked until play resumes." : turn.phase === "GAME_OVER"
    ? "The game is complete. Review the board or recent actions."
    : wizard.state.phase === "IDLE" && info.isMyTurn && turn.actionsRemaining === 0
      ? "Your actions are complete. Choose End Turn."
      : describePrompt(wizard.state, info);
  return <div className="prompt-strip" role="status" aria-live="polite">{prompt}</div>;
}

function describePrompt(
  state: ReturnType<typeof useWizard>["state"],
  turn: TurnInfo,
): ReactNode {
  // When idle and it's not the viewer's turn (also covers spectators,
  // who never own the active seat), surface whose turn it is here so
  // the seated-player banner above the board can stay invisible.
  if (state.phase === "IDLE" && !turn.isMyTurn) {
    if (turn.activeName === null) return "Waiting…";
    return (
      <>
        Waiting for{" "}
        <strong style={turn.activeColor ? { color: pawnSwatch(turn.activeColor) } : undefined}>
          {turn.activeName}
        </strong>
        …
      </>
    );
  }
  switch (state.phase) {
    case "IDLE":
      return state.stashedCardIndex === null
        ? "Choose an action, or select a card first."
        : "Card selected. Choose an action to use it.";
    case "AWAITING_CARD":
      return state.action === "PASS"
        ? "Pass — pick a card from your hand to discard."
        : "Loan — pick a card from your hand to discard.";
    case "AWAITING_CARDS_SCOUT": {
      const need = 3 - state.cardIndices.length;
      if (need > 0) {
        return `Scout — pick ${need} more non-wild card${
          need === 1 ? "" : "s"
        } from your hand.`;
      }
      return "Scout — three cards picked. Choose End Action to confirm.";
    }
    case "AWAITING_DEVELOP_INPUTS": {
      const missing: string[] = [];
      if (state.cardIndex === null) missing.push("a card");
      if (state.industries.length === 0) missing.push("an industry");
      if (missing.length > 0) {
        return `Develop — pick ${missing.join(" and ")}.`;
      }
      if (state.industries.length === 1) {
        return "Develop — End Action to develop one tile, or pick a second industry to develop two.";
      }
      return "Develop — submitting…";
    }
    case "AWAITING_BUILD_INPUTS": {
      const missing: string[] = [];
      if (state.cardIndex === null) missing.push("a card");
      if (state.slot === null) missing.push("a city slot (or a tile to overbuild)");
      if (state.industry === null) missing.push("an industry");
      if (missing.length === 0) return "Build — submitting…";
      return `Build — pick ${missing.join(" and ")}.`;
    }
    case "AWAITING_NETWORK_INPUTS": {
      const missing: string[] = [];
      if (state.cardIndex === null) missing.push("a card");
      if (state.lineIndex === null) missing.push("a canal/rail line");
      if (missing.length > 0) return `Network — pick ${missing.join(" and ")}.`;
      if (state.secondLineIndex === null) {
        return "Network — pick a second rail line for the rail-era double, or End Action to lay just one.";
      }
      return "Network — submitting…";
    }
    case "AWAITING_SELL_INPUTS": {
      if (state.cardIndex === null && state.tileIds.length === 0) {
        return "Sell — pick a card and one or more own tiles to flip.";
      }
      if (state.cardIndex === null) {
        return "Sell — pick a card from your hand to use for this action.";
      }
      if (state.tileIds.length === 0) {
        return "Sell — pick at least one own unflipped Cotton / Manufacturer / Pottery tile.";
      }
      return `Sell — ${state.tileIds.length} tile${
        state.tileIds.length === 1 ? "" : "s"
      } picked. Choose End Action to confirm (or pick more).`;
    }
    case "AWAITING_SELL_GLOUCESTER": {
      const left = state.need - state.industries.length;
      if (left > 0) {
        return `Gloucester follow-up — pick ${left} more industr${
          left === 1 ? "y" : "ies"
        } from your mat (no iron cost).`;
      }
      return "Gloucester follow-up — submitting…";
    }
    case "AWAITING_DEVELOP_IRON_PICK": {
      const left = state.industries.length - state.picks.length;
      return `Develop iron — pick ${left} more iron source${
        left === 1 ? "" : "s"
      } in the picker.`;
    }
    case "AWAITING_BUILD_RESOURCES": {
      const coalLeft = state.coalNeed - state.coalPicks.length;
      const ironLeft = state.ironNeed - state.ironPicks.length;
      const parts: string[] = [];
      if (coalLeft > 0) parts.push(`${coalLeft} coal`);
      if (ironLeft > 0) parts.push(`${ironLeft} iron`);
      if (parts.length === 0) return "Build resources — submitting…";
      return `Build resources — pick ${parts.join(" + ")} in the picker.`;
    }
    case "AWAITING_NETWORK_RESOURCES": {
      const fc = state.firstCoalNeed - state.firstCoalPicks.length;
      const sc = state.secondCoalNeed - state.secondCoalPicks.length;
      const beer = state.beerNeed - state.beerPicks.length;
      const parts: string[] = [];
      if (fc > 0) parts.push(`${fc} coal (link 1)`);
      if (sc > 0) parts.push(`${sc} coal (link 2)`);
      if (beer > 0) parts.push(`${beer} beer`);
      if (parts.length === 0) return "Network resources — submitting…";
      return `Network resources — pick ${parts.join(" + ")} in the picker.`;
    }
    case "AWAITING_SELL_RESOURCES": {
      const total = state.orders.reduce(
        (a, o) => a + (o.beerNeed - o.beerPicks.length),
        0,
      );
      if (total === 0) return "Sell resources — submitting…";
      return `Sell resources — pick ${total} more beer source${total === 1 ? "" : "s"} in the picker.`;
    }
    case "AWAITING_SELL_MERCHANT_CHOICE": {
      const left = state.choices.filter((c) => c.chosen === null).length;
      if (left === 0) return "Sell merchants — confirming…";
      return `Sell — pick a merchant for ${left} tile${left === 1 ? "" : "s"} in the picker.`;
    }
  }
}

function pawnSwatch(color: string | null): string {
  switch (color) {
    case "red":
      return "#c14040";
    case "yellow":
      return "#805b16";
    case "green":
      return "#2d6a45";
    case "blue":
      return "#2b537a";
    case "purple":
      return "#5e3970";
    case "teal":
      return "#256a78";
    default:
      return "currentColor";
  }
}
