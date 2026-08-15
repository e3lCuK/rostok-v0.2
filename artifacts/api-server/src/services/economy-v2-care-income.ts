/**
 * Economy v2 ordinary Care income (pure, deterministic).
 *
 * D_base  = capital × 0.12 × elapsed / SECONDS_PER_YEAR
 * Skill_cycle = (w + s + f) / 300
 * bonusRate = 0.015 + 0.015 × Skill_cycle × Freshness   ∈ [0.015, 0.03]
 * D_bonus = capital × bonusRate × elapsed / SECONDS_PER_YEAR
 *
 * No Math.random, missed_sessions, storedSessions, or streak money multipliers.
 */

import {
  ACTIVITY_DURATION_PRESETS,
  secondsPerGameSecondForCapital,
  V2_REFERENCE_CAPITAL,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
  V2_ENERGY_BANK_MAX,
} from "./economy-v2";

export const V2_BASE_APR = 0.12;
export const V2_BONUS_APR_MIN = 0.015;
export const V2_BONUS_APR_VARIABLE = 0.015;
export const V2_SECONDS_PER_YEAR = 365 * 24 * 60 * 60; // 31_536_000
export const V2_FRESHNESS_MIN = 0.5;
export const V2_FRESHNESS_MAX = 1.0;
export const V2_FRESHNESS_GRACE_CYCLES = 3;
export const V2_FRESHNESS_DECAY_PER_EXTRA_CYCLE = 0.01;
export const V2_FRESHNESS_RECOVERY_ON_CARE = 0.05;

export type EconomyV2CareIncomeInput = {
  capital: number;
  /** Epoch ms of last income settle; null/undefined → no backfill. */
  incomeAnchorAt: number | null | undefined;
  nowMs: number;
  waterScore: number;
  sunScore: number;
  fertilizerScore: number;
  /** Persisted freshness before this Care (0.50–1.00). */
  freshness: number;
  /**
   * Ordinary Care financial elapsed (ms), excluding excess-period share.
   * When provided (including 0), money uses this instead of full wall-clock.
   * Freshness decay still uses wall-clock since incomeAnchorAt.
   */
  ordinaryIncomeElapsedMs?: number | null;
};

export type EconomyV2CareIncomeResult = {
  elapsedFinancialSeconds: number;
  cycleSkill: number;
  freshnessForReward: number;
  newFreshness: number;
  bonusRate: number;
  effectiveBonusRate: number;
  baseReward: number;
  bonusReward: number;
  totalReward: number;
  /** True when anchor was missing — caller must persist now without paying. */
  didInitializeAnchor: boolean;
};

/** Round half-up to 2 decimal places (kopecks). */
export function roundMoneyToKopecks(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function clampSkillScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

/** Skill_cycle = (w + s + f) / 300 ∈ [0, 1]. */
export function computeCycleSkill(
  waterScore: number,
  sunScore: number,
  fertilizerScore: number,
): number {
  const sum =
    clampSkillScore(waterScore) +
    clampSkillScore(sunScore) +
    clampSkillScore(fertilizerScore);
  return sum / 300;
}

export function normalizePersistedFreshness(raw: number): number {
  if (!Number.isFinite(raw)) return V2_FRESHNESS_MAX;
  return Math.min(V2_FRESHNESS_MAX, Math.max(V2_FRESHNESS_MIN, raw));
}

/**
 * Real seconds for a full 60-energy bank refill at capital K.
 * t60 = 60 × T(K). Invalid / negative capital → Infinity (no decay).
 */
export function t60SecondsForCapital(capital: number): number {
  const t = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(t) || t <= 0) return Number.POSITIVE_INFINITY;
  return V2_ENERGY_BANK_MAX * t;
}

export function computeFreshnessForReward(input: {
  oldFreshness: number;
  elapsedFinancialSeconds: number;
  capital: number;
}): { freshnessForReward: number; newFreshness: number; extraCycles: number } {
  const old = normalizePersistedFreshness(input.oldFreshness);
  const elapsed = Math.max(0, input.elapsedFinancialSeconds);
  const t60 = t60SecondsForCapital(input.capital);

  let extraCycles = 0;
  if (Number.isFinite(t60) && t60 > 0 && elapsed > 0) {
    const absenceCycles = elapsed / t60;
    extraCycles = Math.max(
      0,
      Math.floor(absenceCycles) - V2_FRESHNESS_GRACE_CYCLES,
    );
  }

  const freshnessForReward = Math.max(
    V2_FRESHNESS_MIN,
    old - V2_FRESHNESS_DECAY_PER_EXTRA_CYCLE * extraCycles,
  );
  const newFreshness = Math.min(
    V2_FRESHNESS_MAX,
    freshnessForReward + V2_FRESHNESS_RECOVERY_ON_CARE,
  );

  return { freshnessForReward, newFreshness, extraCycles };
}

export function computeBonusRate(
  cycleSkill: number,
  freshnessForReward: number,
): number {
  const skill = Number.isFinite(cycleSkill)
    ? Math.min(1, Math.max(0, cycleSkill))
    : 0;
  const freshness = normalizePersistedFreshness(freshnessForReward);
  const rate =
    V2_BONUS_APR_MIN + V2_BONUS_APR_VARIABLE * skill * freshness;
  return Math.min(V2_BONUS_APR_MIN + V2_BONUS_APR_VARIABLE, Math.max(V2_BONUS_APR_MIN, rate));
}

/**
 * Pure Care income for one completed ordinary Care cycle.
 * Deterministic — identical inputs → identical outputs.
 */
export function computeEconomyV2CareIncome(
  input: EconomyV2CareIncomeInput,
): EconomyV2CareIncomeResult {
  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();
  const capital =
    Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;

  const anchorRaw = input.incomeAnchorAt;
  const anchorMissing =
    anchorRaw == null ||
    (typeof anchorRaw === "number" && !Number.isFinite(anchorRaw));

  const cycleSkillEarly = computeCycleSkill(
    input.waterScore,
    input.sunScore,
    input.fertilizerScore,
  );

  if (anchorMissing) {
    // First run: initialize anchor, no back-accrual. Care still recovers Freshness.
    const freshnessForReward = normalizePersistedFreshness(input.freshness);
    const newFreshness = Math.min(
      V2_FRESHNESS_MAX,
      freshnessForReward + V2_FRESHNESS_RECOVERY_ON_CARE,
    );
    const bonusRate = computeBonusRate(cycleSkillEarly, freshnessForReward);
    return {
      elapsedFinancialSeconds: 0,
      cycleSkill: cycleSkillEarly,
      freshnessForReward,
      newFreshness,
      bonusRate,
      effectiveBonusRate: bonusRate,
      baseReward: 0,
      bonusReward: 0,
      totalReward: 0,
      didInitializeAnchor: true,
    };
  }

  const anchorMs = Math.trunc(Number(anchorRaw));
  const wallElapsedFinancialSeconds = Math.max(0, (nowMs - anchorMs) / 1000);
  const ordinaryMsRaw = input.ordinaryIncomeElapsedMs;
  const useOrdinarySplit =
    ordinaryMsRaw != null && Number.isFinite(Number(ordinaryMsRaw));
  const elapsedFinancialSeconds = useOrdinarySplit
    ? Math.max(0, Number(ordinaryMsRaw) / 1000)
    : wallElapsedFinancialSeconds;

  const cycleSkill = computeCycleSkill(
    input.waterScore,
    input.sunScore,
    input.fertilizerScore,
  );

  const { freshnessForReward, newFreshness } = computeFreshnessForReward({
    oldFreshness: input.freshness,
    elapsedFinancialSeconds: wallElapsedFinancialSeconds,
    capital,
  });

  if (capital <= 0 || elapsedFinancialSeconds <= 0) {
    return {
      elapsedFinancialSeconds,
      cycleSkill,
      freshnessForReward,
      newFreshness,
      bonusRate: computeBonusRate(cycleSkill, freshnessForReward),
      effectiveBonusRate: computeBonusRate(cycleSkill, freshnessForReward),
      baseReward: 0,
      bonusReward: 0,
      totalReward: 0,
      didInitializeAnchor: false,
    };
  }

  const bonusRate = computeBonusRate(cycleSkill, freshnessForReward);
  const yearFrac = elapsedFinancialSeconds / V2_SECONDS_PER_YEAR;
  const baseRaw = capital * V2_BASE_APR * yearFrac;
  const bonusRaw = capital * bonusRate * yearFrac;
  const baseReward = roundMoneyToKopecks(baseRaw);
  const bonusReward = roundMoneyToKopecks(bonusRaw);

  return {
    elapsedFinancialSeconds,
    cycleSkill,
    freshnessForReward,
    newFreshness,
    bonusRate,
    effectiveBonusRate: bonusRate,
    baseReward,
    bonusReward,
    totalReward: roundMoneyToKopecks(baseReward + bonusReward),
    didInitializeAnchor: false,
  };
}

/**
 * Income for one completed Care mini-game of `presetSeconds` duration.
 * Financial elapsed = game-seconds × T(K) — the wall time that
 * generated those reserve/energy seconds at current capital.
 * Uses the same APR formulas as Care cycle income.
 * `skill` is 0…1 (v3); maps to cycleSkill for bonus rate.
 */
export function computeIncomeForOneGame(input: {
  capital: number;
  presetSeconds: number;
  skill?: number;
  freshness?: number;
}): {
  base: number;
  bonus: number;
  total: number;
  bonusRate: number;
  elapsedFinancialSeconds: number;
} {
  const capital =
    Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;
  const preset = Math.max(
    0,
    Math.floor(Number(input.presetSeconds) || 0),
  );
  const skill =
    input.skill != null && Number.isFinite(input.skill)
      ? Math.min(1, Math.max(0, Number(input.skill)))
      : 1;
  const freshness = normalizePersistedFreshness(
    input.freshness != null && Number.isFinite(input.freshness)
      ? Number(input.freshness)
      : V2_FRESHNESS_MAX,
  );
  const bonusRate = computeBonusRate(skill, freshness);
  const t = secondsPerGameSecondForCapital(capital);
  const elapsedFinancialSeconds =
    capital > 0 && preset > 0 && Number.isFinite(t) && t > 0
      ? preset * t
      : 0;
  if (capital <= 0 || elapsedFinancialSeconds <= 0) {
    return {
      base: 0,
      bonus: 0,
      total: 0,
      bonusRate,
      elapsedFinancialSeconds,
    };
  }
  const yearFrac = elapsedFinancialSeconds / V2_SECONDS_PER_YEAR;
  const base = roundMoneyToKopecks(capital * V2_BASE_APR * yearFrac);
  const bonus = roundMoneyToKopecks(capital * bonusRate * yearFrac);
  return {
    base,
    bonus,
    total: roundMoneyToKopecks(base + bonus),
    bonusRate,
    elapsedFinancialSeconds,
  };
}

/** Catalog: income for each activity duration preset at current capital. */
export function buildIncomeByPresetTable(input: {
  capital: number;
  /** Illustrative skill 0…1 for bonus (default perfect). */
  skill?: number;
  freshness?: number;
}): Array<{
  presetSeconds: number;
  income: number;
  base: number;
  bonus: number;
}> {
  const skill = input.skill ?? 1;
  const freshness = input.freshness ?? V2_FRESHNESS_MAX;
  return ACTIVITY_DURATION_PRESETS.map((presetSeconds) => {
    const r = computeIncomeForOneGame({
      capital: input.capital,
      presetSeconds,
      skill,
      freshness,
    });
    return {
      presetSeconds,
      income: r.total,
      base: r.base,
      bonus: r.bonus,
    };
  });
}

/** Re-export for docs / tests. */
export { V2_REFERENCE_CAPITAL, V2_SECONDS_PER_ENERGY_AT_REFERENCE };
