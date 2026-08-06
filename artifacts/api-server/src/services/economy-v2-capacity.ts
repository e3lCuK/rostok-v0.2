/**
 * Shared Economy v2 total *ordinary* storage capacity
 * (bank + ready roots + fractional progress). Cap is 60.
 * Excess beyond this cap accumulates separately in v2_excess_seconds.
 */

import { V2_ENERGY_BANK_MAX } from "./economy-v2";

/** Total stored energy units (game-seconds) across bank + roots. */
export const V2_TOTAL_STORAGE_CAP = V2_ENERGY_BANK_MAX; // 60

/**
 * Single epsilon for capacity comparisons / near-1 progress flush.
 * Do not scatter ad-hoc epsilons elsewhere — import this constant.
 */
export const CAPACITY_EPSILON = 1e-9;

export type V2StorageCapacityInput = {
  /** Exact bank seconds — do not floor for capacity math. */
  energySeconds: number;
  /** popcount(v2_root_ready_mask). */
  readyCount: number;
  /** Fractional progress toward next ready section [0, 1). */
  generationProgress: number;
};

export type V2StorageCapacity = {
  bankSeconds: number;
  readyCount: number;
  generationProgress: number;
  /** bank + readyCount + progress (exact; no floor on bank). */
  occupied: number;
  /** max(0, 60 - occupied). */
  freeCapacity: number;
  /** occupied > 60 (legacy / bad debug). */
  overCapacity: boolean;
  /** freeCapacity ≈ 0 — ordinary generation must stop. */
  storageFull: boolean;
};

/** Non-negative finite — does NOT clamp to 60 (preserves legacy over-cap). */
export function normalizeBankSecondsForCapacity(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

function normalizeReadyCount(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(60, Math.floor(raw));
}

/**
 * Fractional progress in [0, 1). Values ≥ 1 keep only the fractional part
 * (integer portion should already have been flushed to ready bits).
 * Does NOT silently wipe near-1 progress to 0.
 */
export function normalizeFractionalProgress(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  if (raw < 1) return raw;
  const frac = raw - Math.floor(raw);
  return frac < 1 ? frac : 0;
}

/**
 * How many whole ready sections `progress` can produce, using epsilon so
 * values like 0.999999999 count as 1 (avoids permanent near-cap deadlock).
 */
export function wholeProgressUnits(progress: number): number {
  const p = Number.isFinite(progress) && progress > 0 ? progress : 0;
  return Math.floor(p + CAPACITY_EPSILON);
}

/**
 * Whole ready sections that still fit under the 60 cap, ignoring fractional
 * progress (progress is what we are converting into ready bits).
 */
export function maxWholeReadySectionsFitting(input: {
  energySeconds: number;
  readyCount: number;
  want: number;
}): number {
  const wantN = Number.isFinite(input.want) ? Math.max(0, Math.floor(input.want)) : 0;
  if (wantN <= 0) return 0;
  const bank = normalizeBankSecondsForCapacity(input.energySeconds);
  const ready = normalizeReadyCount(input.readyCount);
  const maskFree = 60 - ready;
  const room = V2_TOTAL_STORAGE_CAP - bank - ready;
  const byCapacity = Math.floor(room + CAPACITY_EPSILON);
  return Math.min(wantN, maskFree, Math.max(0, byCapacity));
}

/**
 * occupied = bank + readyCount + generationProgress
 * freeCapacity = max(0, 60 - occupied)
 */
export function computeV2StorageCapacity(
  input: V2StorageCapacityInput,
): V2StorageCapacity {
  const bankSeconds = normalizeBankSecondsForCapacity(input.energySeconds);
  const readyCount = normalizeReadyCount(input.readyCount);
  const generationProgress = normalizeFractionalProgress(
    input.generationProgress,
  );
  const occupied = bankSeconds + readyCount + generationProgress;
  const freeCapacity = Math.max(0, V2_TOTAL_STORAGE_CAP - occupied);
  const overCapacity = occupied > V2_TOTAL_STORAGE_CAP + CAPACITY_EPSILON;
  const storageFull = freeCapacity <= CAPACITY_EPSILON;

  return {
    bankSeconds,
    readyCount,
    generationProgress,
    occupied,
    freeCapacity,
    overCapacity,
    storageFull,
  };
}

/**
 * How many whole ready sections may still be added under total storage cap
 * (and under remaining mask slots). Progress is already counted in occupied.
 */
export function maxAddableReadySections(
  input: V2StorageCapacityInput,
  want: number,
): number {
  const wantN = Number.isFinite(want) ? Math.max(0, Math.floor(want)) : 0;
  if (wantN <= 0) return 0;
  const cap = computeV2StorageCapacity(input);
  const maskFree = 60 - cap.readyCount;
  const byCapacity = Math.floor(cap.freeCapacity + CAPACITY_EPSILON);
  return Math.min(wantN, maskFree, byCapacity);
}

/**
 * Max bank seconds allowed without exceeding total storage
 * (does not remove ready sections or progress).
 */
export function maxBankSecondsUnderStorageCap(input: {
  readyCount: number;
  generationProgress: number;
}): number {
  const readyCount = normalizeReadyCount(input.readyCount);
  const progress = normalizeFractionalProgress(input.generationProgress);
  return Math.max(0, V2_TOTAL_STORAGE_CAP - readyCount - progress);
}
