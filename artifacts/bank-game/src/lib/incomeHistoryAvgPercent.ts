/**
 * Effective APR % shown in accrual history («Средний %»).
 * Weight by income amount — not by operation count — so a 0.01₽ tutorial
 * row does not dilute a 19₽ Care payout equally.
 */

export type IncomeSessionForAvgPercent = {
  base: number;
  total: number;
};

/** Per-session effective rate: (total/base)*12 when base > 0, else 12. */
export function incomeSessionEffectivePercent(
  session: IncomeSessionForAvgPercent,
): number {
  const base = Number(session.base) || 0;
  const total = Number(session.total) || 0;
  if (base > 0 && Number.isFinite(total)) return (total / base) * 12;
  return 12;
}

/**
 * Amount-weighted average of session effective percents.
 * Weight = max(0, total). Empty / zero-weight → 0.
 */
export function computeAverageIncomePercent(
  sessions: readonly IncomeSessionForAvgPercent[],
): number {
  let weighted = 0;
  let weight = 0;
  for (const s of sessions) {
    const w = Math.max(0, Number(s.total) || 0);
    if (w <= 0) continue;
    weighted += incomeSessionEffectivePercent(s) * w;
    weight += w;
  }
  if (weight <= 0) return 0;
  return weighted / weight;
}
