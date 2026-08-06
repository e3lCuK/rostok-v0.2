/**
 * Claim Metelka pending reward — balance + XP + income_history; no tree growth.
 */

import { pool } from "@workspace/db";
import { roundMoneyToKopecks } from "./economy-v2-care-income";
import { calcPlayerLevel } from "./economy-v2-care-xp";
import { EconomyV2ExcessSessionError } from "./economy-v2-excess-session";
import type { EconomyV2DbClient } from "./economy-v2-energy-settle";
import {
  type MetelkaPendingRewardPublic,
} from "./economy-v2-excess-metelka-pending";

export type ClaimMetelkaPendingRewardResult = {
  success: true;
  reward: {
    baseAmount: number;
    bonusAmount: number;
    totalAmount: number;
    xpAmount: number;
    claimedAt: number;
    claimToken: string;
  };
  moneyGained: number;
  xpGained: number;
  balances: { balance: number; earned: number };
  playerXp: number;
  playerLevel: number;
  metelkaPendingReward: MetelkaPendingRewardPublic;
};

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1 || raw === "1";
}

function parseMoney(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function parsePlayerXp(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function parsePendingXp(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
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

function normalizeClaimToken(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/**
 * Atomically claim an active Metelka pending reward by claimToken.
 * Credits accounts + XP + income_history; closes pending. No tree growth.
 */
export async function claimMetelkaPendingReward(
  userId: string | number,
  claimTokenRaw: unknown,
  nowMs: number = Date.now(),
): Promise<ClaimMetelkaPendingRewardResult> {
  const claimToken = normalizeClaimToken(claimTokenRaw);
  if (claimToken == null) {
    throw new EconomyV2ExcessSessionError(
      400,
      "invalid_metelka_claim_token",
      "Invalid Metelka claim token",
    );
  }

  return withTx(async (client) => {
    await client.query(
      `SELECT active_balance FROM accounts WHERE user_id = $1 FOR UPDATE`,
      [String(userId)],
    );

    const gameRow = await client.query(
      `SELECT player_xp,
              player_level,
              tree_growth_mm,
              tree_growth_remainder,
              metelka_pending_active,
              metelka_pending_base,
              metelka_pending_bonus,
              metelka_pending_xp,
              metelka_pending_created_at,
              metelka_pending_claim_token,
              metelka_pending_claimed_at
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      throw new EconomyV2ExcessSessionError(404, "not_found", "Game state not found");
    }

    const row = gameRow.rows[0] as Record<string, unknown>;
    const storedToken =
      row.metelka_pending_claim_token == null
        ? null
        : String(row.metelka_pending_claim_token);
    const alreadyClaimed =
      row.metelka_pending_claimed_at != null ||
      (!asBool(row.metelka_pending_active) && storedToken != null);

    if (!asBool(row.metelka_pending_active)) {
      if (alreadyClaimed && storedToken === claimToken) {
        throw new EconomyV2ExcessSessionError(
          409,
          "metelka_pending_reward_already_claimed",
          "Metelka reward was already claimed",
        );
      }
      throw new EconomyV2ExcessSessionError(
        409,
        "metelka_pending_reward_not_found",
        "No active Metelka reward to claim",
      );
    }

    if (storedToken == null || storedToken !== claimToken) {
      throw new EconomyV2ExcessSessionError(
        400,
        "invalid_metelka_claim_token",
        "Invalid Metelka claim token",
      );
    }

    const baseAmount = roundMoneyToKopecks(
      Math.max(0, parseMoney(row.metelka_pending_base)),
    );
    const bonusAmount = roundMoneyToKopecks(
      Math.max(0, parseMoney(row.metelka_pending_bonus)),
    );
    const xpAmount = parsePendingXp(row.metelka_pending_xp);
    const totalAmount = roundMoneyToKopecks(baseAmount + bonusAmount);

    if (baseAmount < 0 || bonusAmount < 0 || xpAmount < 0) {
      throw new EconomyV2ExcessSessionError(
        409,
        "metelka_pending_reward_not_found",
        "Metelka reward amounts are invalid",
      );
    }

    const prevXp = parsePlayerXp(row.player_xp);
    const nextXp = prevXp + xpAmount;
    const nextLevel = calcPlayerLevel(nextXp);

    // Atomic close gate — only one concurrent claim wins.
    const closed = await client.query(
      `UPDATE game_state
       SET metelka_pending_active = FALSE,
           metelka_pending_claimed_at = $2,
           player_xp = $3,
           player_level = $4,
           updated_at = NOW()
       WHERE user_id = $1
         AND metelka_pending_active = TRUE
         AND metelka_pending_claim_token = $5
         AND metelka_pending_claimed_at IS NULL
       RETURNING metelka_pending_active,
                 metelka_pending_base,
                 metelka_pending_bonus,
                 metelka_pending_xp,
                 metelka_pending_created_at,
                 metelka_pending_claim_token,
                 metelka_pending_claimed_at,
                 player_xp,
                 player_level,
                 tree_growth_mm,
                 tree_growth_remainder`,
      [String(userId), nowMs, nextXp, nextLevel, claimToken],
    );

    if (closed.rows.length === 0) {
      throw new EconomyV2ExcessSessionError(
        409,
        "metelka_pending_reward_already_claimed",
        "Metelka reward was already claimed",
      );
    }

    if (totalAmount > 0) {
      await client.query(
        `UPDATE accounts
         SET active_balance = active_balance + $2,
             active_earned = active_earned + $2
         WHERE user_id = $1`,
        [String(userId), totalAmount],
      );
      const earnedDate = new Date(nowMs).toLocaleDateString("ru-RU");
      await client.query(
        `INSERT INTO income_history(user_id, amount, type, earned_date)
         VALUES($1, $2, 'metelka', $3)`,
        [String(userId), totalAmount, earnedDate],
      );
    }

    const acc = await client.query(
      `SELECT active_balance, active_earned FROM accounts WHERE user_id = $1`,
      [String(userId)],
    );

    const metelkaPendingReward: MetelkaPendingRewardPublic = {
      active: false,
      baseAmount,
      bonusAmount,
      totalAmount,
      xpAmount,
      createdAt:
        row.metelka_pending_created_at == null
          ? null
          : parseInt(String(row.metelka_pending_created_at), 10) || null,
      claimToken,
      claimedAt: nowMs,
    };

    return {
      success: true,
      reward: {
        baseAmount,
        bonusAmount,
        totalAmount,
        xpAmount,
        claimedAt: nowMs,
        claimToken,
      },
      moneyGained: totalAmount,
      xpGained: xpAmount,
      balances: {
        balance: parseMoney(acc.rows[0]?.active_balance),
        earned: parseMoney(acc.rows[0]?.active_earned),
      },
      // Use computed post-UPDATE totals — do not re-parse a stale pre-update snapshot.
      playerXp: nextXp,
      playerLevel: nextLevel,
      metelkaPendingReward,
    };
  });
}
