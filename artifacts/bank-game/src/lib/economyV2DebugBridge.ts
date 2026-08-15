/**
 * Bridge: GamePage registers apply/getSnapshot; local debug panel consumes.
 * Avoids reload and duplicate snapshots for Economy v2 debug mutations.
 *
 * Snapshot reads are referentially stable when values are unchanged
 * (required by useSyncExternalStore — otherwise Maximum update depth).
 */

import type { EconomyV2ExcessState, EconomyV2RootsState } from "@/lib/api";
import type { EconomyV3DebugReadout } from "@/lib/v3Roots";

export type EconomyV2DebugSnapshot = {
  energySeconds: number;
  readyCount: number;
  excessSeconds: number;
  /** Live T(n) from ledger — for debug readout (not independent state). */
  excessPresetSeconds: number;
  /** Financial wall-clock t_excess (ms) — server snapshot. */
  excessElapsedMs: number;
  /**
   * True while excess financial time should keep accumulating (shared-pool max /
   * generatingExcess / ordinaryFull). Debug live clock uses this — not the
   * root generation wait-clock — so transfers never roll the readout back.
   */
  excessFinancialMinting: boolean;
  /**
   * @deprecated Prefer excessFinancialMinting + readMetelkaFinancialLiveMs.
   * Kept for older panel checks; may be null.
   */
  excessFinancialAnchorAt: number | null;
  /** Player capital used for Metelka money preview. */
  capital: number;
  sessionActive: boolean;
  sessionPresetSeconds: number | null;
  /** Compact v3 readout; null when v3Roots absent / disabled. */
  v3: EconomyV3DebugReadout | null;
};

export type EconomyV2EnergyApplyPatch = {
  v2EnergySeconds: number;
  v2EnergyAnchorAt: number;
  lastSessionTime: number | null;
  missedSessions: number;
  v2Roots: EconomyV2RootsState;
};

export type EconomyV2RootsApplyPatch = {
  v2Roots: EconomyV2RootsState;
  v2EnergySeconds: number;
  v2EnergyAnchorAt: number;
};

export type EconomyV2ExcessApplyPatch = {
  v2Excess: EconomyV2ExcessState;
};

export type EconomyV2PlayerProgressApplyPatch = {
  playerXP: number;
  playerLevel: number;
};

export type EconomyV2DebugBridge = {
  getSnapshot: () => EconomyV2DebugSnapshot;
  onEnergyApplied: (patch: EconomyV2EnergyApplyPatch) => void;
  onRootsApplied: (patch: EconomyV2RootsApplyPatch) => void;
  onExcessApplied: (patch: EconomyV2ExcessApplyPatch) => void;
  /** Apply fresh Economy v3 roots snapshot from debug mutate (no F5). */
  onV3RootsApplied: (v3Roots: import("@/lib/api").EconomyV3RootsState) => void;
  /**
   * Soft-apply debug +XP so GamePage can play LevelUpAnimation.
   * Must NOT full-reload — remount resets prevLevelRef to the new level.
   */
  onPlayerProgressApplied: (patch: EconomyV2PlayerProgressApplyPatch) => void;
};

const EMPTY_SNAPSHOT: EconomyV2DebugSnapshot = Object.freeze({
  energySeconds: 0,
  readyCount: 0,
  excessSeconds: 0,
  excessPresetSeconds: 5,
  excessElapsedMs: 0,
  excessFinancialMinting: false,
  excessFinancialAnchorAt: null,
  capital: 0,
  sessionActive: false,
  sessionPresetSeconds: null,
  v3: null,
});

let bridge: EconomyV2DebugBridge | null = null;
const listeners = new Set<() => void>();
/** Last snapshot returned to subscribers — stable ref when values equal. */
let cachedSnapshot: EconomyV2DebugSnapshot = EMPTY_SNAPSHOT;
/**
 * Bumped on every debug excess apply (reset / addPresetSeconds / …).
 * In-flight GET /game/state that started before the bump must not clobber
 * the newer debug excess snapshot (stale settle response race).
 */
let excessDebugMutationSeq = 0;

/** Call when applying a debug excess response to local state. */
export function bumpEconomyV2ExcessDebugMutationSeq(): number {
  excessDebugMutationSeq += 1;
  return excessDebugMutationSeq;
}

export function readEconomyV2ExcessDebugMutationSeq(): number {
  return excessDebugMutationSeq;
}

function v3ReadoutsEqual(
  a: EconomyV3DebugReadout | null,
  b: EconomyV3DebugReadout | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.effectivePresetSeconds === b.effectivePresetSeconds &&
    a.currentVisitDay === b.currentVisitDay &&
    a.activeDailyBonusSeconds === b.activeDailyBonusSeconds &&
    a.basePresetSeconds === b.basePresetSeconds &&
    a.waterRootSeconds === b.waterRootSeconds &&
    a.sunRootSeconds === b.sunRootSeconds &&
    a.fertilizerRootSeconds === b.fertilizerRootSeconds &&
    a.waterReserveSeconds === b.waterReserveSeconds &&
    a.sunReserveSeconds === b.sunReserveSeconds &&
    a.fertilizerReserveSeconds === b.fertilizerReserveSeconds &&
    a.frozen === b.frozen &&
    a.accumulating === b.accumulating &&
    a.careCycleStatus === b.careCycleStatus &&
    a.ordinaryFull === b.ordinaryFull &&
    a.rootsFull === b.rootsFull &&
    a.generatingExcess === b.generatingExcess &&
    a.excessAvailable === b.excessAvailable &&
    a.metelkaRequired === b.metelkaRequired &&
    a.metelkaPhase === b.metelkaPhase
  );
}

function snapshotsEqual(
  a: EconomyV2DebugSnapshot,
  b: EconomyV2DebugSnapshot,
): boolean {
  return (
    a.energySeconds === b.energySeconds &&
    a.readyCount === b.readyCount &&
    a.excessSeconds === b.excessSeconds &&
    a.excessPresetSeconds === b.excessPresetSeconds &&
    a.excessElapsedMs === b.excessElapsedMs &&
    a.excessFinancialMinting === b.excessFinancialMinting &&
    a.excessFinancialAnchorAt === b.excessFinancialAnchorAt &&
    a.capital === b.capital &&
    a.sessionActive === b.sessionActive &&
    a.sessionPresetSeconds === b.sessionPresetSeconds &&
    v3ReadoutsEqual(a.v3, b.v3)
  );
}

function emit() {
  for (const l of listeners) l();
}

function peekRawSnapshot(): EconomyV2DebugSnapshot {
  if (!bridge) return EMPTY_SNAPSHOT;
  const raw = bridge.getSnapshot();
  return {
    energySeconds: Number(raw.energySeconds) || 0,
    readyCount: Math.max(0, Math.floor(Number(raw.readyCount) || 0)),
    excessSeconds: Number(raw.excessSeconds) || 0,
    excessPresetSeconds: Math.max(
      5,
      Math.min(25, Math.round(Number(raw.excessPresetSeconds) || 5)),
    ),
    excessElapsedMs: Math.max(0, Number(raw.excessElapsedMs) || 0),
    excessFinancialMinting: raw.excessFinancialMinting === true,
    excessFinancialAnchorAt: (() => {
      const n = Number(raw.excessFinancialAnchorAt);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    })(),
    capital: Math.max(0, Number(raw.capital) || 0),
    sessionActive: raw.sessionActive === true,
    sessionPresetSeconds:
      raw.sessionPresetSeconds == null
        ? null
        : Math.round(Number(raw.sessionPresetSeconds)) || null,
    v3: raw.v3 ?? null,
  };
}

/**
 * Return a cached snapshot object. Same values → same reference (Object.is).
 * Safe to call from render / useSyncExternalStore getSnapshot.
 */
export function readEconomyV2DebugSnapshot(): EconomyV2DebugSnapshot {
  const next = peekRawSnapshot();
  if (snapshotsEqual(cachedSnapshot, next)) {
    return cachedSnapshot;
  }
  cachedSnapshot = next === EMPTY_SNAPSHOT ? EMPTY_SNAPSHOT : next;
  return cachedSnapshot;
}

export function registerEconomyV2DebugBridge(
  next: EconomyV2DebugBridge | null,
): void {
  bridge = next;
  const prev = cachedSnapshot;
  const snapped = peekRawSnapshot();
  if (snapshotsEqual(prev, snapped)) {
    return;
  }
  cachedSnapshot = snapped === EMPTY_SNAPSHOT ? EMPTY_SNAPSHOT : snapped;
  emit();
}

export function getEconomyV2DebugBridge(): EconomyV2DebugBridge | null {
  return bridge;
}

/**
 * Call after GamePage commitState. No-ops when v2 debug fields are unchanged
 * (avoids panel re-render storms).
 */
export function notifyEconomyV2DebugSnapshot(): void {
  const prev = cachedSnapshot;
  const next = peekRawSnapshot();
  if (snapshotsEqual(prev, next)) {
    return;
  }
  cachedSnapshot = next === EMPTY_SNAPSHOT ? EMPTY_SNAPSHOT : next;
  emit();
}

export function subscribeEconomyV2DebugSnapshot(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

