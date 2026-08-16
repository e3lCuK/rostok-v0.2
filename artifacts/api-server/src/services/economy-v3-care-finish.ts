/**
 * Economy v3 Care activity finish — store skill, mark session completed,
 * and record the result in the Care cycle journal.
 */

import { pool } from "@workspace/db";
import {
  computeIncomeForOneGame,
} from "./economy-v2-care-income";
import {
  isEconomyV2TutorialActive,
  loadCapitalForUser,
} from "./economy-v2-energy-settle";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  buildEconomyV3RootsPublicState,
  finishEconomyV3CareActivityPure,
  parseEconomyV3Bool,
  parseNullableTimestampMs,
  parseV3CareActivityStatus,
  parseV3CareCycleStatus,
  parseV3CareSkill,
  recordCareCycleFinishPure,
  validateRootKind,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
  type RootKind,
} from "./economy-v3-roots";
import type { EconomyV3DbClient } from "./economy-v3-roots-settle";

export class EconomyV3CareFinishError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3CareFinishError";
    this.status = status;
    this.code = code;
  }
}

export type FinishEconomyV3CareActivityIncome = {
  base: number;
  bonus: number;
  total: number;
  presetSeconds: number;
};

export type FinishEconomyV3CareActivityResponse = {
  finished: true;
  alreadyCompleted: boolean;
  activity: RootKind;
  skill: number;
  /**
   * Calculated on first successful finish and stored as pending.
   * Balance is NOT credited here — coin / claimAll credits later.
   * Zeros on idempotent replay.
   */
  income: FinishEconomyV3CareActivityIncome;
  /** Unchanged balance (money stays pending until claimAll). */
  balances: { balance: number; earned: number };
  treeGrowthMM: number;
  pendingBaseReward: number;
  pendingBonusReward: number;
  v3Roots: EconomyV3RootsPublicState;
};

const V3_CARE_FINISH_SELECT = `
  tutorial_done,
  streak_days,
  tree_growth_mm,
  tree_growth_remainder,
  pending_base_reward,
  pending_bonus_reward,
  v2_freshness,
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

function httpStatusForFinishCode(code: string): number {
  switch (code) {
    case "unknown_activity":
    case "invalid_skill":
      return 400;
    case "activity_mismatch":
    case "no_active_activity":
      return 409;
    default:
      return 400;
  }
}

function parsePresetNullable(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function catchCounterColumn(activity: RootKind): string {
  switch (activity) {
    case "water":
      return "total_water_drops";
    case "sun":
      return "total_sun_catches";
    case "fertilizer":
      return "total_leaf_picks";
  }
}

/** Items caught in the minigame — counts toward catch achievements (incl. tutorial). */
function parseCollectedCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 10_000) {
    return Math.round(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 10_000) return n;
  }
  return 0;
}

/**
 * Finish the active v3 Care activity under FOR UPDATE.
 * Idempotent when the matching session is already completed.
 */
export async function finishEconomyV3CareActivity(
  userId: string | number,
  activityRaw: unknown,
  skillRaw: unknown,
  nowMs: number = Date.now(),
  collectedRaw: unknown = 0,
): Promise<FinishEconomyV3CareActivityResponse> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3CareFinishError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_CARE_FINISH_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareFinishError(
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

    const kindRaw = locked.v3_care_activity_kind;
    const careActivityKind =
      kindRaw != null && validateRootKind(kindRaw) ? kindRaw : null;

    const finished = finishEconomyV3CareActivityPure({
      activity: activityRaw,
      skill: skillRaw,
      careActivityKind,
      careActivityStatus: parseV3CareActivityStatus(
        locked.v3_care_activity_status,
      ),
      careActivityPresetSeconds: parsePresetNullable(
        locked.v3_care_activity_preset_seconds,
      ),
      careActivityStartedAt: parseNullableTimestampMs(
        locked.v3_care_activity_started_at,
      ),
      careActivitySkill: parseV3CareSkill(locked.v3_care_activity_skill),
      careActivityFinishedAt: parseNullableTimestampMs(
        locked.v3_care_activity_finished_at,
      ),
      nowMs,
    });

    if (!finished.ok) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareFinishError(
        httpStatusForFinishCode(finished.code),
        finished.code,
        finished.message,
      );
    }

    const cycle = recordCareCycleFinishPure({
      activity: finished.activity,
      presetSeconds: finished.presetSeconds,
      skill: finished.skill,
      nowMs: finished.finishedAt,
      waterCompleted: parseEconomyV3Bool(locked.v3_care_cycle_water_completed),
      waterPresetSeconds: parsePresetNullable(
        locked.v3_care_cycle_water_preset_seconds,
      ),
      waterSkill: parseV3CareSkill(locked.v3_care_cycle_water_skill),
      sunCompleted: parseEconomyV3Bool(locked.v3_care_cycle_sun_completed),
      sunPresetSeconds: parsePresetNullable(
        locked.v3_care_cycle_sun_preset_seconds,
      ),
      sunSkill: parseV3CareSkill(locked.v3_care_cycle_sun_skill),
      fertilizerCompleted: parseEconomyV3Bool(
        locked.v3_care_cycle_fertilizer_completed,
      ),
      fertilizerPresetSeconds: parsePresetNullable(
        locked.v3_care_cycle_fertilizer_preset_seconds,
      ),
      fertilizerSkill: parseV3CareSkill(locked.v3_care_cycle_fertilizer_skill),
      cycleCompletedAt: parseNullableTimestampMs(
        locked.v3_care_cycle_completed_at,
      ),
      cycleStatus: parseV3CareCycleStatus(locked.v3_care_cycle_status),
    });

    if (!finished.alreadyCompleted || cycle.recorded) {
      await client.query(
        `UPDATE game_state
         SET v3_care_activity_skill = $2,
             v3_care_activity_finished_at = $3,
             v3_care_activity_status = $4,
             v3_care_cycle_water_completed = $5,
             v3_care_cycle_water_preset_seconds = $6,
             v3_care_cycle_water_skill = $7,
             v3_care_cycle_sun_completed = $8,
             v3_care_cycle_sun_preset_seconds = $9,
             v3_care_cycle_sun_skill = $10,
             v3_care_cycle_fertilizer_completed = $11,
             v3_care_cycle_fertilizer_preset_seconds = $12,
             v3_care_cycle_fertilizer_skill = $13,
             v3_care_cycle_completed_at = $14,
             v3_care_cycle_status = $15,
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          String(userId),
          finished.skill,
          new Date(finished.finishedAt),
          finished.careActivityStatus,
          cycle.waterCompleted,
          cycle.waterPresetSeconds,
          cycle.waterSkill,
          cycle.sunCompleted,
          cycle.sunPresetSeconds,
          cycle.sunSkill,
          cycle.fertilizerCompleted,
          cycle.fertilizerPresetSeconds,
          cycle.fertilizerSkill,
          cycle.cycleCompletedAt == null
            ? null
            : new Date(cycle.cycleCompletedAt),
          cycle.cycleStatus,
        ],
      );

      locked.v3_care_activity_skill = finished.skill;
      locked.v3_care_activity_finished_at = new Date(finished.finishedAt);
      locked.v3_care_activity_status = finished.careActivityStatus;
      locked.v3_care_cycle_water_completed = cycle.waterCompleted;
      locked.v3_care_cycle_water_preset_seconds = cycle.waterPresetSeconds;
      locked.v3_care_cycle_water_skill = cycle.waterSkill;
      locked.v3_care_cycle_sun_completed = cycle.sunCompleted;
      locked.v3_care_cycle_sun_preset_seconds = cycle.sunPresetSeconds;
      locked.v3_care_cycle_sun_skill = cycle.sunSkill;
      locked.v3_care_cycle_fertilizer_completed = cycle.fertilizerCompleted;
      locked.v3_care_cycle_fertilizer_preset_seconds =
        cycle.fertilizerPresetSeconds;
      locked.v3_care_cycle_fertilizer_skill = cycle.fertilizerSkill;
      locked.v3_care_cycle_completed_at =
        cycle.cycleCompletedAt == null
          ? null
          : new Date(cycle.cycleCompletedAt);
      locked.v3_care_cycle_status = cycle.cycleStatus;
    }

    const presetSeconds =
      typeof finished.presetSeconds === "number" &&
      Number.isFinite(finished.presetSeconds)
        ? Math.max(0, Math.floor(finished.presetSeconds))
        : 0;

    let income: FinishEconomyV3CareActivityIncome = {
      base: 0,
      bonus: 0,
      total: 0,
      presetSeconds,
    };
    let treeGrowthMM =
      typeof locked.tree_growth_mm === "number"
        ? locked.tree_growth_mm
        : parseInt(String(locked.tree_growth_mm ?? "0"), 10) || 0;
    let balance = capital;
    let earned = capital;

    const accRow = await client.query(
      `SELECT active_balance::float8 AS balance, active_earned::float8 AS earned
       FROM accounts WHERE user_id = $1 FOR UPDATE`,
      [String(userId)],
    );
    if (accRow.rows.length > 0) {
      const row = accRow.rows[0] as {
        balance?: unknown;
        earned?: unknown;
        active_balance?: unknown;
        active_earned?: unknown;
      };
      balance =
        Number(row.balance ?? row.active_balance) || capital;
      earned = Number(row.earned ?? row.active_earned) || 0;
    }

    // First successful finish: calculate income into pending (do not credit balance).
    // Coin click → claimAll applies pending to accounts + history (mm is Care claim).
    // Tutorial (trusted tutorial_done === false): compute for response only — never persist.
    let pendingBase =
      parseFloat(String(locked.pending_base_reward ?? "0")) || 0;
    let pendingBonus =
      parseFloat(String(locked.pending_bonus_reward ?? "0")) || 0;
    const tutorialActive = isEconomyV2TutorialActive(locked.tutorial_done);
    const itemCount = parseCollectedCount(collectedRaw);

    if (!finished.alreadyCompleted) {
      // Catch counters always count (including tutorial) for achievements.
      if (itemCount > 0) {
        const counterCol = catchCounterColumn(finished.activity);
        await client.query(
          `UPDATE game_state
           SET ${counterCol} = COALESCE(${counterCol}, 0) + $2,
               updated_at = NOW()
           WHERE user_id = $1`,
          [String(userId), itemCount],
        );
      }

      const freshnessRaw = (locked as { v2_freshness?: unknown }).v2_freshness;
      const freshness =
        freshnessRaw != null && Number.isFinite(Number(freshnessRaw))
          ? Number(freshnessRaw)
          : 1;
      const awarded = computeIncomeForOneGame({
        capital: balance,
        presetSeconds,
        skill: finished.skill,
        freshness,
      });
      income = {
        base: awarded.base,
        bonus: awarded.bonus,
        total: awarded.total,
        presetSeconds,
      };

      if (
        !tutorialActive &&
        (awarded.base > 0 || awarded.bonus > 0)
      ) {
        pendingBase += awarded.base;
        pendingBonus += awarded.bonus;
        await client.query(
          `UPDATE game_state
           SET pending_base_reward = $2,
               pending_bonus_reward = $3,
               updated_at = NOW()
           WHERE user_id = $1`,
          [String(userId), pendingBase, pendingBonus],
        );
        locked.pending_base_reward = pendingBase;
        locked.pending_bonus_reward = pendingBonus;
      }
    }

    await client.query("COMMIT");

    return {
      finished: true,
      alreadyCompleted: finished.alreadyCompleted,
      activity: finished.activity,
      skill: finished.skill,
      income,
      balances: { balance, earned },
      treeGrowthMM,
      pendingBaseReward: pendingBase,
      pendingBonusReward: pendingBonus,
      v3Roots: buildEconomyV3RootsPublicState(locked, {
        capital: balance,
      }),
    };
  } catch (err) {
    if (!(err instanceof EconomyV3CareFinishError)) {
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
