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
//   AWAITING_SELL_GLOUCESTER      — Sell sub-state entered after End
//                                   Action when one or more orders
//                                   consumed Gloucester merchant beer.
//                                   Captures one mat-industry pick per
//                                   beer; auto-submits at full count.
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

import type {
  CoalSource,
  IndustryName,
  IronSource,
  PlayerId,
  SellOrder,
} from "../../engine";

export interface BuildSlotPick {
  readonly cityName: string;
  readonly slotIndex: number;
}

export type WizardState =
  // §10.1 — IDLE may carry a stashed card chosen card-first; the next
  // action button picks up where it left off.
  | { readonly phase: "IDLE"; readonly stashedCardIndex: number | null }
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
  // §5.2 Network — card + line(s) picked in any order. Canal era auto-
  // submits when card + first line are set. Rail era waits for the user
  // to either pick a second line (auto-submits at the second pick) or
  // hit End Action with one line set. Line picks toggle on duplicate
  // click and fill first → second in click order.
  | {
      readonly phase: "AWAITING_NETWORK_INPUTS";
      readonly cardIndex: number | null;
      readonly lineIndex: number | null;
      readonly secondLineIndex: number | null;
    }
  // §5.4 Sell — card + variable-arity own-tile picks, in any order.
  // Tile picks TOGGLE on duplicate click (distinct-id collection).
  // endAction submits with card + 1+ tiles. Merchant + beer sources
  // auto-resolve at submit; explicit pickers are roadmap.
  | {
      readonly phase: "AWAITING_SELL_INPUTS";
      readonly cardIndex: number | null;
      readonly tileIds: readonly string[];
    }
  // §5.4 step 3 Gloucester follow-up — entered after End Action on Sell
  // when one or more orders consumed Gloucester merchant beer. The
  // wizard freezes the Sell inputs and asks the player for one industry
  // per Gloucester beer consumed. Same Develop semantics: industries
  // accumulate (duplicates allowed); auto-submit on the Nth pick.
  | {
      readonly phase: "AWAITING_SELL_GLOUCESTER";
      readonly cardIndex: number;
      readonly orders: readonly SellOrder[];
      readonly need: number;
      readonly industries: readonly IndustryName[];
    }
  // §5.6.2 Develop iron-source picker — entered when 2+ unflipped Iron
  // Works tiles are available. The wizard freezes the Develop inputs
  // (card + industries) and asks the user to click each tile (or
  // "Use Market") until all cubes are sourced. Auto-submits at the
  // last pick.
  | {
      readonly phase: "AWAITING_DEVELOP_IRON_PICK";
      readonly cardIndex: number;
      readonly developSeatId: PlayerId;
      readonly industries: readonly IndustryName[];
      readonly picks: readonly IronSource[];
    }
  // §5.6.1 / §5.6.2 Build resource picker — entered after all 3 Build
  // inputs are set when EITHER coal (2+ closest mines tied) or iron
  // (2+ unflipped works) has multiple free board options. Non-ambiguous
  // picks are pre-filled at entry; the user clicks only the rows that
  // remain. Auto-submits at the last pick.
  | {
      readonly phase: "AWAITING_BUILD_RESOURCES";
      readonly cardIndex: number;
      readonly slot: BuildSlotPick;
      readonly industry: IndustryName;
      readonly coalNeed: number;
      readonly ironNeed: number;
      readonly coalPicks: readonly CoalSource[];
      readonly ironPicks: readonly IronSource[];
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
  | { type: "NETWORK_TOGGLE_LINE"; lineIndex: number; allowSecond: boolean }
  | { type: "START_SELL" }
  | { type: "SELL_SET_CARD"; cardIndex: number }
  | { type: "SELL_TOGGLE_TILE"; tileId: string }
  | {
      type: "ENTER_SELL_GLOUCESTER";
      cardIndex: number;
      orders: readonly SellOrder[];
      need: number;
    }
  | { type: "ADD_SELL_GLOUCESTER_INDUSTRY"; industry: IndustryName }
  | {
      type: "ENTER_DEVELOP_IRON_PICK";
      cardIndex: number;
      developSeatId: PlayerId;
      industries: readonly IndustryName[];
    }
  | { type: "DEVELOP_IRON_ADD_PICK"; source: IronSource }
  | { type: "DEVELOP_IRON_RESET_PICKS" }
  | {
      type: "ENTER_BUILD_RESOURCES";
      cardIndex: number;
      slot: BuildSlotPick;
      industry: IndustryName;
      coalNeed: number;
      ironNeed: number;
      coalPicks: readonly CoalSource[];
      ironPicks: readonly IronSource[];
    }
  | { type: "BUILD_COAL_ADD_PICK"; source: CoalSource }
  | { type: "BUILD_IRON_ADD_PICK"; source: IronSource }
  | { type: "BUILD_RESOURCES_RESET" }
  | { type: "IDLE_STASH_CARD"; cardIndex: number | null }
  | { type: "RESET" };

export const INITIAL_WIZARD: WizardState = {
  phase: "IDLE",
  stashedCardIndex: null,
};

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
        secondLineIndex: null,
      };
    case "NETWORK_SET_CARD": {
      if (state.phase !== "AWAITING_NETWORK_INPUTS") return state;
      return { ...state, cardIndex: action.cardIndex };
    }
    case "NETWORK_TOGGLE_LINE": {
      if (state.phase !== "AWAITING_NETWORK_INPUTS") return state;
      const li = action.lineIndex;
      // Toggle off if already picked.
      if (li === state.lineIndex) {
        // Promote second to first if any so the slots stay packed.
        return {
          ...state,
          lineIndex: state.secondLineIndex,
          secondLineIndex: null,
        };
      }
      if (li === state.secondLineIndex) {
        return { ...state, secondLineIndex: null };
      }
      // Fill first slot first, then second when allowed (rail era).
      if (state.lineIndex === null) {
        return { ...state, lineIndex: li };
      }
      if (action.allowSecond && state.secondLineIndex === null) {
        return { ...state, secondLineIndex: li };
      }
      // Otherwise replace first (canal era's only "swap" gesture; or
      // rail era when both are full and the user wants to redo).
      return { ...state, lineIndex: li };
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
    case "ENTER_SELL_GLOUCESTER":
      return {
        phase: "AWAITING_SELL_GLOUCESTER",
        cardIndex: action.cardIndex,
        orders: action.orders,
        need: action.need,
        industries: [],
      };
    case "ADD_SELL_GLOUCESTER_INDUSTRY": {
      // Repeatable target — duplicates allowed (same Develop semantics
      // per §5.3); cap at `need`.
      if (state.phase !== "AWAITING_SELL_GLOUCESTER") return state;
      if (state.industries.length >= state.need) return state;
      return {
        ...state,
        industries: [...state.industries, action.industry],
      };
    }
    case "ENTER_DEVELOP_IRON_PICK":
      return {
        phase: "AWAITING_DEVELOP_IRON_PICK",
        cardIndex: action.cardIndex,
        developSeatId: action.developSeatId,
        industries: action.industries,
        picks: [],
      };
    case "DEVELOP_IRON_ADD_PICK": {
      if (state.phase !== "AWAITING_DEVELOP_IRON_PICK") return state;
      if (state.picks.length >= state.industries.length) return state;
      return { ...state, picks: [...state.picks, action.source] };
    }
    case "DEVELOP_IRON_RESET_PICKS": {
      if (state.phase !== "AWAITING_DEVELOP_IRON_PICK") return state;
      return { ...state, picks: [] };
    }
    case "ENTER_BUILD_RESOURCES":
      return {
        phase: "AWAITING_BUILD_RESOURCES",
        cardIndex: action.cardIndex,
        slot: action.slot,
        industry: action.industry,
        coalNeed: action.coalNeed,
        ironNeed: action.ironNeed,
        coalPicks: action.coalPicks,
        ironPicks: action.ironPicks,
      };
    case "BUILD_COAL_ADD_PICK": {
      if (state.phase !== "AWAITING_BUILD_RESOURCES") return state;
      if (state.coalPicks.length >= state.coalNeed) return state;
      return { ...state, coalPicks: [...state.coalPicks, action.source] };
    }
    case "BUILD_IRON_ADD_PICK": {
      if (state.phase !== "AWAITING_BUILD_RESOURCES") return state;
      if (state.ironPicks.length >= state.ironNeed) return state;
      return { ...state, ironPicks: [...state.ironPicks, action.source] };
    }
    case "BUILD_RESOURCES_RESET": {
      if (state.phase !== "AWAITING_BUILD_RESOURCES") return state;
      return { ...state, coalPicks: [], ironPicks: [] };
    }
    case "IDLE_STASH_CARD": {
      // Card-first flow only applies in IDLE. While a wizard is open
      // the wizard's own SET_CARD reducers handle card clicks.
      if (state.phase !== "IDLE") return state;
      return { ...state, stashedCardIndex: action.cardIndex };
    }
    case "RESET":
      return { phase: "IDLE", stashedCardIndex: null };
  }
}

/** Set of card indices the wizard currently has highlighted in the Hand
 * panel. Used to draw the warm-gold border on picked cards. */
export function pickedCardIndices(state: WizardState): ReadonlySet<number> {
  if (state.phase === "IDLE" && state.stashedCardIndex !== null) {
    return new Set([state.stashedCardIndex]);
  }
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
  if (state.phase === "AWAITING_SELL_GLOUCESTER") {
    return new Set([state.cardIndex]);
  }
  if (state.phase === "AWAITING_DEVELOP_IRON_PICK") {
    return new Set([state.cardIndex]);
  }
  if (state.phase === "AWAITING_BUILD_RESOURCES") {
    return new Set([state.cardIndex]);
  }
  return new Set();
}
