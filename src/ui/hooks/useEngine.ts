import { useContext } from "react";
import type { Engine } from "../../engine/Engine";
import { EngineContext } from "./EngineProvider";

/**
 * Get the live Engine instance for dispatching intents. Components that
 * only need to READ state should prefer `useGameState(selector)`; this
 * hook is for buttons and wizards that need to call `engine.dispatch()`.
 */
export function useEngine(): Engine {
  const engine = useContext(EngineContext);
  if (!engine) {
    throw new Error("useEngine must be used inside <EngineProvider>");
  }
  return engine;
}
