/**
 * Economy v3 tree growth SoT (production Care cycles only).
 *
 *   Growth_mm = T × Skill × Care × LongCare
 *
 * - T      = sum of three activity presets (5–25 each) → 15…75
 * - Skill  = mean of three activity skills ∈ [0, 1]
 * - Care   = mean of per-preset C(t), where C(t) = 1.25 − 0.01t (Metelka table)
 *            Care is NEVER C(sum T) — C applies to one preset only
 * - LongCare = 1 + 0.5(1 − e^{−0.01N}), N = lifetime successful Care claims
 *            range [1.00, 1.50)
 * - Skill 0 → award 1 mm (participation for a completed Care trio)
 *
 * Capital / rubles do not enter this formula. Tutorial uses fixed demo mm.
 */

export const V3_TREE_GROWTH_PRESET_MIN = 5;
export const V3_TREE_GROWTH_PRESET_MAX = 25;
export const V3_TREE_GROWTH_T_MIN = 15;
export const V3_TREE_GROWTH_T_MAX = 75;

/** Per-preset Care: C(t) = 1.25 − 0.01t for t ∈ [5, 25]. */
export const V3_CARE_COEFF_INTERCEPT = 1.25;
export const V3_CARE_COEFF_SLOPE = 0.01;

export const V3_LONG_CARE_BONUS_MAX = 0.5;
export const V3_LONG_CARE_RATE = 0.01;
export const V3_LONG_CARE_MIN = 1;
export const V3_LONG_CARE_MAX = 1.5;

export type V3TreeGrowthActivityInput = {
  presetSeconds: number;
  skill: number;
};

export type V3TreeGrowthInput = {
  water: V3TreeGrowthActivityInput;
  sun: V3TreeGrowthActivityInput;
  fertilizer: V3TreeGrowthActivityInput;
  /** Lifetime successful Care cycles completed before this award. */
  longCareCycles: number;
};

export type V3TreeGrowthBreakdown = {
  T: number;
  skill: number;
  /** Mean of C(T_i) for the three presets. */
  care: number;
  longCare: number;
  /** Raw Growth_mm before integer flooring. */
  growthMm: number;
  /** Integer mm awarded this cycle (floor of growthMm). */
  awardedMm: number;
};

/**
 * Skill ∈ [0, 1]. Values in (1, 100] are treated as percents (minigame 0–100).
 */
export function coerceV3CareSkill(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1 && raw <= 100) return raw / 100;
  if (raw > 1) return 1;
  return raw;
}

function clampPresetSeconds(raw: number): number {
  if (!Number.isFinite(raw)) return V3_TREE_GROWTH_PRESET_MIN;
  const n = Math.trunc(raw);
  if (n < V3_TREE_GROWTH_PRESET_MIN) return V3_TREE_GROWTH_PRESET_MIN;
  if (n > V3_TREE_GROWTH_PRESET_MAX) return V3_TREE_GROWTH_PRESET_MAX;
  return n;
}

function clampLongCareCycles(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.trunc(raw);
}

/**
 * Metelka / Care per-preset coefficient.
 * Table: 5→1.20, 10→1.15, 15→1.10, 20→1.05, 25→1.00.
 */
export function computeCareCoeffForPreset(presetSeconds: number): number {
  const t = clampPresetSeconds(presetSeconds);
  return V3_CARE_COEFF_INTERCEPT - V3_CARE_COEFF_SLOPE * t;
}

/** Cycle Care = arithmetic mean of the three per-preset C(T_i). */
export function computeCycleCareCoeff(
  waterPreset: number,
  sunPreset: number,
  fertilizerPreset: number,
): number {
  return (
    (computeCareCoeffForPreset(waterPreset) +
      computeCareCoeffForPreset(sunPreset) +
      computeCareCoeffForPreset(fertilizerPreset)) /
    3
  );
}

/**
 * LongCare(N) = 1 + 0.5(1 − e^{−0.01N}).
 * Approaches 1.50 asymptotically; never exceeds that ceiling in practice.
 */
export function computeLongCare(longCareCycles: number): number {
  const n = clampLongCareCycles(longCareCycles);
  const value =
    V3_LONG_CARE_MIN +
    V3_LONG_CARE_BONUS_MAX * (1 - Math.exp(-V3_LONG_CARE_RATE * n));
  if (value < V3_LONG_CARE_MIN) return V3_LONG_CARE_MIN;
  if (value > V3_LONG_CARE_MAX) return V3_LONG_CARE_MAX;
  return value;
}

export function computeEconomyV3TreeGrowth(
  input: V3TreeGrowthInput,
): V3TreeGrowthBreakdown {
  const tw = clampPresetSeconds(input.water.presetSeconds);
  const ts = clampPresetSeconds(input.sun.presetSeconds);
  const tf = clampPresetSeconds(input.fertilizer.presetSeconds);
  const sw = coerceV3CareSkill(input.water.skill);
  const ss = coerceV3CareSkill(input.sun.skill);
  const sf = coerceV3CareSkill(input.fertilizer.skill);

  const T = tw + ts + tf;
  const skill = (sw + ss + sf) / 3;
  const care = computeCycleCareCoeff(tw, ts, tf);
  const longCare = computeLongCare(input.longCareCycles);
  const growthMm = T * skill * care * longCare;
  // Skill 0: still award 1 mm for a completed Care trio (participation).
  const awardedMm =
    Number.isFinite(growthMm) && growthMm > 0
      ? Math.floor(growthMm)
      : skill === 0
        ? 1
        : 0;

  return { T, skill, care, longCare, growthMm, awardedMm };
}

/**
 * Apply awarded mm onto persisted growth + remainder (fractional carry).
 * Does not couple to rubles — remainder only carries unused Growth fractions.
 */
export function applyTreeGrowthAward(args: {
  currentMm: number;
  currentRemainder: number;
  growthMm: number;
}): { treeGrowthMm: number; treeGrowthRemainder: number; awardedMm: number } {
  const currentMm =
    Number.isFinite(args.currentMm) && args.currentMm > 0
      ? Math.trunc(args.currentMm)
      : 0;
  const currentRemainder =
    Number.isFinite(args.currentRemainder) && args.currentRemainder > 0
      ? args.currentRemainder
      : 0;
  const growth =
    Number.isFinite(args.growthMm) && args.growthMm > 0 ? args.growthMm : 0;

  const whole = Math.floor(growth);
  const frac = growth - whole;
  let rem = currentRemainder + frac;
  let delta = whole;
  if (rem >= 1) {
    const extra = Math.floor(rem);
    delta += extra;
    rem -= extra;
  }
  return {
    treeGrowthMm: currentMm + delta,
    treeGrowthRemainder: rem,
    awardedMm: delta,
  };
}
