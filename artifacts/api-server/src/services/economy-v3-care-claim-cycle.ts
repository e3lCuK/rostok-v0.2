/**
 * Economy v3 Care cycle claim — apply XP once under FOR UPDATE.
 * Money is awarded on finish-activity (per completed mini-game). Apples stay 0.
 */

import { pool } from "@workspace/db";
import {
  isEconomyV2TutorialActive,
  loadCapitalForUser,
} from "./economy-v2-energy-settle";
import { calcPlayerLevel } from "./economy-v2-care-xp";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  buildEconomyV3RootsPublicState,
  buildV3CareCycle,
  claimEconomyV3CareCyclePure,
  parseNullableTimestampMs,
  parseV3CareActivityStatus,
  parseV3CareCycleStatus,
  type ClaimEconomyV3CareCycleSnapshot,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
} from "./economy-v3-roots";
import type { EconomyV3DbClient } from "./economy-v3-roots-settle";

export class EconomyV3CareClaimCycleError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3CareClaimCycleError";
    this.status = status;
    this.code = code;
  }
}

export type ClaimEconomyV3CareCycleResponse = {
  claimed: true;
  alreadyClaimed: boolean;
  xp: number;
  treeGrowth: number;
  income: { base: number; bonus: number; total: number };
  playerXp: number;
  playerLevel: number;
  pendingBaseReward: number;
  pendingBonusReward: number;
  totalApples: number;
  treeGrowthMm: number;
  v3Roots: EconomyV3RootsPublicState;
};

const V3_CARE_CLAIM_CYCLE_SELECT = `
  tutorial_done,
  player_xp,
  player_level,
  pending_base_reward,
  pending_bonus_reward,
  total_apples,
  tree_growth_mm,
  v3_root_water_seconds,
  v3_root_sun_seconds,
  v3_root_fertilizer_seconds,
  v3_reserve_water_seconds,
  v3_reserve_sun_seconds,
  v3_reserve_fertilizer_seconds,
  v3_daily_cap_seconds,
  v3_day_key,
  v3_generation_anchor_at,
  v3_generation_frozen_at,
  v3_insurance_deadline_at,
  v3_generation_progress,
  v3_generation_rr_cursor,
  v3_first_transferred_root,
  v3_transferred_roots,
  ${V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS.trim()}
`;

function httpStatusForClaimCycleCode(code: string): number {
  switch (code) {
    case "care_cycle_not_finished":
    case "activity_session_pending":
    case "reward_preview_unavailable":
      return 409;
    default:
      return 400;
  }
}

function asFloat(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function asInt(raw: unknown): number {
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function readStoredClaim(
  row: EconomyV3RootsRow,
): ClaimEconomyV3CareCycleSnapshot | null {
  const claimedAt = parseNullableTimestampMs(row.v3_care_cycle_claimed_at);
  if (claimedAt == null) return null;
  return {
    claimedAt,
    xp: asInt(row.v3_care_cycle_claimed_xp),
    treeGrowth: asInt(row.v3_care_cycle_claimed_tree_growth),
    income: {
      base: asFloat(row.v3_care_cycle_claimed_base_income),
      bonus: asFloat(row.v3_care_cycle_claimed_bonus_income),
      total: asFloat(row.v3_care_cycle_claimed_total_income),
    },
  };
}

/**
 * Claim finished Care cycle rewards under FOR UPDATE.
 * Applies XP + pending income once; does not grow the tree or award apples.
 */
export async function claimEconomyV3CareCycle(
  userId: string | number,
  nowMs: number = Date.now(),
): Promise<ClaimEconomyV3CareCycleResponse> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3CareClaimCycleError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_CARE_CLAIM_CYCLE_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareClaimCycleError(
        404,
        "not_found",
        "Game state not found",
      );
    }

    const locked = gameRow.rows[0] as EconomyV3RootsRow;
    const capital = await loadCapitalForUser(
      client as EconomyV3DbClient,
      userId,
    );
    const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();

    const careCycle = buildV3CareCycle(locked, { capital, nowMs: now });
    const storedClaim = readStoredClaim(locked);

    const decided = claimEconomyV3CareCyclePure({
      careSessionStatus: parseV3CareActivityStatus(
        locked.v3_care_activity_status,
      ),
      cycleStatus: parseV3CareCycleStatus(locked.v3_care_cycle_status),
      cycleClaimedAt: parseNullableTimestampMs(locked.v3_care_cycle_claimed_at),
      storedClaim,
      rewardPreviewAvailable: careCycle.rewardPreview.available,
      rewardPreview: careCycle.rewardPreview,
      nowMs: now,
    });

    if (!decided.ok) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareClaimCycleError(
        httpStatusForClaimCycleCode(decided.code),
        decided.code,
        decided.message,
      );
    }

    let playerXp = asInt(locked.player_xp);
    let playerLevel = asInt(locked.player_level) || 1;
    let pendingBase = asFloat(locked.pending_base_reward);
    let pendingBonus = asFloat(locked.pending_bonus_reward);
    const totalApples = asInt(locked.total_apples);
    const treeGrowthMm = asInt(locked.tree_growth_mm);
    const snapshot = decided.snapshot;
    const tutorialActive = isEconomyV2TutorialActive(locked.tutorial_done);

    if (decided.applyAwards) {
      const claimedAtMs = Math.trunc(Number(snapshot.claimedAt));
      const claimedAtDate = new Date(claimedAtMs);

      if (tutorialActive) {
        // Mark cycle claimed for idempotency — do not persist XP / income / anchors.
        await client.query(
          `UPDATE game_state
           SET v3_care_cycle_claimed_at = $2,
               v3_care_cycle_claimed_xp = 0,
               v3_care_cycle_claimed_tree_growth = 0,
               v3_care_cycle_claimed_base_income = 0,
               v3_care_cycle_claimed_bonus_income = 0,
               v3_care_cycle_claimed_total_income = 0,
               updated_at = NOW()
           WHERE user_id = $1`,
          [String(userId), claimedAtDate],
        );
        locked.v3_care_cycle_claimed_at = claimedAtDate;
        locked.v3_care_cycle_claimed_xp = 0;
        locked.v3_care_cycle_claimed_tree_growth = 0;
        locked.v3_care_cycle_claimed_base_income = 0;
        locked.v3_care_cycle_claimed_bonus_income = 0;
        locked.v3_care_cycle_claimed_total_income = 0;
      } else {
        playerXp = playerXp + snapshot.xp;
        playerLevel = calcPlayerLevel(playerXp);
        // Money is pending until coin / claimAll. Claim only grants XP.

        await client.query(
          `UPDATE game_state
           SET player_xp = $2,
               player_level = $3,
               v3_care_cycle_claimed_at = $4,
               v3_care_cycle_claimed_xp = $5,
               v3_care_cycle_claimed_tree_growth = $6,
               v3_care_cycle_claimed_base_income = $7,
               v3_care_cycle_claimed_bonus_income = $8,
               v3_care_cycle_claimed_total_income = $9,
               v2_income_anchor_at = $10,
               v2_ordinary_income_elapsed_ms = 0,
               updated_at = NOW()
           WHERE user_id = $1`,
          [
            String(userId),
            playerXp,
            playerLevel,
            claimedAtDate,
            snapshot.xp,
            snapshot.treeGrowth,
            snapshot.income.base,
            snapshot.income.bonus,
            snapshot.income.total,
            claimedAtMs,
          ],
        );

        locked.player_xp = playerXp;
        locked.player_level = playerLevel;
        locked.v3_care_cycle_claimed_at = claimedAtDate;
        locked.v3_care_cycle_claimed_xp = snapshot.xp;
        locked.v3_care_cycle_claimed_tree_growth = snapshot.treeGrowth;
        locked.v3_care_cycle_claimed_base_income = snapshot.income.base;
        locked.v3_care_cycle_claimed_bonus_income = snapshot.income.bonus;
        locked.v3_care_cycle_claimed_total_income = snapshot.income.total;
        locked.v2_income_anchor_at = claimedAtMs;
        locked.v2_ordinary_income_elapsed_ms = 0;
      }
    }

    await client.query("COMMIT");

    const responseXp = tutorialActive && decided.applyAwards ? 0 : snapshot.xp;
    const responseTree =
      tutorialActive && decided.applyAwards ? 0 : snapshot.treeGrowth;
    const responseIncome =
      tutorialActive && decided.applyAwards
        ? { base: 0, bonus: 0, total: 0 }
        : { ...snapshot.income };

    return {
      claimed: true,
      alreadyClaimed: decided.alreadyClaimed,
      xp: responseXp,
      treeGrowth: responseTree,
      income: responseIncome,
      playerXp,
      playerLevel,
      pendingBaseReward: pendingBase,
      pendingBonusReward: pendingBonus,
      totalApples,
      treeGrowthMm,
      v3Roots: buildEconomyV3RootsPublicState(locked, {
        capital,
        nowMs: now,
      }),
    };
  } catch (err) {
    if (!(err instanceof EconomyV3CareClaimCycleError)) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
    }
    throw err;
  } finally {
    client.release();
  }
}
