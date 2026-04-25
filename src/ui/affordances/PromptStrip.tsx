// =============================================================================
// §11.10 Prompt — single line of text above the main board describing
// what the active wizard expects next. No panel chrome.
//
// Read-only derivation from wizard state; never owns state. The message
// is always one short imperative sentence so the player can glance at
// it without reading prose.
// =============================================================================

import { useWizard } from "../wizards/WizardProvider";

export function PromptStrip() {
  const wizard = useWizard();
  const text = describePrompt(wizard.state);
  return <div className="prompt-strip">{text}</div>;
}

function describePrompt(state: ReturnType<typeof useWizard>["state"]): string {
  switch (state.phase) {
    case "IDLE":
      return state.stashedCardIndex === null
        ? "Click an action button to begin a turn — or click a card first to stash it."
        : "Card stashed. Click an action button (Pass / Loan / Build / etc) to use it.";
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
      return "Scout — three cards picked. Click End Action to dispatch.";
    }
    case "AWAITING_DEVELOP_INPUTS": {
      const missing: string[] = [];
      if (state.cardIndex === null) missing.push("a card");
      if (state.industries.length === 0) missing.push("an industry on your mat");
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
      if (state.slot === null) missing.push("an empty city slot");
      if (state.industry === null) missing.push("an industry on your mat");
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
        return "Sell — pick a card from your hand to authorise the action.";
      }
      if (state.tileIds.length === 0) {
        return "Sell — pick at least one own unflipped Cotton / Manufacturer / Pottery tile.";
      }
      return `Sell — ${state.tileIds.length} tile${
        state.tileIds.length === 1 ? "" : "s"
      } picked. Click End Action to dispatch (or pick more).`;
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
  }
}
