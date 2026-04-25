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
//   AWAITING_DEVELOP_INPUTS       — Develop; card + 1 or 2 industries picked
//                                   in any order. Auto-submit when card +
//                                   2 industries; endAction() submits when
//                                   card + at least 1 industry.
//   AWAITING_BUILD_INPUTS         — Build; card + slot + industry in any
//                                   order. Auto-submit when all three set.
//
// All non-trivial wizards follow the §10.1 convention:
//   - Unique-cardinality inputs (card, slot, industry, line) are REPLACED
//     by a second click of the same input type.
//   - Variable-cardinality inputs (Develop industries[], Sell orders[],
//     Scout cards[]) ACCUMULATE up to the action's cap; Reset Selection
//     clears.
//
// Network / Sell aren't yet wired through the wizard.
// =============================================================================

import type { IndustryName, PlayerId } from "../../engine";

export interface BuildSlotPick {
  readonly cityName: string;
  readonly slotIndex: number;
}

export type WizardState =
  | { readonly phase: "IDLE" }
  | { readonly phase: "AWAITING_CARD"; readonly action: "PASS" | "LOAN" }
  | {
      readonly phase: "AWAITING_CARDS_SCOUT";
      readonly cardIndices: readonly number[];
    }
  // §5.3 Develop — card + 1 or 2 industries, picked in any order. Auto-submit
  // when card + 2 industries; End Action when card + at least 1.
  | {
      readonly phase: "AWAITING_DEVELOP_INPUTS";
      readonly developSeatId: PlayerId;
      readonly cardIndex: number | null;
      readonly industries: readonly IndustryName[];
    }
  // §5.1 Build — three fields picked in any order. Auto-submit when all
  // are set; endAction() submits whatever's set (engine validates).
  | {
      readonly phase: "AWAITING_BUILD_INPUTS";
      readonly cardIndex: number | null;
      readonly slot: BuildSlotPick | null;
      readonly industry: IndustryName | null;
    };

export type WizardAction =
  | { type: "START_PASS" }
  | { type: "START_LOAN" }
  | { type: "START_SCOUT" }
  | { type: "START_DEVELOP"; developSeatId: PlayerId }
  | { type: "START_BUILD" }
  | { type: "TOGGLE_CARD"; cardIndex: number }
  | { type: "DEVELOP_SET_CARD"; cardIndex: number }
  | { type: "ADD_DEVELOP_INDUSTRY"; industry: IndustryName }
  | { type: "BUILD_SET_CARD"; cardIndex: number }
  | { type: "BUILD_SET_SLOT"; slot: BuildSlotPick }
  | { type: "BUILD_SET_INDUSTRY"; industry: IndustryName }
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
      return {
        phase: "AWAITING_DEVELOP_INPUTS",
        developSeatId: action.developSeatId,
        cardIndex: null,
        industries: [],
      };
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
    case "DEVELOP_SET_CARD": {
      // Card is a unique-cardinality input — second click REPLACES.
      if (state.phase !== "AWAITING_DEVELOP_INPUTS") return state;
      return { ...state, cardIndex: action.cardIndex };
    }
    case "ADD_DEVELOP_INDUSTRY": {
      // Develop allows TWO tiles from the same industry stack (§5.3 — the
      // engine pops them in order, so the second pop sees a depleted
      // stack). Each click ADDS a pick; we never deselect on click. Cap
      // at 2 — the wizard auto-submits there. Use Reset Selection to
      // clear and start over.
      if (state.phase !== "AWAITING_DEVELOP_INPUTS") return state;
      if (state.industries.length >= 2) return state;
      return {
        ...state,
        industries: [...state.industries, action.industry],
      };
    }
    case "START_BUILD":
      return {
        phase: "AWAITING_BUILD_INPUTS",
        cardIndex: null,
        slot: null,
        industry: null,
      };
    case "BUILD_SET_CARD": {
      if (state.phase !== "AWAITING_BUILD_INPUTS") return state;
      return { ...state, cardIndex: action.cardIndex };
    }
    case "BUILD_SET_SLOT": {
      if (state.phase !== "AWAITING_BUILD_INPUTS") return state;
      return { ...state, slot: action.slot };
    }
    case "BUILD_SET_INDUSTRY": {
      if (state.phase !== "AWAITING_BUILD_INPUTS") return state;
      return { ...state, industry: action.industry };
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
  if (
    state.phase === "AWAITING_DEVELOP_INPUTS" &&
    state.cardIndex !== null
  ) {
    return new Set([state.cardIndex]);
  }
  if (state.phase === "AWAITING_BUILD_INPUTS" && state.cardIndex !== null) {
    return new Set([state.cardIndex]);
  }
  return new Set();
}
