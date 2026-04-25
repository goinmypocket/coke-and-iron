// =============================================================================
// Wizard state machine — UI-only.
//
// Tracks half-completed action inputs that don't exist as far as the engine
// is concerned. The engine only ever sees the final assembled Intent.
//
// Phases at this milestone:
//   IDLE                       — no action in progress.
//   AWAITING_CARD              — player picked Pass or Loan; needs one
//                                card. Picking a card dispatches and the
//                                wizard returns to IDLE on success.
//   AWAITING_CARDS_SCOUT       — player picked Scout; toggles up to 3
//                                distinct card indices, then explicitly
//                                submits via endAction().
//
// Build / Network / Develop / Sell are not yet wired through the wizard —
// they will get their own phases once their UI lands.
// =============================================================================

export type WizardState =
  | { readonly phase: "IDLE" }
  | { readonly phase: "AWAITING_CARD"; readonly action: "PASS" | "LOAN" }
  | {
      readonly phase: "AWAITING_CARDS_SCOUT";
      readonly cardIndices: readonly number[];
    };

export type WizardAction =
  | { type: "START_PASS" }
  | { type: "START_LOAN" }
  | { type: "START_SCOUT" }
  | { type: "TOGGLE_CARD"; cardIndex: number }
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
      return { ...state, cardIndices: [...state.cardIndices, action.cardIndex] };
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
  return new Set();
}
