import { createContext, useContext, type ReactNode } from "react";
import type { Engine } from "../../../engine/Engine";

export const EngineContext = createContext<Engine | null>(null);

/** PlayerId of the seat this browser session occupies, or null when the
 * viewer is unseated. Used to gate private information (own hand) so
 * one client never sees another player's cards.
 *
 * For spectators who've picked a player to "view through", this carries
 * the chosen player's PlayerId — that's what the UI uses to decide
 * whose hand to render. The server-side handleIntent still rejects any
 * dispatch coming from a spectator, so seating-action gates need the
 * separate `ActualSeatContext`. */
export const ViewerSeatContext = createContext<number | null>(null);

/** PlayerId of the seat this user actually owns on the server, or null
 *  for true spectators. This is the gate for "may I dispatch?" — keeps
 *  the spectator-view picker from making the action verbs clickable. */
export const ActualSeatContext = createContext<number | null>(null);

/** Most recent server rejection of one of MY intents, formatted for
 * inline display. `null` when there's nothing to show. The dismiss
 * callback lets UI clear it on user interaction. */
interface RejectionValue {
  readonly text: string | null;
  dismiss(): void;
}

const PausedContext = createContext(false);
export function usePaused(): boolean { return useContext(PausedContext); }

const noopRejection: RejectionValue = { text: null, dismiss: () => {} };

export const RejectionContext = createContext<RejectionValue>(noopRejection);

export function EngineProvider({
  engine,
  mySeatId,
  actualSeatId,
  rejection,
  paused = false,
  children,
}: {
  engine: Engine;
  /** Whose hand to render. For seated players this equals their seat;
   *  for spectators picking a viewing perspective, it's the chosen
   *  player's id. */
  mySeatId: number | null;
  /** The seat this user actually owns. null for true spectators —
   *  prevents the wizard from offering action verbs they can't dispatch. */
  actualSeatId?: number | null;
  rejection?: RejectionValue;
  paused?: boolean;
  children: ReactNode;
}) {
  return (
    <EngineContext.Provider value={engine}>
      <ViewerSeatContext.Provider value={mySeatId}>
        <ActualSeatContext.Provider
          value={actualSeatId === undefined ? mySeatId : actualSeatId}
        >
          <RejectionContext.Provider value={rejection ?? noopRejection}>
            <PausedContext.Provider value={paused}>{children}</PausedContext.Provider>
          </RejectionContext.Provider>
        </ActualSeatContext.Provider>
      </ViewerSeatContext.Provider>
    </EngineContext.Provider>
  );
}

export function useMySeatId(): number | null {
  return useContext(ViewerSeatContext);
}

/** The seat this user actually owns. Differs from `useMySeatId` only
 *  for spectators with a viewing override; gates dispatch eligibility. */
export function useActualSeatId(): number | null {
  return useContext(ActualSeatContext);
}

export function useRejection(): RejectionValue {
  return useContext(RejectionContext);
}
