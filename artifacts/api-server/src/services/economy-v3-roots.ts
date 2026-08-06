/**
 * Economy v3 roots + activity reserves — domain types, pure helpers, settle math.
 *
 * Stage 6A: Care availability preview from reserves (no spend / no Care session).
 */

import {
  capitalMultiplier,
  generateEnergyFromElapsed,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
} from "./economy-v2";
import {
  normalizeExcessSeconds,
} from "./economy-v2-excess";
import {
  normalizeExcessElapsedMs,
} from "./economy-v2-excess-income";
import {
  buildV3EffectiveCapacityBreakdown,
  clampV3CapacitySeconds,
  computeV3EffectivePresetSeconds,
  normalizeV3BasePresetSeconds,
  normalizeV3StorageToEffectiveCapacity,
  V3_BASE_PRESET_DEFAULT,
  V3_BASE_PRESET_MAX,
  V3_BASE_PRESET_MIN,
  V3_EFFECTIVE_CAPACITY_MAX,
} from "./economy-v3-effective-capacity";
import {
  buildV3ExcessGatePublic,
  canAcceptV3OrdinaryRootUnit,
  computeV3OrdinaryFullState,
  isV3RootOrdinaryEligible,
  splitV3ElapsedOrdinaryAndExcess,
  type V3ReservesFullMap,
} from "./economy-v3-excess-gate";
import {
  buildV3MetelkaCyclePublic,
  computeV3RootsFull,
  readV3MetelkaCompletedForCycle,
  readV3MetelkaRequired,
} from "./economy-v3-metelka-cycle";
import {
  buildEconomyV3CareRewardPreview,
  type EconomyV3CareRewardEconomyContext,
  type EconomyV3CareRewardPreview,
} from "./economy-v3-care-reward-preview";

export type {
  EconomyV3CareRewardEconomyContext,
  EconomyV3CareRewardPreview,
} from "./economy-v3-care-reward-preview";

export {
  V3_EFFECTIVE_CAPACITY_MAX,
  computeV3EffectivePresetSeconds,
  buildV3EffectiveCapacityBreakdown,
  normalizeV3BasePresetSeconds,
  normalizeV3StorageToEffectiveCapacity,
} from "./economy-v3-effective-capacity";

export const V3_ROOT_KINDS = ["water", "sun", "fertilizer"] as const;
export type RootKind = (typeof V3_ROOT_KINDS)[number];

/** Absolute max game-seconds on one root / reserve (base 25 + visit bonus 5).
 * Not a daily capacity SoT — use effectivePresetSeconds for ledger writes. */
export const V3_ROOT_CAPACITY_SECONDS = V3_EFFECTIVE_CAPACITY_MAX;
/** Absolute max for one activity reserve / Care preset. */
export const V3_RESERVE_CAPACITY_SECONDS = V3_EFFECTIVE_CAPACITY_MAX;
export const V3_SEGMENT_SECONDS = 5;
export const V3_SEGMENT_COUNT = 5;
/** Minimum reserve seconds required to launch an activity (future Care). */
export const V3_PLAYABLE_MIN_SECONDS = 5;
/** Root is collectible/transferable once it holds ≥ 1 whole game-second. */
export const V3_ROOT_PLAYABLE_MIN_SECONDS = 1;

export const V3_DAILY_CAP_MIN = V3_BASE_PRESET_MIN;
export const V3_DAILY_CAP_MAX = V3_BASE_PRESET_MAX;
export const V3_DAILY_CAP_DEFAULT = V3_BASE_PRESET_DEFAULT;

/**
 * Insurance window after first transfer (wall-clock ms).
 * Deadline is stored on first transfer; settle applies auto-transfer when due.
 */
export const V3_TRANSFER_INSURANCE_MS = 60_000;
/** Same window in seconds — kept for docs / snapshot helpers. */
export const V3_INSURANCE_INTERVAL_SECONDS = V3_TRANSFER_INSURANCE_MS / 1000;

export type V3SegmentSplit = {
  fullSegments: number;
  partialSegmentSeconds: number;
};

export type V3RootState = {
  seconds: number;
  fullSegments: number;
  partialSegmentSeconds: number;
  capacitySeconds: number;
  /** seconds / capacitySeconds in [0, 1]. */
  fillFraction: number;
  /** True when the root holds ≥ 1 whole game-second. */
  playableFromRoot: boolean;
  transferred: boolean;
  frozen: boolean;
};

export type V3ActivityReserve = {
  seconds: number;
  capacitySeconds: number;
  /** True when reserve has enough seconds to start the activity (≥ 5). */
  playable: boolean;
};

/** Preview of Care launch options from a reserve — no spend. */
export type V3CareAvailabilityEntry = {
  reserveSeconds: number;
  playable: boolean;
  /** Max whole-second preset that can be launched; 0 when not playable. */
  maxPresetSeconds: number;
};

export type V3CareActivityStatus = "active" | "completed";

export type V3CareSessionState = {
  active: boolean;
  activity: RootKind | null;
  presetSeconds: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: V3CareActivityStatus | null;
  /** Mini-game skill in [0, 1]; set on finish. */
  skill: number | null;
};

/** Persisted per-activity result inside the current Care cycle. */
export type V3CareCycleActivityResult = {
  completed: boolean;
  presetSeconds: number | null;
  skill: number | null;
};

export type V3CareCycleStatus = "in_progress" | "ready" | "finished";

export type V3CareCycleClaimState = {
  claimed: boolean;
  claimedAt: string | null;
  xp: number;
  treeGrowth: number;
  income: {
    base: number;
    bonus: number;
    total: number;
  };
};

export type V3CareCycleState = {
  startedAt: string | null;
  completedAt: string | null;
  finishedAt: string | null;
  status: V3CareCycleStatus | null;
  allCompleted: boolean;
  readyToFinish: boolean;
  totalPresetSeconds: number | null;
  averageSkill: number | null;
  activities: Record<RootKind, V3CareCycleActivityResult>;
  /** Read-only Care reward estimate from v2 formulas; never awards. */
  rewardPreview: EconomyV3CareRewardPreview;
  /** Persisted claim snapshot after claim-cycle (not recalculated). */
  claim: V3CareCycleClaimState;
};

export type V3GenerationState = {
  anchorAt: string | null;
  /** Fractional progress toward next whole game-second [0, 1). */
  progress: number;
  /** Round-robin cursor: 0=water, 1=sun, 2=fertilizer — next whole second target. */
  rrCursor: number;
  nextRoot: RootKind;
  frozenAt: string | null;
  insuranceDeadlineAt: string | null;
  firstTransferredRoot: RootKind | null;
  transferredRoots: RootKind[];
  /** Wall-clock seconds until next whole game-second; null when not accumulating. */
  secondsUntilNextWholeSecond: number | null;
  /**
   * Absolute wall deadline for the current full energy-unit cycle
   * (`now + secondsUntilNextWholeSecond`). Null when not accumulating.
   * Same semantic family as v2 `secondsUntilNextSection` countdown.
   */
  nextWholeSecondAt: string | null;
  /**
   * Full real-seconds length of one energy-unit cycle at current capital
   * (`720 / M(K)`). Null when not accumulating.
   */
  cycleDurationSeconds: number | null;
  accumulating: boolean;
};

/** Excess / Metelka gate derived from reserves + roots. */
export type V3ExcessGateState = {
  /** All three activity reserves ≥ effectivePreset. */
  ordinaryFull: boolean;
  /** All three roots at effective capacity — Metelka product gate. */
  rootsFull: boolean;
  reservesFull: Record<RootKind, boolean>;
  generatingExcess: boolean;
};

export type EconomyV3MetelkaCyclePublic = {
  required: boolean;
  completedForCycle: boolean;
  transferLocked: boolean;
  careLocked: boolean;
  phase:
    | "roots_accumulating"
    | "roots_full_waiting_excess"
    | "metelka_available"
    | "metelka_active"
    | "metelka_pending_result"
    | "root_transfer_unlocked";
};

export type EconomyV3RootsPublicState = {
  enabled: true;
  /** Persisted base preset (`v3_daily_cap_seconds`, 5…25). */
  dailyCapSeconds: number;
  /** Same as dailyCapSeconds — shared base for all three activities. */
  basePresetSeconds: number;
  /** Visit streak bonus seconds (0…5). */
  activeDailyBonusSeconds: number;
  /** 1-based visit day that produced activeDailyBonusSeconds. */
  currentVisitDay: number;
  /** base + bonus, capped at 30 — root and reserve capacity. */
  effectivePresetSeconds: number;
  dayKey: string | null;
  roots: Record<RootKind, V3RootState>;
  reserves: Record<RootKind, V3ActivityReserve>;
  /** Care launch preview from reserves — does not spend or start a session. */
  careAvailability: Record<RootKind, V3CareAvailabilityEntry>;
  /** At most one v3 Care activity session (active or last completed). */
  careSession: V3CareSessionState;
  /** Journal of completed activities in the current Care cycle. */
  careCycle: V3CareCycleState;
  generation: V3GenerationState;
  excessGate: V3ExcessGateState;
  /** Roots-full → Metelka-before-transfer cycle. */
  metelkaCycle: EconomyV3MetelkaCyclePublic;
};

export type EconomyV3RootsRow = {
  tutorial_done?: unknown;
  v3_root_water_seconds?: unknown;
  v3_root_sun_seconds?: unknown;
  v3_root_fertilizer_seconds?: unknown;
  v3_reserve_water_seconds?: unknown;
  v3_reserve_sun_seconds?: unknown;
  v3_reserve_fertilizer_seconds?: unknown;
  v3_daily_cap_seconds?: unknown;
  v3_day_key?: unknown;
  v3_generation_anchor_at?: unknown;
  v3_generation_frozen_at?: unknown;
  v3_insurance_deadline_at?: unknown;
  v3_generation_progress?: unknown;
  v3_generation_rr_cursor?: unknown;
  v3_first_transferred_root?: unknown;
  v3_transferred_roots?: unknown;
  v3_metelka_required?: unknown;
  v3_metelka_completed_for_cycle?: unknown;
  v3_care_activity_kind?: unknown;
  v3_care_activity_preset_seconds?: unknown;
  v3_care_activity_started_at?: unknown;
  v3_care_activity_status?: unknown;
  v3_care_activity_skill?: unknown;
  v3_care_activity_finished_at?: unknown;
  v3_care_cycle_water_completed?: unknown;
  v3_care_cycle_water_preset_seconds?: unknown;
  v3_care_cycle_water_skill?: unknown;
  v3_care_cycle_sun_completed?: unknown;
  v3_care_cycle_sun_preset_seconds?: unknown;
  v3_care_cycle_sun_skill?: unknown;
  v3_care_cycle_fertilizer_completed?: unknown;
  v3_care_cycle_fertilizer_preset_seconds?: unknown;
  v3_care_cycle_fertilizer_skill?: unknown;
  v3_care_cycle_started_at?: unknown;
  v3_care_cycle_completed_at?: unknown;
  v3_care_cycle_finished_at?: unknown;
  v3_care_cycle_status?: unknown;
  v3_care_cycle_total_preset_seconds?: unknown;
  v3_care_cycle_average_skill?: unknown;
  v3_care_cycle_claimed_at?: unknown;
  v3_care_cycle_claimed_xp?: unknown;
  v3_care_cycle_claimed_tree_growth?: unknown;
  v3_care_cycle_claimed_base_income?: unknown;
  v3_care_cycle_claimed_bonus_income?: unknown;
  v3_care_cycle_claimed_total_income?: unknown;
  /** Optional Care income context (read-only for rewardPreview). */
  v2_income_anchor_at?: unknown;
  v2_freshness?: unknown;
  v2_ordinary_income_elapsed_ms?: unknown;
  player_xp?: unknown;
  player_level?: unknown;
  pending_base_reward?: unknown;
  pending_bonus_reward?: unknown;
  total_apples?: unknown;
  tree_growth_mm?: unknown;
  tree_growth_remainder?: unknown;
  /** Visit streak — drives daily preset bonus (0…5). */
  streak_days?: unknown;
};

export type BuildEconomyV3RootsPublicStateOptions = {
  capital?: number;
  nowMs?: number;
  incomeAnchorAt?: number | null;
  freshness?: number;
  ordinaryIncomeElapsedMs?: number | null;
  /**
   * When provided (e.g. right after settle), sets excessGate.generatingExcess.
   * Default false — snapshot alone does not invent live settle direction.
   */
  generatingExcess?: boolean;
  /** For metelkaCycle.phase — excess ledger availability. */
  excessAvailable?: boolean;
  metelkaSessionActive?: boolean;
  metelkaPendingResult?: boolean;
  /** Override persisted cycle flags after settle advance. */
  metelkaRequired?: boolean;
  metelkaCompletedForCycle?: boolean;
  /** Override streak_days from row when computing effective capacity. */
  streakDays?: unknown;
};

export type EconomyV3InvariantIssue = {
  code: string;
  message: string;
};

export type SettleEconomyV3RootsInput = {
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  generationProgress: number;
  generationAnchorAt: number | null;
  generationFrozenAt: number | null;
  dayKey: string | null;
  capital: number;
  nowMs: number;
  /** Round-robin cursor before this settle (0=water, 1=sun, 2=fertilizer). */
  generationRrCursor?: number;
  /** When true, advance anchor only — no generation / backfill / excess. */
  tutorialActive: boolean;
  /** Roots already transferred — settle does not grow them. */
  transferredRoots?: readonly RootKind[];
  /** Activity reserves — gate excess when all ≥ effectivePreset. */
  reserveWaterSeconds?: number;
  reserveSunSeconds?: number;
  reserveFertilizerSeconds?: number;
  /** Persisted base preset (5…25). */
  dailyCapSeconds?: number;
  /**
   * Visit streak days → 1-based visit day for bonus (≤0 reads as day 1).
   * Prefer this over visitBonusSeconds in production.
   */
  streakDays?: unknown;
  /**
   * Explicit bonus override (0…5). When set, streakDays is ignored for capacity.
   * Used by tests / debug isolation — production passes streakDays only.
   */
  visitBonusSeconds?: unknown;
  /** Existing excess ledger (v2 columns) before this settle. */
  excessSeconds?: number;
  excessElapsedMs?: number;
};

export type SettleEconomyV3RootsResult = {
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  /** Reserves after capacity-normalize (may be clamped). */
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  /** Effective capacity used for this settle (base + streak bonus). */
  effectivePresetSeconds: number;
  /** Overflow moved from roots/reserves into excess before generation. */
  capacityNormalizeOverflowSeconds: number;
  generationProgress: number;
  generationAnchorAt: number;
  dayKey: string;
  elapsedMs: number;
  elapsedSeconds: number;
  /** Raw generated game-seconds from elapsed × capital (before progress). */
  generatedRaw: number;
  /** Whole game-second units to distribute this settle (round-robin), not per root. */
  wholeSeconds: number;
  /** Round-robin cursor after this settle (always present). */
  generationRrCursor: number;
  /** True when generation math ran (not tutorial / frozen / null-anchor init). */
  generated: boolean;
  /** Excess game-seconds after this settle. */
  excessSeconds: number;
  /** Portion of generated that went to excess this window. */
  excessGenerated: number;
  /** Real excess wall-clock ms after this settle. */
  excessElapsedMs: number;
  /** Wall-clock ms share of this window attributed to excessGenerated. */
  excessElapsedMsGenerated: number;
  ordinaryFull: boolean;
  reservesFull: Record<RootKind, boolean>;
  generatingExcess: boolean;
};

/** Clamp root storage to whole seconds in [0, capacity] (default absolute max 30). */
export function clampRootSeconds(
  raw: unknown,
  capacitySeconds: unknown = V3_ROOT_CAPACITY_SECONDS,
): number {
  return clampV3CapacitySeconds(raw, capacitySeconds);
}

/** Clamp base daily preset to whole seconds in [5, 25]; invalid → default 20. */
export function normalizeDailyCap(raw: unknown): number {
  return normalizeV3BasePresetSeconds(raw);
}

/**
 * Clamp reserve storage to whole seconds in [0, capacitySeconds].
 * `capacitySeconds` may be effective preset (up to 30).
 */
export function clampReserveSeconds(
  raw: unknown,
  capacitySeconds: unknown = V3_DAILY_CAP_DEFAULT,
): number {
  return clampV3CapacitySeconds(raw, capacitySeconds);
}

/** Fractional generation progress in [0, 1). */
export function normalizeGenerationProgress(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1) return n;
  const frac = n - Math.floor(n);
  return frac < 1 ? frac : 0;
}

/** Round-robin generation cursor: 0=water, 1=sun, 2=fertilizer. */
export function normalizeGenerationRrCursor(raw: unknown): 0 | 1 | 2 {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
  if (n === 1 || n === 2) return n;
  return 0;
}

export type DistributeV3WholeSecondsRoundRobinResult = {
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  generationRrCursor: 0 | 1 | 2;
  acceptedUnits: number;
  discardedUnits: number;
};

/**
 * Assign each whole generated second to exactly one root in round-robin order.
 * Ineligible or at-cap roots discard that unit (no reroute).
 */
export function distributeV3WholeSecondsRoundRobin(input: {
  wholeSeconds: number;
  generationRrCursor: number;
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  reservesFull: V3ReservesFullMap;
  transferredRoots: ReadonlySet<RootKind> | readonly RootKind[];
  /** Effective root capacity (default absolute max 30). */
  rootCapacitySeconds?: number;
}): DistributeV3WholeSecondsRoundRobinResult {
  const rootCap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      0,
      Math.floor(
        Number.isFinite(input.rootCapacitySeconds as number)
          ? Number(input.rootCapacitySeconds)
          : V3_ROOT_CAPACITY_SECONDS,
      ) || V3_ROOT_CAPACITY_SECONDS,
    ),
  );
  let cursor = normalizeGenerationRrCursor(input.generationRrCursor);
  let water = clampRootSeconds(input.rootWaterSeconds, rootCap);
  let sun = clampRootSeconds(input.rootSunSeconds, rootCap);
  let fertilizer = clampRootSeconds(input.rootFertilizerSeconds, rootCap);
  const transferred =
    input.transferredRoots instanceof Set
      ? input.transferredRoots
      : new Set(input.transferredRoots);
  const units = Math.max(0, Math.floor(input.wholeSeconds));
  let acceptedUnits = 0;
  let discardedUnits = 0;

  for (let i = 0; i < units; i++) {
    const kind = V3_ROOT_KINDS[cursor];
    const seconds =
      kind === "water" ? water : kind === "sun" ? sun : fertilizer;
    const eligible = isV3RootOrdinaryEligible({
      kind,
      reservesFull: input.reservesFull,
      transferredRoots: transferred,
    });
    if (eligible && seconds < rootCap) {
      if (kind === "water") {
        water = clampRootSeconds(water + 1, rootCap);
      } else if (kind === "sun") {
        sun = clampRootSeconds(sun + 1, rootCap);
      } else {
        fertilizer = clampRootSeconds(fertilizer + 1, rootCap);
      }
      acceptedUnits++;
    } else {
      discardedUnits++;
    }
    cursor = ((cursor + 1) % 3) as 0 | 1 | 2;
  }

  return {
    rootWaterSeconds: water,
    rootSunSeconds: sun,
    rootFertilizerSeconds: fertilizer,
    generationRrCursor: cursor,
    acceptedUnits,
    discardedUnits,
  };
}

export function splitIntoFiveSegments(secondsRaw: unknown): V3SegmentSplit {
  const seconds = clampRootSeconds(secondsRaw);
  return {
    fullSegments: Math.floor(seconds / V3_SEGMENT_SECONDS),
    partialSegmentSeconds: seconds % V3_SEGMENT_SECONDS,
  };
}

export function validateRootKind(value: unknown): value is RootKind {
  return value === "water" || value === "sun" || value === "fertilizer";
}

export function normalizeTransferredRoots(raw: unknown): RootKind[] {
  if (raw == null) return [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw
          .replace(/^\{|\}$/g, "")
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean)
      : [];

  const seen = new Set<RootKind>();
  const out: RootKind[] = [];
  for (const item of list) {
    if (!validateRootKind(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** UTC calendar day key — same convention as Care streak / login (`YYYY-MM-DD`). */
export function economyV3DayKeyUtc(nowMs: number): string {
  const t = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();
  return new Date(t).toISOString().slice(0, 10);
}

export function parseNullableTimestampMs(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const asNum = Number(s);
  if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(s)) {
    return Math.trunc(asNum);
  }
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function parseNullableTimestampIso(raw: unknown): string | null {
  const ms = parseNullableTimestampMs(raw);
  return ms == null ? null : new Date(ms).toISOString();
}

function parseNullableDayKey(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function parseFirstTransferredRoot(raw: unknown): RootKind | null {
  if (raw == null || raw === "") return null;
  return validateRootKind(raw) ? raw : null;
}

/**
 * Real seconds needed for +1 game-second at the given capital.
 * Same as v2 `secondsPerSectionForCapital` / `720 / M(K)`.
 */
export function secondsPerGameSecondForCapital(capital: number): number {
  const m = capitalMultiplier(capital);
  if (!Number.isFinite(m) || m <= 0) return Number.POSITIVE_INFINITY;
  return V2_SECONDS_PER_ENERGY_AT_REFERENCE / m;
}

export function computeSecondsUntilNextWholeSecond(input: {
  progress: number;
  capital: number;
  accumulating: boolean;
}): number | null {
  if (!input.accumulating) return null;
  const per = secondsPerGameSecondForCapital(input.capital);
  if (!Number.isFinite(per) || per <= 0) return null;
  const progress = normalizeGenerationProgress(input.progress);
  const remaining = Math.max(0, (1 - progress) * per);
  return remaining;
}

export function buildV3RootState(input: {
  seconds: unknown;
  transferred: boolean;
  frozen: boolean;
  capacitySeconds?: unknown;
}): V3RootState {
  const capacitySeconds = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      V3_DAILY_CAP_MIN,
      Math.floor(Number(input.capacitySeconds)) || V3_ROOT_CAPACITY_SECONDS,
    ),
  );
  const seconds = clampRootSeconds(input.seconds, capacitySeconds);
  const split = splitIntoFiveSegments(seconds);
  return {
    seconds,
    fullSegments: split.fullSegments,
    partialSegmentSeconds: split.partialSegmentSeconds,
    capacitySeconds,
    fillFraction: capacitySeconds > 0 ? seconds / capacitySeconds : 0,
    playableFromRoot: seconds >= V3_ROOT_PLAYABLE_MIN_SECONDS,
    transferred: input.transferred,
    frozen: input.frozen,
  };
}

export function buildV3ActivityReserve(input: {
  seconds: unknown;
  /** Effective capacity (preferred) or legacy dailyCap field. */
  capacitySeconds?: unknown;
  dailyCapSeconds?: unknown;
}): V3ActivityReserve {
  const capacitySeconds = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      V3_DAILY_CAP_MIN,
      Math.floor(
        Number(
          input.capacitySeconds ??
            input.dailyCapSeconds ??
            V3_DAILY_CAP_DEFAULT,
        ),
      ) || V3_DAILY_CAP_DEFAULT,
    ),
  );
  const seconds = clampReserveSeconds(input.seconds, capacitySeconds);
  return {
    seconds,
    capacitySeconds,
    playable: seconds >= V3_PLAYABLE_MIN_SECONDS,
  };
}

/**
 * Care availability preview from activity reserves.
 * Does not spend reserves or create a Care session.
 *
 * playable = reserveSeconds >= 5
 * maxPresetSeconds = playable ? clamp(floor(reserve), 5, effectivePreset) : 0
 */
export function buildEconomyV3CareAvailability(input: {
  reserves: {
    water: unknown;
    sun: unknown;
    fertilizer: unknown;
  };
  /** Effective preset capacity (preferred). */
  effectivePresetSeconds?: unknown;
  dailyCapSeconds?: unknown;
}): Record<RootKind, V3CareAvailabilityEntry> {
  const effectivePresetSeconds = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      V3_DAILY_CAP_MIN,
      Math.floor(
        Number(
          input.effectivePresetSeconds ??
            input.dailyCapSeconds ??
            V3_DAILY_CAP_DEFAULT,
        ),
      ) || V3_DAILY_CAP_DEFAULT,
    ),
  );
  const upper = Math.min(effectivePresetSeconds, V3_RESERVE_CAPACITY_SECONDS);

  const entry = (raw: unknown): V3CareAvailabilityEntry => {
    const reserveSeconds = clampReserveSeconds(raw, effectivePresetSeconds);
    const playable = reserveSeconds >= V3_PLAYABLE_MIN_SECONDS;
    if (!playable) {
      return { reserveSeconds, playable: false, maxPresetSeconds: 0 };
    }
    const maxPresetSeconds = Math.min(
      upper,
      Math.max(V3_PLAYABLE_MIN_SECONDS, reserveSeconds),
    );
    return { reserveSeconds, playable: true, maxPresetSeconds };
  };

  return {
    water: entry(input.reserves.water),
    sun: entry(input.reserves.sun),
    fertilizer: entry(input.reserves.fertilizer),
  };
}

export function parseV3CareActivityStatus(
  raw: unknown,
): V3CareActivityStatus | null {
  return raw === "active" || raw === "completed" ? raw : null;
}

/** Whole preset seconds for Care start; null when not a finite integer. */
export function parseV3CarePresetSeconds(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) return null;
    return raw;
  }
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) {
    return Number.parseInt(raw.trim(), 10);
  }
  return null;
}

/** Skill coefficient in [0, 1]; null when missing / non-finite / out of range. */
export function parseV3CareSkill(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

export function buildV3CareSession(
  row: EconomyV3RootsRow | null | undefined,
): V3CareSessionState {
  const status = parseV3CareActivityStatus(row?.v3_care_activity_status);
  const kindRaw = row?.v3_care_activity_kind;
  const activity =
    kindRaw != null && validateRootKind(kindRaw) ? kindRaw : null;
  const startedAt = parseNullableTimestampIso(row?.v3_care_activity_started_at);
  const finishedAt = parseNullableTimestampIso(
    row?.v3_care_activity_finished_at,
  );
  const presetRaw = row?.v3_care_activity_preset_seconds;
  let presetSeconds: number | null = null;
  if (presetRaw != null && presetRaw !== "") {
    const n =
      typeof presetRaw === "number"
        ? presetRaw
        : Number.parseInt(String(presetRaw), 10);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0) {
      presetSeconds = n;
    }
  }
  const skillRaw = row?.v3_care_activity_skill;
  const skill =
    skillRaw == null || skillRaw === ""
      ? null
      : parseV3CareSkill(
          typeof skillRaw === "number" ? skillRaw : Number(skillRaw),
        );

  if (status == null) {
    return {
      active: false,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      finishedAt: null,
      status: null,
      skill: null,
    };
  }

  return {
    active: status === "active",
    activity,
    presetSeconds,
    startedAt,
    finishedAt: status === "completed" ? finishedAt : null,
    status,
    skill: status === "completed" ? skill : null,
  };
}

export function parseEconomyV3Bool(raw: unknown): boolean {
  return (
    raw === true ||
    raw === 1 ||
    raw === "1" ||
    raw === "t" ||
    raw === "true" ||
    raw === "TRUE"
  );
}

function parseCareCyclePresetSeconds(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function buildV3CareCycleActivityResult(input: {
  completedRaw: unknown;
  presetRaw: unknown;
  skillRaw: unknown;
}): V3CareCycleActivityResult {
  const completed = parseEconomyV3Bool(input.completedRaw);
  if (!completed) {
    return { completed: false, presetSeconds: null, skill: null };
  }
  return {
    completed: true,
    presetSeconds: parseCareCyclePresetSeconds(input.presetRaw),
    skill:
      input.skillRaw == null || input.skillRaw === ""
        ? null
        : parseV3CareSkill(
            typeof input.skillRaw === "number"
              ? input.skillRaw
              : Number(input.skillRaw),
          ),
  };
}

export function parseV3CareCycleStatus(
  raw: unknown,
): V3CareCycleStatus | null {
  return raw === "in_progress" || raw === "ready" || raw === "finished"
    ? raw
    : null;
}

export function clampAverageSkill(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

export function computeCareCycleTotals(activities: {
  water: V3CareCycleActivityResult;
  sun: V3CareCycleActivityResult;
  fertilizer: V3CareCycleActivityResult;
}): { totalPresetSeconds: number; averageSkill: number } {
  const presets = [
    activities.water.presetSeconds ?? 0,
    activities.sun.presetSeconds ?? 0,
    activities.fertilizer.presetSeconds ?? 0,
  ];
  const skills = [
    activities.water.skill ?? 0,
    activities.sun.skill ?? 0,
    activities.fertilizer.skill ?? 0,
  ];
  return {
    totalPresetSeconds: presets[0]! + presets[1]! + presets[2]!,
    averageSkill: clampAverageSkill(
      (skills[0]! + skills[1]! + skills[2]!) / 3,
    ),
  };
}

function parseOrdinaryIncomeElapsedMs(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseFreshness(raw: unknown): number {
  if (raw == null || raw === "") return 1;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Resolve Care income context for rewardPreview (capital + v2 income fields).
 * Options override row values when provided.
 */
export function resolveEconomyV3CareRewardEconomyContext(
  row: EconomyV3RootsRow | null | undefined,
  options?: BuildEconomyV3RootsPublicStateOptions,
): EconomyV3CareRewardEconomyContext {
  const capital =
    options?.capital != null && Number.isFinite(options.capital)
      ? Number(options.capital)
      : 0;
  const nowMs =
    options?.nowMs != null && Number.isFinite(options.nowMs)
      ? Math.trunc(options.nowMs)
      : Date.now();
  const incomeAnchorAt =
    options?.incomeAnchorAt !== undefined
      ? options.incomeAnchorAt
      : parseNullableTimestampMs(row?.v2_income_anchor_at);
  const freshness =
    options?.freshness != null && Number.isFinite(options.freshness)
      ? Number(options.freshness)
      : parseFreshness(row?.v2_freshness);
  const ordinaryIncomeElapsedMs =
    options?.ordinaryIncomeElapsedMs !== undefined
      ? options.ordinaryIncomeElapsedMs
      : parseOrdinaryIncomeElapsedMs(row?.v2_ordinary_income_elapsed_ms);
  return {
    capital,
    incomeAnchorAt,
    nowMs,
    freshness,
    ordinaryIncomeElapsedMs,
  };
}

function parseClaimedMoney(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseClaimedInt(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function buildV3CareCycleClaim(
  row: EconomyV3RootsRow | null | undefined,
): V3CareCycleClaimState {
  const claimedAt = parseNullableTimestampIso(row?.v3_care_cycle_claimed_at);
  if (claimedAt == null) {
    return {
      claimed: false,
      claimedAt: null,
      xp: 0,
      treeGrowth: 0,
      income: { base: 0, bonus: 0, total: 0 },
    };
  }
  return {
    claimed: true,
    claimedAt,
    xp: parseClaimedInt(row?.v3_care_cycle_claimed_xp),
    treeGrowth: parseClaimedInt(row?.v3_care_cycle_claimed_tree_growth),
    income: {
      base: parseClaimedMoney(row?.v3_care_cycle_claimed_base_income),
      bonus: parseClaimedMoney(row?.v3_care_cycle_claimed_bonus_income),
      total: parseClaimedMoney(row?.v3_care_cycle_claimed_total_income),
    },
  };
}

export function buildV3CareCycle(
  row: EconomyV3RootsRow | null | undefined,
  options?: BuildEconomyV3RootsPublicStateOptions,
): V3CareCycleState {
  const activities = {
    water: buildV3CareCycleActivityResult({
      completedRaw: row?.v3_care_cycle_water_completed,
      presetRaw: row?.v3_care_cycle_water_preset_seconds,
      skillRaw: row?.v3_care_cycle_water_skill,
    }),
    sun: buildV3CareCycleActivityResult({
      completedRaw: row?.v3_care_cycle_sun_completed,
      presetRaw: row?.v3_care_cycle_sun_preset_seconds,
      skillRaw: row?.v3_care_cycle_sun_skill,
    }),
    fertilizer: buildV3CareCycleActivityResult({
      completedRaw: row?.v3_care_cycle_fertilizer_completed,
      presetRaw: row?.v3_care_cycle_fertilizer_preset_seconds,
      skillRaw: row?.v3_care_cycle_fertilizer_skill,
    }),
  } satisfies Record<RootKind, V3CareCycleActivityResult>;

  const allCompleted =
    activities.water.completed &&
    activities.sun.completed &&
    activities.fertilizer.completed;

  const status = parseV3CareCycleStatus(row?.v3_care_cycle_status);
  const session = buildV3CareSession(row);
  const sessionPending = session.status != null;
  const finishedAt = parseNullableTimestampIso(row?.v3_care_cycle_finished_at);

  let totalPresetSeconds: number | null = null;
  let averageSkill: number | null = null;
  if (status === "finished" || allCompleted) {
    const storedTotal = row?.v3_care_cycle_total_preset_seconds;
    const storedAvg = row?.v3_care_cycle_average_skill;
    if (status === "finished") {
      totalPresetSeconds =
        storedTotal == null || storedTotal === ""
          ? computeCareCycleTotals(activities).totalPresetSeconds
          : Math.trunc(Number(storedTotal));
      averageSkill =
        storedAvg == null || storedAvg === ""
          ? computeCareCycleTotals(activities).averageSkill
          : clampAverageSkill(Number(storedAvg));
    }
  }

  const cycleWithoutPreview = {
    startedAt: parseNullableTimestampIso(row?.v3_care_cycle_started_at),
    completedAt: allCompleted
      ? parseNullableTimestampIso(row?.v3_care_cycle_completed_at)
      : null,
    finishedAt: status === "finished" ? finishedAt : null,
    status,
    allCompleted,
    readyToFinish:
      allCompleted && !sessionPending && status !== "finished",
    totalPresetSeconds,
    averageSkill,
    activities,
  };

  return {
    ...cycleWithoutPreview,
    rewardPreview: buildEconomyV3CareRewardPreview(
      cycleWithoutPreview,
      resolveEconomyV3CareRewardEconomyContext(row, options),
    ),
    claim: buildV3CareCycleClaim(row),
  };
}

export function isCareCycleActivityCompleted(
  row: EconomyV3RootsRow | null | undefined,
  activity: RootKind,
): boolean {
  return buildV3CareCycle(row).activities[activity].completed;
}

export type RecordCareCycleFinishInput = {
  activity: RootKind;
  presetSeconds: number | null;
  skill: number;
  nowMs: number;
  waterCompleted: boolean;
  waterPresetSeconds: number | null;
  waterSkill: number | null;
  sunCompleted: boolean;
  sunPresetSeconds: number | null;
  sunSkill: number | null;
  fertilizerCompleted: boolean;
  fertilizerPresetSeconds: number | null;
  fertilizerSkill: number | null;
  cycleCompletedAt: number | null;
  cycleStatus: V3CareCycleStatus | null;
};

export type RecordCareCycleFinishResult = {
  waterCompleted: boolean;
  waterPresetSeconds: number | null;
  waterSkill: number | null;
  sunCompleted: boolean;
  sunPresetSeconds: number | null;
  sunSkill: number | null;
  fertilizerCompleted: boolean;
  fertilizerPresetSeconds: number | null;
  fertilizerSkill: number | null;
  cycleCompletedAt: number | null;
  cycleStatus: V3CareCycleStatus;
  allCompleted: boolean;
  /** True when this call newly wrote the activity result. */
  recorded: boolean;
};

/**
 * Persist one activity result into the Care cycle journal.
 * Idempotent: already-completed activities keep their stored values.
 * When all three are done, status becomes `ready` (unless already finished).
 */
export function recordCareCycleFinishPure(
  input: RecordCareCycleFinishInput,
): RecordCareCycleFinishResult {
  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();

  let waterCompleted = input.waterCompleted;
  let waterPresetSeconds = input.waterPresetSeconds;
  let waterSkill = input.waterSkill;
  let sunCompleted = input.sunCompleted;
  let sunPresetSeconds = input.sunPresetSeconds;
  let sunSkill = input.sunSkill;
  let fertilizerCompleted = input.fertilizerCompleted;
  let fertilizerPresetSeconds = input.fertilizerPresetSeconds;
  let fertilizerSkill = input.fertilizerSkill;
  let recorded = false;

  const already = {
    water: waterCompleted,
    sun: sunCompleted,
    fertilizer: fertilizerCompleted,
  }[input.activity];

  if (!already) {
    recorded = true;
    if (input.activity === "water") {
      waterCompleted = true;
      waterPresetSeconds = input.presetSeconds;
      waterSkill = input.skill;
    } else if (input.activity === "sun") {
      sunCompleted = true;
      sunPresetSeconds = input.presetSeconds;
      sunSkill = input.skill;
    } else {
      fertilizerCompleted = true;
      fertilizerPresetSeconds = input.presetSeconds;
      fertilizerSkill = input.skill;
    }
  }

  const allCompleted = waterCompleted && sunCompleted && fertilizerCompleted;
  let cycleCompletedAt = input.cycleCompletedAt;
  if (allCompleted && cycleCompletedAt == null) {
    cycleCompletedAt = nowMs;
  }

  const cycleStatus: V3CareCycleStatus =
    input.cycleStatus === "finished"
      ? "finished"
      : allCompleted
        ? "ready"
        : "in_progress";

  return {
    waterCompleted,
    waterPresetSeconds,
    waterSkill,
    sunCompleted,
    sunPresetSeconds,
    sunSkill,
    fertilizerCompleted,
    fertilizerPresetSeconds,
    fertilizerSkill,
    cycleCompletedAt,
    cycleStatus,
    allCompleted,
    recorded,
  };
}

export type FinishEconomyV3CareCycleInput = {
  careSessionStatus: V3CareActivityStatus | null;
  cycleStatus: V3CareCycleStatus | null;
  waterCompleted: boolean;
  waterPresetSeconds: number | null;
  waterSkill: number | null;
  sunCompleted: boolean;
  sunPresetSeconds: number | null;
  sunSkill: number | null;
  fertilizerCompleted: boolean;
  fertilizerPresetSeconds: number | null;
  fertilizerSkill: number | null;
  cycleFinishedAt: number | null;
  totalPresetSeconds: number | null;
  averageSkill: number | null;
  nowMs: number;
};

export type FinishEconomyV3CareCycleResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      alreadyFinished: boolean;
      finishedAt: number;
      totalPresetSeconds: number;
      averageSkill: number;
      cycleStatus: "finished";
    };

/**
 * Explicit Care cycle finish after all three activities are completed and
 * the transient session is cleared. No rewards.
 */
export function finishEconomyV3CareCyclePure(
  input: FinishEconomyV3CareCycleInput,
): FinishEconomyV3CareCycleResult {
  if (input.careSessionStatus != null) {
    return {
      ok: false,
      code: "activity_session_pending",
      message:
        "Acknowledge the current Care activity session before finishing the cycle",
    };
  }

  const allCompleted =
    input.waterCompleted &&
    input.sunCompleted &&
    input.fertilizerCompleted;
  if (!allCompleted) {
    return {
      ok: false,
      code: "care_cycle_not_complete",
      message: "All three Care activities must be completed first",
    };
  }

  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();

  const totals = computeCareCycleTotals({
    water: {
      completed: true,
      presetSeconds: input.waterPresetSeconds,
      skill: input.waterSkill,
    },
    sun: {
      completed: true,
      presetSeconds: input.sunPresetSeconds,
      skill: input.sunSkill,
    },
    fertilizer: {
      completed: true,
      presetSeconds: input.fertilizerPresetSeconds,
      skill: input.fertilizerSkill,
    },
  });

  if (input.cycleStatus === "finished") {
    return {
      ok: true,
      alreadyFinished: true,
      finishedAt:
        input.cycleFinishedAt != null && Number.isFinite(input.cycleFinishedAt)
          ? Math.trunc(input.cycleFinishedAt)
          : nowMs,
      totalPresetSeconds:
        input.totalPresetSeconds != null &&
        Number.isFinite(input.totalPresetSeconds)
          ? Math.trunc(input.totalPresetSeconds)
          : totals.totalPresetSeconds,
      averageSkill:
        input.averageSkill != null && Number.isFinite(input.averageSkill)
          ? clampAverageSkill(input.averageSkill)
          : totals.averageSkill,
      cycleStatus: "finished",
    };
  }

  return {
    ok: true,
    alreadyFinished: false,
    finishedAt: nowMs,
    totalPresetSeconds: totals.totalPresetSeconds,
    averageSkill: totals.averageSkill,
    cycleStatus: "finished",
  };
}

export type AcknowledgeEconomyV3CareCycleInput = {
  careSessionStatus: V3CareActivityStatus | null;
  cycleStatus: V3CareCycleStatus | null;
  /** True when claimed_at is set (rewards already taken). */
  cycleClaimed: boolean;
};

export type AcknowledgeEconomyV3CareCycleResult =
  | { ok: false; code: string; message: string }
  | { ok: true; cleared: true };

/**
 * Clear a finished Care cycle journal so a new cycle can start.
 * Does not touch reserves, roots, or rewards. Requires claim first.
 */
export function acknowledgeEconomyV3CareCyclePure(
  input: AcknowledgeEconomyV3CareCycleInput,
): AcknowledgeEconomyV3CareCycleResult {
  if (input.careSessionStatus != null) {
    return {
      ok: false,
      code: "activity_session_pending",
      message:
        "Acknowledge the current Care activity session before acknowledging the cycle",
    };
  }

  if (input.cycleStatus !== "finished") {
    return {
      ok: false,
      code: "care_cycle_not_finished",
      message: "Care cycle must be finished before it can be acknowledged",
    };
  }

  if (!input.cycleClaimed) {
    return {
      ok: false,
      code: "care_cycle_not_claimed",
      message: "Claim Care cycle rewards before acknowledging the cycle",
    };
  }

  return { ok: true, cleared: true };
}

export type ClaimEconomyV3CareCycleSnapshot = {
  claimedAt: number;
  xp: number;
  treeGrowth: number;
  income: { base: number; bonus: number; total: number };
};

export type ClaimEconomyV3CareCycleInput = {
  careSessionStatus: V3CareActivityStatus | null;
  cycleStatus: V3CareCycleStatus | null;
  cycleClaimedAt: number | null;
  /** Persisted claim amounts when already claimed. */
  storedClaim: ClaimEconomyV3CareCycleSnapshot | null;
  rewardPreviewAvailable: boolean;
  rewardPreview: EconomyV3CareRewardPreview;
  nowMs: number;
};

export type ClaimEconomyV3CareCycleResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      alreadyClaimed: boolean;
      snapshot: ClaimEconomyV3CareCycleSnapshot;
      /** Awards to apply only when alreadyClaimed is false. */
      applyAwards: boolean;
    };

/**
 * Pure Care cycle claim gate. Caller applies XP/pending when applyAwards.
 * Idempotent when claimed_at is already set.
 */
export function claimEconomyV3CareCyclePure(
  input: ClaimEconomyV3CareCycleInput,
): ClaimEconomyV3CareCycleResult {
  if (input.careSessionStatus != null) {
    return {
      ok: false,
      code: "activity_session_pending",
      message:
        "Acknowledge the current Care activity session before claiming the cycle",
    };
  }

  if (input.cycleStatus !== "finished") {
    return {
      ok: false,
      code: "care_cycle_not_finished",
      message: "Care cycle must be finished before rewards can be claimed",
    };
  }

  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();

  if (
    input.cycleClaimedAt != null &&
    Number.isFinite(input.cycleClaimedAt)
  ) {
    const stored = input.storedClaim;
    return {
      ok: true,
      alreadyClaimed: true,
      applyAwards: false,
      snapshot: stored ?? {
        claimedAt: Math.trunc(input.cycleClaimedAt),
        xp: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
    };
  }

  if (!input.rewardPreviewAvailable || !input.rewardPreview.available) {
    return {
      ok: false,
      code: "reward_preview_unavailable",
      message: "Care cycle reward preview is not available",
    };
  }

  const preview = input.rewardPreview;
  return {
    ok: true,
    alreadyClaimed: false,
    applyAwards: true,
    snapshot: {
      claimedAt: nowMs,
      xp: preview.xp,
      treeGrowth: preview.treeGrowth,
      income: {
        base: preview.income.base,
        bonus: preview.income.bonus,
        total: preview.income.total,
      },
    },
  };
}

export type FinishEconomyV3CareActivityInput = {
  activity: unknown;
  skill: unknown;
  careActivityKind: RootKind | null;
  careActivityStatus: V3CareActivityStatus | null;
  careActivityPresetSeconds: number | null;
  careActivityStartedAt: number | null;
  careActivitySkill: number | null;
  careActivityFinishedAt: number | null;
  nowMs: number;
};

export type FinishEconomyV3CareActivityResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      alreadyCompleted: boolean;
      activity: RootKind;
      skill: number;
      presetSeconds: number | null;
      startedAt: number | null;
      finishedAt: number;
      careActivityStatus: "completed";
    };

/**
 * Pure Care activity finish: validate skill, mark session completed.
 * Does not change reserves or award rewards.
 */
export function finishEconomyV3CareActivityPure(
  input: FinishEconomyV3CareActivityInput,
): FinishEconomyV3CareActivityResult {
  if (!validateRootKind(input.activity)) {
    return {
      ok: false,
      code: "unknown_activity",
      message: 'activity must be "water", "sun", or "fertilizer"',
    };
  }
  const activity = input.activity;

  const skill = parseV3CareSkill(input.skill);
  if (skill == null) {
    return {
      ok: false,
      code: "invalid_skill",
      message: "skill must be a finite number in [0, 1]",
    };
  }

  const status = input.careActivityStatus;
  if (status == null) {
    return {
      ok: false,
      code: "no_active_activity",
      message: "No v3 Care activity session to finish",
    };
  }

  if (input.careActivityKind == null || input.careActivityKind !== activity) {
    return {
      ok: false,
      code: "activity_mismatch",
      message: "activity does not match the current v3 Care session",
    };
  }

  if (status === "completed") {
    const finishedAt =
      input.careActivityFinishedAt != null &&
      Number.isFinite(input.careActivityFinishedAt)
        ? Math.trunc(input.careActivityFinishedAt)
        : Number.isFinite(input.nowMs)
          ? Math.trunc(input.nowMs)
          : Date.now();
    const keptSkill =
      input.careActivitySkill != null &&
      Number.isFinite(input.careActivitySkill)
        ? input.careActivitySkill
        : skill;
    return {
      ok: true,
      alreadyCompleted: true,
      activity,
      skill: keptSkill,
      presetSeconds: input.careActivityPresetSeconds,
      startedAt: input.careActivityStartedAt,
      finishedAt,
      careActivityStatus: "completed",
    };
  }

  if (status !== "active") {
    return {
      ok: false,
      code: "no_active_activity",
      message: "No active v3 Care activity session",
    };
  }

  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();

  return {
    ok: true,
    alreadyCompleted: false,
    activity,
    skill,
    presetSeconds: input.careActivityPresetSeconds,
    startedAt: input.careActivityStartedAt,
    finishedAt: nowMs,
    careActivityStatus: "completed",
  };
}

export type AcknowledgeEconomyV3CareActivityInput = {
  activity: unknown;
  careActivityKind: RootKind | null;
  careActivityStatus: V3CareActivityStatus | null;
};

export type AcknowledgeEconomyV3CareActivityResult =
  | { ok: false; code: string; message: string }
  | { ok: true; activity: RootKind; cleared: true };

/**
 * Pure Care activity acknowledge: clear a completed session so the next
 * activity can start. Does not touch reserves or award rewards.
 */
export function acknowledgeEconomyV3CareActivityPure(
  input: AcknowledgeEconomyV3CareActivityInput,
): AcknowledgeEconomyV3CareActivityResult {
  if (!validateRootKind(input.activity)) {
    return {
      ok: false,
      code: "unknown_activity",
      message: 'activity must be "water", "sun", or "fertilizer"',
    };
  }
  const activity = input.activity;

  const status = input.careActivityStatus;
  if (status == null) {
    return {
      ok: false,
      code: "no_completed_activity",
      message: "No completed v3 Care activity session to acknowledge",
    };
  }

  if (input.careActivityKind == null || input.careActivityKind !== activity) {
    return {
      ok: false,
      code: "activity_mismatch",
      message: "activity does not match the current v3 Care session",
    };
  }

  if (status === "active") {
    return {
      ok: false,
      code: "activity_not_completed",
      message: "v3 Care activity session is still active",
    };
  }

  if (status !== "completed") {
    return {
      ok: false,
      code: "no_completed_activity",
      message: "No completed v3 Care activity session to acknowledge",
    };
  }

  return { ok: true, activity, cleared: true };
}

export type StartEconomyV3CareActivityInput = {
  activity: unknown;
  presetSeconds: unknown;
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  dailyCapSeconds: number;
  careActivityStatus: V3CareActivityStatus | null;
  /** True when this activity is already recorded in the current Care cycle. */
  careCycleActivityCompleted?: boolean;
  nowMs: number;
};

export type StartEconomyV3CareActivityResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      activity: RootKind;
      presetSeconds: number;
      reserveWaterSeconds: number;
      reserveSunSeconds: number;
      reserveFertilizerSeconds: number;
      dailyCapSeconds: number;
      careActivityKind: RootKind;
      careActivityPresetSeconds: number;
      careActivityStartedAt: number;
      careActivityStatus: "active";
    };

/**
 * Pure Care activity start: validate preset, debit matching reserve, open session.
 * Does not complete the mini-game or award rewards.
 */
export function startEconomyV3CareActivityPure(
  input: StartEconomyV3CareActivityInput,
): StartEconomyV3CareActivityResult {
  if (!validateRootKind(input.activity)) {
    return {
      ok: false,
      code: "unknown_activity",
      message: 'activity must be "water", "sun", or "fertilizer"',
    };
  }
  const activity = input.activity;

  if (input.careCycleActivityCompleted) {
    return {
      ok: false,
      code: "activity_already_completed",
      message: `Care cycle activity "${activity}" is already completed`,
    };
  }

  const presetSeconds = parseV3CarePresetSeconds(input.presetSeconds);
  if (presetSeconds == null) {
    return {
      ok: false,
      code: "invalid_preset",
      message: "presetSeconds must be a whole integer",
    };
  }
  if (presetSeconds < V3_PLAYABLE_MIN_SECONDS) {
    return {
      ok: false,
      code: "preset_below_min",
      message: `presetSeconds must be >= ${V3_PLAYABLE_MIN_SECONDS}`,
    };
  }
  if (presetSeconds > V3_RESERVE_CAPACITY_SECONDS) {
    return {
      ok: false,
      code: "preset_above_max",
      message: `presetSeconds must be <= ${V3_RESERVE_CAPACITY_SECONDS}`,
    };
  }

  // dailyCapSeconds here is the effective preset capacity (base + streak bonus).
  const dailyCapSeconds = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      V3_DAILY_CAP_MIN,
      Math.floor(Number(input.dailyCapSeconds)) || V3_DAILY_CAP_DEFAULT,
    ),
  );
  if (presetSeconds > dailyCapSeconds) {
    return {
      ok: false,
      code: "preset_above_daily_cap",
      message: `presetSeconds must be <= dailyCapSeconds (${dailyCapSeconds})`,
    };
  }

  if (input.careActivityStatus === "active") {
    return {
      ok: false,
      code: "activity_in_progress",
      message: "A v3 Care activity session is already active",
    };
  }

  const reserves = {
    water: clampReserveSeconds(input.reserveWaterSeconds, dailyCapSeconds),
    sun: clampReserveSeconds(input.reserveSunSeconds, dailyCapSeconds),
    fertilizer: clampReserveSeconds(
      input.reserveFertilizerSeconds,
      dailyCapSeconds,
    ),
  };

  if (reserves[activity] < presetSeconds) {
    return {
      ok: false,
      code: "insufficient_reserve",
      message: `reserve ${activity} has ${reserves[activity]}s; need ${presetSeconds}`,
    };
  }

  reserves[activity] = clampReserveSeconds(
    reserves[activity] - presetSeconds,
    dailyCapSeconds,
  );

  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();

  return {
    ok: true,
    activity,
    presetSeconds,
    reserveWaterSeconds: reserves.water,
    reserveSunSeconds: reserves.sun,
    reserveFertilizerSeconds: reserves.fertilizer,
    dailyCapSeconds,
    careActivityKind: activity,
    careActivityPresetSeconds: presetSeconds,
    careActivityStartedAt: nowMs,
    careActivityStatus: "active",
  };
}

/**
 * Whether the generation clock is running.
 * Freeze/insurance is a transfer-trio state only — it does not pause accumulation.
 */
export function isEconomyV3Accumulating(input: {
  tutorialActive: boolean;
  /** Ignored for the clock (kept for call-site compatibility). */
  frozen?: boolean;
  capital: number;
}): boolean {
  if (input.tutorialActive) return false;
  return Number.isFinite(input.capital) && input.capital > 0;
}

/**
 * Build public `game.v3Roots` snapshot from a game_state row (+ optional capital
 * for countdown). Does not mutate storage or run generation.
 */
export function buildEconomyV3RootsPublicState(
  row: EconomyV3RootsRow | null | undefined,
  options?: BuildEconomyV3RootsPublicStateOptions,
): EconomyV3RootsPublicState {
  const basePresetSeconds = normalizeDailyCap(row?.v3_daily_cap_seconds);
  const streakDays =
    options?.streakDays !== undefined
      ? options.streakDays
      : row?.streak_days;
  const capacity = buildV3EffectiveCapacityBreakdown({
    basePresetSeconds,
    streakDays,
  });
  const effectivePresetSeconds = capacity.effectivePresetSeconds;
  const transferredRoots = normalizeTransferredRoots(row?.v3_transferred_roots);
  const transferredSet = new Set(transferredRoots);
  const frozenAt = parseNullableTimestampIso(row?.v3_generation_frozen_at);
  const frozen = frozenAt != null;
  const progress = normalizeGenerationProgress(row?.v3_generation_progress);
  const rrCursor = normalizeGenerationRrCursor(row?.v3_generation_rr_cursor);
  const capital =
    options?.capital != null && Number.isFinite(options.capital)
      ? Number(options.capital)
      : 0;
  const tutorialActive = row?.tutorial_done === false;
  const allTransferred = V3_ROOT_KINDS.every((k) => transferredSet.has(k));
  const accumulating =
    isEconomyV3Accumulating({
      tutorialActive,
      frozen,
      capital,
    }) && !allTransferred;

  const roots = {
    water: buildV3RootState({
      seconds: row?.v3_root_water_seconds,
      transferred: transferredSet.has("water"),
      frozen,
      capacitySeconds: effectivePresetSeconds,
    }),
    sun: buildV3RootState({
      seconds: row?.v3_root_sun_seconds,
      transferred: transferredSet.has("sun"),
      frozen,
      capacitySeconds: effectivePresetSeconds,
    }),
    fertilizer: buildV3RootState({
      seconds: row?.v3_root_fertilizer_seconds,
      transferred: transferredSet.has("fertilizer"),
      frozen,
      capacitySeconds: effectivePresetSeconds,
    }),
  } satisfies Record<RootKind, V3RootState>;

  const reserves = {
    water: buildV3ActivityReserve({
      seconds: row?.v3_reserve_water_seconds,
      capacitySeconds: effectivePresetSeconds,
    }),
    sun: buildV3ActivityReserve({
      seconds: row?.v3_reserve_sun_seconds,
      capacitySeconds: effectivePresetSeconds,
    }),
    fertilizer: buildV3ActivityReserve({
      seconds: row?.v3_reserve_fertilizer_seconds,
      capacitySeconds: effectivePresetSeconds,
    }),
  } satisfies Record<RootKind, V3ActivityReserve>;

  const careAvailability = buildEconomyV3CareAvailability({
    reserves: {
      water: reserves.water.seconds,
      sun: reserves.sun.seconds,
      fertilizer: reserves.fertilizer.seconds,
    },
    effectivePresetSeconds,
  });

  const ordinaryGate = computeV3OrdinaryFullState({
    reserveWaterSeconds: reserves.water.seconds,
    reserveSunSeconds: reserves.sun.seconds,
    reserveFertilizerSeconds: reserves.fertilizer.seconds,
    dailyCapSeconds: effectivePresetSeconds,
    effectivePresetSeconds,
  });
  const rootsFull = computeV3RootsFull({
    rootWaterSeconds: roots.water.seconds,
    rootSunSeconds: roots.sun.seconds,
    rootFertilizerSeconds: roots.fertilizer.seconds,
    capacitySeconds: effectivePresetSeconds,
  });
  const excessGate = buildV3ExcessGatePublic({
    ordinaryFull: ordinaryGate.ordinaryFull,
    rootsFull,
    reservesFull: ordinaryGate.reservesFull,
    generatingExcess: options?.generatingExcess === true,
  });

  const metelkaRequired =
    options?.metelkaRequired != null
      ? options.metelkaRequired === true
      : readV3MetelkaRequired(row?.v3_metelka_required);
  const metelkaCompletedForCycle =
    options?.metelkaCompletedForCycle != null
      ? options.metelkaCompletedForCycle === true
      : readV3MetelkaCompletedForCycle(row?.v3_metelka_completed_for_cycle);
  const metelkaSessionActive =
    options?.metelkaSessionActive != null
      ? options.metelkaSessionActive === true
      : (row as { v2_excess_session_active?: unknown })
          ?.v2_excess_session_active === true;
  const metelkaPendingResult =
    options?.metelkaPendingResult != null
      ? options.metelkaPendingResult === true
      : (row as { v2_excess_session_finished_at?: unknown })
          ?.v2_excess_session_finished_at != null;
  const metelkaCycle = buildV3MetelkaCyclePublic({
    rootsFull,
    required: metelkaRequired,
    completedForCycle: metelkaCompletedForCycle,
    excessAvailable: options?.excessAvailable === true,
    metelkaSessionActive,
    metelkaPendingResult,
  });

  const nowMs =
    options?.nowMs != null && Number.isFinite(options.nowMs)
      ? Math.trunc(options.nowMs)
      : Date.now();
  const secondsUntilNextWholeSecond = computeSecondsUntilNextWholeSecond({
    progress,
    capital,
    accumulating,
  });
  const cycleDurationSeconds =
    accumulating && capital > 0
      ? secondsPerGameSecondForCapital(capital)
      : null;
  const nextWholeSecondAt =
    secondsUntilNextWholeSecond != null &&
    Number.isFinite(secondsUntilNextWholeSecond)
      ? new Date(
          nowMs + Math.max(0, secondsUntilNextWholeSecond) * 1000,
        ).toISOString()
      : null;

  return {
    enabled: true,
    dailyCapSeconds: basePresetSeconds,
    basePresetSeconds: capacity.basePresetSeconds,
    activeDailyBonusSeconds: capacity.activeDailyBonusSeconds,
    currentVisitDay: capacity.currentVisitDay,
    effectivePresetSeconds,
    dayKey: parseNullableDayKey(row?.v3_day_key),
    roots,
    reserves,
    careAvailability,
    careSession: buildV3CareSession(row),
    careCycle: buildV3CareCycle(row, options),
    generation: {
      anchorAt: parseNullableTimestampIso(row?.v3_generation_anchor_at),
      progress,
      rrCursor,
      nextRoot: V3_ROOT_KINDS[rrCursor],
      frozenAt,
      insuranceDeadlineAt: parseNullableTimestampIso(
        row?.v3_insurance_deadline_at,
      ),
      firstTransferredRoot: parseFirstTransferredRoot(
        row?.v3_first_transferred_root,
      ),
      transferredRoots,
      secondsUntilNextWholeSecond,
      nextWholeSecondAt,
      cycleDurationSeconds:
        cycleDurationSeconds != null && Number.isFinite(cycleDurationSeconds)
          ? cycleDurationSeconds
          : null,
      accumulating,
    },
    excessGate,
    metelkaCycle,
  };
}

/**
 * Pure round-robin root settle. One wall-clock window → shared generation;
 * each whole second is assigned sequentially Water → Sun → Fertilizer → …
 *
 * Excess gate (reserves, not roots):
 * - while any reserve < effectivePreset → ordinary seconds into the RR queue;
 * - when all three reserves ≥ effectivePreset → ordinary stops, elapsed → excess;
 * - when no eligible root can accept (all at effective cap / transferred / reserve full)
 *   → elapsed → excess ledger (does not set ordinaryFull / Metelka gate);
 * - a root whose matching reserve is full, or that is at effective cap, discards its
 *   RR slot only while another root can still accept; cursor still advances;
 * - transferred roots likewise discard their slot.
 *
 * Before generation: roots/reserves above effective capacity are clamped and
 * overflow is added to the excess ledger (does not clear prior excess).
 *
 * When routing to excess, generated game-seconds skip root growth (cursor unchanged).
 */
export function settleEconomyV3Roots(
  input: SettleEconomyV3RootsInput,
): SettleEconomyV3RootsResult {
  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();
  const dayKey = input.dayKey?.trim()
    ? String(input.dayKey).trim()
    : economyV3DayKeyUtc(nowMs);

  const basePresetSeconds = normalizeDailyCap(input.dailyCapSeconds);
  const effectivePresetSeconds = computeV3EffectivePresetSeconds({
    basePresetSeconds,
    streakDays: input.streakDays,
    visitBonusSeconds: input.visitBonusSeconds,
  });

  const normalized = normalizeV3StorageToEffectiveCapacity({
    rootWaterSeconds: input.rootWaterSeconds,
    rootSunSeconds: input.rootSunSeconds,
    rootFertilizerSeconds: input.rootFertilizerSeconds,
    reserveWaterSeconds: input.reserveWaterSeconds ?? 0,
    reserveSunSeconds: input.reserveSunSeconds ?? 0,
    reserveFertilizerSeconds: input.reserveFertilizerSeconds ?? 0,
    effectivePresetSeconds,
  });

  const rootWater = normalized.rootWaterSeconds;
  const rootSun = normalized.rootSunSeconds;
  const rootFertilizer = normalized.rootFertilizerSeconds;
  const reserveWaterSeconds = normalized.reserveWaterSeconds;
  const reserveSunSeconds = normalized.reserveSunSeconds;
  const reserveFertilizerSeconds = normalized.reserveFertilizerSeconds;
  const capacityNormalizeOverflowSeconds = normalized.overflowSeconds;

  const progress = normalizeGenerationProgress(input.generationProgress);
  const inputCursor = normalizeGenerationRrCursor(input.generationRrCursor);
  const transferred = new Set(normalizeTransferredRoots(input.transferredRoots));
  const ordinaryGate = computeV3OrdinaryFullState({
    reserveWaterSeconds,
    reserveSunSeconds,
    reserveFertilizerSeconds,
    dailyCapSeconds: effectivePresetSeconds,
    effectivePresetSeconds,
  });
  const excessBefore = normalizeExcessSeconds(
    (input.excessSeconds ?? 0) + capacityNormalizeOverflowSeconds,
  );
  const excessElapsedBefore = normalizeExcessElapsedMs(input.excessElapsedMs);

  const base: SettleEconomyV3RootsResult = {
    rootWaterSeconds: rootWater,
    rootSunSeconds: rootSun,
    rootFertilizerSeconds: rootFertilizer,
    reserveWaterSeconds,
    reserveSunSeconds,
    reserveFertilizerSeconds,
    effectivePresetSeconds,
    capacityNormalizeOverflowSeconds,
    generationProgress: progress,
    generationAnchorAt: nowMs,
    dayKey,
    elapsedMs: 0,
    elapsedSeconds: 0,
    generatedRaw: 0,
    wholeSeconds: 0,
    generationRrCursor: inputCursor,
    generated: false,
    excessSeconds: excessBefore,
    excessGenerated: 0,
    excessElapsedMs: excessElapsedBefore,
    excessElapsedMsGenerated: 0,
    ordinaryFull: ordinaryGate.ordinaryFull,
    reservesFull: ordinaryGate.reservesFull,
    generatingExcess: false,
  };

  // Tutorial: advance anchor only — no generation / excess / backfill.
  // Freeze does not pause the generation clock (transfer/insurance only).
  if (input.tutorialActive) {
    return base;
  }

  const anchorRaw = input.generationAnchorAt;
  if (anchorRaw == null || !Number.isFinite(anchorRaw)) {
    // First settle: set anchor to now without backfill.
    return base;
  }

  const anchorMs = Math.trunc(Number(anchorRaw));
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) {
    return base;
  }

  const elapsedMs = Math.max(0, nowMs - anchorMs);
  const elapsedSeconds = elapsedMs / 1000;
  const generatedRaw = generateEnergyFromElapsed(input.capital, elapsedSeconds);

  // Reserves-full OR no root can accept another ordinary unit → excess ledger.
  // ordinaryFull (Metelka gate) stays reserves-only; blocked roots must not discard.
  const ordinaryAcceptBlocked = !canAcceptV3OrdinaryRootUnit({
    rootWaterSeconds: rootWater,
    rootSunSeconds: rootSun,
    rootFertilizerSeconds: rootFertilizer,
    reservesFull: ordinaryGate.reservesFull,
    transferredRoots: transferred,
    rootCapacitySeconds: effectivePresetSeconds,
  });
  const routeGeneratedToExcess =
    ordinaryGate.ordinaryFull || ordinaryAcceptBlocked;

  const split = splitV3ElapsedOrdinaryAndExcess({
    elapsedMs,
    generatedGameSeconds: generatedRaw,
    ordinaryFull: routeGeneratedToExcess,
  });

  const generatingExcess =
    routeGeneratedToExcess && split.excessGenerated > 0;

  // When ordinary is full or roots cannot accept: do not grow roots.
  // Still advance generationProgress so the cycle clock / nextWholeSecondAt
  // stay absolute (same as ordinary). Freezing progress while resetting
  // generationAnchorAt=now caused the UI timer to jump back every poll.
  if (routeGeneratedToExcess) {
    const totalGenerated = progress + split.excessGenerated;
    const wholeSeconds = Math.max(0, Math.floor(totalGenerated));
    const newProgress = normalizeGenerationProgress(
      totalGenerated - wholeSeconds,
    );
    return {
      ...base,
      generationProgress: newProgress,
      generationAnchorAt: nowMs,
      elapsedMs,
      elapsedSeconds,
      generatedRaw,
      // Wholes completed into the excess ledger this settle (roots unchanged).
      wholeSeconds,
      generationRrCursor: inputCursor,
      generated: true,
      excessSeconds: normalizeExcessSeconds(
        excessBefore + split.excessGenerated,
      ),
      excessGenerated: split.excessGenerated,
      excessElapsedMs: normalizeExcessElapsedMs(
        excessElapsedBefore + split.excessElapsedMs,
      ),
      excessElapsedMsGenerated: split.excessElapsedMs,
      generatingExcess,
    };
  }

  const totalGenerated = progress + split.ordinaryAccepted;
  const wholeSeconds = Math.max(0, Math.floor(totalGenerated));
  const newProgress = normalizeGenerationProgress(totalGenerated - wholeSeconds);

  const distributed = distributeV3WholeSecondsRoundRobin({
    wholeSeconds,
    generationRrCursor: inputCursor,
    rootWaterSeconds: rootWater,
    rootSunSeconds: rootSun,
    rootFertilizerSeconds: rootFertilizer,
    reservesFull: ordinaryGate.reservesFull,
    transferredRoots: transferred,
    rootCapacitySeconds: effectivePresetSeconds,
  });

  return {
    rootWaterSeconds: distributed.rootWaterSeconds,
    rootSunSeconds: distributed.rootSunSeconds,
    rootFertilizerSeconds: distributed.rootFertilizerSeconds,
    reserveWaterSeconds,
    reserveSunSeconds,
    reserveFertilizerSeconds,
    effectivePresetSeconds,
    capacityNormalizeOverflowSeconds,
    generationProgress: newProgress,
    generationAnchorAt: nowMs,
    dayKey,
    elapsedMs,
    elapsedSeconds,
    generatedRaw,
    wholeSeconds,
    generationRrCursor: distributed.generationRrCursor,
    generated: true,
    excessSeconds: excessBefore,
    excessGenerated: 0,
    excessElapsedMs: excessElapsedBefore,
    excessElapsedMsGenerated: 0,
    ordinaryFull: false,
    reservesFull: ordinaryGate.reservesFull,
    generatingExcess: false,
  };
}

export type TransferEconomyV3RootInput = {
  root: unknown;
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  /**
   * Effective capacity for free-room / clamp (base + streak bonus).
   * Also accepted as `capacitySeconds`.
   */
  dailyCapSeconds: number;
  capacitySeconds?: number;
  transferredRoots: readonly RootKind[] | unknown;
  firstTransferredRoot: RootKind | null;
  /** Epoch ms — used for freeze / insurance / cycle restart timestamps. */
  nowMs: number;
  /** Existing freeze timestamp (epoch ms), if any. */
  generationFrozenAt: number | null;
  /** Existing insurance deadline (epoch ms), if any. */
  insuranceDeadlineAt: number | null;
  /** Shared generation progress before this transfer. */
  generationProgress: number;
  /** Generation anchor before this transfer (epoch ms). */
  generationAnchorAt: number | null;
};

export type TransferEconomyV3RootSuccess = {
  ok: true;
  root: RootKind;
  /** Whole seconds taken from the root before clearing it. */
  transferredSeconds: number;
  /** Whole seconds actually added to the matching reserve (≤ free room). */
  acceptedSeconds: number;
  /**
   * Whole seconds that did not fit reserve — routed to excess at persist.
   * Root is always cleared to 0 on success.
   */
  discardedSeconds: number;
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  dailyCapSeconds: number;
  transferredRoots: RootKind[];
  firstTransferredRoot: RootKind | null;
  generationFrozenAt: number | null;
  insuranceDeadlineAt: number | null;
  generationProgress: number;
  generationAnchorAt: number;
  /** True when this was the first transfer of the current cycle. */
  startedFreeze: boolean;
  /** True when all three roots transferred and a new cycle was opened. */
  cycleCompleted: boolean;
};

export type TransferEconomyV3RootFailure = {
  ok: false;
  code: "unknown_root" | "already_transferred" | "empty_root" | "reserve_full";
  message: string;
};

/**
 * Pure manual transfer of one root into its matching activity reserve.
 *
 * First transfer of a cycle sets transfer-freeze + insurance for the trio
 * (waiting UI / auto-transfer). Generation clock keeps running.
 * Completing the trio clears freeze/transferred markers only — progress and
 * anchor are preserved.
 *
 * On success the root is cleared to 0. Overflow past effective capacity is
 * returned as discardedSeconds for the caller to ADD to the excess ledger
 * (prior excess is never cleared).
 */
export function transferEconomyV3RootPure(
  input: TransferEconomyV3RootInput,
): TransferEconomyV3RootSuccess | TransferEconomyV3RootFailure {
  if (!validateRootKind(input.root)) {
    return {
      ok: false,
      code: "unknown_root",
      message: 'root must be "water", "sun", or "fertilizer"',
    };
  }
  const root = input.root;
  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();
  const capacitySeconds = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      V3_DAILY_CAP_MIN,
      Math.floor(
        Number(input.capacitySeconds ?? input.dailyCapSeconds),
      ) || V3_DAILY_CAP_DEFAULT,
    ),
  );
  const dailyCapSeconds = capacitySeconds;
  const transferredRoots = normalizeTransferredRoots(input.transferredRoots);
  if (transferredRoots.includes(root)) {
    return {
      ok: false,
      code: "already_transferred",
      message: `Root ${root} was already transferred`,
    };
  }

  const roots = {
    water: clampRootSeconds(input.rootWaterSeconds, capacitySeconds),
    sun: clampRootSeconds(input.rootSunSeconds, capacitySeconds),
    fertilizer: clampRootSeconds(input.rootFertilizerSeconds, capacitySeconds),
  };
  const reserves = {
    water: clampReserveSeconds(input.reserveWaterSeconds, capacitySeconds),
    sun: clampReserveSeconds(input.reserveSunSeconds, capacitySeconds),
    fertilizer: clampReserveSeconds(
      input.reserveFertilizerSeconds,
      capacitySeconds,
    ),
  };

  const transferredSeconds = roots[root];
  if (transferredSeconds < V3_ROOT_PLAYABLE_MIN_SECONDS) {
    return {
      ok: false,
      code: "empty_root",
      message: `Root ${root} must hold at least ${V3_ROOT_PLAYABLE_MIN_SECONDS} second to transfer`,
    };
  }

  const freeRoom = Math.max(0, capacitySeconds - reserves[root]);
  const acceptedSeconds = Math.min(transferredSeconds, freeRoom);
  const discardedSeconds = transferredSeconds - acceptedSeconds;

  if (acceptedSeconds <= 0) {
    return {
      ok: false,
      code: "reserve_full",
      message: `Reserve ${root} is full — transfer does not move or destroy excess`,
    };
  }

  // Clear root to 0; overflow becomes discardedSeconds → excess at persist.
  roots[root] = 0;
  reserves[root] = clampReserveSeconds(
    reserves[root] + acceptedSeconds,
    capacitySeconds,
  );

  const nextTransferred = normalizeTransferredRoots([
    ...transferredRoots,
    root,
  ]);
  const isFirstOfCycle = transferredRoots.length === 0;

  let firstTransferredRoot: RootKind | null =
    input.firstTransferredRoot != null &&
    validateRootKind(input.firstTransferredRoot)
      ? input.firstTransferredRoot
      : null;

  let generationFrozenAt =
    input.generationFrozenAt != null && Number.isFinite(input.generationFrozenAt)
      ? Math.trunc(input.generationFrozenAt)
      : null;
  let insuranceDeadlineAt =
    input.insuranceDeadlineAt != null &&
    Number.isFinite(input.insuranceDeadlineAt)
      ? Math.trunc(input.insuranceDeadlineAt)
      : null;
  let generationProgress = normalizeGenerationProgress(input.generationProgress);
  let generationAnchorAt =
    input.generationAnchorAt != null && Number.isFinite(input.generationAnchorAt)
      ? Math.trunc(input.generationAnchorAt)
      : nowMs;
  let startedFreeze = false;
  let cycleCompleted = false;
  let finalTransferredRoots = nextTransferred;

  if (isFirstOfCycle) {
    startedFreeze = true;
    firstTransferredRoot = root;
    generationFrozenAt = nowMs;
    insuranceDeadlineAt = nowMs + V3_TRANSFER_INSURANCE_MS;
  } else {
    // Keep freeze markers from the first transfer of this cycle.
    if (firstTransferredRoot == null) {
      firstTransferredRoot = root;
    }
    if (generationFrozenAt == null) {
      generationFrozenAt = nowMs;
    }
    if (insuranceDeadlineAt == null) {
      insuranceDeadlineAt = generationFrozenAt + V3_TRANSFER_INSURANCE_MS;
    }
  }

  if (nextTransferred.length >= V3_ROOT_KINDS.length) {
    // Clear transfer-cycle markers only — keep generation clock (progress/anchor).
    cycleCompleted = true;
    startedFreeze = false;
    generationFrozenAt = null;
    insuranceDeadlineAt = null;
    firstTransferredRoot = null;
    finalTransferredRoots = [];
  }

  return {
    ok: true,
    root,
    transferredSeconds,
    acceptedSeconds,
    discardedSeconds,
    rootWaterSeconds: roots.water,
    rootSunSeconds: roots.sun,
    rootFertilizerSeconds: roots.fertilizer,
    reserveWaterSeconds: reserves.water,
    reserveSunSeconds: reserves.sun,
    reserveFertilizerSeconds: reserves.fertilizer,
    dailyCapSeconds,
    transferredRoots: finalTransferredRoots,
    firstTransferredRoot,
    generationFrozenAt,
    insuranceDeadlineAt,
    generationProgress,
    generationAnchorAt,
    startedFreeze,
    cycleCompleted,
  };
}

export type EconomyV3AutoTransferPublic = {
  applied: true;
  at: string;
  roots: RootKind[];
  acceptedByRoot: Partial<Record<RootKind, number>>;
  discardedByRoot: Partial<Record<RootKind, number>>;
};

export type AutoTransferEconomyV3Input = {
  nowMs: number;
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  /** Effective capacity (base + streak). Also accepted as capacitySeconds. */
  dailyCapSeconds: number;
  capacitySeconds?: number;
  transferredRoots: readonly RootKind[] | unknown;
  firstTransferredRoot: RootKind | null;
  generationFrozenAt: number | null;
  insuranceDeadlineAt: number | null;
  generationProgress: number;
  generationAnchorAt: number | null;
};

export type AutoTransferEconomyV3Result =
  | { applied: false }
  | {
      applied: true;
      atMs: number;
      roots: RootKind[];
      acceptedByRoot: Partial<Record<RootKind, number>>;
      discardedByRoot: Partial<Record<RootKind, number>>;
      rootWaterSeconds: number;
      rootSunSeconds: number;
      rootFertilizerSeconds: number;
      reserveWaterSeconds: number;
      reserveSunSeconds: number;
      reserveFertilizerSeconds: number;
      dailyCapSeconds: number;
      transferredRoots: RootKind[];
      firstTransferredRoot: null;
      generationFrozenAt: null;
      insuranceDeadlineAt: null;
      generationProgress: number;
      generationAnchorAt: number;
      cycleCompleted: true;
    };

/**
 * After insurance deadline, automatically finish remaining roots of a frozen
 * cycle and open a new accumulation cycle (no backfill).
 *
 * Empty remaining roots (0 s) are completed without adding to reserves so the
 * system cannot stay frozen forever.
 *
 * Transferred roots are cleared to 0. Overflow past effective capacity is
 * recorded in discardedByRoot for the caller to ADD to excess (prior excess
 * is never cleared).
 */
export function autoTransferEconomyV3RemainingPure(
  input: AutoTransferEconomyV3Input,
): AutoTransferEconomyV3Result {
  const nowMs = Number.isFinite(input.nowMs)
    ? Math.trunc(input.nowMs)
    : Date.now();
  const frozenAt =
    input.generationFrozenAt != null && Number.isFinite(input.generationFrozenAt)
      ? Math.trunc(input.generationFrozenAt)
      : null;
  const deadlineAt =
    input.insuranceDeadlineAt != null &&
    Number.isFinite(input.insuranceDeadlineAt)
      ? Math.trunc(input.insuranceDeadlineAt)
      : null;

  if (frozenAt == null || deadlineAt == null || nowMs < deadlineAt) {
    return { applied: false };
  }

  const capacitySeconds = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      V3_DAILY_CAP_MIN,
      Math.floor(
        Number(input.capacitySeconds ?? input.dailyCapSeconds),
      ) || V3_DAILY_CAP_DEFAULT,
    ),
  );
  const dailyCapSeconds = capacitySeconds;
  const transferredRoots = normalizeTransferredRoots(input.transferredRoots);
  const roots = {
    water: clampRootSeconds(input.rootWaterSeconds, capacitySeconds),
    sun: clampRootSeconds(input.rootSunSeconds, capacitySeconds),
    fertilizer: clampRootSeconds(input.rootFertilizerSeconds, capacitySeconds),
  };
  const reserves = {
    water: clampReserveSeconds(input.reserveWaterSeconds, capacitySeconds),
    sun: clampReserveSeconds(input.reserveSunSeconds, capacitySeconds),
    fertilizer: clampReserveSeconds(
      input.reserveFertilizerSeconds,
      capacitySeconds,
    ),
  };

  const remaining = V3_ROOT_KINDS.filter((k) => !transferredRoots.includes(k));
  const progress = normalizeGenerationProgress(input.generationProgress);
  const anchorAt =
    input.generationAnchorAt != null && Number.isFinite(input.generationAnchorAt)
      ? Math.trunc(input.generationAnchorAt)
      : nowMs;

  // Frozen with no remaining roots (inconsistent) — still thaw; keep clock.
  if (remaining.length === 0) {
    return {
      applied: true,
      atMs: nowMs,
      roots: [],
      acceptedByRoot: {},
      discardedByRoot: {},
      rootWaterSeconds: roots.water,
      rootSunSeconds: roots.sun,
      rootFertilizerSeconds: roots.fertilizer,
      reserveWaterSeconds: reserves.water,
      reserveSunSeconds: reserves.sun,
      reserveFertilizerSeconds: reserves.fertilizer,
      dailyCapSeconds,
      transferredRoots: [],
      firstTransferredRoot: null,
      generationFrozenAt: null,
      insuranceDeadlineAt: null,
      generationProgress: progress,
      generationAnchorAt: anchorAt,
      cycleCompleted: true,
    };
  }

  const acceptedByRoot: Partial<Record<RootKind, number>> = {};
  const discardedByRoot: Partial<Record<RootKind, number>> = {};
  const autoRoots: RootKind[] = [];

  for (const kind of remaining) {
    autoRoots.push(kind);
    const seconds = roots[kind];
    if (seconds <= 0) {
      acceptedByRoot[kind] = 0;
      discardedByRoot[kind] = 0;
      roots[kind] = 0;
      continue;
    }
    const freeRoom = Math.max(0, capacitySeconds - reserves[kind]);
    const accepted = Math.min(seconds, freeRoom);
    const overflow = seconds - accepted;
    reserves[kind] = clampReserveSeconds(
      reserves[kind] + accepted,
      capacitySeconds,
    );
    // Clear root; overflow → discardedByRoot → excess at persist.
    roots[kind] = 0;
    acceptedByRoot[kind] = accepted;
    discardedByRoot[kind] = overflow;
  }

  return {
    applied: true,
    atMs: nowMs,
    roots: autoRoots,
    acceptedByRoot,
    discardedByRoot,
    rootWaterSeconds: roots.water,
    rootSunSeconds: roots.sun,
    rootFertilizerSeconds: roots.fertilizer,
    reserveWaterSeconds: reserves.water,
    reserveSunSeconds: reserves.sun,
    reserveFertilizerSeconds: reserves.fertilizer,
    dailyCapSeconds,
    transferredRoots: [],
    firstTransferredRoot: null,
    generationFrozenAt: null,
    insuranceDeadlineAt: null,
    // Keep generation clock — do not open a fresh 12:00 cycle.
    generationProgress: progress,
    generationAnchorAt: anchorAt,
    cycleCompleted: true,
  };
}

export function toEconomyV3AutoTransferPublic(
  auto: Extract<AutoTransferEconomyV3Result, { applied: true }>,
): EconomyV3AutoTransferPublic {
  return {
    applied: true,
    at: new Date(auto.atMs).toISOString(),
    roots: auto.roots,
    acceptedByRoot: auto.acceptedByRoot,
    discardedByRoot: auto.discardedByRoot,
  };
}

/**
 * Pure invariant checks for persisted / assembled v3 state.
 * Returns an empty array when valid.
 */
export function validateEconomyV3RootsState(
  state: EconomyV3RootsPublicState,
): EconomyV3InvariantIssue[] {
  const issues: EconomyV3InvariantIssue[] = [];
  const dailyCap = normalizeDailyCap(state.dailyCapSeconds);

  if (state.dailyCapSeconds !== dailyCap) {
    issues.push({
      code: "daily_cap_out_of_range",
      message: `dailyCapSeconds must be in [${V3_DAILY_CAP_MIN}, ${V3_DAILY_CAP_MAX}]`,
    });
  }

  const progress = state.generation.progress;
  if (
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress >= 1
  ) {
    issues.push({
      code: "progress_out_of_range",
      message: "generation.progress must be in [0, 1)",
    });
  }

  if (
    state.generation.secondsUntilNextWholeSecond != null &&
    state.generation.secondsUntilNextWholeSecond < 0
  ) {
    issues.push({
      code: "seconds_until_negative",
      message: "secondsUntilNextWholeSecond must not be negative",
    });
  }

  for (const kind of V3_ROOT_KINDS) {
    const root = state.roots[kind];
    const effectiveCap = Math.min(
      V3_EFFECTIVE_CAPACITY_MAX,
      Math.max(
        0,
        Math.floor(Number(state.effectivePresetSeconds)) ||
          Math.floor(Number(state.dailyCapSeconds)) ||
          V3_DAILY_CAP_DEFAULT,
      ),
    );
    const rootCap = effectiveCap;
    if (
      root.seconds < 0 ||
      root.seconds > rootCap ||
      !Number.isInteger(root.seconds)
    ) {
      issues.push({
        code: "root_seconds_out_of_range",
        message: `root ${kind} seconds must be an integer in [0, ${rootCap}]`,
      });
    }
    const reserve = state.reserves[kind];
    const reserveCap = effectiveCap;
    if (
      reserve.seconds < 0 ||
      reserve.seconds > reserveCap ||
      !Number.isInteger(reserve.seconds)
    ) {
      issues.push({
        code: "reserve_seconds_out_of_range",
        message: `reserve ${kind} seconds must be an integer in [0, capacity=${reserveCap}]`,
      });
    }
  }

  for (const kind of state.generation.transferredRoots) {
    if (!validateRootKind(kind)) {
      issues.push({
        code: "unknown_transferred_root",
        message: `transferredRoots contains unknown kind: ${String(kind)}`,
      });
    }
  }

  const first = state.generation.firstTransferredRoot;
  if (first != null && !validateRootKind(first)) {
    issues.push({
      code: "unknown_first_transferred_root",
      message: `firstTransferredRoot must be a known root kind or null`,
    });
  }

  if (
    state.generation.frozenAt == null &&
    state.generation.insuranceDeadlineAt != null
  ) {
    issues.push({
      code: "insurance_without_freeze",
      message: "insuranceDeadlineAt must be null when frozenAt is null",
    });
  }

  return issues;
}

export function isEconomyV3RootsStateValid(
  state: EconomyV3RootsPublicState,
): boolean {
  return validateEconomyV3RootsState(state).length === 0;
}
