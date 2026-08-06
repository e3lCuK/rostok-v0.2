/**
 * Economy v3 Metelka-before-transfer cycle.
 *
 * Product order:
 * roots full (effective capacity) → excess → Metelka → then unlock root transfer → reserves → Care.
 *
 * Persisted:
 * - v3_metelka_required — obligation active (roots-full cycle awaiting Metelka finish)
 * - v3_metelka_completed_for_cycle — Metelka finished for this roots-full latch
 */

import { V3_EFFECTIVE_CAPACITY_MAX } from "./economy-v3-effective-capacity";

export type RootKind = "water" | "sun" | "fertilizer";

/** Absolute max root capacity (base 25 + visit bonus 5). */
export const V3_METELKA_ROOT_CAPACITY_SECONDS = V3_EFFECTIVE_CAPACITY_MAX;

export type V3MetelkaCyclePhase =
  | "roots_accumulating"
  | "roots_full_waiting_excess"
  | "metelka_available"
  | "metelka_active"
  | "metelka_pending_result"
  | "root_transfer_unlocked";

export type V3MetelkaCycleFlags = {
  /** All three roots at effective capacity. */
  rootsFull: boolean;
  /** Server obligation: Metelka must complete before transfer. */
  required: boolean;
  /** Metelka finished for the current roots-full latch. */
  completedForCycle: boolean;
  /** Block manual root → reserve transfer. */
  transferLocked: boolean;
  /** Block Care activity starts. */
  careLocked: boolean;
  phase: V3MetelkaCyclePhase;
};

export type V3MetelkaCyclePersistPatch = {
  required: boolean;
  completedForCycle: boolean;
  /** True when either persisted flag should be written. */
  dirty: boolean;
};

function floorNonNeg(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function resolveCapacitySeconds(raw: unknown): number {
  const n = floorNonNeg(raw);
  if (n <= 0) return V3_METELKA_ROOT_CAPACITY_SECONDS;
  return Math.min(V3_METELKA_ROOT_CAPACITY_SECONDS, Math.max(1, n));
}

/** True when every root holds a full capacity load. */
export function computeV3RootsFull(input: {
  rootWaterSeconds: unknown;
  rootSunSeconds: unknown;
  rootFertilizerSeconds: unknown;
  /** Effective preset / root capacity (default absolute max 30). */
  capacitySeconds?: unknown;
  effectivePresetSeconds?: unknown;
}): boolean {
  const capacity = resolveCapacitySeconds(
    input.capacitySeconds ?? input.effectivePresetSeconds,
  );
  const water = Math.min(capacity, floorNonNeg(input.rootWaterSeconds));
  const sun = Math.min(capacity, floorNonNeg(input.rootSunSeconds));
  const fertilizer = Math.min(
    capacity,
    floorNonNeg(input.rootFertilizerSeconds),
  );
  return water >= capacity && sun >= capacity && fertilizer >= capacity;
}

export function readV3MetelkaRequired(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

export function readV3MetelkaCompletedForCycle(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

/**
 * Advance persisted cycle flags from current root fill.
 * Pure — caller writes when `dirty`.
 */
export function advanceV3MetelkaCycleFlags(input: {
  rootsFull: boolean;
  required: boolean;
  completedForCycle: boolean;
}): V3MetelkaCyclePersistPatch {
  let { required, completedForCycle } = input;
  const beforeRequired = required;
  const beforeCompleted = completedForCycle;

  if (input.rootsFull) {
    // Enter / stay in roots-full latch. New obligation unless already completed.
    if (!completedForCycle && !required) {
      required = true;
    }
  } else {
    // Left roots-full (transfers drained at least one root) → clear cycle.
    required = false;
    completedForCycle = false;
  }

  return {
    required,
    completedForCycle,
    dirty:
      required !== beforeRequired || completedForCycle !== beforeCompleted,
  };
}

/** Mark Metelka finished for the current roots-full obligation. */
export function completeV3MetelkaCycleFlags(input: {
  required: boolean;
  completedForCycle: boolean;
}): V3MetelkaCyclePersistPatch {
  return {
    required: false,
    completedForCycle: true,
    dirty: input.required !== false || input.completedForCycle !== true,
  };
}

/**
 * Care blocked while Metelka must be cleared first:
 * - excessAvailable (Metelka start card would show)
 * - active Metelka session
 *
 * Pending Metelka coin alone does NOT block Care once excess is spent
 * and the session is closed.
 */
export function isCareBlockedByMetelka(input: {
  excessAvailable: boolean;
  metelkaSessionActive: boolean;
}): boolean {
  return (
    input.excessAvailable === true || input.metelkaSessionActive === true
  );
}

/**
 * Build public cycle flags + phase from roots, persisted markers, and excess UI.
 */
export function buildV3MetelkaCyclePublic(input: {
  rootsFull: boolean;
  required: boolean;
  completedForCycle: boolean;
  excessAvailable: boolean;
  metelkaSessionActive: boolean;
  metelkaPendingResult: boolean;
}): V3MetelkaCycleFlags {
  const required = input.required === true;
  const completedForCycle = input.completedForCycle === true;
  const metelkaBusy =
    input.metelkaSessionActive === true ||
    input.metelkaPendingResult === true;
  // Transfer stays locked while Metelka UI is in flight (active/pending result).
  const transferLocked = metelkaBusy;
  // Care: blocked by available excess or active session — not by coin pending.
  const careLocked = isCareBlockedByMetelka({
    excessAvailable: input.excessAvailable === true,
    metelkaSessionActive: input.metelkaSessionActive === true,
  });

  let phase: V3MetelkaCyclePhase = "roots_accumulating";
  if (input.metelkaSessionActive) {
    phase = "metelka_active";
  } else if (input.metelkaPendingResult) {
    phase = "metelka_pending_result";
  } else if (input.excessAvailable) {
    phase = "metelka_available";
  } else if (input.rootsFull) {
    phase = "roots_full_waiting_excess";
  } else if (completedForCycle && input.rootsFull) {
    phase = "root_transfer_unlocked";
  } else {
    phase = "roots_accumulating";
  }

  return {
    rootsFull: input.rootsFull === true,
    required,
    completedForCycle,
    transferLocked,
    careLocked,
    phase,
  };
}

/** Metelka start — excessAvailable alone (roots / transfer state irrelevant). */
export function isV3MetelkaCycleReadyForStart(input: {
  required: boolean;
  completedForCycle: boolean;
  rootsFull: boolean;
  excessAvailable?: boolean;
}): boolean {
  if (input.excessAvailable === false) return false;
  return true;
}
