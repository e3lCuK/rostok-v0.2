/**
 * Finish an active Metelka cleaning attempt.
 *
 * Version=2: compute Metelka pending reward (base + cleared bonus + XP prepared),
 * deduct excess snapshots, wipe session. Does NOT credit balance / history /
 * player_xp / Care pending (claim comes later).
 * Legacy (NULL/1): auto-collect special red web, deduct excess snapshot,
 * clear the session — no pending result / acknowledge screen.
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
import type { ExcessFinishReason } from "./economy-v2-excess-skill";
import {
  computeExcessGrossIncome,
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
  roundMoneyToKopecks,
} from "./economy-v2-excess-income";
import { calcPlayerLevel } from "./economy-v2-care-xp";
import {
  appendClearedExcessWebId,
  EXCESS_SPECIAL_WEB_ID,
  isExcessSessionFinishableByTime,
  parseClearedExcessWebIds,
} from "./economy-v2-excess-webs";
import {
  computeExcessRegularSkill,
  computeSpecialWebIncomeDelta,
  countRegularClearedWebs,
  isSpecialWebCleared,
} from "./economy-v2-excess-rewards";
import { computeExcessCleaningXp } from "./economy-v2-excess-xp";
import {
  clearExcessSessionSqlParams,
  EconomyV2ExcessSessionError,
} from "./economy-v2-excess-session";
import { isEconomyV2TutorialActive } from "./economy-v2-energy-settle";
import type { EconomyV2DbClient } from "./economy-v2-energy-settle";
import {
  computeMetelkaFinishPendingAward,
  readMetelkaPendingRewardFromRow,
  type MetelkaPendingRewardPublic,
} from "./economy-v2-excess-metelka-pending";

/** Remainder after removing a non-negative snapshot share; never negative. */
function deductExcessSnapshotShare(current: number, snapshot: number): number {
  const cur = Number.isFinite(current) && current > 0 ? current : 0;
  const snap = Number.isFinite(snapshot) && snapshot > 0 ? snapshot : 0;
  return Math.max(0, cur - snap);
}

export type FinishExcessSessionResult = {
  excessSeconds: number;
  excessElapsedMs: number;
  excess: EconomyV2ExcessPublicState;
  result: EconomyV2ExcessResultPublicState;
  playerXp: number;
  playerLevel: number;
  xpGained: number;
  balances: { balance: number; earned: number };
  /**
   * Direct balance credit this call.
   * Version=2 Metelka: always 0 (cash stays in metelka pending until claim).
   * Legacy: special-web auto-collect may still credit.
   */
  moneyGained: number;
  finishReason: ExcessFinishReason | null;
  consumedExcessSeconds?: number;
  /**
   * Prepared Metelka income amounts (not yet credited to balance).
   * Ledger deduction is top-level `consumedExcessSeconds` (not a preset).
   * Session T is on `excess.session.presetSeconds` / result — not here.
   */
  income?: {
    base: number;
    bonus: number;
    total: number;
  };
  /** Care pending unchanged. */
  pendingBaseReward?: number;
  pendingBonusReward?: number;
  automaticReward?: { baseIncomeAppliedNow: number };
  bonusIncomeAppliedNow?: number;
  /** Separate Metelka pending reward (survives reload; claim later). */
  metelkaPendingReward?: MetelkaPendingRewardPublic;
};

export const EXCESS_SESSION_RESULT_SELECT = `v2_excess_seconds,
              v2_excess_elapsed_ms,
              v2_excess_base_income,
              pending_base_reward,
              pending_bonus_reward,
              metelka_pending_active,
              metelka_pending_base,
              metelka_pending_bonus,
              metelka_pending_xp,
              metelka_pending_created_at,
              metelka_pending_claim_token,
              metelka_pending_claimed_at,
              tutorial_done,
              v2_freshness,
              player_xp,
              player_level,
              v2_excess_session_active,
              v2_excess_session_version,
              v2_excess_session_started_at,
              v2_excess_session_source_seconds,
              v2_excess_session_source_elapsed_ms,
              v2_excess_session_capital,
              v2_excess_session_base_income,
              v2_excess_session_base_web_cleared,
              v2_excess_session_base_web_collection_mode,
              v2_excess_session_base_income_applied,
              v2_excess_session_preset_seconds,
              v2_excess_session_rate,
              v2_excess_session_web_count,
              v2_excess_session_layout_seed,
              v2_excess_session_cleared_web_ids,
              v2_excess_session_finished_at,
              v2_excess_session_finish_reason,
              v2_excess_session_final_cleared_count,
              v2_excess_session_final_web_count,
              v2_excess_session_skill,
              v2_excess_session_xp_max,
              v2_excess_session_xp_raw,
              v2_excess_session_xp_awarded,
              v2_excess_session_xp_applied,
              v2_excess_session_gross_income,
              v2_excess_session_payment_factor,
              v2_excess_session_paid_income,
              v2_excess_session_income_applied,
              v2_excess_session_bonus_raw_unlocked`;

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1 || raw === "1";
}

function parsePlayerXp(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function parseMoney(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

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

function resolveFinishReason(input: {
  allCleared: boolean;
  timeExpired: boolean;
}): ExcessFinishReason | null {
  if (input.allCleared) return "all_webs_cleared";
  if (input.timeExpired) return "time_expired";
  return null;
}

async function loadBalances(
  client: EconomyV2DbClient,
  userId: string | number,
): Promise<{ balance: number; earned: number }> {
  const acc = await client.query(
    `SELECT active_balance, active_earned FROM accounts WHERE user_id = $1`,
    [String(userId)],
  );
  return {
    balance: parseMoney(acc.rows[0]?.active_balance),
    earned: parseMoney(acc.rows[0]?.active_earned),
  };
}

/**
 * Leftover pending result from before the per-click migration (finished_at
 * set, version=2): pay remaining base + bonus, deduct frozen snapshots, and
 * clear — using the same settlement logic as acknowledge — so old pending
 * results never stay stuck now that finish no longer produces them.
 *
 * Legacy (NULL/1): credit remaining lump + deduct + clear (unchanged).
 */
async function settleLegacyPendingResult(
  client: EconomyV2DbClient,
  userId: string | number,
  row: Record<string, unknown>,
): Promise<FinishExcessSessionResult> {
  if (isExcessSessionVersion2(row.v2_excess_session_version)) {
    const result = readExcessResultFromRow(row);
    const { acknowledgeV2 } = await import("./economy-v2-excess-acknowledge");
    const paid = await acknowledgeV2(client, userId, row, result);
    const { sql } = clearExcessSessionSqlParams();
    await client.query(sql, [String(userId)]);
    const after = await client.query(
      `SELECT ${EXCESS_SESSION_RESULT_SELECT} FROM game_state WHERE user_id = $1`,
      [String(userId)],
    );
    const out = after.rows[0] as Record<string, unknown>;
    const balances = await loadBalances(client, userId);
    const playerXp = parsePlayerXp(out.player_xp);
    return {
      excessSeconds: normalizeExcessSeconds(out.v2_excess_seconds),
      excessElapsedMs: normalizeExcessElapsedMs(out.v2_excess_elapsed_ms),
      excess: buildEconomyV2ExcessFromRow(out),
      result: emptyExcessResult(),
      playerXp,
      playerLevel: calcPlayerLevel(playerXp),
      xpGained: 0,
      balances,
      moneyGained: paid,
      finishReason: result.reason,
    };
  }

  const result = readExcessResultFromRow(row);
  if (!asBool(row.v2_excess_session_income_applied)) {
    const sourceSeconds = normalizeExcessSeconds(
      row.v2_excess_session_source_seconds,
    );
    const sourceElapsedMs = normalizeExcessElapsedMs(
      row.v2_excess_session_source_elapsed_ms,
    );
    const nextSeconds = deductExcessSnapshotShare(
      normalizeExcessSeconds(row.v2_excess_seconds),
      sourceSeconds,
    );
    // Remove paid financial snapshot so the next Metelka cannot re-pay it.
    let nextElapsed = deductExcessSnapshotShare(
      normalizeExcessElapsedMs(row.v2_excess_elapsed_ms),
      sourceElapsedMs,
    );
    if (nextSeconds <= 0) nextElapsed = 0;
    await client.query(
      `UPDATE game_state
       SET v2_excess_seconds = $2,
           v2_excess_elapsed_ms = $3,
           v2_excess_session_income_applied = TRUE,
           updated_at = NOW()
       WHERE user_id = $1
         AND v2_excess_session_finished_at IS NOT NULL
         AND v2_excess_session_income_applied = FALSE`,
      [String(userId), nextSeconds, nextElapsed],
    );
    const paidRaw =
      result.income.available && result.income.paid != null
        ? Number(result.income.paid)
        : 0;
    const credit =
      result.income.available && Number.isFinite(paidRaw) && paidRaw > 0
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
      await client.query(
        `INSERT INTO income_history(user_id, amount, type, earned_date)
         VALUES($1, $2, 'excess', $3)`,
        [String(userId), credit, new Date().toLocaleDateString("ru-RU")],
      );
    }
  }
  const { sql } = clearExcessSessionSqlParams();
  await client.query(sql, [String(userId)]);
  const after = await client.query(
    `SELECT ${EXCESS_SESSION_RESULT_SELECT} FROM game_state WHERE user_id = $1`,
    [String(userId)],
  );
  const out = after.rows[0] as Record<string, unknown>;
  const balances = await loadBalances(client, userId);
  const playerXp = parsePlayerXp(out.player_xp);
  return {
    excessSeconds: normalizeExcessSeconds(out.v2_excess_seconds),
    excessElapsedMs: normalizeExcessElapsedMs(out.v2_excess_elapsed_ms),
    excess: buildEconomyV2ExcessFromRow(out),
    result: emptyExcessResult(),
    playerXp,
    playerLevel: calcPlayerLevel(playerXp),
    xpGained: 0,
    balances,
    moneyGained: 0,
    finishReason: null,
  };
}

async function finishV2Session(
  client: EconomyV2DbClient,
  userId: string | number,
  row: Record<string, unknown>,
  nowMs: number,
): Promise<FinishExcessSessionResult> {
  const startedAt =
    row.v2_excess_session_started_at == null
      ? null
      : parseInt(String(row.v2_excess_session_started_at), 10);
  const presetSeconds =
    row.v2_excess_session_preset_seconds == null
      ? null
      : parseInt(String(row.v2_excess_session_preset_seconds), 10);
  const webCount =
    row.v2_excess_session_web_count == null
      ? null
      : parseInt(String(row.v2_excess_session_web_count), 10);

  if (
    webCount == null ||
    !Number.isFinite(webCount) ||
    webCount <= 0 ||
    startedAt == null ||
    presetSeconds == null
  ) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_session_not_active",
      "Active session is missing finish inputs",
    );
  }

  // Unclaimed pending must NOT block finish of an active/expired session.
  // A prior 0₽ pending (common in short debug T) used to leave gameplay stuck
  // at timer=0 because finish always 409'd while session.active stayed true.
  // Finish is authoritative: it replaces any previous unclaimed Metelka pending.

  const clearedIds = parseClearedExcessWebIds(
    row.v2_excess_session_cleared_web_ids,
  );
  const regularCleared = countRegularClearedWebs(clearedIds, webCount);
  // Finish accepts a small client-ahead skew so UI=0 cannot stick on 409.
  const timeExpired = isExcessSessionFinishableByTime(
    startedAt,
    presetSeconds,
    nowMs,
  );
  const allCleared = regularCleared >= webCount;
  const reason = resolveFinishReason({ allCleared, timeExpired });

  if (reason == null) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_session_not_finishable",
      "Session is still in progress",
    );
  }

  const sourceElapsed = normalizeExcessElapsedMs(
    row.v2_excess_session_source_elapsed_ms,
  );
  const prevPlayerXp = parsePlayerXp(row.player_xp);
  const nextPlayerXp = prevPlayerXp;
  const nextPlayerLevel = calcPlayerLevel(nextPlayerXp);

  const baseAlreadyApplied = asBool(row.v2_excess_session_base_income_applied);
  const currentSeconds = normalizeExcessSeconds(row.v2_excess_seconds);
  const currentElapsedMs = normalizeExcessElapsedMs(row.v2_excess_elapsed_ms);
  const currentBaseLedger = normalizeExcessBaseIncome(
    row.v2_excess_base_income,
  );
  const sourceSeconds = normalizeExcessSeconds(
    row.v2_excess_session_source_seconds,
  );
  const sessionBaseIncome = normalizeExcessBaseIncome(
    row.v2_excess_session_base_income,
  );
  const nextSeconds = deductExcessSnapshotShare(currentSeconds, sourceSeconds);
  // Deduct the frozen paid financial period (anti double-pay). Not a ledger rewrite.
  let nextElapsedMs = deductExcessSnapshotShare(
    currentElapsedMs,
    sourceElapsed,
  );
  let nextBaseLedger = baseAlreadyApplied
    ? currentBaseLedger
    : deductExcessSnapshotShare(currentBaseLedger, sessionBaseIncome);
  // Fully paid ledger → wipe financial history so the excess timer restarts at 0.
  if (nextSeconds <= 0) {
    nextElapsedMs = 0;
    nextBaseLedger = 0;
  }

  const carePendingBase =
    parseFloat(String(row.pending_base_reward ?? "0")) || 0;
  const carePendingBonus =
    parseFloat(String(row.pending_bonus_reward ?? "0")) || 0;

  const capital = parseMoney(row.v2_excess_session_capital);
  const balancesBefore = await loadBalances(client, userId);
  const capitalForIncome =
    capital > 0 ? capital : Math.max(0, balancesBefore.balance);
  const tutorialActive = isEconomyV2TutorialActive(row.tutorial_done);
  const sessionRate =
    row.v2_excess_session_rate == null
      ? 0
      : parseFloat(String(row.v2_excess_session_rate)) || 0;

  const award = computeMetelkaFinishPendingAward({
    capital: capitalForIncome,
    sourceSeconds,
    sourceElapsedMs: sourceElapsed,
    annualRate: sessionRate,
    baseIncomeSnapshot: sessionBaseIncome,
    presetSeconds,
    whiteWebCount: webCount,
    clearedWebIds: clearedIds,
    tutorialActive,
  });

  // Atomic: write Metelka pending + deduct excess + wipe session.
  // Guard: session still active AND no existing Metelka pending.
  const updated = await client.query(
    `UPDATE game_state
     SET v2_excess_seconds = $2,
         v2_excess_elapsed_ms = $3,
         v2_excess_base_income = $4,
         player_xp = $5,
         player_level = $6,
         metelka_pending_active = TRUE,
         metelka_pending_base = $7,
         metelka_pending_bonus = $8,
         metelka_pending_xp = $9,
         metelka_pending_created_at = $10,
         metelka_pending_claim_token = $11,
         metelka_pending_claimed_at = NULL,
         v2_excess_session_active = FALSE,
         v2_excess_session_version = NULL,
         v2_excess_session_started_at = NULL,
         v2_excess_session_source_seconds = NULL,
         v2_excess_session_source_elapsed_ms = NULL,
         v2_excess_session_capital = NULL,
         v2_excess_session_base_income = NULL,
         v2_excess_session_base_web_cleared = FALSE,
         v2_excess_session_base_web_collection_mode = NULL,
         v2_excess_session_base_income_applied = FALSE,
         v2_excess_session_preset_seconds = NULL,
         v2_excess_session_rate = NULL,
         v2_excess_session_web_count = NULL,
         v2_excess_session_layout_seed = NULL,
         v2_excess_session_cleared_web_ids = '{}',
         v2_excess_session_finished_at = NULL,
         v2_excess_session_finish_reason = NULL,
         v2_excess_session_final_cleared_count = NULL,
         v2_excess_session_final_web_count = NULL,
         v2_excess_session_skill = NULL,
         v2_excess_session_xp_max = NULL,
         v2_excess_session_xp_raw = NULL,
         v2_excess_session_xp_awarded = NULL,
         v2_excess_session_xp_applied = FALSE,
         v2_excess_session_gross_income = NULL,
         v2_excess_session_payment_factor = NULL,
         v2_excess_session_paid_income = NULL,
         v2_excess_session_income_applied = FALSE,
         v2_excess_session_bonus_raw_unlocked = 0,
         v3_metelka_required = FALSE,
         v3_metelka_completed_for_cycle = TRUE,
         updated_at = NOW()
     WHERE user_id = $1
       AND v2_excess_session_active = TRUE
       AND v2_excess_session_finished_at IS NULL
     RETURNING *`,
    [
      String(userId),
      nextSeconds,
      nextElapsedMs,
      nextBaseLedger,
      nextPlayerXp,
      nextPlayerLevel,
      award.earnedBase,
      award.earnedBonus,
      award.earnedXp,
      nowMs,
      award.claimToken,
    ],
  );

  if (updated.rows.length === 0) {
    // Concurrent finish won the race — re-read. Never soft-succeed while
    // session is still active (that permanently locks the client finish guard).
    const again = await client.query(
      `SELECT ${EXCESS_SESSION_RESULT_SELECT} FROM game_state WHERE user_id = $1`,
      [String(userId)],
    );
    const latest = (again.rows[0] ?? row) as Record<string, unknown>;
    if (asBool(latest.v2_excess_session_active)) {
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_session_not_finishable",
        "Session finish race — retry",
      );
    }
    const balances = await loadBalances(client, userId);
    const playerXp = parsePlayerXp(latest.player_xp);
    return {
      excessSeconds: normalizeExcessSeconds(latest.v2_excess_seconds),
      excessElapsedMs: normalizeExcessElapsedMs(latest.v2_excess_elapsed_ms),
      excess: buildEconomyV2ExcessFromRow(latest),
      result: emptyExcessResult(),
      playerXp,
      playerLevel: calcPlayerLevel(playerXp),
      xpGained: 0,
      balances,
      moneyGained: 0,
      finishReason: null,
      consumedExcessSeconds: 0,
      income: { base: 0, bonus: 0, total: 0 },
      pendingBaseReward: carePendingBase,
      pendingBonusReward: carePendingBonus,
      bonusIncomeAppliedNow: 0,
      metelkaPendingReward: readMetelkaPendingRewardFromRow(latest),
    };
  }

  const out = updated.rows[0] as Record<string, unknown>;
  const balances = await loadBalances(client, userId);
  const playerXp = parsePlayerXp(out.player_xp);
  const metelkaPending = readMetelkaPendingRewardFromRow(out);

  return {
    excessSeconds: normalizeExcessSeconds(out.v2_excess_seconds),
    excessElapsedMs: normalizeExcessElapsedMs(out.v2_excess_elapsed_ms),
    excess: buildEconomyV2ExcessFromRow(out),
    result: emptyExcessResult(),
    playerXp,
    playerLevel: calcPlayerLevel(playerXp),
    xpGained: 0,
    balances,
    moneyGained: 0,
    finishReason: reason,
    consumedExcessSeconds: sourceSeconds,
    income: {
      base: award.earnedBase,
      bonus: award.earnedBonus,
      total: award.totalMoney,
    },
    pendingBaseReward:
      parseFloat(String(out.pending_base_reward ?? carePendingBase)) ||
      carePendingBase,
    pendingBonusReward:
      parseFloat(String(out.pending_bonus_reward ?? carePendingBonus)) ||
      carePendingBonus,
    bonusIncomeAppliedNow: 0,
    metelkaPendingReward: metelkaPending,
  };
}

async function finishLegacySession(
  client: EconomyV2DbClient,
  userId: string | number,
  row: Record<string, unknown>,
  nowMs: number,
): Promise<FinishExcessSessionResult> {
  const startedAt =
    row.v2_excess_session_started_at == null
      ? null
      : parseInt(String(row.v2_excess_session_started_at), 10);
  const presetSeconds =
    row.v2_excess_session_preset_seconds == null
      ? null
      : parseInt(String(row.v2_excess_session_preset_seconds), 10);
  const webCount =
    row.v2_excess_session_web_count == null
      ? null
      : parseInt(String(row.v2_excess_session_web_count), 10);

  if (
    webCount == null ||
    !Number.isFinite(webCount) ||
    webCount <= 0 ||
    startedAt == null ||
    presetSeconds == null
  ) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_session_not_active",
      "Active session is missing finish inputs",
    );
  }

  let clearedIds = parseClearedExcessWebIds(
    row.v2_excess_session_cleared_web_ids,
  );
  const regularCleared = countRegularClearedWebs(clearedIds, webCount);
  const timeExpired = isExcessSessionFinishableByTime(
    startedAt,
    presetSeconds,
    nowMs,
  );
  const allCleared = regularCleared >= webCount;
  const reason = resolveFinishReason({ allCleared, timeExpired });

  if (reason == null) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_session_not_finishable",
      "Session is still in progress",
    );
  }

  const capital = parseMoney(row.v2_excess_session_capital);
  const sourceElapsed = normalizeExcessElapsedMs(
    row.v2_excess_session_source_elapsed_ms,
  );
  const rate = parseMoney(row.v2_excess_session_rate);
  const gross = computeExcessGrossIncome({
    capital,
    excessElapsedMs: sourceElapsed,
    annualRate: rate,
  });
  const guaranteed = gross * 0.5;

  let moneyGained = 0;
  let paidIncome = parseMoney(row.v2_excess_session_paid_income);
  const xpAwarded = parsePlayerXp(row.v2_excess_session_xp_awarded);

  if (!isSpecialWebCleared(clearedIds)) {
    moneyGained = computeSpecialWebIncomeDelta({
      guaranteed,
      specialAlreadyPaid: false,
    });
    paidIncome = roundMoneyToKopecks(paidIncome + moneyGained);
    clearedIds = appendClearedExcessWebId(clearedIds, EXCESS_SPECIAL_WEB_ID);
    if (moneyGained > 0) {
      await client.query(
        `UPDATE accounts
         SET active_balance = active_balance + $2,
             active_earned = active_earned + $2
         WHERE user_id = $1`,
        [String(userId), moneyGained],
      );
      await client.query(
        `INSERT INTO income_history(user_id, amount, type, earned_date)
         VALUES($1, $2, 'excess', $3)`,
        [String(userId), moneyGained, new Date().toLocaleDateString("ru-RU")],
      );
    }
  }

  const skill = computeExcessRegularSkill(regularCleared, webCount);
  const xp = computeExcessCleaningXp({ presetSeconds, skill });

  const sourceSeconds = normalizeExcessSeconds(
    row.v2_excess_session_source_seconds,
  );
  const nextSeconds = deductExcessSnapshotShare(
    normalizeExcessSeconds(row.v2_excess_seconds),
    sourceSeconds,
  );
  let nextElapsed = deductExcessSnapshotShare(
    normalizeExcessElapsedMs(row.v2_excess_elapsed_ms),
    sourceElapsed,
  );
  if (nextSeconds <= 0) nextElapsed = 0;

  await client.query(
    `UPDATE game_state
     SET v2_excess_seconds = $2,
         v2_excess_elapsed_ms = $3,
         v2_excess_session_cleared_web_ids = $4,
         v2_excess_session_paid_income = $5,
         v2_excess_session_xp_awarded = $6,
         v2_excess_session_xp_max = $7,
         v2_excess_session_xp_raw = $8,
         v2_excess_session_skill = $9,
         v2_excess_session_gross_income = $10,
         v2_excess_session_finish_reason = $11,
         v2_excess_session_final_cleared_count = $12,
         v2_excess_session_final_web_count = $13,
         v2_excess_session_xp_applied = TRUE,
         v2_excess_session_income_applied = TRUE,
         updated_at = NOW()
     WHERE user_id = $1
       AND v2_excess_session_active = TRUE`,
    [
      String(userId),
      nextSeconds,
      nextElapsed,
      clearedIds,
      paidIncome,
      xpAwarded,
      xp.maxXp,
      xp.rawXp,
      skill,
      gross > 0 ? gross : null,
      reason,
      regularCleared,
      webCount,
    ],
  );

  const { sql } = clearExcessSessionSqlParams();
  await client.query(sql, [String(userId)]);

  const after = await client.query(
    `SELECT ${EXCESS_SESSION_RESULT_SELECT} FROM game_state WHERE user_id = $1`,
    [String(userId)],
  );
  const out = after.rows[0] as Record<string, unknown>;
  const balances = await loadBalances(client, userId);
  const playerXp = parsePlayerXp(out.player_xp);

  return {
    excessSeconds: normalizeExcessSeconds(out.v2_excess_seconds),
    excessElapsedMs: normalizeExcessElapsedMs(out.v2_excess_elapsed_ms),
    excess: buildEconomyV2ExcessFromRow(out),
    result: emptyExcessResult(),
    playerXp,
    playerLevel: calcPlayerLevel(playerXp),
    xpGained: xpAwarded,
    balances,
    moneyGained,
    finishReason: reason,
  };
}

/**
 * Finish active Metelka session when time expired or all regular webs cleared.
 */
export async function finishEconomyV2ExcessSession(
  userId: string | number,
  nowMs: number = Date.now(),
): Promise<FinishExcessSessionResult> {
  return withTx(async (client) => {
    await client.query(
      `SELECT active_balance FROM accounts WHERE user_id = $1 FOR UPDATE`,
      [String(userId)],
    );

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
    const existing = readExcessResultFromRow(row);
    if (existing.available) {
      return settleLegacyPendingResult(client, userId, row);
    }

    if (!asBool(row.v2_excess_session_active)) {
      const balances = await loadBalances(client, userId);
      const playerXp = parsePlayerXp(row.player_xp);
      return {
        excessSeconds: normalizeExcessSeconds(row.v2_excess_seconds),
        excessElapsedMs: normalizeExcessElapsedMs(row.v2_excess_elapsed_ms),
        excess: buildEconomyV2ExcessFromRow(row),
        result: emptyExcessResult(),
        playerXp,
        playerLevel: calcPlayerLevel(playerXp),
        xpGained: 0,
        balances,
        moneyGained: 0,
        finishReason: null,
        metelkaPendingReward: readMetelkaPendingRewardFromRow(row),
      };
    }

    if (isExcessSessionVersion2(row.v2_excess_session_version)) {
      return finishV2Session(client, userId, row, nowMs);
    }
    return finishLegacySession(client, userId, row, nowMs);
  });
}
