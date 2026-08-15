export type EconomyV2Input = {
  capital: number;
  elapsedSeconds: number;
  freshnessCoefficient?: number;
};

export type EconomyV2Result = {
  rawEnergy: number;
  freshnessCoefficient: number;
  usableEnergy: number;
};

export const ACTIVITY_DURATION_PRESETS = [
  5, 6, 7, 8, 9,
  10, 11, 12, 13, 14,
  15, 16, 17, 18, 19,
  20, 21, 22, 23, 24,
  25,
] as const;

export type ActivityDurationPreset =
  (typeof ACTIVITY_DURATION_PRESETS)[number];

export type EconomyV2ActivityResult = EconomyV2Result & {
  activityDuration: ActivityDurationPreset;
  maxXp: number;
};

export type EconomyV2ActivityCompletionInput = EconomyV2Input & {
  performanceCoefficient: number;
};

export type EconomyV2ActivityCompletionResult =
  EconomyV2ActivityResult & {
    earnedXp: number;
  };

/** Reference capital where 1 game-second accumulates in exactly 12 minutes. */
export const V2_REFERENCE_CAPITAL = 100_000;
export const V2_CAPITAL_EXPONENT = 0.15;
/**
 * Weight in T(K)=3600/(1+W·(K/REF)^0.15).
 * Chosen so T(REF)=720s (12 min): 3600/(1+W)=720 → W=4.
 */
export const V2_ENERGY_CAPITAL_WEIGHT = 4;
/** Real seconds for +1 energy at K=0 (60 minutes). */
export const V2_SECONDS_PER_ENERGY_AT_ZERO = 60 * 60;
/** Real seconds for +1 energy at reference capital (12 minutes). */
export const V2_SECONDS_PER_ENERGY_AT_REFERENCE = 12 * 60;
export const V2_ENERGY_BANK_MIN = 0;
export const V2_ENERGY_BANK_MAX = 60;

export function isActivityDurationPreset(
  value: number,
): value is ActivityDurationPreset {
  return Number.isInteger(value) && value >= 5 && value <= 25;
}

export function energyToActivityDuration(
  usableEnergy: number,
): ActivityDurationPreset {
  if (!Number.isFinite(usableEnergy)) {
    return 5;
  }

  const wholeSeconds = Math.floor(usableEnergy);
  const clampedSeconds = Math.min(25, Math.max(5, wholeSeconds));

  return clampedSeconds as ActivityDurationPreset;
}

const PERFECT_ACTIVITY_XP = 100;

/**
 * (K/REF)^0.15 capital ratio term. Non-finite / negative → null (invalid).
 * K=0 → 0 (base generation still runs via T(0)=3600).
 */
export function capitalRatioPower(capital: number): number | null {
  if (!Number.isFinite(capital) || capital < 0) return null;
  if (capital === 0) return 0;
  return Math.pow(capital / V2_REFERENCE_CAPITAL, V2_CAPITAL_EXPONENT);
}

/**
 * Real seconds for +1 game-second / energy unit:
 *   T(K) = 3600 / (1 + 4·(K/100000)^0.15)
 * K=0 → 3600 (60 min); K=100000 → 720 (12 min); larger K → faster, dampened.
 * Non-finite / negative capital → Infinity (no accrual).
 */
export function secondsPerGameSecondForCapital(capital: number): number {
  const ratio = capitalRatioPower(capital);
  if (ratio == null) return Number.POSITIVE_INFINITY;
  return (
    V2_SECONDS_PER_ENERGY_AT_ZERO /
    (1 + V2_ENERGY_CAPITAL_WEIGHT * ratio)
  );
}

/**
 * Effective multiplier vs the 12-minute reference tick:
 *   M(K) = 720 / T(K) = (1 + 4·(K/REF)^0.15) / 5
 * At REF → 1; at 0 → 0.2. Prefer {@link secondsPerGameSecondForCapital} /
 * {@link generateEnergyFromElapsed} for new code.
 */
export function capitalMultiplier(capital: number): number {
  const t = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return V2_SECONDS_PER_ENERGY_AT_REFERENCE / t;
}

/**
 * Energy generated over elapsed real time at the given capital.
 * generatedEnergy = elapsedSeconds / T(K)
 */
export function generateEnergyFromElapsed(
  capital: number,
  elapsedSeconds: number,
): number {
  const safeElapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  if (safeElapsed === 0) return 0;
  const t = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return safeElapsed / t;
}

export function clampV2EnergyBank(value: number): number {
  if (!Number.isFinite(value)) return V2_ENERGY_BANK_MIN;
  return Math.min(V2_ENERGY_BANK_MAX, Math.max(V2_ENERGY_BANK_MIN, value));
}

export function calculateMaxXpForDuration(
  duration: ActivityDurationPreset,
): number {
  return Math.round(
    (duration / 25) * PERFECT_ACTIVITY_XP,
  );
}

export function normalizePerformanceCoefficient(
  performanceCoefficient: number,
): number {
  return Number.isFinite(performanceCoefficient)
    ? Math.min(1, Math.max(0, performanceCoefficient))
    : 0;
}

export function calculateEarnedXp(
  duration: ActivityDurationPreset,
  performanceCoefficient: number,
): number {
  const maxXp = calculateMaxXpForDuration(duration);
  const normalizedPerformance =
    normalizePerformanceCoefficient(performanceCoefficient);
  const earnedXp = maxXp * normalizedPerformance;
  return Math.floor(earnedXp);
}

export function normalizeFreshnessCoefficient(
  freshnessCoefficient: number,
): number {
  return Number.isFinite(freshnessCoefficient)
    ? Math.min(1, Math.max(0, freshnessCoefficient))
    : 0;
}

export function applyFreshnessToEnergy(
  rawEnergy: number,
  freshnessCoefficient: number,
): number {
  const normalizedRawEnergy = Number.isFinite(rawEnergy)
    ? Math.max(0, rawEnergy)
    : 0;
  const normalizedFreshness =
    normalizeFreshnessCoefficient(freshnessCoefficient);
  return normalizedRawEnergy * normalizedFreshness;
}

/**
 * Continuous energy accumulation (pre-cap).
 * Single source of truth for the capital × elapsed formula.
 */
export function calculateEconomyV2(input: EconomyV2Input): EconomyV2Result {
  const rawEnergy = generateEnergyFromElapsed(
    input.capital,
    input.elapsedSeconds,
  );

  const freshnessCoefficient = input.freshnessCoefficient ?? 1;
  const normalizedFreshnessCoefficient =
    normalizeFreshnessCoefficient(freshnessCoefficient);
  const usableEnergy = applyFreshnessToEnergy(
    rawEnergy,
    normalizedFreshnessCoefficient,
  );

  return {
    rawEnergy,
    freshnessCoefficient: normalizedFreshnessCoefficient,
    usableEnergy,
  };
}

export function calculateEconomyV2Activity(
  input: EconomyV2Input,
): EconomyV2ActivityResult {
  const economy = calculateEconomyV2(input);
  const activityDuration = energyToActivityDuration(
    economy.usableEnergy,
  );
  const maxXp = calculateMaxXpForDuration(activityDuration);

  return {
    ...economy,
    activityDuration,
    maxXp,
  };
}

export function calculateEconomyV2ActivityCompletion(
  input: EconomyV2ActivityCompletionInput,
): EconomyV2ActivityCompletionResult {
  const activity = calculateEconomyV2Activity(input);
  const earnedXp = calculateEarnedXp(
    activity.activityDuration,
    input.performanceCoefficient,
  );

  return {
    ...activity,
    earnedXp,
  };
}

/**
 * @deprecated Bank auto-accrual removed. Use settleEconomyV2Roots from economy-v2-roots.
 * Kept type aliases for gradual import migration in tests.
 */
export type SettleEconomyV2EnergyInput = {
  energySeconds: number;
  energyAnchorAt: number | null | undefined;
  capital: number;
  nowMs: number;
  rootReadyMask?: bigint | string | number | null;
  rootGenerationProgress?: number | null;
};
