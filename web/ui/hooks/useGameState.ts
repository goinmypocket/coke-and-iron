/// <reference types="vite/client" />
import { useContext, useRef, useSyncExternalStore } from "react";
import type { GameState } from "../../../engine/types";
import { EngineContext } from "./EngineProvider";

const UNINITIALIZED = Symbol("uninitialized");

/**
 * Subscribe to the engine and project a slice of GameState.
 *
 * **Two-tier cache** that defends against `useSyncExternalStore`'s
 * "The result of getSnapshot should be cached to avoid an infinite
 * loop" error:
 *
 *   1. **State-reference cache** — the engine returns the SAME
 *      GameState object until something mutates it. We memoise the
 *      selector against that ref, so getSnapshot calls within a
 *      single render hit the cache without re-running the selector
 *      AT ALL. This is the load-bearing fix: even an unstable
 *      selector like `s => s.players.map(...)` (which builds a fresh
 *      array of fresh objects) returns the same memoised reference
 *      while state is unchanged, satisfying React's stability
 *      requirement.
 *
 *   2. **Value-equality cache** — when state DOES change, run the
 *      selector once, then compare the new result with the cached
 *      one via `isEqual`. If equal, keep the old reference so
 *      downstream `useMemo` / `===` comparisons stay stable.
 *
 * Pass `shallowEqual` (exported below) when the selector returns
 * objects or arrays whose CONTENTS are stable across state changes
 * but whose outer reference is freshly built each call.
 *
 * In dev builds we also detect unstable selectors at the source: if
 * two calls against the SAME state ref disagree on `isEqual`, the
 * selector is non-deterministic and we log a clear warning pointing
 * at the call site. (We don't throw — that would cascade through
 * React's render pipeline and obscure the real culprit.)
 */
export function useGameState<T>(
  selector: (state: GameState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const engine = useContext(EngineContext);
  if (!engine) {
    throw new Error("useGameState must be used inside <EngineProvider>");
  }
  const stateRef = useRef<GameState | null>(null);
  const cacheRef = useRef<T | typeof UNINITIALIZED>(UNINITIALIZED);

  return useSyncExternalStore(engine.subscribe, () => {
    const state = engine.getState();

    if (
      stateRef.current === state &&
      cacheRef.current !== UNINITIALIZED
    ) {
      // Same state object as last call — the engine hasn't mutated
      // since we last ran. Return the cached projection regardless of
      // whether the selector itself is referentially stable.
      if (import.meta.env.DEV) {
        const recomputed = selector(state);
        if (!isEqual(cacheRef.current as T, recomputed)) {
          // eslint-disable-next-line no-console
          console.error(
            "[useGameState] Selector returned a non-equal value for the SAME GameState reference. " +
              "This indicates the selector is non-deterministic — usually `s => s.foo.map(...)` " +
              "or `s => ({...})` paired with the default Object.is equality. " +
              "Either return a stable reference (e.g. `s.foo`) or pass `shallowEqual`. " +
              "The state-reference cache is masking the bug at runtime; please fix the selector.",
            { cached: cacheRef.current, recomputed },
          );
        }
      }
      return cacheRef.current as T;
    }

    const next = selector(state);
    if (
      cacheRef.current !== UNINITIALIZED &&
      isEqual(cacheRef.current as T, next)
    ) {
      stateRef.current = state;
      return cacheRef.current as T;
    }
    stateRef.current = state;
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
