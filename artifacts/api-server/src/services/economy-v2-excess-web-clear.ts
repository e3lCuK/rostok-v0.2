/**
 * Clear a single Metelka cobweb during an active excess session.
 *
 * Version=2 (current): record-only progress.
 *   - White webs only — append webId to cleared_web_ids.
 *   - No money, XP, pending, tree, or income_history on clear.
 *   - Red / base-income webs are rejected (removed from active layout).
 * Legacy (NULL/1): per-click XP (regular) and income (regular bonus / special)
 * using the older 50/50 guaranteed+bonus-pool formula (unchanged).
 */

import { pool } from "@workspace/db";
import {
  buildEconomyV2ExcessFromRow,
  isExcessSessionVersion2,
  normalizeExcessSeconds,
  type EconomyV2ExcessPublicState,
  type EconomyV2ExcessSessionPublicState,
} from "./economy-v2-excess";
import {
  computeExcessGrossIncome,
  normalizeExcessElapsedMs,
  roundMoneyToKopecks,
} from "./economy-v2-excess-income";
import {
  appendClearedExcessWebId,
  EXCESS_SPECIAL_WEB_ID,
  isExcessSessionTimeExpired,
  isExcessWebCleared,
  parseClearedExcessWebIds,
  validateExcessWebId,
} from "./economy-v2-excess-webs";
import {
  computeRegularWebBonusDelta,
  computeRegularWebXpDelta,
  computeSpecialWebIncomeDelta,
  countRegularClearedWebs,
  isExcessSpecialWebId,
  isSpecialWebCleared,
  type ExcessBaseWebCollectionMode,
} from "./economy-v2-excess-rewards";
import { calcPlayerLevel } from "./economy-v2-care-xp";
import { EconomyV2ExcessSessionError } from "./economy-v2-excess-session";
import type { EconomyV2DbClient } from "./economy-v2-energy-settle";

export type ClearExcessWebReward = {
  kind: "regular" | "special" | "base_income" | "progress";
  xpGained: number;
  moneyGained: number;
};

export type ClearExcessWebRewardDelta = {
  kind: "regular" | "base_income" | "progress";
  bonusRawDelta?: number;
  xpRawDelta?: number;
  clearedWhiteCount?: number;
  whiteWebCount?: number;
  cumulativeBonusRaw?: number;
  cumulativeXpRaw?: number;
  baseIncomeAmount?: number;
  collectionMode?: ExcessBaseWebCollectionMode;
} | null;

export type ClearExcessWebResult = {
  excessSeconds: number;
  excess: EconomyV2ExcessPublicState;
  session: EconomyV2ExcessSessionPublicState;
  clearedWebId: string;
  reward: ClearExcessWebReward;
  /** Version=2: progress-only delta (zeros). Legacy: null. */
  rewardDelta: ClearExcessWebRewardDelta;
  playerXp: number;
  playerLevel: number;
  balances: { balance: number; earned: number };
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

function parseMoney(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function parseXp(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1 || raw === "1";
}

/**
 * Atomically clear one web id.
 * Version=2: record cleared id only. Legacy: credit reward share.
 */
export async function clearEconomyV2ExcessWeb(
  userId: string | number,
  webIdRaw: unknown,
  nowMs: number = Date.now(),
): Promise<ClearExcessWebResult> {
  return withTx(async (client) => {
    await client.query(
      `SELECT active_balance FROM accounts WHERE user_id = $1 FOR UPDATE`,
      [String(userId)],
    );

    const gameRow = await client.query(
      `SELECT v2_excess_seconds,
              v2_excess_elapsed_ms,
              v2_excess_base_income,
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
              v2_excess_session_xp_awarded,
              v2_excess_session_gross_income,
              v2_excess_session_paid_income,
              v2_excess_session_payment_factor,
              v2_excess_session_income_applied,
              v2_excess_session_finish_reason,
              v2_excess_session_final_cleared_count,
              v2_excess_session_final_web_count,
              v2_excess_session_skill,
              v2_excess_session_xp_max,
              v2_excess_session_xp_raw,
              v2_excess_session_xp_applied,
              v2_excess_session_bonus_raw_unlocked,
              tutorial_done,
              v2_freshness
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      throw new EconomyV2ExcessSessionError(404, "not_found", "Game state not found");
    }

    const row = gameRow.rows[0] as Record<string, unknown>;
    const active = asBool(row.v2_excess_session_active);

    if (!active) {
      if (row.v2_excess_session_finished_at != null) {
        throw new EconomyV2ExcessSessionError(
          409,
          "excess_session_finished",
          "Metelka session already finished",
        );
      }
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_session_not_active",
        "No active excess Metelka session",
      );
    }

    const isV2 = isExcessSessionVersion2(row.v2_excess_session_version);
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
    const layoutSeed =
      row.v2_excess_session_layout_seed == null
        ? null
        : parseInt(String(row.v2_excess_session_layout_seed), 10);

    if (
      webCount == null ||
      !Number.isFinite(webCount) ||
      webCount <= 0 ||
      layoutSeed == null ||
      !Number.isFinite(layoutSeed) ||
      presetSeconds == null
    ) {
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_session_not_active",
        "Active session is missing web layout",
      );
    }

    if (isExcessSessionTimeExpired(startedAt, presetSeconds, nowMs)) {
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_session_time_expired",
        "Metelka session time has expired",
      );
    }

    const validated = validateExcessWebId(webIdRaw, webCount);
    if (validated == null) {
      throw new EconomyV2ExcessSessionError(
        400,
        "invalid_excess_web_id",
        "Invalid excess web id",
      );
    }

    if (isV2) {
      return clearV2Web(client, userId, row, validated, webCount);
    }
    return clearLegacyWeb(
      client,
      userId,
      row,
      validated,
      webCount,
      presetSeconds,
    );
  });
}

/**
 * Version=2: record cleared white web only. No awards.
 * Red / special ids are rejected (not part of active layout).
 */
async function clearV2Web(
  client: EconomyV2DbClient,
  userId: string | number,
  row: Record<string, unknown>,
  validated: number | "base_income" | "special",
  webCount: number,
): Promise<ClearExcessWebResult> {
  if (validated === "special" || validated === "base_income") {
    throw new EconomyV2ExcessSessionError(
      400,
      "invalid_excess_web_id",
      "Invalid excess web id",
    );
  }

  const webIndex = validated as number;
  const webId = `web-${webIndex}`;
  const clearedIds = parseClearedExcessWebIds(
    row.v2_excess_session_cleared_web_ids,
  );
  if (isExcessWebCleared(webId, clearedIds)) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_web_already_cleared",
      "This web was already cleared",
    );
  }
  const nextCleared = appendClearedExcessWebId(clearedIds, webId);
  const clearedWhiteAfter = countRegularClearedWebs(nextCleared, webCount);

  const updated = await client.query(
    `UPDATE game_state
     SET v2_excess_session_cleared_web_ids = $2,
         updated_at = NOW()
     WHERE user_id = $1
       AND v2_excess_session_active = TRUE
       AND NOT ($3 = ANY(COALESCE(v2_excess_session_cleared_web_ids, '{}')))
     RETURNING *`,
    [String(userId), nextCleared, webId],
  );
  if (updated.rows.length === 0) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_web_already_cleared",
      "This web was already cleared",
    );
  }

  return buildClearResult(
    client,
    userId,
    updated.rows[0] as Record<string, unknown>,
    webId,
    { kind: "progress", xpGained: 0, moneyGained: 0 },
    {
      kind: "progress",
      bonusRawDelta: 0,
      xpRawDelta: 0,
      clearedWhiteCount: clearedWhiteAfter,
      whiteWebCount: webCount,
    },
  );
}

async function clearLegacyWeb(
  client: EconomyV2DbClient,
  userId: string | number,
  row: Record<string, unknown>,
  validated: number | "base_income" | "special",
  webCount: number,
  presetSeconds: number,
): Promise<ClearExcessWebResult> {
  // Legacy: base-income-web is not part of old sessions.
  if (validated === "base_income") {
    throw new EconomyV2ExcessSessionError(
      400,
      "invalid_excess_web_id",
      "Invalid excess web id",
    );
  }
  const webId =
    validated === "special" ? EXCESS_SPECIAL_WEB_ID : `web-${validated}`;
  const kind = isExcessSpecialWebId(webId) ? "special" : "regular";

  const clearedIds = parseClearedExcessWebIds(
    row.v2_excess_session_cleared_web_ids,
  );
  if (isExcessWebCleared(webId, clearedIds)) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_web_already_cleared",
      "This web was already cleared",
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
  const bonusPool = gross * 0.5;

  const xpAwardedBefore = parseXp(row.v2_excess_session_xp_awarded);
  const paidBefore = parseMoney(row.v2_excess_session_paid_income);
  const specialWasCleared = isSpecialWebCleared(clearedIds);
  const bonusPaidBefore = specialWasCleared
    ? Math.max(0, paidBefore - roundMoneyToKopecks(guaranteed))
    : paidBefore;

  let deltaXp = 0;
  let deltaMoney = 0;
  let xpAwardedAfter = xpAwardedBefore;
  let paidAfter = paidBefore;

  const nextCleared = appendClearedExcessWebId(clearedIds, webId);

  if (kind === "special") {
    deltaMoney = computeSpecialWebIncomeDelta({
      guaranteed,
      specialAlreadyPaid: specialWasCleared,
    });
    paidAfter = roundMoneyToKopecks(paidBefore + deltaMoney);
  } else {
    const regularAfter = countRegularClearedWebs(nextCleared, webCount);
    const xp = computeRegularWebXpDelta({
      presetSeconds,
      webCount,
      regularClearedAfter: regularAfter,
      xpAwardedBefore,
    });
    deltaXp = xp.deltaXp;
    xpAwardedAfter = xp.xpAwardedAfter;
    const bonus = computeRegularWebBonusDelta({
      bonusPool,
      webCount,
      regularClearedAfter: regularAfter,
      bonusPaidBefore,
    });
    deltaMoney = bonus.deltaMoney;
    paidAfter = roundMoneyToKopecks(
      (specialWasCleared ? roundMoneyToKopecks(guaranteed) : 0) +
        bonus.bonusPaidAfter,
    );
  }

  const prevXp = parseXp(row.player_xp);
  const nextXp = prevXp + deltaXp;
  const nextLevel = calcPlayerLevel(nextXp);

  const updated = await client.query(
    `UPDATE game_state
     SET v2_excess_session_cleared_web_ids = $2,
         v2_excess_session_xp_awarded = $3,
         v2_excess_session_xp_max = $4,
         v2_excess_session_gross_income = $5,
         v2_excess_session_paid_income = $6,
         player_xp = $7,
         player_level = $8,
         updated_at = NOW()
     WHERE user_id = $1
       AND v2_excess_session_active = TRUE
       AND NOT ($9 = ANY(COALESCE(v2_excess_session_cleared_web_ids, '{}')))
     RETURNING *`,
    [
      String(userId),
      nextCleared,
      xpAwardedAfter,
      computeRegularWebXpDelta({
        presetSeconds,
        webCount,
        regularClearedAfter: webCount,
        xpAwardedBefore: 0,
      }).maxXp,
      gross > 0 ? gross : null,
      paidAfter,
      nextXp,
      nextLevel,
      webId,
    ],
  );

  if (updated.rows.length === 0) {
    throw new EconomyV2ExcessSessionError(
      409,
      "excess_web_already_cleared",
      "This web was already cleared",
    );
  }

  if (deltaMoney > 0) {
    await client.query(
      `UPDATE accounts
       SET active_balance = active_balance + $2,
           active_earned = active_earned + $2
       WHERE user_id = $1`,
      [String(userId), deltaMoney],
    );
    const earnedDate = new Date().toLocaleDateString("ru-RU");
    await client.query(
      `INSERT INTO income_history(user_id, amount, type, earned_date)
       VALUES($1, $2, 'excess', $3)`,
      [String(userId), deltaMoney, earnedDate],
    );
  }

  return buildClearResult(
    client,
    userId,
    updated.rows[0] as Record<string, unknown>,
    webId,
    {
      kind: kind === "special" ? "special" : "regular",
      xpGained: deltaXp,
      moneyGained: deltaMoney,
    },
    null,
  );
}

async function buildClearResult(
  client: EconomyV2DbClient,
  userId: string | number,
  outRow: Record<string, unknown>,
  webId: string,
  reward: ClearExcessWebReward,
  rewardDelta: ClearExcessWebRewardDelta,
): Promise<ClearExcessWebResult> {
  const excess = buildEconomyV2ExcessFromRow(outRow);
  const acc = await client.query(
    `SELECT active_balance, active_earned FROM accounts WHERE user_id = $1`,
    [String(userId)],
  );
  const nextLevel = calcPlayerLevel(parseXp(outRow.player_xp));
  return {
    excessSeconds: normalizeExcessSeconds(outRow.v2_excess_seconds),
    excess,
    session: excess.session,
    clearedWebId: webId,
    reward,
    rewardDelta,
    playerXp: parseXp(outRow.player_xp),
    playerLevel:
      outRow.player_level == null
        ? nextLevel
        : parseInt(String(outRow.player_level), 10) || nextLevel,
    balances: {
      balance: parseMoney(acc.rows[0]?.active_balance),
      earned: parseMoney(acc.rows[0]?.active_earned),
    },
  };
}
