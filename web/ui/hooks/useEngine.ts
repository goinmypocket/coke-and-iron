import { useContext, useSyncExternalStore } from "react";
import type { Engine } from "../../../engine/Engine";
import type { ClientEngine } from "../../network/ClientEngine";
import type { ObservableEvent } from "../../../engine/eventLog";
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

/**
 * Subscribe to the engine and re-render whenever Engine.canUndo()
 * changes. Used by the Undo button to update its disabled state after
 * each successful dispatch and after every undo.
 */
export function useCanUndo(): boolean {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, () => engine.canUndo());
}

/**
 * Subscribes to the engine and returns the current intent-log length as
 * a re-render trigger. The log itself is mutated in place, so consumers
 * read it via `engine.getIntentLog()` directly inside render — this hook
 * just makes them re-render on every push / pop.
 */
export function useIntentLogVersion(): number {
  const engine = useEngine();
  return useSyncExternalStore(
    engine.subscribe,
    () => engine.getIntentLog().length,
  );
}

/** Stable empty array reused across snapshot calls when the engine does
 *  not expose `getRecentEvents` (e.g., the headless Engine in tests).
 *  useSyncExternalStore requires reference stability between calls when
 *  nothing changed. */
const EMPTY_EVENTS: readonly ObservableEvent[] = Object.freeze([]);

/**
 * Subscribes to the engine and returns the recent observable-event log,
 * the public history each client computes from its own STATE stream.
 * Falls back to an empty array on engine implementations that don't
 * carry the log (the headless Engine class — tests, editor previews).
 *
 * The returned array is the engine's internal reference; ClientEngine
 * replaces it with a fresh array on every change, so React's referential
 * equality check fires the re-render at the right time.
 */
export function useRecentEvents(): readonly ObservableEvent[] {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, () => {
    const probe = engine as unknown as Partial<ClientEngine>;
    return typeof probe.getRecentEvents === "function"
      ? probe.getRecentEvents()
      : EMPTY_EVENTS;
  });
}
