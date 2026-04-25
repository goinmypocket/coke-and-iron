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
//   AWAITING_NETWORK_INPUTS       — Network; card + line in any order.
//                                   Auto-submit when both set. Rail-era
//                                   coal source auto-resolves to market;
//                                   second-rail-offer is deferred.
//   AWAITING_SELL_INPUTS          — Sell; card + 1+ own unflipped sellable
//                                   tiles in any order. Tile picks toggle
//                                   on duplicate click. End Action
//                                   submits; merchant + beer auto-resolve.
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
    }
  // §5.2 Network — card + line picked in any order. Auto-submit when both
  // set. Second-rail offer (Rail era only) is deferred — captured on the
  // roadmap.
  | {
      readonly phase: "AWAITING_NETWORK_INPUTS";
      readonly cardIndex: number | null;
      readonly lineIndex: number | null;
    }
  // §5.4 Sell — card + variable-arity own-tile picks, in any order.
  // Tile picks TOGGLE on duplicate click (distinct-id collection).
  // endAction submits with card + 1+ tiles. Merchant + beer sources are
  // auto-resolved at submit time; explicit pickers + Gloucester
  // follow-up are deferred to roadmap.
  | {
      readonly phase: "AWAITING_SELL_INPUTS";
      readonly cardIndex: number | null;
      readonly tileIds: readonly string[];
    };

export type WizardAction =
  | { type: "START_PASS" }
  | { type: "START_LOAN" }
  | { type: "START_SCOUT" }
  | { type: "START_DEVELOP"; developSeatId: PlayerId }
  | { type: "START_BUILD" }
  | { type: "START_NETWORK" }
  | { type: "TOGGLE_CARD"; cardIndex: number }
  | { type: "DEVELOP_SET_CARD"; cardIndex: number }
  | { type: "ADD_DEVELOP_INDUSTRY"; industry: IndustryName }
  | { type: "BUILD_SET_CARD"; cardIndex: number }
  | { type: "BUILD_SET_SLOT"; slot: BuildSlotPick }
  | { type: "BUILD_SET_INDUSTRY"; industry: IndustryName }
  | { type: "NETWORK_SET_CARD"; cardIndex: number }
  | { type: "NETWORK_SET_LINE"; lineIndex: number }
  | { type: "START_SELL" }
  | { type: "SELL_SET_CARD"; cardIndex: number }
  | { type: "SELL_TOGGLE_TILE"; tileId: string }
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
    case "START_NETWORK":
      return {
        phase: "AWAITING_NETWORK_INPUTS",
        cardIndex: null,
        lineIndex: null,
      };
    case "NETWORK_SET_CARD": {
      if (state.phase !== "AWAITING_NETWORK_INPUTS") return state;
      return { ...state, cardIndex: action.cardIndex };
    }
    case "NETWORK_SET_LINE": {
      if (state.phase !== "AWAITING_NETWORK_INPUTS") return state;
      return { ...state, lineIndex: action.lineIndex };
    }
    case "START_SELL":
      return {
        phase: "AWAITING_SELL_INPUTS",
        cardIndex: null,
        tileIds: [],
      };
    case "SELL_SET_CARD": {
      if (state.phase !== "AWAITING_SELL_INPUTS") return state;
      return { ...state, cardIndex: action.cardIndex };
    }
    case "SELL_TOGGLE_TILE": {
      // Distinct-id collection — same target click toggles the selection
      // (you can't sell the same tile twice, so toggle is the natural
      // "deselect" gesture).
      if (state.phase !== "AWAITING_SELL_INPUTS") return state;
      const has = state.tileIds.includes(action.tileId);
      return {
        ...state,
        tileIds: has
          ? state.tileIds.filter((id) => id !== action.tileId)
          : [...state.tileIds, action.tileId],
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
  if (
    state.phase === "AWAITING_DEVELOP_INPUTS" &&
    state.cardIndex !== null
  ) {
    return new Set([state.cardIndex]);
  }
  if (state.phase === "AWAITING_BUILD_INPUTS" && state.cardIndex !== null) {
    return new Set([state.cardIndex]);
  }
  if (
    state.phase === "AWAITING_NETWORK_INPUTS" &&
    state.cardIndex !== null
  ) {
    return new Set([state.cardIndex]);
  }
  if (state.phase === "AWAITING_SELL_INPUTS" && state.cardIndex !== null) {
    return new Set([state.cardIndex]);
  }
  return new Set();
}
