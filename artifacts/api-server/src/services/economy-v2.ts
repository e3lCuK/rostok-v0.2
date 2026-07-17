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

const CAPITAL_EXPONENT = 0.15;
const FULL_REGEN_SECONDS = 8 * 60 * 60;
const RAW_ENERGY_SCALE = 10;
const PERFECT_ACTIVITY_XP = 100;

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

/** Isolated v2 economy stub — not wired into production game flow. */
export function calculateEconomyV2(input: EconomyV2Input): EconomyV2Result {
  const capital = Math.max(0, input.capital);
  const elapsedSeconds = Math.max(0, input.elapsedSeconds);

  const rawEnergy =
    Math.pow(capital, CAPITAL_EXPONENT) *
    (elapsedSeconds / FULL_REGEN_SECONDS) *
    RAW_ENERGY_SCALE;

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
