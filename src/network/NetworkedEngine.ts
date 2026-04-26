// =============================================================================
// Wraps a local Engine instance so that successful local dispatches are
// also forwarded to the host. Server broadcasts of OTHER clients' intents
// come back in via `applyRemote`, which uses the original (un-forwarded)
// dispatch to advance the mirror without re-sending.
//
// On rejection from the host (race lost, stale state, etc.), the caller
// invokes `rollbackLastDispatch()` which uses Engine.undo to roll back the
// optimistic local apply. Only safe within the originator's current turn —
// the same constraint Engine.undo already enforces.
// =============================================================================
import type { Engine } from "../engine/Engine";
import type { Intent, Result } from "../engine/types";

export interface NetworkedEngineHandle {
  /** The same Engine instance, with its `dispatch` method patched to
   *  forward successful intents to the host. */
  readonly engine: Engine;
  /** Apply an intent received from the server WITHOUT re-forwarding it. */
  applyRemote(intent: Intent): Result;
  /** Roll back the most recent locally-dispatched intent. Returns false
   *  when nothing to undo (e.g. the apply already crossed a turn
   *  boundary). */
  rollbackLastDispatch(): boolean;
}

export function networkifyEngine(
  engine: Engine,
  sendIntent: (intent: Intent) => void,
): NetworkedEngineHandle {
  const innerDispatch = engine.dispatch;
  engine.dispatch = (intent: Intent): Result => {
    const result = innerDispatch(intent);
    if (result.ok) sendIntent(intent);
    return result;
  };
  return {
    engine,
    applyRemote: (intent) => innerDispatch(intent),
    rollbackLastDispatch: () => engine.undo(),
  };
}
