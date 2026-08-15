/**
 * Economy v2 root energy — matured sections awaiting manual collection.
 *
 * Generation formula matches bank accrual:
 *   generated = elapsedSeconds / T(K)
 *   T(K) = 3600 / (1 + 4·(K/100000)^0.15)
 *
 * Generated energy fills a 60-bit ready mask (one bit = one game-second section).
 * Collected bank (v2_energy_seconds) is NOT increased by settle — only by collect.
 *
 * Shared ordinary storage cap (bank + ready + progress) = 60.
 * Overflow beyond freeCapacity accumulates into v2_excess_seconds (t_excess).
 */

import {
  clampV2EnergyBank,
  generateEnergyFromElapsed,
  secondsPerGameSecondForCapital,
  V2_ENERGY_BANK_MAX,
} from "./economy-v2";
import {
  CAPACITY_EPSILON,
  computeV2StorageCapacity,
  maxWholeReadySectionsFitting,
  normalizeBankSecondsForCapacity,
  normalizeFractionalProgress,
  wholeProgressUnits,
  V2_TOTAL_STORAGE_CAP,
} from "./economy-v2-capacity";
import {
  normalizeExcessSeconds,
  splitGeneratedIntoOrdinaryAndExcess,
} from "./economy-v2-excess";
import {
  computeExcessElapsedMsShare,
  computeOrdinaryElapsedMsShare,
  normalizeExcessElapsedMs,
} from "./economy-v2-excess-income";

export const V2_ROOT_SECTION_COUNT = 60;
export const V2_ROOT_COUNT = 4;
export const V2_SECTIONS_PER_ROOT = 15;

const FULL_MASK = (1n << BigInt(V2_ROOT_SECTION_COUNT)) - 1n;

export type EconomyV2RootsPublicState = {
  readyMask: string;
  readyCount: number;
  generationProgress: number;
  secondsPerSection: number;
  secondsUntilNextSection: number | null;
  /** All 60 mask bits ready. */
  isFull: boolean;
  /** bank + ready + progress >= 60 — generation stopped. */
  storageFull: boolean;
  storageOccupied: number;
  storageFree: number;
  /** Legacy/debug state above shared cap (values not auto-wiped). */
  storageOverCapacity: boolean;
};

export type SettleEconomyV2RootsInput = {
  /** Collected Care bank (unchanged by settle). */
  energySeconds: number;
  energyAnchorAt: number | null | undefined;
  rootReadyMask: bigint | string | number | null | undefined;
  rootGenerationProgress: number | null | undefined;
  /** Accumulated excess game-seconds before this settle. */
  excessSeconds?: number | null | undefined;
  /** Accumulated real excess wall-clock ms (t_excess) before this settle. */
  excessElapsedMs?: number | null | undefined;
  capital: number;
  nowMs: number;
};

export type SettleEconomyV2RootsResult = {
  /** Collected bank — never increased by root settle. */
  energySeconds: number;
  energyAnchorAt: number;
  rootReadyMask: bigint;
  rootGenerationProgress: number;
  /** Raw generated energy from the elapsed window (before capacity clamp). */
  generatedEnergy: number;
  /** Generation accepted under freeCapacity (may be < generatedEnergy). */
  usableGeneratedEnergy: number;
  /** Whole sections requested from floor(progress + usable). */
  maturedSections: number;
  /** Sections actually placed into empty mask slots. */
  placedSections: number;
  elapsedSeconds: number;
  rootsFull: boolean;
  storageFull: boolean;
  storageOverCapacity: boolean;
  /** Excess game-seconds after this settle (previous + excessGenerated). */
  excessSeconds: number;
  /** Portion of generated that went to excess this window. */
  excessGenerated: number;
  /** Real excess wall-clock ms after this settle. */
  excessElapsedMs: number;
  /** Wall-clock ms share of this window attributed to excessGenerated. */
  excessElapsedMsGenerated: number;
  /** Wall-clock ms share of this window attributed to ordinary capacity. */
  ordinaryElapsedMsGenerated: number;
};

export function parseRootReadyMask(raw: unknown): bigint {
  if (raw == null || raw === "") return 0n;
  if (typeof raw === "bigint") {
    return raw < 0n ? 0n : raw & FULL_MASK;
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return 0n;
    return BigInt(Math.trunc(raw)) & FULL_MASK;
  }
  const s = String(raw).trim();
  if (!s) return 0n;
  try {
    const n = BigInt(s);
    return n < 0n ? 0n : n & FULL_MASK;
  } catch {
    return 0n;
  }
}

export function maskToString(mask: bigint): string {
  return (mask & FULL_MASK).toString(10);
}

export function parseRootGenerationProgress(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return normalizeFractionalProgress(n);
}

export function countReadySections(mask: bigint): number {
  let m = mask & FULL_MASK;
  let count = 0;
  while (m > 0n) {
    m &= m - 1n;
    count++;
  }
  return count;
}

export function isSectionReady(mask: bigint, sectionIndex: number): boolean {
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= V2_ROOT_SECTION_COUNT) {
    return false;
  }
  return ((mask >> BigInt(sectionIndex)) & 1n) === 1n;
}

export function setSectionReady(mask: bigint, sectionIndex: number): bigint {
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= V2_ROOT_SECTION_COUNT) {
    return mask & FULL_MASK;
  }
  return (mask | (1n << BigInt(sectionIndex))) & FULL_MASK;
}

export function clearSectionReady(mask: bigint, sectionIndex: number): bigint {
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= V2_ROOT_SECTION_COUNT) {
    return mask & FULL_MASK;
  }
  return (mask & ~(1n << BigInt(sectionIndex))) & FULL_MASK;
}

/** First empty section index in 0..59 order, or null if full. */
export function findFirstEmptySection(mask: bigint): number | null {
  for (let i = 0; i < V2_ROOT_SECTION_COUNT; i++) {
    if (!isSectionReady(mask, i)) return i;
  }
  return null;
}

/**
 * Place up to `count` matured sections into the first free slots (0→59).
 */
export function placeMaturedSections(
  mask: bigint,
  count: number,
): { mask: bigint; placed: number } {
  const want = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  let next = mask & FULL_MASK;
  let placed = 0;
  for (let i = 0; i < V2_ROOT_SECTION_COUNT && placed < want; i++) {
    if (!isSectionReady(next, i)) {
      next = setSectionReady(next, i);
      placed++;
    }
  }
  return { mask: next, placed };
}

export function secondsPerSectionForCapital(capital: number): number {
  return secondsPerGameSecondForCapital(capital);
}

export function buildEconomyV2RootsPublicState(input: {
  rootReadyMask: bigint;
  rootGenerationProgress: number;
  capital: number;
  /** Collected bank — required for shared storage countdown gate. */
  energySeconds?: number;
}): EconomyV2RootsPublicState {
  const mask = input.rootReadyMask & FULL_MASK;
  const readyCount = countReadySections(mask);
  const isFull = readyCount >= V2_ROOT_SECTION_COUNT;
  const progress = parseRootGenerationProgress(input.rootGenerationProgress);
  const bankSeconds = normalizeBankSecondsForCapacity(
    input.energySeconds == null ? 0 : Number(input.energySeconds),
  );
  const capacity = computeV2StorageCapacity({
    energySeconds: bankSeconds,
    readyCount,
    generationProgress: progress,
  });
  const secondsPerSection = secondsPerSectionForCapital(input.capital);
  const capitalOk = Number.isFinite(input.capital) && input.capital >= 0;

  let secondsUntilNextSection: number | null = null;
  if (
    capitalOk &&
    !isFull &&
    !capacity.storageFull &&
    Number.isFinite(secondsPerSection)
  ) {
    secondsUntilNextSection = (1 - progress) * secondsPerSection;
  }

  return {
    readyMask: maskToString(mask),
    readyCount,
    generationProgress: progress,
    secondsPerSection: Number.isFinite(secondsPerSection) ? secondsPerSection : 0,
    secondsUntilNextSection,
    isFull,
    storageFull: capacity.storageFull,
    storageOccupied: capacity.occupied,
    storageFree: capacity.freeCapacity,
    storageOverCapacity: capacity.overCapacity,
  };
}

function normalizeNowMs(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return Date.now();
  return Math.trunc(nowMs);
}

/** Bank for settle persistence — no upper clamp (preserves legacy over-cap). */
function normalizeStoredEnergy(raw: number): number {
  return normalizeBankSecondsForCapacity(raw);
}

function stoppedSettleResult(input: {
  energySeconds: number;
  nowMs: number;
  mask: bigint;
  progress: number;
  generatedEnergy: number;
  elapsedSeconds: number;
  elapsedMs: number;
  excessSeconds: number;
  excessElapsedMs: number;
  excessGenerated?: number;
  maturedSections?: number;
  placedSections?: number;
}): SettleEconomyV2RootsResult {
  const readyCount = countReadySections(input.mask);
  const freeSlots = V2_ROOT_SECTION_COUNT - readyCount;
  const capacity = computeV2StorageCapacity({
    energySeconds: input.energySeconds,
    readyCount,
    generationProgress: input.progress,
  });
  // Mask completely full: orphan fractional progress cannot become a section.
  // Storage-full with free slots: keep progress; do not wipe bank/ready.
  const nextProgress = freeSlots <= 0 ? 0 : input.progress;
  const excessGenerated =
    input.excessGenerated != null
      ? Math.max(0, input.excessGenerated)
      : 0;
  const excessElapsedMsGenerated = computeExcessElapsedMsShare({
    elapsedMs: input.elapsedMs,
    generatedGameSeconds: input.generatedEnergy,
    excessGenerated,
  });
  const ordinaryElapsedMsGenerated = computeOrdinaryElapsedMsShare({
    elapsedMs: input.elapsedMs,
    excessElapsedMs: excessElapsedMsGenerated,
  });
  return {
    energySeconds: input.energySeconds,
    energyAnchorAt: input.nowMs,
    rootReadyMask: input.mask,
    rootGenerationProgress: nextProgress,
    generatedEnergy: input.generatedEnergy,
    usableGeneratedEnergy: 0,
    maturedSections: input.maturedSections ?? 0,
    placedSections: input.placedSections ?? 0,
    elapsedSeconds: input.elapsedSeconds,
    rootsFull: freeSlots <= 0,
    storageFull: capacity.storageFull || freeSlots <= 0,
    storageOverCapacity: capacity.overCapacity,
    excessSeconds: normalizeExcessSeconds(input.excessSeconds + excessGenerated),
    excessGenerated,
    excessElapsedMs: normalizeExcessElapsedMs(
      input.excessElapsedMs + excessElapsedMsGenerated,
    ),
    excessElapsedMsGenerated,
    ordinaryElapsedMsGenerated,
  };
}

/**
 * Convert whole (epsilon-aware) progress units into ready bits under the
 * shared 60-cap. Returns updated mask + leftover fractional progress.
 */
export function flushProgressIntoReadySections(input: {
  energySeconds: number;
  mask: bigint;
  progress: number;
}): { mask: bigint; progress: number; placed: number } {
  let mask = input.mask & FULL_MASK;
  let progress = normalizeFractionalProgress(input.progress);
  // Include any near-1 values that still sit slightly below 1.0.
  let units = wholeProgressUnits(progress);
  if (units <= 0 && progress + CAPACITY_EPSILON >= 1) {
    units = 1;
  }
  if (units <= 0) {
    return { mask, progress, placed: 0 };
  }

  const readyCount = countReadySections(mask);
  const canPlace = maxWholeReadySectionsFitting({
    energySeconds: input.energySeconds,
    readyCount,
    want: units,
  });
  if (canPlace <= 0) {
    // Cannot place: clamp progress so occupied does not exceed 60.
    const room = Math.max(
      0,
      V2_TOTAL_STORAGE_CAP - input.energySeconds - readyCount,
    );
    const clamped =
      room <= CAPACITY_EPSILON ? 0 : Math.min(progress, Math.max(0, room - CAPACITY_EPSILON));
    return {
      mask,
      progress: normalizeFractionalProgress(clamped),
      placed: 0,
    };
  }

  const placed = placeMaturedSections(mask, canPlace);
  mask = placed.mask;
  progress = Math.max(0, progress - placed.placed);
  // If epsilon pushed us over an integer boundary, clear residual dust.
  if (progress < CAPACITY_EPSILON) progress = 0;
  progress = normalizeFractionalProgress(progress);
  return { mask, progress, placed: placed.placed };
}

/**
 * Pure root settle. Does not increase collected bank (energySeconds).
 * Reuses v2_energy_anchor_at as the generation clock (no second anchor).
 *
 * Ordinary freeCapacity is filled first; remainder accumulates into excessSeconds.
 * Anchor always advances to nowMs so the same elapsed window is never double-counted.
 *
 * Order:
 * 1) flush near-complete progress → ready
 * 2) compute freeCapacity
 * 3) accept generated into ordinary / excess
 * 4) add ordinary to progress, flush whole units → ready again
 * 5) recompute storageFull
 */
export function settleEconomyV2Roots(
  input: SettleEconomyV2RootsInput,
): SettleEconomyV2RootsResult {
  const nowMs = normalizeNowMs(input.nowMs);
  const energySeconds = normalizeStoredEnergy(input.energySeconds);
  let mask = parseRootReadyMask(input.rootReadyMask);
  let progress = parseRootGenerationProgress(input.rootGenerationProgress);
  const excessBefore = normalizeExcessSeconds(input.excessSeconds);
  const excessElapsedBefore = normalizeExcessElapsedMs(input.excessElapsedMs);
  const anchorRaw = input.energyAnchorAt;

  // Flush any near-1 progress into ready BEFORE the storageFull gate.
  const preFlush = flushProgressIntoReadySections({
    energySeconds,
    mask,
    progress,
  });
  mask = preFlush.mask;
  progress = preFlush.progress;
  const prePlaced = preFlush.placed;

  const readyCount = countReadySections(mask);
  const capacityBefore = computeV2StorageCapacity({
    energySeconds,
    readyCount,
    generationProgress: progress,
  });

  const anchorMissing =
    anchorRaw == null ||
    (typeof anchorRaw === "number" && !Number.isFinite(anchorRaw));

  if (anchorMissing) {
    return stoppedSettleResult({
      energySeconds,
      nowMs,
      mask,
      progress,
      generatedEnergy: 0,
      elapsedSeconds: 0,
      elapsedMs: 0,
      excessSeconds: excessBefore,
      excessElapsedMs: excessElapsedBefore,
      excessGenerated: 0,
      maturedSections: prePlaced,
      placedSections: prePlaced,
    });
  }

  const anchorMs = Math.trunc(Number(anchorRaw));
  if (!Number.isFinite(anchorMs) || anchorMs > nowMs) {
    return stoppedSettleResult({
      energySeconds,
      nowMs,
      mask,
      progress,
      generatedEnergy: 0,
      elapsedSeconds: 0,
      elapsedMs: 0,
      excessSeconds: excessBefore,
      excessElapsedMs: excessElapsedBefore,
      excessGenerated: 0,
      maturedSections: prePlaced,
      placedSections: prePlaced,
    });
  }

  const elapsedMs = Math.max(0, nowMs - anchorMs);
  const elapsedSeconds = elapsedMs / 1000;
  const generatedEnergy = generateEnergyFromElapsed(input.capital, elapsedSeconds);
  const freeSlots = V2_ROOT_SECTION_COUNT - readyCount;

  // Ordinary storage full or mask full: all generation → excess; advance anchor.
  if (freeSlots <= 0 || capacityBefore.storageFull) {
    return stoppedSettleResult({
      energySeconds,
      nowMs,
      mask,
      progress,
      generatedEnergy,
      elapsedSeconds,
      elapsedMs,
      excessSeconds: excessBefore,
      excessElapsedMs: excessElapsedBefore,
      excessGenerated: generatedEnergy,
      maturedSections: prePlaced,
      placedSections: prePlaced,
    });
  }

  const { ordinaryAccepted, excessGenerated } = splitGeneratedIntoOrdinaryAndExcess({
    generated: generatedEnergy,
    freeCapacity: capacityBefore.freeCapacity,
  });
  const usableGeneratedEnergy = ordinaryAccepted;
  const excessElapsedMsGenerated = computeExcessElapsedMsShare({
    elapsedMs,
    generatedGameSeconds: generatedEnergy,
    excessGenerated,
  });
  const ordinaryElapsedMsGenerated = computeOrdinaryElapsedMsShare({
    elapsedMs,
    excessElapsedMs: excessElapsedMsGenerated,
  });

  const totalProgress = progress + usableGeneratedEnergy;
  const maturedFromGen = wholeProgressUnits(totalProgress);
  const remainingAfterFloor = totalProgress - maturedFromGen;

  let placedFromGen = 0;
  if (maturedFromGen > 0) {
    const canPlace = maxWholeReadySectionsFitting({
      energySeconds,
      readyCount: countReadySections(mask),
      want: maturedFromGen,
    });
    if (canPlace > 0) {
      const placed = placeMaturedSections(mask, canPlace);
      mask = placed.mask;
      placedFromGen = placed.placed;
    }
  }

  let nextProgress = Math.max(0, remainingAfterFloor + (maturedFromGen - placedFromGen));
  // Re-flush in case epsilon left a near-1 remainder that still fits.
  const postFlush = flushProgressIntoReadySections({
    energySeconds,
    mask,
    progress: nextProgress,
  });
  mask = postFlush.mask;
  nextProgress = postFlush.progress;
  placedFromGen += postFlush.placed;

  const readyAfter = countReadySections(mask);
  const rootsFull = readyAfter >= V2_ROOT_SECTION_COUNT;
  if (rootsFull) {
    nextProgress = 0;
  }

  const capacityAfter = computeV2StorageCapacity({
    energySeconds,
    readyCount: readyAfter,
    generationProgress: nextProgress,
  });
  if (capacityAfter.overCapacity) {
    nextProgress = Math.max(
      0,
      V2_TOTAL_STORAGE_CAP - energySeconds - readyAfter,
    );
    nextProgress = normalizeFractionalProgress(nextProgress);
    if (nextProgress + CAPACITY_EPSILON >= 1) {
      // Still a whole unit of room dust — prefer 0 over fake near-1 stuck state.
      nextProgress = 0;
    }
  }

  const placedTotal = prePlaced + placedFromGen;

  return {
    energySeconds,
    energyAnchorAt: nowMs,
    rootReadyMask: mask,
    rootGenerationProgress: nextProgress,
    generatedEnergy,
    usableGeneratedEnergy,
    maturedSections: prePlaced + maturedFromGen,
    placedSections: placedTotal,
    elapsedSeconds,
    rootsFull,
    storageFull: capacityAfter.storageFull || rootsFull,
    storageOverCapacity: capacityAfter.overCapacity,
    excessSeconds: normalizeExcessSeconds(excessBefore + excessGenerated),
    excessGenerated,
    excessElapsedMs: normalizeExcessElapsedMs(
      excessElapsedBefore + excessElapsedMsGenerated,
    ),
    excessElapsedMsGenerated,
    ordinaryElapsedMsGenerated,
  };
}

/** Collection allowed when bank + 1 would not exceed bank cap. */
export function canCollectIntoEnergyBank(energySeconds: number): boolean {
  const bank = clampV2EnergyBank(Number.isFinite(energySeconds) ? energySeconds : 0);
  return bank + 1 <= V2_ENERGY_BANK_MAX + 1e-12;
}

export function collectRootSectionPure(input: {
  energySeconds: number;
  rootReadyMask: bigint;
  sectionIndex: number;
}):
  | { ok: true; energySeconds: number; rootReadyMask: bigint }
  | { ok: false; code: "invalid_section" | "section_not_ready" | "energy_bank_full" } {
  const { sectionIndex } = input;
  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= V2_ROOT_SECTION_COUNT
  ) {
    return { ok: false, code: "invalid_section" };
  }
  const mask = input.rootReadyMask & FULL_MASK;
  if (!isSectionReady(mask, sectionIndex)) {
    return { ok: false, code: "section_not_ready" };
  }
  if (!canCollectIntoEnergyBank(input.energySeconds)) {
    return { ok: false, code: "energy_bank_full" };
  }
  const bank = clampV2EnergyBank(
    Number.isFinite(input.energySeconds) ? input.energySeconds : 0,
  );
  return {
    ok: true,
    energySeconds: clampV2EnergyBank(bank + 1),
    rootReadyMask: clearSectionReady(mask, sectionIndex),
  };
}
