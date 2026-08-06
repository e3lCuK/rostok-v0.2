/**
 * Acknowledge finished Metelka result.
 *
 * Version=2: pay base + bonus (round kopecks), income_history excess_base /
 * excess_bonus, deduct source seconds/elapsed snapshots, reduce
 * v2_excess_base_income by ONLY sessionBaseIncome, clear session. Idempotent.
 *
 * Legacy: credit paidIncome once, deduct session snapshot, clear.
 */

import { pool } from "@workspace/db";
import {
  buildEconomyV2ExcessFromRow,
  emptyExcessResult,
  isExcessSessionVersion2,
  normalizeExcessSeconds,
  readExcessResultFromRow,
  type EconomyV2ExcessPublicState,
  type EconomyV2ExcessResultPublicState,
} from "./economy-v2-excess";
import {
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
  roundMoneyToKopecks,
} from "./economy-v2-excess-income";
import { EXCESS_SESSION_RESULT_SELECT } from "./economy-v2-excess-finish";
import {
  clearExcessSessionSqlParams,
  EconomyV2ExcessSessionError,
} from "./economy-v2-excess-session";
import type { EconomyV2DbClient } from "./economy-v2-energy-settle";

export type AcknowledgeExcessBalances = {
  balance: number;
  earned: number;
};

export type AcknowledgeExcessResultPayload = {
  excessSeconds: number;
  excessElapsedMs: number;
  excessBaseIncome?: number;
  excess: EconomyV2ExcessPublicState;
  result: EconomyV2ExcessResultPublicState;
  /** Absolute balances after this acknowledge (or current if already cleared). */
  balances: AcknowledgeExcessBalances;
  /** Amount credited this call (0 when skipped / already applied / unavailable). */
  paidIncomeApplied: number;
};

async function withTx<T>(fn: (client: EconomyV2DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1 || raw === "1";
}

function parseMoney(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** Remainder after removing a non-negative snapshot share; never negative. */
export function deductExcessSnapshotShare(
  current: number,
  snapshot: number,
): number {
  const cur = Number.isFinite(current) && current > 0 ? current : 0;
  const snap = Number.isFinite(snapshot) && snapshot > 0 ? snapshot : 0;
  return Math.max(0, cur - snap);
}

async function loadBalances(
  client: EconomyV2DbClient,
  userId: string | number,
  forUpdate: boolean,
): Promise<AcknowledgeExcessBalances> {
  const sql = forUpdate
    ? `SELECT active_balance, active_earned FROM accounts WHERE user_id = $1 FOR UPDATE`
    : `SELECT active_balance, active_earned FROM accounts WHERE user_id = $1`;
  const acc = await client.query(sql, [String(userId)]);
  if (acc.rows.length === 0) {
    throw new EconomyV2ExcessSessionError(404, "not_found", "Account not found");
  }
  return {
    balance: parseMoney(acc.rows[0].active_balance),
    earned: parseMoney(acc.rows[0].active_earned),
  };
}

/**
 * Pay base + bonus for an already-frozen v2 pending result row, deducting
 * only the frozen session snapshots. Shared with the finish path so old
 * (pre per-click) pending results left over from before this migration get
 * fully settled instead of staying stuck. Idempotent — returns 0 when the
 * income was already applied.
 */
export async function acknowledgeV2(
  client: EconomyV2DbClient,
  userId: string | number,
  row: Record<string, unknown>,
  result: EconomyV2ExcessResultPublicState,
): Promise<number> {
  if (asBool(row.v2_excess_session_income_applied)) {
    return 0;
  }

  const sourceSeconds = normalizeExcessSeconds(
    row.v2_excess_session_source_seconds,
  );
  const sessionBaseIncome = normalizeExcessBaseIncome(
    row.v2_excess_session_base_income,
  );
  const currentSeconds = normalizeExcessSeconds(row.v2_excess_seconds);
  const currentElapsedMs = normalizeExcessElapsedMs(row.v2_excess_elapsed_ms);
  const currentBaseLedger = normalizeExcessBaseIncome(row.v2_excess_base_income);

  const nextSeconds = deductExcessSnapshotShare(currentSeconds, sourceSeconds);
  const sourceElapsedMs = normalizeExcessElapsedMs(
    row.v2_excess_session_source_elapsed_ms,
  );
  // Remove paid financial snapshot so the next cycle cannot re-pay it.
  const nextElapsed = deductExcessSnapshotShare(
    currentElapsedMs,
    sourceElapsedMs,
  );
  const nextBaseLedger = deductExcessSnapshotShare(
    currentBaseLedger,
    sessionBaseIncome,
  );

  const basePaid = roundMoneyToKopecks(Math.max(0, sessionBaseIncome));
  const skill =
    result.skill != null && Number.isFinite(result.skill) ? result.skill : 0;
  const gross =
    result.income.gross != null && Number.isFinite(result.income.gross)
      ? result.income.gross
      : 0;
  const bonusFromResult =
    result.income.bonus?.paid != null &&
    Number.isFinite(result.income.bonus.paid)
      ? Number(result.income.bonus.paid)
      : null;
  const bonusPaid = roundMoneyToKopecks(
    bonusFromResult != null
      ? Math.max(0, bonusFromResult)
      : Math.max(0, gross * skill),
  );
  const totalPaid = roundMoneyToKopecks(basePaid + bonusPaid);

  const applied = await client.query(
    `UPDATE game_state
     SET v2_excess_seconds = $2,
         v2_excess_elapsed_ms = $3,
         v2_excess_base_income = $4,
         v2_excess_session_income_applied = TRUE,
         v2_excess_session_base_income_applied = TRUE,
         updated_at = NOW()
     WHERE user_id = $1
       AND v2_excess_session_finished_at IS NOT NULL
       AND v2_excess_session_income_applied = FALSE
     RETURNING v2_excess_session_paid_income,
               v2_excess_session_base_income`,
    [String(userId), nextSeconds, nextElapsed, nextBaseLedger],
  );

  if (applied.rows.length === 0) {
    return 0;
  }

  let credited = 0;
  const earnedDate = new Date().toLocaleDateString("ru-RU");

  if (basePaid > 0) {
    await client.query(
      `UPDATE accounts
       SET active_balance = active_balance + $2,
           active_earned = active_earned + $2
       WHERE user_id = $1`,
      [String(userId), basePaid],
    );
    await client.query(
      `INSERT INTO income_history(user_id, amount, type, earned_date)
       VALUES($1, $2, 'excess_base', $3)`,
      [String(userId), basePaid, earnedDate],
    );
    credited += basePaid;
  }

  if (bonusPaid > 0) {
    await client.query(
      `UPDATE accounts
       SET active_balance = active_balance + $2,
           active_earned = active_earned + $2
       WHERE user_id = $1`,
      [String(userId), bonusPaid],
    );
    await client.query(
      `INSERT INTO income_history(user_id, amount, type, earned_date)
       VALUES($1, $2, 'excess_bonus', $3)`,
      [String(userId), bonusPaid, earnedDate],
    );
    credited += bonusPaid;
  }

  // Prefer totalPaid when both components were computed; credited tracks applied.
  void totalPaid;
  return roundMoneyToKopecks(credited);
}

async function acknowledgeLegacy(
  client: EconomyV2DbClient,
  userId: string | number,
  row: Record<string, unknown>,
  result: EconomyV2ExcessResultPublicState,
): Promise<number> {
  if (asBool(row.v2_excess_session_income_applied)) {
    return 0;
  }

  const sourceSeconds = normalizeExcessSeconds(
    row.v2_excess_session_source_seconds,
  );
  const currentSeconds = normalizeExcessSeconds(row.v2_excess_seconds);
  const currentElapsedMs = normalizeExcessElapsedMs(row.v2_excess_elapsed_ms);
  const nextSeconds = deductExcessSnapshotShare(currentSeconds, sourceSeconds);
  const sourceElapsedMs = normalizeExcessElapsedMs(
    row.v2_excess_session_source_elapsed_ms,
  );
  const nextElapsed = deductExcessSnapshotShare(
    currentElapsedMs,
    sourceElapsedMs,
  );

  const applied = await client.query(
    `UPDATE game_state
     SET v2_excess_seconds = $2,
         v2_excess_elapsed_ms = $3,
         v2_excess_session_income_applied = TRUE,
         updated_at = NOW()
     WHERE user_id = $1
       AND v2_excess_session_finished_at IS NOT NULL
       AND v2_excess_session_income_applied = FALSE
     RETURNING v2_excess_session_paid_income,
               v2_excess_session_gross_income`,
    [String(userId), nextSeconds, nextElapsed],
  );

  if (applied.rows.length === 0) {
    return 0;
  }

  const incomeAvailable = result.income.available === true;
  const paidRaw =
    incomeAvailable && result.income.paid != null
      ? Number(result.income.paid)
      : 0;
  const credit =
    incomeAvailable && Number.isFinite(paidRaw) && paidRaw > 0
      ? roundMoneyToKopecks(paidRaw)
      : 0;

  if (credit > 0) {
    await client.query(
      `UPDATE accounts
       SET active_balance = active_balance + $2,
           active_earned = active_earned + $2
       WHERE user_id = $1`,
      [String(userId), credit],
    );
    const earnedDate = new Date().toLocaleDateString("ru-RU");
    await client.query(
      `INSERT INTO income_history(user_id, amount, type, earned_date)
       VALUES($1, $2, 'excess', $3)`,
      [String(userId), credit, earnedDate],
    );
  }
  return credit;
}

/**
 * Apply saved Metelka income + deduct source snapshot + clear result.
 * Idempotent when result already cleared or income already applied+cleared.
 */
export async function acknowledgeEconomyV2ExcessResult(
  userId: string | number,
): Promise<AcknowledgeExcessResultPayload> {
  return withTx(async (client) => {
    await loadBalances(client, userId, true);

    const gameRow = await client.query(
      `SELECT ${EXCESS_SESSION_RESULT_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      throw new EconomyV2ExcessSessionError(404, "not_found", "Game state not found");
    }

    const row = gameRow.rows[0] as Record<string, unknown>;
    const result = readExcessResultFromRow(row);

    if (!result.available) {
      const balances = await loadBalances(client, userId, false);
      return {
        excessSeconds: normalizeExcessSeconds(row.v2_excess_seconds),
        excessElapsedMs: normalizeExcessElapsedMs(row.v2_excess_elapsed_ms),
        excessBaseIncome: normalizeExcessBaseIncome(row.v2_excess_base_income),
        excess: buildEconomyV2ExcessFromRow(row),
        result: emptyExcessResult(),
        balances,
        paidIncomeApplied: 0,
      };
    }

    const paidIncomeApplied = isExcessSessionVersion2(
      row.v2_excess_session_version,
    )
      ? await acknowledgeV2(client, userId, row, result)
      : await acknowledgeLegacy(client, userId, row, result);

    const { sql } = clearExcessSessionSqlParams();
    await client.query(sql, [String(userId)]);

    const after = await client.query(
      `SELECT ${EXCESS_SESSION_RESULT_SELECT}
       FROM game_state
       WHERE user_id = $1`,
      [String(userId)],
    );
    const outRow = after.rows[0] as Record<string, unknown>;
    const balances = await loadBalances(client, userId, false);

    return {
      excessSeconds: normalizeExcessSeconds(outRow.v2_excess_seconds),
      excessElapsedMs: normalizeExcessElapsedMs(outRow.v2_excess_elapsed_ms),
      excessBaseIncome: normalizeExcessBaseIncome(outRow.v2_excess_base_income),
      excess: buildEconomyV2ExcessFromRow(outRow),
      result: emptyExcessResult(),
      balances,
      paidIncomeApplied,
    };
  });
}
