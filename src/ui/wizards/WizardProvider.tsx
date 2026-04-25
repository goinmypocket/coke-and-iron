// =============================================================================
// WizardProvider — context glue for the local UI state machine.
//
// The engine never knows about "half-picked" inputs; this provider keeps
// them in React state and assembles full Intents on dispatch.
//
//   Pass / Loan       — card click dispatches immediately.
//   Scout             — three card clicks then endAction().
//   Develop           — card click captures cardIndex; mat clicks pick 1 or
//                       2 industries. Auto-submit at 2, endAction() at 1.
//                       Iron sources are auto-resolved at submit time:
//                       cheapest free network iron (any unflipped Iron
//                       Works tile, any owner) per pick, falling back to
//                       MARKET when none remain.
//
// Card-first flow (§10.1) is not yet implemented — clicks in IDLE no-op.
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
import type {
  GameState,
  IndustryName,
  IronSource,
  PlayerId,
} from "../../engine";
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
  startDevelop(): void;
  /** Click on a card from HandPanel. Routes to the active phase. */
  pickCard(cardIndex: number): void;
  /** Click on a mat top-tile from a player sub-panel. */
  pickIndustry(seatId: PlayerId, industry: IndustryName): void;
  /** Submit the current wizard (Scout: 3 cards; Develop: 1 industry). */
  endAction(): void;
  /** Cancel the current wizard back to IDLE without dispatching. */
  reset(): void;
}

const WizardContext = createContext<WizardApi | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD);

  const startPass = useCallback(() => dispatch({ type: "START_PASS" }), []);
  const startLoan = useCallback(() => dispatch({ type: "START_LOAN" }), []);
  const startScout = useCallback(() => dispatch({ type: "START_SCOUT" }), []);
  const startDevelop = useCallback(
    () => dispatch({ type: "START_DEVELOP" }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const submitDevelop = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_DEVELOP_INDUSTRIES") return;
      if (live.industries.length === 0) {
        toast.error("Pick at least one industry to develop.");
        return;
      }
      const sources = autoResolveIronSources(
        engine.getState(),
        live.industries.length,
      );
      const result = engine.dispatch({
        type: "DEVELOP",
        playerId: live.developSeatId,
        cardIndex: live.cardIndex,
        industries: [...live.industries],
        ironSources: sources.map((s) => [s]),
      });
      if (result.ok) {
        dispatch({ type: "RESET" });
      } else {
        toast.error(reasonToText(result.reason));
      }
    },
    [engine],
  );

  const pickCard = useCallback(
    (cardIndex: number) => {
      const live = state;
      if (live.phase === "IDLE") return;
      if (live.phase === "AWAITING_CARD") {
        const liveState = engine.getState();
        const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
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
      if (live.phase === "AWAITING_CARDS_SCOUT") {
        dispatch({ type: "TOGGLE_CARD", cardIndex });
        return;
      }
      if (live.phase === "AWAITING_CARD_DEVELOP") {
        const liveState = engine.getState();
        const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
        dispatch({
          type: "PICK_DEVELOP_CARD",
          cardIndex,
          developSeatId: playerId,
        });
        return;
      }
      if (live.phase === "AWAITING_DEVELOP_INDUSTRIES") {
        // Card already picked — additional card clicks are no-ops.
        return;
      }
    },
    [engine, state],
  );

  const pickIndustry = useCallback(
    (seatId: PlayerId, industry: IndustryName) => {
      const live = state;
      if (live.phase !== "AWAITING_DEVELOP_INDUSTRIES") return;
      if (live.developSeatId !== seatId) return;

      const already = live.industries.includes(industry);
      const nextCount = already
        ? live.industries.length - 1
        : live.industries.length + 1;

      dispatch({ type: "TOGGLE_DEVELOP_INDUSTRY", industry });

      // Auto-submit when we just landed on 2 picks.
      if (!already && nextCount === 2) {
        const projected: WizardState = {
          ...live,
          industries: [...live.industries, industry],
        };
        submitDevelop(projected);
      }
    },
    [state, submitDevelop],
  );

  const endAction = useCallback(() => {
    const live = state;
    if (live.phase === "AWAITING_CARDS_SCOUT") {
      if (live.cardIndices.length !== 3) {
        toast.error("Pick three distinct cards before submitting.");
        return;
      }
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const [a, b, c] = live.cardIndices as [number, number, number];
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
      return;
    }
    if (live.phase === "AWAITING_DEVELOP_INDUSTRIES") {
      submitDevelop(live);
      return;
    }
  }, [engine, state, submitDevelop]);

  const api = useMemo<WizardApi>(
    () => ({
      state,
      picked: pickedCardIndices(state),
      startPass,
      startLoan,
      startScout,
      startDevelop,
      pickCard,
      pickIndustry,
      endAction,
      reset,
    }),
    [
      state,
      startPass,
      startLoan,
      startScout,
      startDevelop,
      pickCard,
      pickIndustry,
      endAction,
      reset,
    ],
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

/**
 * Pick `count` iron sources, preferring free network iron (any unflipped
 * Iron Works tile with cubes, any owner) over the market. Walks `builtTiles`
 * deterministically (engine list order); decrements local counts so two
 * develops in one dispatch don't double-claim the same cube.
 */
function autoResolveIronSources(
  state: GameState,
  count: number,
): IronSource[] {
  const remaining = new Map<string, number>();
  for (const tile of state.builtTiles) {
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (spec?.industry !== "IRON_WORKS") continue;
    if (tile.flipped) continue;
    if (tile.resources <= 0) continue;
    remaining.set(tile.id, tile.resources);
  }
  const sources: IronSource[] = [];
  for (let i = 0; i < count; i++) {
    let pickedTile: string | null = null;
    for (const [id, n] of remaining) {
      if (n > 0) {
        pickedTile = id;
        break;
      }
    }
    if (pickedTile !== null) {
      sources.push({ kind: "TILE", tileId: pickedTile });
      remaining.set(pickedTile, (remaining.get(pickedTile) ?? 0) - 1);
    } else {
      sources.push({ kind: "MARKET" });
    }
  }
  return sources;
}
