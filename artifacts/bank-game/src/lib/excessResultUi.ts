import type { EconomyV2ExcessResultState, EconomyV2ExcessState } from "@/lib/api";
import { formatRub } from "@/lib/engine";

/**
 * Legacy result card only.
 * Version=2 finishes settle in finish — never show the result Continue UX.
 */
export function isExcessResultAvailable(
  excess?: EconomyV2ExcessState | null,
): boolean {
  if (excess?.result?.available !== true) return false;
  const ver = excess.result.sessionVersion ?? excess.session?.version ?? null;
  if (ver === 2) return false;
  return true;
}
/** Skill fraction → whole percent string, e.g. 0.5 → "50%". */
export function formatExcessSkillPercent(skill: number | null | undefined): string {
  const n = Number(skill);
  if (!Number.isFinite(n)) return "0%";
  const pct = Math.round(Math.min(1, Math.max(0, n)) * 100);
  return `${pct}%`;
}

export function excessResultClearedLabel(
  result?: EconomyV2ExcessResultState | null,
): string {
  const cleared = result?.clearedCount;
  const total = result?.webCount;
  if (cleared == null || total == null) return "Очищено —";
  return `Очищено ${cleared} из ${total}`;
}

/** Server awarded XP only — no local formula. */
export function formatExcessAwardedXp(
  awarded: number | null | undefined,
): string {
  const n = Number(awarded);
  const xp = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return xp > 0 ? `+${xp} XP` : "0 XP";
}

/**
 * Server paidIncome → display via formatRub.
 * Returns null when income unavailable (legacy/synthetic) — no fake money.
 */
export function formatExcessPaidIncomeLabel(
  result?: EconomyV2ExcessResultState | null,
): string | null {
  const income = result?.income;
  if (!income || income.available !== true) return null;
  const paid = Number(income.total?.paid ?? income.paid);
  if (!Number.isFinite(paid)) return null;
  return `Доход: +${formatRub(paid)}`;
}

/** Server base/bonus/total labels for the result card (no local formulas). */
export function formatExcessIncomeBreakdownLabels(
  result?: EconomyV2ExcessResultState | null,
): { base: string; bonus: string; total: string } | null {
  const income = result?.income;
  if (!income || income.available !== true) return null;

  const totalRaw = Number(income.total?.paid ?? income.paid);
  if (!Number.isFinite(totalRaw)) return null;

  const baseRaw =
    income.base?.amount != null && Number.isFinite(Number(income.base.amount))
      ? Number(income.base.amount)
      : 0;
  const bonusRaw =
    income.bonus?.paid != null && Number.isFinite(Number(income.bonus.paid))
      ? Number(income.bonus.paid)
      : Math.max(0, totalRaw - baseRaw);

  return {
    base: `Базовый доход: +${formatRub(baseRaw)}`,
    bonus: `Бонусный доход: +${formatRub(bonusRaw)}`,
    total: `Всего: +${formatRub(totalRaw)}`,
  };
}

/** Continue enabled whenever a finish result is pending dismiss. */
export function isExcessResultContinueEnabled(
  result?: EconomyV2ExcessResultState | null,
): boolean {
  return result?.available === true;
}

/**
 * Preview ready but not yet credited — informational only.
 * Continue is still enabled; acknowledge performs the credit.
 */
export function isExcessIncomePendingApplication(
  result?: EconomyV2ExcessResultState | null,
): boolean {
  if (!result?.available) return false;
  if (result.income?.available !== true) return false;
  return result.income.applied !== true;
}

/**
 * Button may be disabled only while HTTP acknowledge is in flight.
 * Spinner / "…" only when `loading` is true.
 */
export function resolveExcessResultContinueUi(input: {
  result?: EconomyV2ExcessResultState | null;
  loading?: boolean;
}): { loading: boolean; disabled: boolean; label: string } {
  const loading = input.loading === true;
  const canContinue = isExcessResultContinueEnabled(input.result);
  return {
    loading,
    disabled: loading || !canContinue,
    label: loading ? "…" : "Продолжить",
  };
}
