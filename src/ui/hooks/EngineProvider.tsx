import { createContext, useContext, type ReactNode } from "react";
import type { Engine } from "../../engine/Engine";

export const EngineContext = createContext<Engine | null>(null);

/** PlayerId of the seat this browser session occupies, or null when the
 * viewer is unseated. Used to gate private information (own hand) so
 * one client never sees another player's cards. */
export const ViewerSeatContext = createContext<number | null>(null);

export function EngineProvider({
  engine,
  mySeatId,
  children,
}: {
  engine: Engine;
  mySeatId: number | null;
  children: ReactNode;
}) {
  return (
    <EngineContext.Provider value={engine}>
      <ViewerSeatContext.Provider value={mySeatId}>
        {children}
      </ViewerSeatContext.Provider>
    </EngineContext.Provider>
  );
}

export function useMySeatId(): number | null {
  return useContext(ViewerSeatContext);
}
