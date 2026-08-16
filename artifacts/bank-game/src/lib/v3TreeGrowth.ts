/**
 * Client mirror of api-server economy-v3-tree-growth SoT.
 * Used for Care growth-timer / +N мм when the claim payload lags (stale dist).
 *
 *   Growth_mm = T × Skill × Care × LongCare
 */

export const V3_TREE_GROWTH_PRESET_MIN = 5;
export const V3_TREE_GROWTH_PRESET_MAX = 25;

const CARE_INTERCEPT = 1.25;
const CARE_SLOPE = 0.01;
const LONG_CARE_BONUS_MAX = 0.5;
const LONG_CARE_RATE = 0.01;
const LONG_CARE_MIN = 1;
const LONG_CARE_MAX = 1.5;

/** Skill ∈ [0, 1]. Values in (1, 100] are treated as percents (minigame 0–100). */
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

export function computeCareCoeffForPreset(presetSeconds: number): number {
  return CARE_INTERCEPT - CARE_SLOPE * clampPresetSeconds(presetSeconds);
}

export function computeLongCare(longCareCycles: number): number {
  const n =
    Number.isFinite(longCareCycles) && longCareCycles > 0
      ? Math.trunc(longCareCycles)
      : 0;
  const value =
    LONG_CARE_MIN + LONG_CARE_BONUS_MAX * (1 - Math.exp(-LONG_CARE_RATE * n));
  if (value < LONG_CARE_MIN) return LONG_CARE_MIN;
  if (value > LONG_CARE_MAX) return LONG_CARE_MAX;
  return value;
}

export function computeEconomyV3TreeGrowth(input: {
  water: { presetSeconds: number; skill: number };
  sun: { presetSeconds: number; skill: number };
  fertilizer: { presetSeconds: number; skill: number };
  longCareCycles?: number;
}): { awardedMm: number } {
  const tw = clampPresetSeconds(input.water.presetSeconds);
  const ts = clampPresetSeconds(input.sun.presetSeconds);
  const tf = clampPresetSeconds(input.fertilizer.presetSeconds);
  const skill =
    (coerceV3CareSkill(input.water.skill) +
      coerceV3CareSkill(input.sun.skill) +
      coerceV3CareSkill(input.fertilizer.skill)) /
    3;
  const care =
    (computeCareCoeffForPreset(tw) +
      computeCareCoeffForPreset(ts) +
      computeCareCoeffForPreset(tf)) /
    3;
  const longCare = computeLongCare(input.longCareCycles ?? 0);
  const growthMm = (tw + ts + tf) * skill * care * longCare;
  // Skill 0: still award 1 mm for a completed Care trio (participation).
  const awardedMm =
    Number.isFinite(growthMm) && growthMm > 0
      ? Math.floor(growthMm)
      : skill === 0
        ? 1
        : 0;
  return { awardedMm };
}
