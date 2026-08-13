/**
 * Economy v3 effective capacity — shared SoT for root + activity reserve caps.
 *
 * basePresetSeconds     = persisted v3_daily_cap_seconds (5…25)
 * currentVisitDay       = 1-based visit day for bonus (see resolveV3CurrentVisitDay)
 * dailyBonusSeconds     = min(5, currentVisitDay)  → day1=+1 … day5+=+5
 * effectivePresetSeconds = base + bonus (max 30)
 *
 * Shared pool per activity (Water / Sun / Fertilizer):
 *   rootSeconds + matching reserveSeconds ≤ effectivePresetSeconds
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
 * Shared pool per activity: root + matching reserve ≤ effectivePreset.
 * Free room left for the root given current reserve + root fill.
 */
export function v3SharedPoolRootFreeRoom(input: {
  rootSeconds: unknown;
  reserveSeconds: unknown;
  capacitySeconds: unknown;
}): number {
  const cap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(0, floorNonNeg(input.capacitySeconds) || V3_BASE_PRESET_DEFAULT),
  );
  const reserve = clampV3CapacitySeconds(input.reserveSeconds, cap);
  const root = clampV3CapacitySeconds(input.rootSeconds, cap);
  return Math.max(0, cap - reserve - root);
}

/**
 * Max root seconds allowed while keeping root + reserve ≤ capacity.
 */
export function v3SharedPoolRootCap(input: {
  reserveSeconds: unknown;
  capacitySeconds: unknown;
}): number {
  const cap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(0, floorNonNeg(input.capacitySeconds) || V3_BASE_PRESET_DEFAULT),
  );
  const reserve = clampV3CapacitySeconds(input.reserveSeconds, cap);
  return Math.max(0, cap - reserve);
}

/**
 * Max reserve seconds allowed while keeping root + reserve ≤ capacity.
 */
export function v3SharedPoolReserveCap(input: {
  rootSeconds: unknown;
  capacitySeconds: unknown;
}): number {
  const cap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(0, floorNonNeg(input.capacitySeconds) || V3_BASE_PRESET_DEFAULT),
  );
  const root = clampV3CapacitySeconds(input.rootSeconds, cap);
  return Math.max(0, cap - root);
}

/**
 * Enforce shared pool for one activity. Prefer keeping reserve (already
 * collected); trim root; leftover becomes overflow (→ excess).
 */
export function splitV3SharedPoolOverflow(input: {
  rootSeconds: unknown;
  reserveSeconds: unknown;
  capacitySeconds: unknown;
}): {
  rootSeconds: number;
  reserveSeconds: number;
  overflowSeconds: number;
} {
  const cap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(0, floorNonNeg(input.capacitySeconds) || V3_BASE_PRESET_DEFAULT),
  );
  const reserveSplit = splitV3CapacityOverflow({
    seconds: input.reserveSeconds,
    capacitySeconds: cap,
  });
  const rootSplit = splitV3CapacityOverflow({
    seconds: input.rootSeconds,
    capacitySeconds: cap,
  });
  let reserve = reserveSplit.keptSeconds;
  let root = rootSplit.keptSeconds;
  let overflow =
    reserveSplit.overflowSeconds + rootSplit.overflowSeconds;

  const total = root + reserve;
  if (total > cap) {
    const trim = total - cap;
    const fromRoot = Math.min(root, trim);
    root -= fromRoot;
    overflow += fromRoot;
    const still = trim - fromRoot;
    if (still > 0) {
      reserve = Math.max(0, reserve - still);
      overflow += still;
    }
  }

  return { rootSeconds: root, reserveSeconds: reserve, overflowSeconds: overflow };
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

  const water = splitV3SharedPoolOverflow({
    rootSeconds: input.rootWaterSeconds,
    reserveSeconds: input.reserveWaterSeconds,
    capacitySeconds: capacity,
  });
  const sun = splitV3SharedPoolOverflow({
    rootSeconds: input.rootSunSeconds,
    reserveSeconds: input.reserveSunSeconds,
    capacitySeconds: capacity,
  });
  const fertilizer = splitV3SharedPoolOverflow({
    rootSeconds: input.rootFertilizerSeconds,
    reserveSeconds: input.reserveFertilizerSeconds,
    capacitySeconds: capacity,
  });

  return {
    rootWaterSeconds: water.rootSeconds,
    rootSunSeconds: sun.rootSeconds,
    rootFertilizerSeconds: fertilizer.rootSeconds,
    reserveWaterSeconds: water.reserveSeconds,
    reserveSunSeconds: sun.reserveSeconds,
    reserveFertilizerSeconds: fertilizer.reserveSeconds,
    overflowSeconds:
      water.overflowSeconds + sun.overflowSeconds + fertilizer.overflowSeconds,
  };
}
