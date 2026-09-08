import type { WizardState } from "./wizardState";

export function wizardActionName(state: WizardState): string | null {
  if (state.phase === "IDLE") return null;
  if (state.phase === "AWAITING_CARD") return state.action === "PASS" ? "Pass" : "Loan";
  if (state.phase.includes("SCOUT")) return "Scout";
  if (state.phase.includes("DEVELOP")) return "Develop";
  if (state.phase.includes("BUILD")) return "Build";
  if (state.phase.includes("NETWORK")) return "Network";
  return "Sell";
}

export function commitHint(state: WizardState, era: "CANAL" | "RAIL"): string | null {
  switch (state.phase) {
    case "IDLE": return state.stashedCardIndex !== null ? "With a card selected, Loan or Pass completes immediately." : null;
    case "AWAITING_CARD": return "Picking a card completes this action immediately.";
    case "AWAITING_BUILD_INPUTS": return "The last required choice submits the Build, or opens its resource picker.";
    case "AWAITING_DEVELOP_INPUTS": return "One tile: End Action. Two tiles and a card: submits automatically, or asks for iron.";
    case "AWAITING_NETWORK_INPUTS": return era === "CANAL" ? "A card and a canal submit automatically." : "One rail: End Action. Two rails and a card: submits automatically, or asks for resources.";
    case "AWAITING_SELL_GLOUCESTER": return "The last free Develop choice completes the sale.";
    default: return null;
  }
}
