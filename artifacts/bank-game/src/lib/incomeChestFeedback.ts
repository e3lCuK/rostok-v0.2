/**
 * Ephemeral UI feedback after successful Metelka acknowledge.
 * Not persisted — F5 must not replay.
 */

import { formatRub } from "@/lib/engine";
import type { EconomyV2ExcessResultState } from "@/lib/api";

export type IncomeChestFeedback = {
  /** Unique per successful apply — remounts float without replaying old ids. */
  id: string;
  /** Server paidIncome captured before acknowledge cleared the result. */
  amount: number;
};

let feedbackSeq = 0;

/** Read display amount from pending finish result (before acknowledge clears it). */
export function readPendingPaidIncome(
  result?: EconomyV2ExcessResultState | null,
): number | null {
  if (!result?.available) return null;
  const income = result.income;
  if (!income || income.available !== true) return null;
  if (income.applied === true) return null;
  const paid = Number(income.paid);
  if (!Number.isFinite(paid) || paid <= 0) return null;
  return paid;
}

/**
 * Show float only when this HTTP call actually credited money.
 * Uses `paidIncomeApplied` from acknowledge response (idempotent → 0).
 */
export function shouldPlayIncomeChestFeedback(
  paidIncomeApplied: number | null | undefined,
  pendingPaid: number | null,
): boolean {
  const applied = Number(paidIncomeApplied);
  if (!Number.isFinite(applied) || applied <= 0) return false;
  if (pendingPaid == null) return false;
  return pendingPaid > 0;
}

export function createIncomeChestFeedback(amount: number): IncomeChestFeedback {
  feedbackSeq += 1;
  return {
    id: `income-chest-${Date.now()}-${feedbackSeq}`,
    amount,
  };
}

/** Floating label via project money formatter, e.g. "+0,10₽". */
export function formatIncomeChestFloatLabel(amount: number): string {
  return `+${formatRub(amount)}`;
}

/** ~850ms float; chest bump reuses existing capital-change animation (~420ms). */
export const INCOME_CHEST_FLOAT_MS = 850;
