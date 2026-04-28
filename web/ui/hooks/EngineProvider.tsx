import { createContext, useContext, type ReactNode } from "react";
import type { Engine } from "../../../engine/Engine";

export const EngineContext = createContext<Engine | null>(null);

/** PlayerId of the seat this browser session occupies, or null when the
 * viewer is unseated. Used to gate private information (own hand) so
 * one client never sees another player's cards. */
export const ViewerSeatContext = createContext<number | null>(null);

/** Most recent server rejection of one of MY intents, formatted for
 * inline display. `null` when there's nothing to show. The dismiss
 * callback lets UI clear it on user interaction. */
interface RejectionValue {
  readonly text: string | null;
  dismiss(): void;
}

const noopRejection: RejectionValue = { text: null, dismiss: () => {} };

export const RejectionContext = createContext<RejectionValue>(noopRejection);

export function EngineProvider({
  engine,
  mySeatId,
  rejection,
  children,
}: {
  engine: Engine;
  mySeatId: number | null;
  rejection?: RejectionValue;
  children: ReactNode;
}) {
  return (
    <EngineContext.Provider value={engine}>
      <ViewerSeatContext.Provider value={mySeatId}>
        <RejectionContext.Provider value={rejection ?? noopRejection}>
          {children}
        </RejectionContext.Provider>
      </ViewerSeatContext.Provider>
    </EngineContext.Provider>
  );
}

export function useMySeatId(): number | null {
  return useContext(ViewerSeatContext);
}

export function useRejection(): RejectionValue {
  return useContext(RejectionContext);
}
