// =============================================================================
// WizardProvider — context glue for the local UI state machine.
//
// The engine never knows about "half-picked" inputs; this provider keeps
// them in React state and assembles full Intents on dispatch. Pass and
// Loan dispatch as soon as the player picks a card; Scout collects three
// distinct cards then waits for endAction(). Card-first flow (§10.1) is
// not yet implemented — clicks in IDLE no-op for now.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { reasonToText } from "../affordances/toast";
import { useEngine } from "../hooks/useEngine";
import {
  INITIAL_WIZARD,
  pickedCardIndices,
  wizardReducer,
  type WizardState,
} from "./wizardState";

interface WizardApi {
  readonly state: WizardState;
  /** Card indices currently highlighted (for HandPanel rendering). */
  readonly picked: ReadonlySet<number>;
  startPass(): void;
  startLoan(): void;
  startScout(): void;
  /** Click on a card from HandPanel. Routes to the active phase. */
  pickCard(cardIndex: number): void;
  /** Submit the current wizard (used by Scout). */
  endAction(): void;
  /** Cancel the current wizard back to IDLE without dispatching. */
  reset(): void;
}

const WizardContext = createContext<WizardApi | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD);

  const startPass = useCallback(
    () => dispatch({ type: "START_PASS" }),
    [],
  );
  const startLoan = useCallback(
    () => dispatch({ type: "START_LOAN" }),
    [],
  );
  const startScout = useCallback(
    () => dispatch({ type: "START_SCOUT" }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const pickCard = useCallback(
    (cardIndex: number) => {
      // Read fresh state at click time — the wizard reducer's snapshot
      // would be stale across renders.
      const live = state;
      if (live.phase === "IDLE") {
        // §10.1 card-first flow not yet implemented.
        return;
      }
      if (live.phase === "AWAITING_CARD") {
        const playerId =
          engine.getState().turnOrder[engine.getState().currentPlayerIndex]!;
        const result = engine.dispatch(
          live.action === "PASS"
            ? { type: "PASS", playerId, cardIndex }
            : { type: "LOAN", playerId, cardIndex },
        );
        if (result.ok) {
          dispatch({ type: "RESET" });
        } else {
          toast.error(reasonToText(result.reason));
        }
        return;
      }
      // AWAITING_CARDS_SCOUT — toggle selection.
      dispatch({ type: "TOGGLE_CARD", cardIndex });
    },
    [engine, state],
  );

  const endAction = useCallback(() => {
    if (state.phase !== "AWAITING_CARDS_SCOUT") return;
    if (state.cardIndices.length !== 3) {
      toast.error("Pick three distinct cards before submitting.");
      return;
    }
    const liveState = engine.getState();
    const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
    const [a, b, c] = state.cardIndices as [number, number, number];
    const result = engine.dispatch({
      type: "SCOUT",
      playerId,
      cardIndices: [a, b, c],
    });
    if (result.ok) {
      dispatch({ type: "RESET" });
    } else {
      toast.error(reasonToText(result.reason));
    }
  }, [engine, state]);

  const api = useMemo<WizardApi>(
    () => ({
      state,
      picked: pickedCardIndices(state),
      startPass,
      startLoan,
      startScout,
      pickCard,
      endAction,
      reset,
    }),
    [state, startPass, startLoan, startScout, pickCard, endAction, reset],
  );

  return (
    <WizardContext.Provider value={api}>{children}</WizardContext.Provider>
  );
}

export function useWizard(): WizardApi {
  const ctx = useContext(WizardContext);
  if (!ctx) {
    throw new Error("useWizard must be used inside <WizardProvider>");
  }
  return ctx;
}
