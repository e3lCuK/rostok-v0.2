/**
 * Economy v3 Care activity acknowledge — clear a completed session.
 * Does not change reserves, roots, or award rewards.
 */

import { pool } from "@workspace/db";
import { loadCapitalForUser } from "./economy-v2-energy-settle";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  acknowledgeEconomyV3CareActivityPure,
  buildEconomyV3RootsPublicState,
  parseV3CareActivityStatus,
  validateRootKind,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
  type RootKind,
} from "./economy-v3-roots";
import type { EconomyV3DbClient } from "./economy-v3-roots-settle";

export class EconomyV3CareAcknowledgeError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3CareAcknowledgeError";
    this.status = status;
    this.code = code;
  }
}

export type AcknowledgeEconomyV3CareActivityResponse = {
  acknowledged: true;
  activity: RootKind;
  v3Roots: EconomyV3RootsPublicState;
};

const V3_CARE_ACK_SELECT = `
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

function httpStatusForAckCode(code: string): number {
  switch (code) {
    case "unknown_activity":
      return 400;
    case "activity_mismatch":
    case "activity_not_completed":
    case "no_completed_activity":
      return 409;
    default:
      return 400;
  }
}

/**
 * Clear a completed v3 Care activity session under FOR UPDATE.
 */
export async function acknowledgeEconomyV3CareActivity(
  userId: string | number,
  activityRaw: unknown,
): Promise<AcknowledgeEconomyV3CareActivityResponse> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3CareAcknowledgeError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_CARE_ACK_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareAcknowledgeError(
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

    const acked = acknowledgeEconomyV3CareActivityPure({
      activity: activityRaw,
      careActivityKind,
      careActivityStatus: parseV3CareActivityStatus(
        locked.v3_care_activity_status,
      ),
    });

    if (!acked.ok) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareAcknowledgeError(
        httpStatusForAckCode(acked.code),
        acked.code,
        acked.message,
      );
    }

    await client.query(
      `UPDATE game_state
       SET v3_care_activity_kind = NULL,
           v3_care_activity_preset_seconds = NULL,
           v3_care_activity_started_at = NULL,
           v3_care_activity_finished_at = NULL,
           v3_care_activity_status = NULL,
           v3_care_activity_skill = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [String(userId)],
    );

    locked.v3_care_activity_kind = null;
    locked.v3_care_activity_preset_seconds = null;
    locked.v3_care_activity_started_at = null;
    locked.v3_care_activity_finished_at = null;
    locked.v3_care_activity_status = null;
    locked.v3_care_activity_skill = null;

    await client.query("COMMIT");

    return {
      acknowledged: true,
      activity: acked.activity,
      v3Roots: buildEconomyV3RootsPublicState(locked, { capital }),
    };
  } catch (err) {
    if (!(err instanceof EconomyV3CareAcknowledgeError)) {
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
