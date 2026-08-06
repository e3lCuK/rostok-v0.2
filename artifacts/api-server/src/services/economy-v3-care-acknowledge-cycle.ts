/**
 * Economy v3 Care cycle acknowledge — clear a finished cycle journal.
 * Does not change reserves, roots, generation, or award rewards.
 */

import { pool } from "@workspace/db";
import { loadCapitalForUser } from "./economy-v2-energy-settle";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  acknowledgeEconomyV3CareCyclePure,
  buildEconomyV3RootsPublicState,
  parseNullableTimestampMs,
  parseV3CareActivityStatus,
  parseV3CareCycleStatus,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
} from "./economy-v3-roots";
import type { EconomyV3DbClient } from "./economy-v3-roots-settle";

export class EconomyV3CareAcknowledgeCycleError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3CareAcknowledgeCycleError";
    this.status = status;
    this.code = code;
  }
}

export type AcknowledgeEconomyV3CareCycleResponse = {
  acknowledged: true;
  v3Roots: EconomyV3RootsPublicState;
};

const V3_CARE_ACK_CYCLE_SELECT = `
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

function httpStatusForAckCycleCode(code: string): number {
  switch (code) {
    case "care_cycle_not_finished":
    case "care_cycle_not_claimed":
    case "activity_session_pending":
      return 409;
    default:
      return 400;
  }
}

/**
 * Clear a finished Care cycle under FOR UPDATE.
 */
export async function acknowledgeEconomyV3CareCycle(
  userId: string | number,
): Promise<AcknowledgeEconomyV3CareCycleResponse> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3CareAcknowledgeCycleError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_CARE_ACK_CYCLE_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareAcknowledgeCycleError(
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

    const acked = acknowledgeEconomyV3CareCyclePure({
      careSessionStatus: parseV3CareActivityStatus(
        locked.v3_care_activity_status,
      ),
      cycleStatus: parseV3CareCycleStatus(locked.v3_care_cycle_status),
      cycleClaimed:
        parseNullableTimestampMs(locked.v3_care_cycle_claimed_at) != null,
    });

    if (!acked.ok) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareAcknowledgeCycleError(
        httpStatusForAckCycleCode(acked.code),
        acked.code,
        acked.message,
      );
    }

    await client.query(
      `UPDATE game_state
       SET v3_care_cycle_water_completed = FALSE,
           v3_care_cycle_water_preset_seconds = NULL,
           v3_care_cycle_water_skill = NULL,
           v3_care_cycle_sun_completed = FALSE,
           v3_care_cycle_sun_preset_seconds = NULL,
           v3_care_cycle_sun_skill = NULL,
           v3_care_cycle_fertilizer_completed = FALSE,
           v3_care_cycle_fertilizer_preset_seconds = NULL,
           v3_care_cycle_fertilizer_skill = NULL,
           v3_care_cycle_started_at = NULL,
           v3_care_cycle_completed_at = NULL,
           v3_care_cycle_finished_at = NULL,
           v3_care_cycle_status = NULL,
           v3_care_cycle_total_preset_seconds = NULL,
           v3_care_cycle_average_skill = NULL,
           v3_care_cycle_claimed_at = NULL,
           v3_care_cycle_claimed_xp = NULL,
           v3_care_cycle_claimed_tree_growth = NULL,
           v3_care_cycle_claimed_base_income = NULL,
           v3_care_cycle_claimed_bonus_income = NULL,
           v3_care_cycle_claimed_total_income = NULL,
           v3_care_activity_kind = NULL,
           v3_care_activity_preset_seconds = NULL,
           v3_care_activity_started_at = NULL,
           v3_care_activity_finished_at = NULL,
           v3_care_activity_status = NULL,
           v3_care_activity_skill = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [String(userId)],
    );

    locked.v3_care_cycle_water_completed = false;
    locked.v3_care_cycle_water_preset_seconds = null;
    locked.v3_care_cycle_water_skill = null;
    locked.v3_care_cycle_sun_completed = false;
    locked.v3_care_cycle_sun_preset_seconds = null;
    locked.v3_care_cycle_sun_skill = null;
    locked.v3_care_cycle_fertilizer_completed = false;
    locked.v3_care_cycle_fertilizer_preset_seconds = null;
    locked.v3_care_cycle_fertilizer_skill = null;
    locked.v3_care_cycle_started_at = null;
    locked.v3_care_cycle_completed_at = null;
    locked.v3_care_cycle_finished_at = null;
    locked.v3_care_cycle_status = null;
    locked.v3_care_cycle_total_preset_seconds = null;
    locked.v3_care_cycle_average_skill = null;
    locked.v3_care_cycle_claimed_at = null;
    locked.v3_care_cycle_claimed_xp = null;
    locked.v3_care_cycle_claimed_tree_growth = null;
    locked.v3_care_cycle_claimed_base_income = null;
    locked.v3_care_cycle_claimed_bonus_income = null;
    locked.v3_care_cycle_claimed_total_income = null;
    locked.v3_care_activity_kind = null;
    locked.v3_care_activity_preset_seconds = null;
    locked.v3_care_activity_started_at = null;
    locked.v3_care_activity_finished_at = null;
    locked.v3_care_activity_status = null;
    locked.v3_care_activity_skill = null;

    await client.query("COMMIT");

    return {
      acknowledged: true,
      v3Roots: buildEconomyV3RootsPublicState(locked, { capital }),
    };
  } catch (err) {
    if (!(err instanceof EconomyV3CareAcknowledgeCycleError)) {
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
