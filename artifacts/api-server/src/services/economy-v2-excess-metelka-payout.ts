/**
 * Metelka cash payout helpers: care-income split + immediate balance settlement.
 * Does not use Care pending_* / claimAll coin path.
 * Does NOT award tree growth — Metelka is excess liquidation only.
 */

import type { EconomyV2DbClient } from "./economy-v2-energy-settle";
import { roundMoneyToKopecks } from "./economy-v2-care-income";

/**
 * Split totalBonus into N deterministic kopeck shares that sum exactly to
 * roundMoneyToKopecks(totalBonus). First (remainder) webs get +1 kopeck.
 */
export function splitMetelkaBonusAmongWhiteWebs(
  totalBonus: number,
  whiteWebCount: number,
): number[] {
  const n = Math.max(0, Math.floor(Number(whiteWebCount) || 0));
  if (n <= 0) return [];
  const totalCents = Math.round(roundMoneyToKopecks(totalBonus) * 100);
  if (totalCents <= 0) return Array.from({ length: n }, () => 0);
  const baseShare = Math.floor(totalCents / n);
  const rem = totalCents % n;
  return Array.from({ length: n }, (_, i) => {
    const cents = baseShare + (i < rem ? 1 : 0);
    return cents / 100;
  });
}

export function metelkaBonusShareForWebIndex(
  totalBonus: number,
  whiteWebCount: number,
  webIndex: number,
): number {
  const shares = splitMetelkaBonusAmongWhiteWebs(totalBonus, whiteWebCount);
  const i = Math.floor(Number(webIndex));
  if (!Number.isFinite(i) || i < 0 || i >= shares.length) return 0;
  return shares[i]!;
}

export type MetelkaCashSettlementResult = {
  credited: number;
};

/**
 * Metelka cash settlement: balance + earned + income_history only.
 * Tree growth is intentionally omitted (Care-only product rule).
 */
export async function settleImmediateMetelkaCash(
  client: EconomyV2DbClient,
  userId: string | number,
  input: {
    amount: number;
    historyType: "base" | "bonus";
  },
): Promise<MetelkaCashSettlementResult> {
  const credited = roundMoneyToKopecks(
    Number.isFinite(input.amount) && input.amount > 0 ? input.amount : 0,
  );

  if (credited <= 0) {
    return { credited: 0 };
  }

  await client.query(
    `UPDATE accounts
     SET active_balance = active_balance + $2,
         active_earned = active_earned + $2
     WHERE user_id = $1`,
    [String(userId), credited],
  );
  await client.query(
    `INSERT INTO income_history(user_id, amount, type, earned_date)
     VALUES($1, $2, $3, $4)`,
    [
      String(userId),
      credited,
      input.historyType,
      new Date().toLocaleDateString("ru-RU"),
    ],
  );

  return { credited };
}
