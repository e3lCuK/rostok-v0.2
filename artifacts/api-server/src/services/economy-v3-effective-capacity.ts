/**
 * Economy v3 effective capacity — shared SoT for root + activity reserve caps.
 *
 * basePresetSeconds     = persisted v3_daily_cap_seconds (5…25)
 * currentVisitDay       = 1-based visit day for bonus (see resolveV3CurrentVisitDay)
 * dailyBonusSeconds     = min(5, currentVisitDay)  → day1=+1 … day5+=+5
 * effectivePresetSeconds = base + bonus (max 30)
 *
 * Persistence note on `streak_days`:
 * - When set by session completion it is already 1-based (first session → 1).
 * - Legacy / never-completed accounts may still store 0.
 * - Reading treats streak_days ≤ 0 as visit day 1 (same as FE getStreakBonusSeconds).
 *
 * One shared base for Water / Sun / Fertilizer (current architecture).
 */

export const V3_BASE_PRESET_MIN = 5;
export const V3_BASE_PRESET_MAX = 25;
export const V3_BASE_PRESET_DEFAULT = 20;
export const V3_VISIT_BONUS_MAX = 5;
/** Absolute max root/reserve storage: base 25 + visit bonus 5. */
export const V3_EFFECTIVE_CAPACITY_MAX = V3_BASE_PRESET_MAX + V3_VISIT_BONUS_MAX;

export type V3EffectiveCapacityBreakdown = {
  basePresetSeconds: number;
  /** 1-based visit day used for the daily preset bonus. */
  currentVisitDay: number;
  activeDailyBonusSeconds: number;
  effectivePresetSeconds: number;
};

function floorNonNeg(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Persist / base preset: whole seconds in [5, 25]; invalid → 20. */
export function normalizeV3BasePresetSeconds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return V3_BASE_PRESET_DEFAULT;
  const whole = Math.floor(n);
  return Math.min(
    V3_BASE_PRESET_MAX,
    Math.max(V3_BASE_PRESET_MIN, whole),
  );
}

/**
 * Map persisted `streak_days` → 1-based current visit day for bonus.
 *
 * - streak ≤ 0 (unset / legacy) → day 1
 * - streak ≥ 1 → that day (already 1-based when written by session complete)
 */
export function resolveV3CurrentVisitDay(streakDays: unknown): number {
  const n =
    typeof streakDays === "number"
      ? streakDays
      : parseInt(String(streakDays ?? "0"), 10);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

/**
 * Visit day → daily preset bonus seconds.
 * day 1 → +1 … day 5+ → +5. Never +0 for an active first day.
 */
export function computeV3VisitBonusSeconds(streakDays: unknown): number {
  const day = resolveV3CurrentVisitDay(streakDays);
  return Math.min(V3_VISIT_BONUS_MAX, day);
}

export function computeV3EffectivePresetSeconds(input: {
  basePresetSeconds: unknown;
  visitBonusSeconds?: unknown;
  streakDays?: unknown;
}): number {
  const base = normalizeV3BasePresetSeconds(input.basePresetSeconds);
  const bonus =
    input.visitBonusSeconds != null
      ? Math.min(
          V3_VISIT_BONUS_MAX,
          Math.max(0, floorNonNeg(input.visitBonusSeconds)),
        )
      : computeV3VisitBonusSeconds(input.streakDays);
  return Math.min(V3_EFFECTIVE_CAPACITY_MAX, base + bonus);
}

export function buildV3EffectiveCapacityBreakdown(input: {
  basePresetSeconds: unknown;
  streakDays?: unknown;
  visitBonusSeconds?: unknown;
}): V3EffectiveCapacityBreakdown {
  const basePresetSeconds = normalizeV3BasePresetSeconds(
    input.basePresetSeconds,
  );
  const currentVisitDay = resolveV3CurrentVisitDay(input.streakDays);
  const activeDailyBonusSeconds =
    input.visitBonusSeconds != null
      ? Math.min(
          V3_VISIT_BONUS_MAX,
          Math.max(0, floorNonNeg(input.visitBonusSeconds)),
        )
      : computeV3VisitBonusSeconds(input.streakDays);

  return {
    basePresetSeconds,
    currentVisitDay,
    activeDailyBonusSeconds,
    effectivePresetSeconds: Math.min(
      V3_EFFECTIVE_CAPACITY_MAX,
      basePresetSeconds + activeDailyBonusSeconds,
    ),
  };
}

/** Clamp stored seconds to [0, capacity]. */
export function clampV3CapacitySeconds(
  raw: unknown,
  capacityRaw: unknown,
): number {
  const cap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(0, floorNonNeg(capacityRaw) || V3_BASE_PRESET_DEFAULT),
  );
  return Math.min(cap, floorNonNeg(raw));
}

/**
 * Split value against a new capacity: keep ≤ cap, overflow = rest.
 * Pure — caller adds overflow to excess ledger.
 */
export function splitV3CapacityOverflow(input: {
  seconds: unknown;
  capacitySeconds: unknown;
}): { keptSeconds: number; overflowSeconds: number } {
  const cap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(0, floorNonNeg(input.capacitySeconds)),
  );
  const seconds = floorNonNeg(input.seconds);
  if (seconds <= cap) {
    return { keptSeconds: seconds, overflowSeconds: 0 };
  }
  return { keptSeconds: cap, overflowSeconds: seconds - cap };
}

/** Normalize three roots + three reserves; sum overflow for excess. */
export function normalizeV3StorageToEffectiveCapacity(input: {
  rootWaterSeconds: unknown;
  rootSunSeconds: unknown;
  rootFertilizerSeconds: unknown;
  reserveWaterSeconds: unknown;
  reserveSunSeconds: unknown;
  reserveFertilizerSeconds: unknown;
  effectivePresetSeconds: unknown;
}): {
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  overflowSeconds: number;
} {
  const capacity = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      V3_BASE_PRESET_MIN,
      floorNonNeg(input.effectivePresetSeconds) || V3_BASE_PRESET_DEFAULT,
    ),
  );

  const rw = splitV3CapacityOverflow({
    seconds: input.rootWaterSeconds,
    capacitySeconds: capacity,
  });
  const rs = splitV3CapacityOverflow({
    seconds: input.rootSunSeconds,
    capacitySeconds: capacity,
  });
  const rf = splitV3CapacityOverflow({
    seconds: input.rootFertilizerSeconds,
    capacitySeconds: capacity,
  });
  const vw = splitV3CapacityOverflow({
    seconds: input.reserveWaterSeconds,
    capacitySeconds: capacity,
  });
  const vs = splitV3CapacityOverflow({
    seconds: input.reserveSunSeconds,
    capacitySeconds: capacity,
  });
  const vf = splitV3CapacityOverflow({
    seconds: input.reserveFertilizerSeconds,
    capacitySeconds: capacity,
  });

  return {
    rootWaterSeconds: rw.keptSeconds,
    rootSunSeconds: rs.keptSeconds,
    rootFertilizerSeconds: rf.keptSeconds,
    reserveWaterSeconds: vw.keptSeconds,
    reserveSunSeconds: vs.keptSeconds,
    reserveFertilizerSeconds: vf.keptSeconds,
    overflowSeconds:
      rw.overflowSeconds +
      rs.overflowSeconds +
      rf.overflowSeconds +
      vw.overflowSeconds +
      vs.overflowSeconds +
      vf.overflowSeconds,
  };
}
