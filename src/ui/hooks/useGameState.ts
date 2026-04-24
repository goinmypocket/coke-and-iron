import { useContext, useSyncExternalStore } from "react";
import type { GameState } from "../../engine/types";
import { EngineContext } from "./EngineProvider";

export function useGameState<T>(selector: (state: GameState) => T): T {
  const engine = useContext(EngineContext);
  if (!engine) {
    throw new Error("useGameState must be used inside <EngineProvider>");
  }
  return useSyncExternalStore(
    engine.subscribe,
    () => selector(engine.getState()),
  );
}
