/**
 * Grey (excess) flask — same UX as gold: countdown of the ~12 min energy
 * cycle, fill bottom→top as remaining shrinks.
 *
 * Phase is derived from financial excessElapsedMs only (not gold
 * generation.anchorAt / leftover remaining).
 * Label locks to whole financial seconds: 1s → 11:59, 2s → 11:58
 * (same floor as debug «Финансовое время»), not ms-phased 11:59 at 1ms.
 * Debug “Финансовое время” stays a separate count-up of total elapsed.
 */

import { resolveCountdownProgress } from "@/lib/v2Roots";
import {
  secondsPerGameSecondForCapital,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
} from "@/lib/metelkaDebugRewardPreview";

export type V3FinancialFlaskDisplay = {
  kind: "financial";
  /** Remaining wall-clock seconds in the current financial cycle. */
  remainingSeconds: number;
  /** Total financial elapsed (seconds, floored) — for tests / debug only. */
  elapsedSeconds: number;
  timeLabel: string;
  /** Fill 0→1 as the cycle counts down (same as gold). */
  barProgress: number;
  cycleDurationSeconds: number;
};

/** Prefer server cycle length; else capital M(K); else reference 720s. */
export function resolveV3FinancialCycleSeconds(input: {
  cycleDurationSeconds?: number | null;
  capital?: number;
}): number {
  const fromServer = Number(input.cycleDurationSeconds);
  if (Number.isFinite(fromServer) && fromServer > 0) return fromServer;
  const fromCapital = secondsPerGameSecondForCapital(Number(input.capital) || 0);
  if (Number.isFinite(fromCapital) && fromCapital > 0 && fromCapital < Infinity) {
    return fromCapital;
  }
  return V2_SECONDS_PER_ENERGY_AT_REFERENCE;
}

/**
 * Remaining ms in the current financial energy-second period (smooth fill).
 * At elapsed=0 (and every exact cycle boundary) → full cycle (fresh 12:00).
 */
export function remainingMsInFinancialCycle(
  excessElapsedMs: number,
  cycleDurationSeconds: number,
): number {
  const elapsedMs = Math.max(0, Number(excessElapsedMs) || 0);
  const cycleMs = Math.max(1, cycleDurationSeconds * 1000);
  const mod = elapsedMs % cycleMs;
  return mod === 0 ? cycleMs : cycleMs - mod;
}

/**
 * Whole-second remaining for the label — locked to floor(elapsed/1000) so
 * finance «1 сек» ↔ flask 11:59 and «2 сек» ↔ 11:58 stay in lockstep
 * (ms-phased countdown would flip to 11:59 at 1ms while finance still shows 0).
 */
export function remainingWholeSecondsInFinancialCycle(
  excessElapsedMs: number,
  cycleDurationSeconds: number,
): number {
  const elapsedSec = Math.max(
    0,
    Math.floor((Number(excessElapsedMs) || 0) / 1000),
  );
  const cycleSec = Math.max(1, Math.floor(cycleDurationSeconds));
  const phase = elapsedSec % cycleSec;
  return phase === 0 ? cycleSec : cycleSec - phase;
}

/** Countdown label m:ss from whole remaining seconds. */
export function formatFinancialCountdown(remainingSeconds: number): string {
  const s = Math.max(0, Math.floor(remainingSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/**
 * Grey flask from financial elapsed ms.
 * Label = whole-second countdown phased with finance readout;
 * fill still uses smooth ms remaining (same gold UX).
 */
export function resolveV3FinancialFlaskDisplay(input: {
  excessElapsedMs: number;
  cycleDurationSeconds?: number | null;
  capital?: number;
}): V3FinancialFlaskDisplay {
  const elapsedMs = Math.max(0, Number(input.excessElapsedMs) || 0);
  const cycleDurationSeconds = resolveV3FinancialCycleSeconds({
    cycleDurationSeconds: input.cycleDurationSeconds,
    capital: input.capital,
  });
  const remainingMs = remainingMsInFinancialCycle(
    elapsedMs,
    cycleDurationSeconds,
  );
  const remainingWholeSeconds = remainingWholeSecondsInFinancialCycle(
    elapsedMs,
    cycleDurationSeconds,
  );
  return {
    kind: "financial",
    remainingSeconds: remainingWholeSeconds,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    timeLabel: formatFinancialCountdown(remainingWholeSeconds),
    barProgress: resolveCountdownProgress(
      remainingMs / 1000,
      cycleDurationSeconds,
    ),
    cycleDurationSeconds,
  };
}
