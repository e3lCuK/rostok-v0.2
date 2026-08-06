/** Minimum whole seconds required to start a full Care cycle (3 × 5). */
export const V2_CARE_MIN_TOTAL_SECONDS = 15;
export const V2_CARE_MIN_ACTIVITY_SECONDS = 5;

export type EconomyV2CareActivity = "water" | "sun" | "fertilizer";

export type EconomyV2CareAllocation = {
  waterSeconds: number;
  sunSeconds: number;
  fertilizerSeconds: number;
  totalAllocatedSeconds: number;
};

/**
 * Round-robin allocation of whole energy seconds across Care activities.
 *
 * base = floor(total / 3)
 * remainder goes water → sun → fertilizer (first `remainder` activities get +1).
 *
 * Caller must ensure total is an integer in a sensible range; this helper
 * only distributes non-negative integers and does not enforce the start gate.
 */
export function createEconomyV2CareAllocation(
  totalEnergy: number,
): EconomyV2CareAllocation {
  const total = Number.isFinite(totalEnergy)
    ? Math.max(0, Math.floor(totalEnergy))
    : 0;
  const base = Math.floor(total / 3);
  const remainder = total % 3;

  const waterSeconds = base + (remainder >= 1 ? 1 : 0);
  const sunSeconds = base + (remainder >= 2 ? 1 : 0);
  const fertilizerSeconds = base;

  return {
    waterSeconds,
    sunSeconds,
    fertilizerSeconds,
    totalAllocatedSeconds: waterSeconds + sunSeconds + fertilizerSeconds,
  };
}

export function isEconomyV2CareActivity(
  value: unknown,
): value is EconomyV2CareActivity {
  return value === "water" || value === "sun" || value === "fertilizer";
}

export function allocationCostForActivity(
  allocation: EconomyV2CareAllocation,
  activity: EconomyV2CareActivity,
): number {
  switch (activity) {
    case "water":
      return allocation.waterSeconds;
    case "sun":
      return allocation.sunSeconds;
    case "fertilizer":
      return allocation.fertilizerSeconds;
  }
}
