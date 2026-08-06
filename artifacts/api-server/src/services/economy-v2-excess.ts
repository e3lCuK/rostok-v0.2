/**
 * Economy v2 excess (t_excess) — accumulated game-seconds beyond the ordinary 60 cap.
 *
 * Ordinary storage (bank + ready + progress) stays ≤ 60.
 * Excess is stored separately and is NOT spilled back into roots/bank automatically.
 *
 * ## Four entities (do not conflate)
 *
 * 1. `v2_excess_seconds` / `excessSeconds` — unlimited **game ledger** (SoT).
 * 2. `v2_excess_elapsed_ms` / `excessElapsedMs` — unlimited **wall-clock** financial t_excess.
 * 3. `excessPresetSeconds` — **derived only**: n=ledger/60 → T(n) ∈ [5,25]. Never a DB column.
 * 4. `session.presetSeconds` — **frozen** T at Metelka start (`v2_excess_session_preset_seconds`).
 *
 * Money uses (2) + r_excess(n from 1). Metelka duration / webs / XP use (3)/(4).
 *
 * Financial wall-clock time lives in v2_excess_elapsed_ms (separate from game seconds).
 * Active Metelka session snapshot fields live on game_state; formulas for
 * preset/rate/webs are shared.
 *
 * Session version:
 * - 2 = white webs only; clear is record-only progress; finish settles session
 *   (excess deduct + wipe). Interim stage: no per-clear/finish awards yet.
 * - NULL/1 = legacy per-click rewards (50/50 guaranteed+bonus-pool formula)
 *   + finish clears session
 */

import { V2_TOTAL_STORAGE_CAP } from "./economy-v2-capacity";
import {
  applyClearedFlagsToWebs,
  computeExcessWebCount,
  generateExcessWebLayout,
  generateExcessWebLayoutWithSpecial,
  parseClearedExcessWebIds,
  type ExcessWebPlacement,
} from "./economy-v2-excess-webs";
import {
  countRegularClearedWebs,
  EXCESS_SPECIAL_WEB_ID,
  isExcessBaseWebCollectionMode,
  isSpecialWebCleared,
  type ExcessBaseWebCollectionMode,
} from "./economy-v2-excess-rewards";
import {
  isExcessFinishReason,
  type ExcessFinishReason,
} from "./economy-v2-excess-skill";
import {
  isExcessFinanciallyValid,
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
} from "./economy-v2-excess-income";

/** One full excess cycle = 60 game-seconds (same unit as ordinary capacity). */
export const V2_EXCESS_CYCLE_SECONDS = V2_TOTAL_STORAGE_CAP; // 60

/** Metelka becomes available at this accumulated excess (preset floor). */
export const V2_EXCESS_MIN_AVAILABLE_SECONDS = 5;

export const V2_EXCESS_PRESET_MIN = 5;
export const V2_EXCESS_PRESET_MAX = 25;

/** Current Metelka session product version written on start. */
export const V2_EXCESS_SESSION_VERSION = 2;

/** Non-negative finite excess — no upper clamp, no floor rounding. */
export function normalizeExcessSeconds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Fractional excess cycle count: n = excessSeconds / 60.
 * Pure readout — does not mutate storage.
 */
export function excessCycleFromSeconds(excessSeconds: number): number {
  const e = normalizeExcessSeconds(excessSeconds);
  return e / V2_EXCESS_CYCLE_SECONDS;
}

/**
 * Bonus income rate for excess (decimal fraction of capital).
 * r_excess(n) = 0.005 + 0.01 × exp(−0.06 × n)
 */
export function excessBonusRate(cycleCount: number): number {
  const n = Number.isFinite(cycleCount) ? Math.max(0, cycleCount) : 0;
  return 0.005 + 0.01 * Math.exp(-0.06 * n);
}

/**
 * Metelka preset duration in seconds.
 * T_excess(n) = 5 + round(20 × (1 − exp(−0.06 × n))), clamped to [5, 25].
 */
export function excessPresetSeconds(cycleCount: number): number {
  const n = Number.isFinite(cycleCount) ? Math.max(0, cycleCount) : 0;
  const raw = 5 + Math.round(20 * (1 - Math.exp(-0.06 * n)));
  return Math.min(V2_EXCESS_PRESET_MAX, Math.max(V2_EXCESS_PRESET_MIN, raw));
}

/** Live T from unlimited game ledger (same as public excessPresetSeconds). */
export function deriveExcessPresetSeconds(excessSeconds: number): number {
  return excessPresetSeconds(excessCycleFromSeconds(excessSeconds));
}

/**
 * Search step (game-seconds) for inverse T → min ledger.
 * Must match client excessEconomyDerive.MIN_LEDGER_SEARCH_STEP.
 */
export const MIN_LEDGER_SEARCH_STEP = 0.01;

/**
 * Minimal playable ledger that yields target Metelka preset T via production T(n).
 *
 * Uses the same excessPresetSeconds / excessCycleFromSeconds — no alternate formula.
 * For T=5 returns V2_EXCESS_MIN_AVAILABLE_SECONDS (playable floor; T is already 5 at 0).
 * Never sets excessSeconds = T directly.
 */
export function minExcessSecondsForPreset(targetPresetSeconds: number): number {
  const T = Math.min(
    V2_EXCESS_PRESET_MAX,
    Math.max(
      V2_EXCESS_PRESET_MIN,
      Math.round(Number(targetPresetSeconds) || V2_EXCESS_PRESET_MIN),
    ),
  );

  if (T === V2_EXCESS_PRESET_MIN) {
    return V2_EXCESS_MIN_AVAILABLE_SECONDS;
  }

  // Analytical lower edge of the round() bucket for offset k = T-5:
  // round(20*(1-exp(-0.06n))) = k  when  20*(…) ∈ [k-0.5, k+0.5)
  const k = T - V2_EXCESS_PRESET_MIN;
  const xLow = k - 0.5;
  const ratio = xLow / 20;
  const nApprox =
    ratio > 0 && ratio < 1 ? -Math.log(1 - ratio) / 0.06 : 0;
  let s = Math.max(0, nApprox * V2_EXCESS_CYCLE_SECONDS - 1);

  const maxScan = 100_000;
  while (s <= maxScan) {
    if (deriveExcessPresetSeconds(s) === T) {
      let min = s;
      while (
        min - MIN_LEDGER_SEARCH_STEP >= 0 &&
        deriveExcessPresetSeconds(min - MIN_LEDGER_SEARCH_STEP) === T
      ) {
        min -= MIN_LEDGER_SEARCH_STEP;
      }
      // Quantize to 0.01 grid: smallest grid point that still yields T.
      let out = Math.ceil(min * 100 - 1e-12) / 100;
      while (deriveExcessPresetSeconds(out) < T) {
        out = Math.round((out + MIN_LEDGER_SEARCH_STEP) * 100) / 100;
      }
      while (
        out - MIN_LEDGER_SEARCH_STEP >= 0 &&
        deriveExcessPresetSeconds(out - MIN_LEDGER_SEARCH_STEP) === T
      ) {
        out = Math.round((out - MIN_LEDGER_SEARCH_STEP) * 100) / 100;
      }
      return out;
    }
    s += MIN_LEDGER_SEARCH_STEP;
  }

  // Should be unreachable for T ∈ [5,25]; fall back to known T=25 neighborhood.
  return 3688.88;
}

export function isExcessAvailable(excessSeconds: number): boolean {
  return normalizeExcessSeconds(excessSeconds) >= V2_EXCESS_MIN_AVAILABLE_SECONDS;
}

/**
 * Split generated energy into ordinary capacity fill vs excess.
 * ordinaryAccepted = min(generated, freeCapacity)
 * excessGenerated  = max(0, generated − ordinaryAccepted)
 */
export function splitGeneratedIntoOrdinaryAndExcess(input: {
  generated: number;
  freeCapacity: number;
}): { ordinaryAccepted: number; excessGenerated: number } {
  const generated =
    Number.isFinite(input.generated) && input.generated > 0 ? input.generated : 0;
  const free =
    Number.isFinite(input.freeCapacity) && input.freeCapacity > 0
      ? input.freeCapacity
      : 0;
  const ordinaryAccepted = Math.min(generated, free);
  const excessGenerated = Math.max(0, generated - ordinaryAccepted);
  return { ordinaryAccepted, excessGenerated };
}

export type EconomyV2ExcessSessionPublicState = {
  active: boolean;
  /** 2 = new model; null/1 = legacy. */
  version: number | null;
  startedAt: number | null;
  sourceSeconds: number | null;
  /** Frozen t_excess ms snapshot at start. */
  sourceElapsedMs: number | null;
  /** Frozen active_balance at start (K). */
  capital: number | null;
  /** Snapshot of v2_excess_base_income at start (version=2). */
  baseIncome: number | null;
  baseWebCleared: boolean;
  baseWebCollectionMode: ExcessBaseWebCollectionMode | null;
  presetSeconds: number | null;
  rate: number | null;
  /** Regular (Skill/XP) white web count — excludes red base-income web. */
  webCount: number | null;
  /** Alias of webCount for version=2 clients. */
  whiteWebCount: number | null;
  layoutSeed: number | null;
  clearedWebIds: string[];
  /** Regular cleared count only. */
  clearedWebCount: number;
  /** Regular remaining count only. */
  remainingWebCount: number;
  /** Version 2 debug: cumulative raw bonus share unlocked this session (not yet credited). */
  bonusRawUnlocked: number | null;
  /** Version 2 debug: cumulative integer XP already applied to player_xp this session. */
  xpAwarded: number | null;
  /** Version-2 red web id (base-income-web). Legacy: web-special. */
  specialWebId: string | null;
  baseWebId: string | null;
  specialCleared: boolean;
  webs: ExcessWebPlacement[];
};

export type EconomyV2ExcessResultXpPublicState = {
  max: number | null;
  raw: number | null;
  awarded: number | null;
  applied: boolean;
};

export type EconomyV2ExcessResultIncomeBasePublicState = {
  amount: number | null;
  collectionMode: ExcessBaseWebCollectionMode | null;
  applied: boolean;
};

export type EconomyV2ExcessResultIncomeBonusPublicState = {
  gross: number | null;
  skill: number | null;
  paid: number | null;
  applied: boolean;
};

export type EconomyV2ExcessResultIncomeTotalPublicState = {
  paid: number | null;
  applied: boolean;
};

export type EconomyV2ExcessResultIncomePublicState = {
  /** False when legacy/synthetic excess has no elapsed history. */
  available: boolean;
  reason: "ok" | "missing_excess_elapsed_history" | "zero" | null;
  capital: number | null;
  excessElapsedMs: number | null;
  annualRate: number | null;
  /** Bonus gross (D_excess). */
  gross: number | null;
  /** Version=2: Skill (bonus factor). Legacy: 0.5+0.5×Skill. */
  paymentFactor: number | null;
  /** Total paid (base+bonus for v2; legacy lump). */
  paid: number | null;
  applied: boolean;
  /** Version=2 structured income (optional for legacy). */
  base?: EconomyV2ExcessResultIncomeBasePublicState;
  bonus?: EconomyV2ExcessResultIncomeBonusPublicState;
  total?: EconomyV2ExcessResultIncomeTotalPublicState;
};

export type EconomyV2ExcessResultPublicState = {
  available: boolean;
  sessionVersion: number | null;
  finishedAt: number | null;
  reason: ExcessFinishReason | null;
  /** White / regular cleared count. */
  clearedCount: number | null;
  clearedWhiteCount: number | null;
  /** White / regular web count. */
  webCount: number | null;
  whiteWebCount: number | null;
  skill: number | null;
  sourceSeconds: number | null;
  presetSeconds: number | null;
  rate: number | null;
  xp: EconomyV2ExcessResultXpPublicState;
  income: EconomyV2ExcessResultIncomePublicState;
};

export type EconomyV2ExcessPublicState = {
  excessSeconds: number;
  /** Real financial excess time (t_excess) in ms. */
  excessElapsedMs: number;
  /** Accrued base 12% APR for excess-period wall-clock only. */
  excessBaseIncome: number;
  /** True when game excess is backed by real elapsed (or excess is empty). */
  excessFinanciallyValid: boolean;
  excessCycle: number;
  excessAvailable: boolean;
  /**
   * Live Metelka duration T(n) derived from excessSeconds — not persisted.
   * Only session.presetSeconds is frozen storage for an active attempt.
   */
  excessPresetSeconds: number;
  excessRate: number;
  session: EconomyV2ExcessSessionPublicState;
  result: EconomyV2ExcessResultPublicState;
};

export type ExcessSessionRowFields = {
  v2_excess_elapsed_ms?: unknown;
  v2_excess_base_income?: unknown;
  v2_ordinary_income_elapsed_ms?: unknown;
  v2_excess_session_active?: unknown;
  v2_excess_session_version?: unknown;
  v2_excess_session_started_at?: unknown;
  v2_excess_session_source_seconds?: unknown;
  v2_excess_session_source_elapsed_ms?: unknown;
  v2_excess_session_capital?: unknown;
  v2_excess_session_base_income?: unknown;
  v2_excess_session_base_web_cleared?: unknown;
  v2_excess_session_base_web_collection_mode?: unknown;
  v2_excess_session_base_income_applied?: unknown;
  v2_excess_session_preset_seconds?: unknown;
  v2_excess_session_rate?: unknown;
  v2_excess_session_web_count?: unknown;
  v2_excess_session_layout_seed?: unknown;
  v2_excess_session_cleared_web_ids?: unknown;
  v2_excess_session_finished_at?: unknown;
  v2_excess_session_finish_reason?: unknown;
  v2_excess_session_final_cleared_count?: unknown;
  v2_excess_session_final_web_count?: unknown;
  v2_excess_session_skill?: unknown;
  v2_excess_session_xp_max?: unknown;
  v2_excess_session_xp_raw?: unknown;
  v2_excess_session_xp_awarded?: unknown;
  v2_excess_session_xp_applied?: unknown;
  v2_excess_session_gross_income?: unknown;
  v2_excess_session_payment_factor?: unknown;
  v2_excess_session_paid_income?: unknown;
  v2_excess_session_income_applied?: unknown;
  v2_excess_session_bonus_raw_unlocked?: unknown;
};

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1 || raw === "1";
}

function asNullableInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function asNullableFinite(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

export function isExcessSessionVersion2(version: unknown): boolean {
  const n = asNullableInt(version);
  return n === V2_EXCESS_SESSION_VERSION;
}

/** Inactive session shape for API / migration defaults. */
export function inactiveExcessSession(): EconomyV2ExcessSessionPublicState {
  return {
    active: false,
    version: null,
    startedAt: null,
    sourceSeconds: null,
    sourceElapsedMs: null,
    capital: null,
    baseIncome: null,
    baseWebCleared: false,
    baseWebCollectionMode: null,
    presetSeconds: null,
    rate: null,
    webCount: null,
    whiteWebCount: null,
    layoutSeed: null,
    clearedWebIds: [],
    clearedWebCount: 0,
    remainingWebCount: 0,
    bonusRawUnlocked: null,
    xpAwarded: null,
    specialWebId: null,
    baseWebId: null,
    specialCleared: false,
    webs: [],
  };
}

export function emptyExcessResultXp(): EconomyV2ExcessResultXpPublicState {
  return {
    max: null,
    raw: null,
    awarded: null,
    applied: false,
  };
}

export function emptyExcessResultIncome(): EconomyV2ExcessResultIncomePublicState {
  return {
    available: false,
    reason: null,
    capital: null,
    excessElapsedMs: null,
    annualRate: null,
    gross: null,
    paymentFactor: null,
    paid: null,
    applied: false,
  };
}

export function emptyExcessResult(): EconomyV2ExcessResultPublicState {
  return {
    available: false,
    sessionVersion: null,
    finishedAt: null,
    reason: null,
    clearedCount: null,
    clearedWhiteCount: null,
    webCount: null,
    whiteWebCount: null,
    skill: null,
    sourceSeconds: null,
    presetSeconds: null,
    rate: null,
    xp: emptyExcessResultXp(),
    income: emptyExcessResultIncome(),
  };
}

/**
 * Read frozen finish result from game_state.
 * Available when finished_at is set (session is no longer active).
 */
export function readExcessResultFromRow(
  row: ExcessSessionRowFields | null | undefined,
): EconomyV2ExcessResultPublicState {
  if (!row) return emptyExcessResult();
  const finishedAt = asNullableInt(row.v2_excess_session_finished_at);
  if (finishedAt == null) return emptyExcessResult();

  const reasonRaw = row.v2_excess_session_finish_reason;
  const reason = isExcessFinishReason(reasonRaw) ? reasonRaw : null;
  const xpApplied = asBool(row.v2_excess_session_xp_applied);
  const incomeApplied = asBool(row.v2_excess_session_income_applied);
  const baseApplied = asBool(row.v2_excess_session_base_income_applied);
  const sessionVersion = asNullableInt(row.v2_excess_session_version);
  const isV2 = sessionVersion === V2_EXCESS_SESSION_VERSION;

  const capital = asNullableFinite(row.v2_excess_session_capital);
  const excessElapsedMs = asNullableFinite(
    row.v2_excess_session_source_elapsed_ms,
  );
  const annualRate = asNullableFinite(row.v2_excess_session_rate);
  const gross = asNullableFinite(row.v2_excess_session_gross_income);
  const paymentFactor = asNullableFinite(row.v2_excess_session_payment_factor);
  const paid = asNullableFinite(row.v2_excess_session_paid_income);
  const sourceSeconds = asNullableFinite(row.v2_excess_session_source_seconds);
  const skill = asNullableFinite(row.v2_excess_session_skill);
  const baseIncome = asNullableFinite(row.v2_excess_session_base_income);
  const collectionModeRaw = row.v2_excess_session_base_web_collection_mode;
  const collectionMode = isExcessBaseWebCollectionMode(collectionModeRaw)
    ? collectionModeRaw
    : null;
  const whiteCount = asNullableInt(row.v2_excess_session_final_web_count);
  const whiteCleared = asNullableInt(row.v2_excess_session_final_cleared_count);

  let incomeAvailable = true;
  let incomeReason: EconomyV2ExcessResultIncomePublicState["reason"] = "ok";
  if (
    sourceSeconds != null &&
    sourceSeconds > 0 &&
    (excessElapsedMs == null || excessElapsedMs <= 0)
  ) {
    incomeAvailable = false;
    incomeReason = "missing_excess_elapsed_history";
  } else if (
    gross == null &&
    paid == null &&
    (excessElapsedMs == null || excessElapsedMs <= 0) &&
    !(isV2 && baseIncome != null && baseIncome > 0)
  ) {
    incomeReason = "zero";
  }

  const bonusPaid =
    isV2 && incomeAvailable && gross != null && skill != null
      ? asNullableFinite(
          // Prefer stored total−base when paid is set; else recompute from skill.
          paid != null && baseIncome != null
            ? Math.max(0, paid - Math.max(0, baseIncome))
            : null,
        ) ?? null
      : null;

  const income: EconomyV2ExcessResultIncomePublicState = {
    available: incomeAvailable,
    reason: incomeReason,
    capital,
    excessElapsedMs,
    annualRate,
    gross: incomeAvailable ? gross : null,
    paymentFactor: incomeAvailable ? paymentFactor : null,
    paid: incomeAvailable ? paid : null,
    applied: incomeApplied,
  };

  if (isV2) {
    const baseAmount = incomeAvailable ? baseIncome : null;
    const resolvedBonusPaid =
      incomeAvailable && bonusPaid == null && gross != null && skill != null
        ? Math.max(0, (gross || 0) * (skill || 0))
        : bonusPaid;
    income.base = {
      amount: baseAmount,
      collectionMode,
      applied: baseApplied || incomeApplied,
    };
    income.bonus = {
      gross: incomeAvailable ? gross : null,
      skill,
      paid: incomeAvailable
        ? resolvedBonusPaid != null
          ? resolvedBonusPaid
          : paymentFactor != null && gross != null
            ? gross * paymentFactor
            : null
        : null,
      applied: incomeApplied,
    };
    income.total = {
      paid: incomeAvailable ? paid : null,
      applied: incomeApplied,
    };
  }

  return {
    available: true,
    sessionVersion,
    finishedAt,
    reason,
    clearedCount: whiteCleared,
    clearedWhiteCount: whiteCleared,
    webCount: whiteCount,
    whiteWebCount: whiteCount,
    skill,
    sourceSeconds,
    presetSeconds: asNullableInt(row.v2_excess_session_preset_seconds),
    rate: annualRate,
    xp: {
      max: asNullableFinite(row.v2_excess_session_xp_max),
      raw: asNullableFinite(row.v2_excess_session_xp_raw),
      awarded: asNullableInt(row.v2_excess_session_xp_awarded),
      applied: xpApplied,
    },
    income,
  };
}

/**
 * Read frozen Metelka session from a game_state row.
 * When inactive, all value fields are null (even if stale columns remain).
 * Web layout is regenerated deterministically from stored seed (GET-safe).
 */
export function readExcessSessionFromRow(
  row: ExcessSessionRowFields | null | undefined,
): EconomyV2ExcessSessionPublicState {
  if (!row || !asBool(row.v2_excess_session_active)) {
    return inactiveExcessSession();
  }
  const version = asNullableInt(row.v2_excess_session_version);
  const isV2 = version === V2_EXCESS_SESSION_VERSION;
  const presetSeconds = asNullableInt(row.v2_excess_session_preset_seconds);
  const webCountRaw = asNullableInt(row.v2_excess_session_web_count);
  const layoutSeed = asNullableInt(row.v2_excess_session_layout_seed);
  const webCount =
    webCountRaw != null
      ? webCountRaw
      : presetSeconds != null
        ? computeExcessWebCount(presetSeconds)
        : null;
  const clearedWebIds = parseClearedExcessWebIds(
    row.v2_excess_session_cleared_web_ids,
  );
  const modeRaw = row.v2_excess_session_base_web_collection_mode;
  const baseWebCollectionMode = isExcessBaseWebCollectionMode(modeRaw)
    ? modeRaw
    : null;

  // Version=2: white webs only (no red base-income). Legacy: keep special red.
  const websForActive =
    layoutSeed != null && webCount != null && webCount > 0
      ? isV2
        ? generateExcessWebLayout({
            seed: layoutSeed,
            webCount,
            presetSeconds: presetSeconds ?? undefined,
          })
        : generateExcessWebLayoutWithSpecial({
            seed: layoutSeed,
            webCount,
            presetSeconds: presetSeconds ?? undefined,
            useBaseIncome: false,
          })
      : [];
  const webs = applyClearedFlagsToWebs(websForActive, clearedWebIds, {
    baseWebCleared: isV2
      ? false
      : isSpecialWebCleared(clearedWebIds),
  });
  const regularCleared = countRegularClearedWebs(clearedWebIds, webCount ?? 0);
  const clearedWebCount = regularCleared;
  const remainingWebCount = Math.max(0, (webCount ?? 0) - regularCleared);

  return {
    active: true,
    version,
    startedAt: asNullableInt(row.v2_excess_session_started_at),
    sourceSeconds: asNullableFinite(row.v2_excess_session_source_seconds),
    sourceElapsedMs: asNullableFinite(row.v2_excess_session_source_elapsed_ms),
    capital: asNullableFinite(row.v2_excess_session_capital),
    baseIncome: asNullableFinite(row.v2_excess_session_base_income),
    baseWebCleared: isV2
      ? asBool(row.v2_excess_session_base_web_cleared)
      : isSpecialWebCleared(clearedWebIds),
    baseWebCollectionMode: isV2 ? baseWebCollectionMode : null,
    presetSeconds,
    rate: asNullableFinite(row.v2_excess_session_rate),
    webCount,
    whiteWebCount: webCount,
    layoutSeed,
    clearedWebIds,
    clearedWebCount,
    remainingWebCount,
    bonusRawUnlocked: isV2
      ? asNullableFinite(row.v2_excess_session_bonus_raw_unlocked)
      : null,
    xpAwarded: isV2 ? asNullableInt(row.v2_excess_session_xp_awarded) : null,
    specialWebId: isV2 ? null : EXCESS_SPECIAL_WEB_ID,
    baseWebId: null,
    specialCleared: isV2
      ? asBool(row.v2_excess_session_base_web_cleared)
      : isSpecialWebCleared(clearedWebIds),
    webs,
  };
}

/** Snapshot parameters for a new attempt from current excess seconds. */
export function computeExcessSessionSnapshot(sourceExcessSeconds: number): {
  sourceSeconds: number;
  presetSeconds: number;
  rate: number;
  webCount: number;
} {
  const sourceSeconds = normalizeExcessSeconds(sourceExcessSeconds);
  const cycle = excessCycleFromSeconds(sourceSeconds);
  const presetSeconds = excessPresetSeconds(cycle);
  return {
    sourceSeconds,
    presetSeconds,
    rate: excessBonusRate(cycle),
    webCount: computeExcessWebCount(presetSeconds),
  };
}

export function buildEconomyV2ExcessPublicState(
  excessSecondsRaw: unknown,
  session?: EconomyV2ExcessSessionPublicState | null,
  result?: EconomyV2ExcessResultPublicState | null,
  excessElapsedMsRaw?: unknown,
  excessBaseIncomeRaw?: unknown,
): EconomyV2ExcessPublicState {
  const excessSeconds = normalizeExcessSeconds(excessSecondsRaw);
  const excessElapsedMs = normalizeExcessElapsedMs(excessElapsedMsRaw);
  const excessBaseIncome = normalizeExcessBaseIncome(excessBaseIncomeRaw);
  const excessCycle = excessCycleFromSeconds(excessSeconds);
  return {
    excessSeconds,
    excessElapsedMs,
    excessBaseIncome,
    excessFinanciallyValid: isExcessFinanciallyValid(
      excessSeconds,
      excessElapsedMs,
    ),
    excessCycle,
    excessAvailable: isExcessAvailable(excessSeconds),
    excessPresetSeconds: excessPresetSeconds(excessCycle),
    excessRate: excessBonusRate(excessCycle),
    session: session ?? inactiveExcessSession(),
    result: result ?? emptyExcessResult(),
  };
}

/** Build full excess public state from a locked game_state row. */
export function buildEconomyV2ExcessFromRow(
  row: ExcessSessionRowFields & {
    v2_excess_seconds?: unknown;
    v2_excess_elapsed_ms?: unknown;
    v2_excess_base_income?: unknown;
  },
): EconomyV2ExcessPublicState {
  return buildEconomyV2ExcessPublicState(
    row.v2_excess_seconds,
    readExcessSessionFromRow(row),
    readExcessResultFromRow(row),
    row.v2_excess_elapsed_ms,
    row.v2_excess_base_income,
  );
}
