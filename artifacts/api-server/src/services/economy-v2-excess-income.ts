/**
 * Excess financial elapsed (t_excess) — wall-clock ms corresponding to
 * overflow game-seconds, accumulated at settle time (not reconstructed later).
 *
 * D_excess = K × (t_excess / Y) × r_excess
 * D_paid   = D_excess × (0.5 + 0.5 × Skill)
 *
 * Excess-period base (Care 12% APR) accrues into v2_excess_base_income so
 * ordinary Care pending_base_reward never double-counts the same wall-clock.
 */

import {
  secondsPerGameSecondForCapital,
} from "./economy-v2";
import {
  roundMoneyToKopecks,
  V2_BASE_APR,
  V2_SECONDS_PER_YEAR,
} from "./economy-v2-care-income";

/** Year duration in ms — same 365-day year as Care income. */
export const V2_YEAR_DURATION_MS = V2_SECONDS_PER_YEAR * 1000;

/**
 * Share of settle wall-clock that corresponds to excessGenerated.
 * Constant generation rate within the window:
 *   excessElapsedMs = elapsedMs × (excessGenerated / generatedGameSeconds)
 * When storage is full, excessGenerated === generated → all elapsed.
 */
export function computeExcessElapsedMsShare(input: {
  elapsedMs: number;
  generatedGameSeconds: number;
  excessGenerated: number;
}): number {
  const elapsedMs =
    Number.isFinite(input.elapsedMs) && input.elapsedMs > 0
      ? input.elapsedMs
      : 0;
  const excess =
    Number.isFinite(input.excessGenerated) && input.excessGenerated > 0
      ? input.excessGenerated
      : 0;
  if (elapsedMs <= 0 || excess <= 0) return 0;

  const generated =
    Number.isFinite(input.generatedGameSeconds) && input.generatedGameSeconds > 0
      ? input.generatedGameSeconds
      : 0;

  if (generated <= 0) {
    // Degenerate: excess without measured generation — treat whole window as excess.
    return elapsedMs;
  }

  const share = Math.min(1, excess / generated);
  return elapsedMs * share;
}

/**
 * Ordinary Care wall-clock share for the same settle window.
 * Invariant: ordinary + excess ≈ total elapsed (float tolerance).
 */
export function computeOrdinaryElapsedMsShare(input: {
  elapsedMs: number;
  excessElapsedMs: number;
}): number {
  const elapsed =
    Number.isFinite(input.elapsedMs) && input.elapsedMs > 0
      ? input.elapsedMs
      : 0;
  const excess =
    Number.isFinite(input.excessElapsedMs) && input.excessElapsedMs > 0
      ? input.excessElapsedMs
      : 0;
  return Math.max(0, elapsed - Math.min(elapsed, excess));
}

/**
 * Base APR income for a wall-clock slice (Care rate → excess-base ledger).
 * Not kopeck-rounded — accumulate raw; round only at display / future payout.
 */
export function computeBaseIncomeForElapsedMs(input: {
  capital: number;
  elapsedMs: number;
  annualRate?: number;
  yearDurationMs?: number;
}): number {
  const capital =
    Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;
  const elapsed =
    Number.isFinite(input.elapsedMs) && input.elapsedMs > 0
      ? input.elapsedMs
      : 0;
  const rate =
    input.annualRate != null &&
    Number.isFinite(input.annualRate) &&
    input.annualRate > 0
      ? input.annualRate
      : V2_BASE_APR;
  const yearMs =
    input.yearDurationMs != null &&
    Number.isFinite(input.yearDurationMs) &&
    input.yearDurationMs > 0
      ? input.yearDurationMs
      : V2_YEAR_DURATION_MS;
  if (capital <= 0 || elapsed <= 0 || rate <= 0) return 0;
  return capital * (elapsed / yearMs) * rate;
}

export function normalizeExcessBaseIncome(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function normalizeOrdinaryIncomeElapsedMs(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function normalizeExcessElapsedMs(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Wall-clock length of one financial energy-second cycle at capital K.
 * Same as grey-flask / `secondsPerGameSecondForCapital`: T(K).
 * Returns +Infinity when capital cannot mint (invalid / negative).
 */
export function financialCycleDurationMsForCapital(capital: number): number {
  const sec = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(sec) || sec <= 0) return Number.POSITIVE_INFINITY;
  return sec * 1000;
}

export type MetelkaPaidFinancialSplit = {
  /** Complete financial cycles that enter Metelka payout. */
  completeCycles: number;
  cycleDurationMs: number;
  paidElapsedMs: number;
  /** Game-seconds matched 1:1 with complete cycles (deducted on finish). */
  paidSeconds: number;
  paidBaseIncome: number;
  remainderElapsedMs: number;
  remainderSeconds: number;
  remainderBaseIncome: number;
};

/**
 * At Metelka start: peel the incomplete financial-cycle tail so it does not
 * enter the paid snapshot. Remainder stays on live ledgers (finish deducts
 * only the paid share) and keeps accruing — no idle gap, no lost time.
 *
 * 1 financial cycle ↔ 1 game-second at current capital (T(K) wall ms).
 * When cycle length is unusable, pay nothing from elapsed (keep all as remainder).
 */
export function splitMetelkaPaidFinancialCycles(input: {
  excessElapsedMs: number;
  excessSeconds: number;
  excessBaseIncome: number;
  capital: number;
}): MetelkaPaidFinancialSplit {
  const elapsed = normalizeExcessElapsedMs(input.excessElapsedMs);
  const seconds =
    Number.isFinite(input.excessSeconds) && input.excessSeconds > 0
      ? input.excessSeconds
      : 0;
  const base = normalizeExcessBaseIncome(input.excessBaseIncome);
  const cycleDurationMs = financialCycleDurationMsForCapital(input.capital);

  if (!Number.isFinite(cycleDurationMs) || cycleDurationMs <= 0 || elapsed <= 0) {
    return {
      completeCycles: 0,
      cycleDurationMs: Number.isFinite(cycleDurationMs) ? cycleDurationMs : 0,
      paidElapsedMs: 0,
      paidSeconds: 0,
      paidBaseIncome: 0,
      remainderElapsedMs: elapsed,
      remainderSeconds: seconds,
      remainderBaseIncome: base,
    };
  }

  const completeCycles = Math.floor(elapsed / cycleDurationMs);
  const paidElapsedMs = completeCycles * cycleDurationMs;
  const paidSeconds = Math.min(seconds, completeCycles);
  const paidBaseIncome =
    elapsed > 0 && paidElapsedMs > 0 ? base * (paidElapsedMs / elapsed) : 0;

  return {
    completeCycles,
    cycleDurationMs,
    paidElapsedMs,
    paidSeconds,
    paidBaseIncome: normalizeExcessBaseIncome(paidBaseIncome),
    remainderElapsedMs: normalizeExcessElapsedMs(elapsed - paidElapsedMs),
    remainderSeconds: Math.max(0, seconds - paidSeconds),
    remainderBaseIncome: normalizeExcessBaseIncome(base - paidBaseIncome),
  };
}

/** True when game excess can back a financial payout (has real elapsed history). */
export function isExcessFinanciallyValid(
  excessSeconds: number,
  excessElapsedMs: number,
): boolean {
  const sec = Number.isFinite(excessSeconds) ? excessSeconds : 0;
  const ms = Number.isFinite(excessElapsedMs) ? excessElapsedMs : 0;
  if (sec <= 0) return true;
  return ms > 0;
}

export function computeExcessPaymentFactor(skill: number): number {
  const s = Number.isFinite(skill) ? Math.min(1, Math.max(0, skill)) : 0;
  return 0.5 + 0.5 * s;
}

export function computeExcessGrossIncome(input: {
  capital: number;
  excessElapsedMs: number;
  annualRate: number;
  yearDurationMs?: number;
}): number {
  const capital =
    Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;
  const elapsed =
    Number.isFinite(input.excessElapsedMs) && input.excessElapsedMs > 0
      ? input.excessElapsedMs
      : 0;
  const rate =
    Number.isFinite(input.annualRate) && input.annualRate > 0
      ? input.annualRate
      : 0;
  const yearMs =
    input.yearDurationMs != null &&
    Number.isFinite(input.yearDurationMs) &&
    input.yearDurationMs > 0
      ? input.yearDurationMs
      : V2_YEAR_DURATION_MS;
  if (capital <= 0 || elapsed <= 0 || rate <= 0) return 0;
  return capital * (elapsed / yearMs) * rate;
}

export function computeExcessPaidIncome(input: {
  grossIncome: number;
  skill: number;
}): { paymentFactor: number; paidIncome: number } {
  const gross =
    Number.isFinite(input.grossIncome) && input.grossIncome > 0
      ? input.grossIncome
      : 0;
  const paymentFactor = computeExcessPaymentFactor(input.skill);
  return {
    paymentFactor,
    paidIncome: gross * paymentFactor,
  };
}

export type ExcessCleaningIncomeBreakdown = {
  available: boolean;
  reason: "ok" | "missing_excess_elapsed_history" | "zero";
  capital: number;
  excessElapsedMs: number;
  annualRate: number;
  yearDurationMs: number;
  grossIncome: number;
  paymentFactor: number;
  paidIncome: number;
  /** Display-rounded paid (kopecks) — not used for persistence of raw paid. */
  paidIncomeDisplay: number;
};

/**
 * Full Metelka income preview from frozen session snapshots + final Skill.
 * Does not mutate balances. Marks unavailable when elapsed history is missing.
 */
export function computeExcessCleaningIncome(input: {
  capital: number | null | undefined;
  sourceElapsedMs: number | null | undefined;
  sourceSeconds: number | null | undefined;
  annualRate: number | null | undefined;
  skill: number;
}): ExcessCleaningIncomeBreakdown {
  const capital =
    input.capital != null && Number.isFinite(Number(input.capital))
      ? Math.max(0, Number(input.capital))
      : 0;
  const sourceElapsedMs =
    input.sourceElapsedMs != null && Number.isFinite(Number(input.sourceElapsedMs))
      ? Math.max(0, Number(input.sourceElapsedMs))
      : 0;
  const sourceSeconds =
    input.sourceSeconds != null && Number.isFinite(Number(input.sourceSeconds))
      ? Math.max(0, Number(input.sourceSeconds))
      : 0;
  const annualRate =
    input.annualRate != null && Number.isFinite(Number(input.annualRate))
      ? Math.max(0, Number(input.annualRate))
      : 0;

  const base = {
    capital,
    excessElapsedMs: sourceElapsedMs,
    annualRate,
    yearDurationMs: V2_YEAR_DURATION_MS,
    grossIncome: 0,
    paymentFactor: computeExcessPaymentFactor(input.skill),
    paidIncome: 0,
    paidIncomeDisplay: 0,
  };

  if (sourceSeconds > 0 && sourceElapsedMs <= 0) {
    return {
      ...base,
      available: false,
      reason: "missing_excess_elapsed_history",
    };
  }

  if (sourceElapsedMs <= 0 || capital <= 0 || annualRate <= 0) {
    return {
      ...base,
      available: true,
      reason: "zero",
      paymentFactor: computeExcessPaymentFactor(input.skill),
    };
  }

  const grossIncome = computeExcessGrossIncome({
    capital,
    excessElapsedMs: sourceElapsedMs,
    annualRate,
  });
  const { paymentFactor, paidIncome } = computeExcessPaidIncome({
    grossIncome,
    skill: input.skill,
  });

  return {
    available: true,
    reason: "ok",
    capital,
    excessElapsedMs: sourceElapsedMs,
    annualRate,
    yearDurationMs: V2_YEAR_DURATION_MS,
    grossIncome,
    paymentFactor,
    paidIncome,
    paidIncomeDisplay: roundMoneyToKopecks(paidIncome),
  };
}

export { roundMoneyToKopecks };
