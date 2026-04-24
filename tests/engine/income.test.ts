import { describe, it, expect } from "vitest";
import {
  MAX_INCOME_LEVEL,
  MAX_INCOME_STEP,
  MIN_INCOME_LEVEL,
  MIN_INCOME_STEP,
  levelToHighestStep,
  moveBackLevels,
  stepToLevel,
} from "../../src/engine/income";

describe("income ladder (§6.3)", () => {
  describe("stepToLevel band boundaries", () => {
    it("band 1 — 1 step per level: 0→−10, 10→0", () => {
      expect(stepToLevel(0)).toBe(-10);
      expect(stepToLevel(5)).toBe(-5);
      expect(stepToLevel(10)).toBe(0);
    });

    it("band 2 — 2 steps per level: 11→1, 12→1, 13→2, 30→10", () => {
      expect(stepToLevel(11)).toBe(1);
      expect(stepToLevel(12)).toBe(1);
      expect(stepToLevel(13)).toBe(2);
      expect(stepToLevel(14)).toBe(2);
      expect(stepToLevel(30)).toBe(10);
    });

    it("band 3 — 3 steps per level: 31→11, 33→11, 34→12, 60→20", () => {
      expect(stepToLevel(31)).toBe(11);
      expect(stepToLevel(33)).toBe(11);
      expect(stepToLevel(34)).toBe(12);
      expect(stepToLevel(60)).toBe(20);
    });

    it("band 4 — 4 steps per level: 61→21, 64→21, 65→22, 99→30", () => {
      expect(stepToLevel(61)).toBe(21);
      expect(stepToLevel(64)).toBe(21);
      expect(stepToLevel(65)).toBe(22);
      expect(stepToLevel(99)).toBe(30);
    });

    it("clamps below MIN and above MAX", () => {
      expect(stepToLevel(-5)).toBe(MIN_INCOME_LEVEL);
      expect(stepToLevel(1000)).toBe(MAX_INCOME_LEVEL);
    });
  });

  describe("levelToHighestStep — highest step at a level", () => {
    it("level −10 → 0 (only step), level 0 → 10 (top of single-step band)", () => {
      expect(levelToHighestStep(-10)).toBe(0);
      expect(levelToHighestStep(0)).toBe(10);
    });

    it("level 1 → 12, level 10 → 30 (top of 2-step band)", () => {
      expect(levelToHighestStep(1)).toBe(12);
      expect(levelToHighestStep(10)).toBe(30);
    });

    it("level 11 → 33, level 20 → 60 (top of 3-step band)", () => {
      expect(levelToHighestStep(11)).toBe(33);
      expect(levelToHighestStep(20)).toBe(60);
    });

    it("level 21 → 64, level 29 → 96, level 30 caps at 99", () => {
      expect(levelToHighestStep(21)).toBe(64);
      expect(levelToHighestStep(29)).toBe(96);
      expect(levelToHighestStep(30)).toBe(MAX_INCOME_STEP);
    });

    it("clamps below MIN and above MAX", () => {
      expect(levelToHighestStep(-20)).toBe(MIN_INCOME_STEP);
      expect(levelToHighestStep(100)).toBe(MAX_INCOME_STEP);
    });
  });

  describe("round-trip: levelToHighestStep(stepToLevel(s)) ≥ s for every s", () => {
    it("is monotonic over the full range", () => {
      for (let s = 0; s <= 99; s++) {
        const l = stepToLevel(s);
        const top = levelToHighestStep(l);
        expect(top).toBeGreaterThanOrEqual(s);
        expect(stepToLevel(top)).toBe(l);
      }
    });
  });

  describe("moveBackLevels — §5.5 step 4 semantics", () => {
    it("default seat (step 10, level 0) minus 3 levels → level −3, step 7", () => {
      const m = moveBackLevels(10, 3);
      expect(m.level).toBe(-3);
      expect(m.step).toBe(7);
    });

    it("step 30 (level 10) minus 3 → level 7, step = highest of L7 = 24", () => {
      // Level 7 in 2-step band: firstStep=11, offset=6, highest=11 + 7*2 - 1 = 24.
      const m = moveBackLevels(30, 3);
      expect(m.level).toBe(7);
      expect(m.step).toBe(24);
    });

    it("step 99 (level 30) minus 3 → level 27, step = 61 + 7*4 - 1 = 88", () => {
      // Band 4: L21→61..64, L22→65..68, ..., L27→85..88 (highest 88).
      const m = moveBackLevels(99, 3);
      expect(m.level).toBe(27);
      expect(m.step).toBe(88);
    });

    it("reports target level unclamped — caller decides legality", () => {
      // Step 2 (level −8) minus 3 → target level −11 (below floor).
      const m = moveBackLevels(2, 3);
      expect(m.level).toBe(-11);
      // step is clamped to levelToHighestStep(-10) = 0.
      expect(m.step).toBe(0);
    });

    it("step 3 (level −7) minus 3 → level −10 exactly, step 0", () => {
      const m = moveBackLevels(3, 3);
      expect(m.level).toBe(-10);
      expect(m.step).toBe(0);
    });
  });
});
