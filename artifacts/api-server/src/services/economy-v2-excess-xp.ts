/**
 * Excess Metelka cleaning XP (GDD §19.10).
 *
 * XP_max(T) = 30 × T / 25
 * XP_excess = XP_max(T) × Skill_excess
 *
 * Rounding: same as Care — Math.round on the final product only.
 * player_xp is INTEGER; no fractional XP accumulator exists.
 */

import {
  V2_EXCESS_PRESET_MAX,
  V2_EXCESS_PRESET_MIN,
} from "./economy-v2-excess";

export const V2_EXCESS_XP_MAX_AT_FULL_PRESET = 30;

export type ExcessCleaningXpBreakdown = {
  /** XP_max(T) = 30 × T / 25 (not pre-rounded). */
  maxXp: number;
  /** maxXp × skill (not pre-rounded). */
  rawXp: number;
  /** Math.round(rawXp), stored as integer player_xp delta. */
  awardedXp: number;
};

function clampPresetSeconds(presetSeconds: number): number {
  if (!Number.isFinite(presetSeconds)) return V2_EXCESS_PRESET_MIN;
  return Math.min(
    V2_EXCESS_PRESET_MAX,
    Math.max(V2_EXCESS_PRESET_MIN, Math.round(presetSeconds)),
  );
}

function clampSkill(skill: number): number {
  if (!Number.isFinite(skill)) return 0;
  return Math.min(1, Math.max(0, skill));
}

/**
 * Pure XP from locked preset + Skill.
 * Does not use web counts (Skill already encodes clear ratio).
 */
export function computeExcessCleaningXp(input: {
  presetSeconds: number;
  skill: number;
}): ExcessCleaningXpBreakdown {
  const T = clampPresetSeconds(input.presetSeconds);
  const skill = clampSkill(input.skill);
  const maxXp = (V2_EXCESS_XP_MAX_AT_FULL_PRESET * T) / 25;
  const rawXp = maxXp * skill;
  const awardedXp = Math.max(0, Math.round(rawXp));
  return { maxXp, rawXp, awardedXp };
}
