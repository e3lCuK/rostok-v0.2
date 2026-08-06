/**
 * Economy v3 Care cycle finish — confirm the completed trio and store totals.
 * No rewards / claim / cleanup.
 */

import { pool } from "@workspace/db";
import { loadCapitalForUser } from "./economy-v2-energy-settle";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  buildEconomyV3RootsPublicState,
  finishEconomyV3CareCyclePure,
  parseEconomyV3Bool,
  parseNullableTimestampMs,
  parseV3CareActivityStatus,
  parseV3CareCycleStatus,
  parseV3CareSkill,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
} from "./economy-v3-roots";
import type { EconomyV3DbClient } from "./economy-v3-roots-settle";

export class EconomyV3CareFinishCycleError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3CareFinishCycleError";
    this.status = status;
    this.code = code;
  }
}

export type FinishEconomyV3CareCycleResponse = {
  finished: true;
  alreadyFinished: boolean;
  totalPresetSeconds: number;
  averageSkill: number;
  v3Roots: EconomyV3RootsPublicState;
};

const V3_CARE_FINISH_CYCLE_SELECT = `
  tutorial_done,
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

function parsePresetNullable(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function httpStatusForFinishCycleCode(code: string): number {
  switch (code) {
    case "care_cycle_not_complete":
    case "activity_session_pending":
      return 409;
    default:
      return 400;
  }
}

/**
 * Finish the Care cycle under FOR UPDATE after all three activities are done.
 */
export async function finishEconomyV3CareCycle(
  userId: string | number,
  nowMs: number = Date.now(),
): Promise<FinishEconomyV3CareCycleResponse> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3CareFinishCycleError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_CARE_FINISH_CYCLE_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareFinishCycleError(
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

    const finished = finishEconomyV3CareCyclePure({
      careSessionStatus: parseV3CareActivityStatus(
        locked.v3_care_activity_status,
      ),
      cycleStatus: parseV3CareCycleStatus(locked.v3_care_cycle_status),
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
      cycleFinishedAt: parseNullableTimestampMs(
        locked.v3_care_cycle_finished_at,
      ),
      totalPresetSeconds: parsePresetNullable(
        locked.v3_care_cycle_total_preset_seconds,
      ),
      averageSkill: parseV3CareSkill(locked.v3_care_cycle_average_skill),
      nowMs,
    });

    if (!finished.ok) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareFinishCycleError(
        httpStatusForFinishCycleCode(finished.code),
        finished.code,
        finished.message,
      );
    }

    if (!finished.alreadyFinished) {
      await client.query(
        `UPDATE game_state
         SET v3_care_cycle_status = $2,
             v3_care_cycle_finished_at = $3,
             v3_care_cycle_total_preset_seconds = $4,
             v3_care_cycle_average_skill = $5,
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          String(userId),
          finished.cycleStatus,
          new Date(finished.finishedAt),
          finished.totalPresetSeconds,
          finished.averageSkill,
        ],
      );

      locked.v3_care_cycle_status = finished.cycleStatus;
      locked.v3_care_cycle_finished_at = new Date(finished.finishedAt);
      locked.v3_care_cycle_total_preset_seconds = finished.totalPresetSeconds;
      locked.v3_care_cycle_average_skill = finished.averageSkill;
    }

    await client.query("COMMIT");

    return {
      finished: true,
      alreadyFinished: finished.alreadyFinished,
      totalPresetSeconds: finished.totalPresetSeconds,
      averageSkill: finished.averageSkill,
      v3Roots: buildEconomyV3RootsPublicState(locked, { capital }),
    };
  } catch (err) {
    if (!(err instanceof EconomyV3CareFinishCycleError)) {
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
