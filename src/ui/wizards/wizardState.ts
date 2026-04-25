// =============================================================================
// Wizard state machine — UI-only.
//
// Tracks half-completed action inputs that don't exist as far as the engine
// is concerned. The engine only ever sees the final assembled Intent.
//
// Phases:
//   IDLE                          — no action in progress.
//   AWAITING_CARD                 — Pass / Loan; one card click dispatches.
//   AWAITING_CARDS_SCOUT          — Scout; toggle up to 3 distinct card
//                                   indices, submit via endAction().
//   AWAITING_CARD_DEVELOP         — Develop, step 1: waiting for a card click
//                                   from hand to authorise the action.
//   AWAITING_DEVELOP_INDUSTRIES   — Develop, step 2: card chosen; user picks
//                                   1 or 2 mat industries from their own
//                                   sub-panel. Auto-submit at 2; endAction()
//                                   submits with 1.
//
// Build / Network / Sell aren't yet wired through the wizard.
// =============================================================================

import type { IndustryName, PlayerId } from "../../engine";

export type WizardState =
  | { readonly phase: "IDLE" }
  | { readonly phase: "AWAITING_CARD"; readonly action: "PASS" | "LOAN" }
  | {
      readonly phase: "AWAITING_CARDS_SCOUT";
      readonly cardIndices: readonly number[];
    }
  | { readonly phase: "AWAITING_CARD_DEVELOP" }
  | {
      readonly phase: "AWAITING_DEVELOP_INDUSTRIES";
      readonly cardIndex: number;
      readonly developSeatId: PlayerId;
      readonly industries: readonly IndustryName[];
    };

export type WizardAction =
  | { type: "START_PASS" }
  | { type: "START_LOAN" }
  | { type: "START_SCOUT" }
  | { type: "START_DEVELOP" }
  | { type: "TOGGLE_CARD"; cardIndex: number }
  | {
      type: "PICK_DEVELOP_CARD";
      cardIndex: number;
      developSeatId: PlayerId;
    }
  | {
      type: "ADD_DEVELOP_INDUSTRY";
      industry: IndustryName;
    }
  | { type: "RESET" };

export const INITIAL_WIZARD: WizardState = { phase: "IDLE" };

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "START_PASS":
      return { phase: "AWAITING_CARD", action: "PASS" };
    case "START_LOAN":
      return { phase: "AWAITING_CARD", action: "LOAN" };
    case "START_SCOUT":
      return { phase: "AWAITING_CARDS_SCOUT", cardIndices: [] };
    case "START_DEVELOP":
      return { phase: "AWAITING_CARD_DEVELOP" };
    case "TOGGLE_CARD": {
      if (state.phase !== "AWAITING_CARDS_SCOUT") return state;
      const i = state.cardIndices.indexOf(action.cardIndex);
      if (i >= 0) {
        return {
          ...state,
          cardIndices: state.cardIndices.filter(
            (idx) => idx !== action.cardIndex,
          ),
        };
      }
      if (state.cardIndices.length >= 3) return state;
      return {
        ...state,
        cardIndices: [...state.cardIndices, action.cardIndex],
      };
    }
    case "PICK_DEVELOP_CARD": {
      if (state.phase !== "AWAITING_CARD_DEVELOP") return state;
      return {
        phase: "AWAITING_DEVELOP_INDUSTRIES",
        cardIndex: action.cardIndex,
        developSeatId: action.developSeatId,
        industries: [],
      };
    }
    case "ADD_DEVELOP_INDUSTRY": {
      // Develop allows TWO tiles from the same industry stack (§5.3 — the
      // engine pops them in order, so the second pop sees a depleted
      // stack). Each click ADDS a pick; we never deselect on click. Cap
      // at 2 — the wizard auto-submits there. Use Reset Selection to
      // clear and start over.
      if (state.phase !== "AWAITING_DEVELOP_INDUSTRIES") return state;
      if (state.industries.length >= 2) return state;
      return {
        ...state,
        industries: [...state.industries, action.industry],
      };
    }
    case "RESET":
      return { phase: "IDLE" };
  }
}

/** Set of card indices the wizard currently has highlighted in the Hand
 * panel. Used to draw the warm-gold border on picked cards. */
export function pickedCardIndices(state: WizardState): ReadonlySet<number> {
  if (state.phase === "AWAITING_CARDS_SCOUT") {
    return new Set(state.cardIndices);
  }
  if (state.phase === "AWAITING_DEVELOP_INDUSTRIES") {
    return new Set([state.cardIndex]);
  }
  return new Set();
}
