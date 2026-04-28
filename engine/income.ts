// =============================================================================
// Income ladder (§6.3).
//
// The Progress Track is 100 cells (steps 0..99). Levels run −10..30 but
// the bands are NON-UNIFORM:
//
//   Steps 0..10   → levels −10..0   (1 step per level)
//   Steps 11..30  → levels 1..10    (2 steps per level)
//   Steps 31..60  → levels 11..20   (3 steps per level)
//   Steps 61..99  → levels 21..30   (4 steps per level, level 30 truncated)
//
// The four bands don't factorise exactly (10 levels × 4 = 40 steps but the
// final band only has 39 cells), so level 30 lives in three cells (97..99)
// instead of four. We encode the bands as data and compute boundaries from
// it; no hand-tuned constants scattered around.
// =============================================================================

export const MIN_INCOME_LEVEL = -10;
export const MAX_INCOME_LEVEL = 30;
export const MIN_INCOME_STEP = 0;
export const MAX_INCOME_STEP = 99;

interface Band {
  readonly firstStep: number;
  readonly firstLevel: number;
  readonly stepsPerLevel: number;
  readonly lastStep: number;
  readonly lastLevel: number;
}

const BANDS: readonly Band[] = [
  { firstStep: 0, firstLevel: -10, stepsPerLevel: 1, lastStep: 10, lastLevel: 0 },
  { firstStep: 11, firstLevel: 1, stepsPerLevel: 2, lastStep: 30, lastLevel: 10 },
  { firstStep: 31, firstLevel: 11, stepsPerLevel: 3, lastStep: 60, lastLevel: 20 },
  { firstStep: 61, firstLevel: 21, stepsPerLevel: 4, lastStep: 99, lastLevel: 30 },
];

/** Step → level. Clamps to [-10, 30] for out-of-range inputs. */
export function stepToLevel(step: number): number {
  if (step <= MIN_INCOME_STEP) return MIN_INCOME_LEVEL;
  if (step >= MAX_INCOME_STEP) return MAX_INCOME_LEVEL;
  for (const band of BANDS) {
    if (step <= band.lastStep) {
      const levelInBand =
        band.firstLevel +
        Math.floor((step - band.firstStep) / band.stepsPerLevel);
      return Math.min(levelInBand, band.lastLevel);
    }
  }
  return MAX_INCOME_LEVEL;
}

/**
 * Level → the HIGHEST step at that level. Used by Loan to set the income
 * marker "on the highest step of the lower level reached" (§5.5 step 4).
 * Clamps to [0, 99] for out-of-range inputs.
 */
export function levelToHighestStep(level: number): number {
  if (level <= MIN_INCOME_LEVEL) return MIN_INCOME_STEP;
  if (level >= MAX_INCOME_LEVEL) return MAX_INCOME_STEP;
  for (const band of BANDS) {
    if (level <= band.lastLevel) {
      const offset = level - band.firstLevel;
      // Highest step of this level = firstStep + (offset+1)*stepsPerLevel - 1
      return band.firstStep + (offset + 1) * band.stepsPerLevel - 1;
    }
  }
  return MAX_INCOME_STEP;
}

/**
 * Move the step back by N levels, landing on the highest step of the
 * destination level (§5.5 step 4). Returns the destination level (may be
 * below MIN_INCOME_LEVEL — caller decides whether that is legal).
 */
export function moveBackLevels(
  step: number,
  deltaLevels: number,
): { level: number; step: number } {
  const current = stepToLevel(step);
  const target = current - deltaLevels;
  const clampedStep = levelToHighestStep(Math.max(target, MIN_INCOME_LEVEL));
  return { level: target, step: clampedStep };
}

/**
 * Advance the income step by N raw ladder steps (not levels), clamped to
 * [0, 99]. Used on tile flip (§2.10 / §5.1 step 8) and for merchant
 * INCOME bonuses — both measured in steps, not levels, per §6.3 note.
 */
export function advanceSteps(step: number, delta: number): number {
  return Math.max(
    MIN_INCOME_STEP,
    Math.min(MAX_INCOME_STEP, step + delta),
  );
}
