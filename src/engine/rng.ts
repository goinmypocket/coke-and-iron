// =============================================================================
// Seeded RNG for the engine.
//
// The whole engine is deterministic given (seed, intent log). Everything
// that needs randomness — deck shuffle, merchant-bag shuffle, future
// tie-breakers — must draw from this module and never from Math.random().
//
// Implementation: pure-rand's xoroshiro128+ generator with the unsafe
// (in-place) API. The generator state travels on GameState so the full
// game state stays replay-deterministic and round-trips through save /
// load via rng.getState() (an array of numbers).
// =============================================================================

import {
  xoroshiro128plus,
  unsafeUniformIntDistribution,
  type RandomGenerator,
} from "pure-rand";

export type Rng = RandomGenerator;

export function makeRng(seed: number): Rng {
  return xoroshiro128plus(seed);
}

/**
 * Fisher-Yates shuffle. Returns a new array. Mutates the supplied RNG in
 * place — callers that want a branch / lookahead should clone first
 * (rng.clone()).
 */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = unsafeUniformIntDistribution(0, i, rng);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Inclusive on both ends. Mutates rng in place. */
export function randomInt(min: number, max: number, rng: Rng): number {
  return unsafeUniformIntDistribution(min, max, rng);
}
