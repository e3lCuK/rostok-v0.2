/**
 * Tutorial capital-idle compensation.
 *
 * While roots are still filling, ordinary/gold-flask income must not also pay
 * the same wall-clock. On tutorial/complete we award base Care APR for:
 *   capital-on-chest → first gold-flask start (roots filled to 10s presets).
 * After flask start, only the flask / Care «База» accrues.
 *
 * D = capital × 0.12 × elapsedSeconds / SECONDS_PER_YEAR  (kopecks)
 */

import {
  roundMoneyToKopecks,
  V2_BASE_APR,
  V2_SECONDS_PER_YEAR,
} from "./economy-v2-care-income";

/** Reject absurd client clocks (AFK / clock skew). */
export const TUTORIAL_COMPENSATION_ELAPSED_MAX_MS = 30 * 60 * 1000;
/** Legacy fallback when timestamps are missing / invalid. */
export const TUTORIAL_COMPENSATION_FALLBACK_RUB = 1;

export type TutorialCompensationInput = {
  capital: number;
  /** Epoch ms — capital armed on chest (vault → active). */
  startedAtMs: number | null | undefined;
  /** Epoch ms — gold flask first starts (roots at 10s presets). */
  endedAtMs: number | null | undefined;
  nowMs?: number;
};

export type TutorialCompensationResult = {
  elapsedMs: number;
  elapsedSeconds: number;
  amountRub: number;
  /** Tutorial demo mm only — compensation ₽ never converts to growth. */
  growthMm: number;
  usedFallback: boolean;
};

export function resolveTutorialCompensationCapital(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 100_000;
  return n;
}

export function clampTutorialCompensationElapsedMs(
  elapsedMs: number,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(
    TUTORIAL_COMPENSATION_ELAPSED_MAX_MS,
    Math.max(0, Math.trunc(elapsedMs)),
  );
}

/**
 * Pure compensation for one tutorial handoff.
 * Missing / inverted timestamps → legacy +1₽ (usedFallback).
 */
export function computeTutorialCompensation(
  input: TutorialCompensationInput,
): TutorialCompensationResult {
  const capital = resolveTutorialCompensationCapital(input.capital);
  const nowMs =
    input.nowMs != null && Number.isFinite(input.nowMs)
      ? Math.trunc(input.nowMs)
      : Date.now();
  const started =
    input.startedAtMs != null && Number.isFinite(Number(input.startedAtMs))
      ? Math.trunc(Number(input.startedAtMs))
      : null;
  const ended =
    input.endedAtMs != null && Number.isFinite(Number(input.endedAtMs))
      ? Math.trunc(Number(input.endedAtMs))
      : null;

  const windowOk =
    started != null &&
    ended != null &&
    ended >= started &&
    started <= nowMs &&
    ended <= nowMs + 5_000;

  if (!windowOk) {
    return {
      elapsedMs: 0,
      elapsedSeconds: 0,
      amountRub: TUTORIAL_COMPENSATION_FALLBACK_RUB,
      growthMm: 1,
      usedFallback: true,
    };
  }

  const elapsedMs = clampTutorialCompensationElapsedMs(ended! - started!);
  if (elapsedMs <= 0) {
    return {
      elapsedMs: 0,
      elapsedSeconds: 0,
      amountRub: TUTORIAL_COMPENSATION_FALLBACK_RUB,
      growthMm: 1,
      usedFallback: true,
    };
  }

  const elapsedSeconds = elapsedMs / 1000;
  const raw = capital * V2_BASE_APR * (elapsedSeconds / V2_SECONDS_PER_YEAR);
  const amountRub = roundMoneyToKopecks(raw);
  if (amountRub <= 0) {
    return {
      elapsedMs,
      elapsedSeconds,
      amountRub: TUTORIAL_COMPENSATION_FALLBACK_RUB,
      growthMm: 1,
      usedFallback: true,
    };
  }

  return {
    elapsedMs,
    elapsedSeconds,
    amountRub,
    growthMm: 1,
    usedFallback: false,
  };
}
