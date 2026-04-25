import { useContext, useRef, useSyncExternalStore } from "react";
import type { GameState } from "../../engine/types";
import { EngineContext } from "./EngineProvider";

const UNINITIALIZED = Symbol("uninitialized");

/**
 * Subscribe to the engine and project a slice of GameState.
 *
 * Caches the most recent selector result so getSnapshot returns a
 * REFERENCE-stable value while the underlying state is unchanged
 * (per `isEqual`). useSyncExternalStore throws "The result of
 * getSnapshot should be cached to avoid an infinite loop" otherwise —
 * which is exactly what selectors building object literals do
 * (`s => ({a: s.x, b: s.y})`).
 *
 * Pass `shallowEqual` for selectors that return objects or arrays
 * whose contents are stable but whose outer reference changes per
 * call.
 */
export function useGameState<T>(
  selector: (state: GameState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const engine = useContext(EngineContext);
  if (!engine) {
    throw new Error("useGameState must be used inside <EngineProvider>");
  }
  const cacheRef = useRef<T | typeof UNINITIALIZED>(UNINITIALIZED);
  return useSyncExternalStore(engine.subscribe, () => {
    const next = selector(engine.getState());
    if (cacheRef.current !== UNINITIALIZED && isEqual(cacheRef.current as T, next)) {
      return cacheRef.current as T;
    }
    cacheRef.current = next;
    return next;
  });
}

/**
 * One-level structural equality. Treats two objects (or arrays) as
 * equal when they have the same keys/length AND every value matches
 * by Object.is. Pass as the second arg to useGameState whenever the
 * selector returns a fresh object/array literal each call.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.is(aRec[k], bRec[k])) return false;
  }
  return true;
}
