/**
 * Economy v2 Care activity XP + result validation.
 *
 * XP_max(T) = 100 × T / 25
 * XP_activity = round(XP_max(T) × Skill)
 * where Skill = skillScore / 100, T = snapshot duration seconds.
 *
 * Completed Care trio at Skill 0 → 1 XP (participation), same idea as 1 mm.
 */

export type EconomyV2CareActivityResultInput = {
  skillScore: unknown;
  collected?: unknown;
  maximum?: unknown;
};

export type NormalizedCareActivityResult = {
  skillScore: number;
  /** Counter increment; defaults to 1 when collected omitted. */
  collected: number;
  maximum: number | null;
};

export class EconomyV2CareResultError extends Error {
  readonly status = 400;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EconomyV2CareResultError";
    this.code = code;
  }
}

/** Clamp + round skill to integer 0–100 (matches historical session score storage). */
export function normalizeSkillScore(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new EconomyV2CareResultError(
      "invalid_skill_score",
      "skillScore must be a finite number",
    );
  }
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * XP_activity = round(100 × T / 25 × Skill)
 * Equivalent: round(4 × T × skillScore / 100)
 */
export function computeEconomyV2ActivityXp(
  durationSeconds: number,
  skillScore: number,
): number {
  const T = Math.max(0, durationSeconds);
  const skill = Math.min(100, Math.max(0, skillScore)) / 100;
  const xp = Math.round((100 * T) / 25 * skill);
  return Math.max(0, xp);
}

/** Sum of per-activity XP for a Care cycle from snapshot durations + scores. */
export function computeEconomyV2CycleXp(
  allocation: {
    waterSeconds: number;
    sunSeconds: number;
    fertilizerSeconds: number;
  },
  scores: { water: number; sun: number; fertilizer: number },
  completed: { water: boolean; sun: boolean; fertilizer: boolean },
): number {
  let total = 0;
  if (completed.water) {
    total += computeEconomyV2ActivityXp(allocation.waterSeconds, scores.water);
  }
  if (completed.sun) {
    total += computeEconomyV2ActivityXp(allocation.sunSeconds, scores.sun);
  }
  if (completed.fertilizer) {
    total += computeEconomyV2ActivityXp(
      allocation.fertilizerSeconds,
      scores.fertilizer,
    );
  }
  const trioDone = completed.water && completed.sun && completed.fertilizer;
  if (trioDone && total === 0) {
    const anyDuration =
      allocation.waterSeconds > 0 ||
      allocation.sunSeconds > 0 ||
      allocation.fertilizerSeconds > 0;
    if (anyDuration) return 1;
  }
  return total;
}

export function parseEconomyV2CareActivityResult(
  raw: unknown,
): NormalizedCareActivityResult {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new EconomyV2CareResultError(
      "invalid_result",
      "result object is required",
    );
  }
  const body = raw as EconomyV2CareActivityResultInput;
  const skillScore = normalizeSkillScore(body.skillScore);

  const hasCollected = body.collected !== undefined;
  const hasMaximum = body.maximum !== undefined;

  // collected alone → counter increment (no skill cross-check).
  // collected + maximum → validate skillScore ≈ collected/maximum×100.
  if (!hasCollected && !hasMaximum) {
    return { skillScore, collected: 1, maximum: null };
  }

  if (hasMaximum && !hasCollected) {
    throw new EconomyV2CareResultError(
      "invalid_result",
      "maximum requires collected",
    );
  }

  const collectedRaw = body.collected;
  if (typeof collectedRaw !== "number" || !Number.isFinite(collectedRaw)) {
    throw new EconomyV2CareResultError(
      "invalid_result",
      "collected must be a finite number",
    );
  }
  if (collectedRaw < 0) {
    throw new EconomyV2CareResultError(
      "invalid_result",
      "collected must be >= 0",
    );
  }
  const collected = Math.max(0, Math.round(collectedRaw));

  if (!hasMaximum) {
    return { skillScore, collected, maximum: null };
  }

  const maximumRaw = body.maximum;
  if (typeof maximumRaw !== "number" || !Number.isFinite(maximumRaw)) {
    throw new EconomyV2CareResultError(
      "invalid_result",
      "maximum must be a finite number",
    );
  }
  if (maximumRaw <= 0) {
    throw new EconomyV2CareResultError(
      "invalid_result",
      "maximum must be > 0",
    );
  }
  if (collectedRaw > maximumRaw) {
    throw new EconomyV2CareResultError(
      "invalid_result",
      "collected must be <= maximum",
    );
  }

  const maximum = maximumRaw;
  const expectedSkill = Math.min(
    100,
    Math.max(0, Math.round((Math.min(collected, maximum) / maximum) * 100)),
  );
  // Allow ±1 for float/rounding differences across minigames.
  if (Math.abs(expectedSkill - skillScore) > 1) {
    throw new EconomyV2CareResultError(
      "skill_mismatch",
      `skillScore ${skillScore} does not match collected/maximum (${expectedSkill})`,
    );
  }

  return { skillScore, collected, maximum };
}

export function calcPlayerLevel(xp: number): number {
  if (xp >= 5000) return 5;
  if (xp >= 2500) return 4;
  if (xp >= 1000) return 3;
  if (xp >= 300) return 2;
  return 1;
}
