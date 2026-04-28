import { describe, it, expect } from "vitest";
import { initialState, makeRng, randomInt, shuffle } from "../../engine";

describe("seeded RNG", () => {
  it("same seed produces identical shuffle sequence", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], makeRng(42));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], makeRng(42));
    expect(a).toEqual(b);
  });

  it("different seeds diverge (with overwhelming probability)", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], makeRng(42));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], makeRng(43));
    expect(a).not.toEqual(b);
  });

  it("shuffle preserves the multiset of elements", () => {
    const input = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
    const out = shuffle(input, makeRng(7));
    expect([...out].sort()).toEqual([...input].sort());
    expect(out).toHaveLength(input.length);
  });

  it("shuffle returns a new array and does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    const out = shuffle(input, makeRng(1));
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
  });

  it("randomInt is within the inclusive bounds", () => {
    const rng = makeRng(99);
    for (let i = 0; i < 100; i++) {
      const n = randomInt(3, 7, rng);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("randomInt with same seed produces identical sequence", () => {
    const rngA = makeRng(12345);
    const rngB = makeRng(12345);
    const seqA = Array.from({ length: 20 }, () => randomInt(0, 1000, rngA));
    const seqB = Array.from({ length: 20 }, () => randomInt(0, 1000, rngB));
    expect(seqA).toEqual(seqB);
  });

  it("advancing the RNG changes getState() (the state is observable)", () => {
    const rng = makeRng(55);
    const before = rng.getState();
    randomInt(0, 1_000_000, rng);
    const after = rng.getState();
    expect(after).not.toEqual(before);
  });

  it("initialState wires the rng from config.seed", () => {
    const s1 = initialState({ seed: 2026, playerCount: 2 });
    const s2 = initialState({ seed: 2026, playerCount: 2 });
    expect(s1.rng.getState()).toEqual(s2.rng.getState());

    const s3 = initialState({ seed: 2027, playerCount: 2 });
    expect(s1.rng.getState()).not.toEqual(s3.rng.getState());
  });

  it("initialState rng advances identically across replays given the same seed", () => {
    const s1 = initialState({ seed: 777, playerCount: 3 });
    const s2 = initialState({ seed: 777, playerCount: 3 });
    const draws1 = Array.from({ length: 50 }, () => randomInt(0, 999, s1.rng));
    const draws2 = Array.from({ length: 50 }, () => randomInt(0, 999, s2.rng));
    expect(draws1).toEqual(draws2);
  });
});
