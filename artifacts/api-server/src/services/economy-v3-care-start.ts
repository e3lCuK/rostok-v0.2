/**
 * Economy v3 Care activity start — debit one activity reserve and open a session.
 * Opens Care cycle journal on first start; rejects already-completed cycle activities.
 */

import { pool } from "@workspace/db";
import { loadCapitalForUser } from "./economy-v2-energy-settle";
import {
  isExcessAvailable,
  normalizeExcessSeconds,
} from "./economy-v2-excess";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { computeV3EffectivePresetSeconds } from "./economy-v3-effective-capacity";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import { isCareBlockedByMetelka } from "./economy-v3-metelka-cycle";
import {
  buildEconomyV3RootsPublicState,
  clampReserveSeconds,
  normalizeDailyCap,
  normalizeTransferredRoots,
  isCareCycleActivityCompleted,
  parseNullableTimestampMs,
  parseV3CareActivityStatus,
  startEconomyV3CareActivityPure,
  validateRootKind,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
  type RootKind,
} from "./economy-v3-roots";
import {
  settleEconomyV3RootsInTransaction,
  type EconomyV3DbClient,
} from "./economy-v3-roots-settle";

export class EconomyV3CareStartError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3CareStartError";
    this.status = status;
    this.code = code;
  }
}

export type StartEconomyV3CareActivityResponse = {
  started: true;
  activity: RootKind;
  presetSeconds: number;
  spentSeconds: number;
  v3Roots: EconomyV3RootsPublicState;
};

const V3_CARE_START_SELECT = `
  tutorial_done,
  streak_days,
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
  v3_metelka_required,
  v3_metelka_completed_for_cycle,
  v2_excess_seconds,
  v2_excess_session_active,
  ${V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS.trim()}
`;

function httpStatusForStartCode(code: string): number {
  switch (code) {
    case "unknown_activity":
    case "invalid_preset":
    case "preset_below_min":
    case "preset_above_max":
    case "preset_above_daily_cap":
    case "insufficient_reserve":
      return 400;
    case "activity_in_progress":
    case "activity_already_completed":
    case "metelka_required_before_care":
    case "roots_collection_incomplete":
      return 409;
    default:
      return 400;
  }
}

/**
 * Settle (incl. auto-transfer) then start one Care activity under FOR UPDATE.
 */
export async function startEconomyV3CareActivity(
  userId: string | number,
  activityRaw: unknown,
  presetSecondsRaw: unknown,
  nowMs: number = Date.now(),
): Promise<StartEconomyV3CareActivityResponse> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3CareStartError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_CARE_START_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3CareStartError(
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

    await settleEconomyV3RootsInTransaction(
      client as EconomyV3DbClient,
      userId,
      locked,
      nowMs,
      capital,
    );

    // Same SoT as public metelkaCycle.careLocked / Metelka start card.
    const excessRow = locked as EconomyV3RootsRow & {
      v2_excess_seconds?: unknown;
      v2_excess_session_active?: unknown;
    };
    if (
      isCareBlockedByMetelka({
        excessAvailable: isExcessAvailable(
          normalizeExcessSeconds(excessRow.v2_excess_seconds),
        ),
        metelkaSessionActive:
          excessRow.v2_excess_session_active === true ||
          excessRow.v2_excess_session_active === "true" ||
          excessRow.v2_excess_session_active === 1 ||
          excessRow.v2_excess_session_active === "1",
      })
    ) {
      await client.query("COMMIT");
      throw new EconomyV3CareStartError(
        409,
        "metelka_required_before_care",
        "Clear excess with Metelka before starting Care",
      );
    }

    // Same gate as client/tutorial: finish the transfer trio before Care.
    // Post-trio server clears freeze + list; length 3 must not keep Care locked.
    const transferredRoots = normalizeTransferredRoots(
      locked.v3_transferred_roots,
    );
    const collectionFrozen =
      parseNullableTimestampMs(locked.v3_generation_frozen_at) != null;
    const midTransferTrio =
      collectionFrozen ||
      transferredRoots.length === 1 ||
      transferredRoots.length === 2;
    if (midTransferTrio) {
      await client.query("COMMIT");
      throw new EconomyV3CareStartError(
        409,
        "roots_collection_incomplete",
        "Collect energy from all roots before starting Care",
      );
    }

    const basePresetSeconds = normalizeDailyCap(locked.v3_daily_cap_seconds);
    const effectivePresetSeconds = computeV3EffectivePresetSeconds({
      basePresetSeconds,
      streakDays: locked.streak_days,
    });
    const activityKind =
      validateRootKind(activityRaw) ? activityRaw : null;
    const started = startEconomyV3CareActivityPure({
      activity: activityRaw,
      presetSeconds: presetSecondsRaw,
      reserveWaterSeconds: clampReserveSeconds(
        locked.v3_reserve_water_seconds,
        effectivePresetSeconds,
      ),
      reserveSunSeconds: clampReserveSeconds(
        locked.v3_reserve_sun_seconds,
        effectivePresetSeconds,
      ),
      reserveFertilizerSeconds: clampReserveSeconds(
        locked.v3_reserve_fertilizer_seconds,
        effectivePresetSeconds,
      ),
      dailyCapSeconds: effectivePresetSeconds,
      careActivityStatus: parseV3CareActivityStatus(
        locked.v3_care_activity_status,
      ),
      careCycleActivityCompleted:
        activityKind != null &&
        isCareCycleActivityCompleted(locked, activityKind),
      nowMs,
    });

    if (!started.ok) {
      await client.query("COMMIT");
      throw new EconomyV3CareStartError(
        httpStatusForStartCode(started.code),
        started.code,
        started.message,
      );
    }

    const cycleStartedAtExisting = parseNullableTimestampMs(
      locked.v3_care_cycle_started_at,
    );
    const cycleStartedAt =
      cycleStartedAtExisting == null
        ? started.careActivityStartedAt
        : cycleStartedAtExisting;

    await client.query(
      `UPDATE game_state
       SET v3_reserve_water_seconds = $2,
           v3_reserve_sun_seconds = $3,
           v3_reserve_fertilizer_seconds = $4,
           v3_care_activity_kind = $5,
           v3_care_activity_preset_seconds = $6,
           v3_care_activity_started_at = $7,
           v3_care_activity_status = $8,
           v3_care_activity_skill = NULL,
           v3_care_activity_finished_at = NULL,
           v3_care_cycle_started_at = COALESCE(v3_care_cycle_started_at, $9),
           v3_care_cycle_status = CASE
             WHEN v3_care_cycle_status IS NULL THEN 'in_progress'
             WHEN v3_care_cycle_status = 'finished' THEN v3_care_cycle_status
             ELSE COALESCE(v3_care_cycle_status, 'in_progress')
           END,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        started.reserveWaterSeconds,
        started.reserveSunSeconds,
        started.reserveFertilizerSeconds,
        started.careActivityKind,
        started.careActivityPresetSeconds,
        new Date(started.careActivityStartedAt),
        started.careActivityStatus,
        new Date(cycleStartedAt),
      ],
    );

    locked.v3_reserve_water_seconds = started.reserveWaterSeconds;
    locked.v3_reserve_sun_seconds = started.reserveSunSeconds;
    locked.v3_reserve_fertilizer_seconds = started.reserveFertilizerSeconds;
    locked.v3_care_activity_kind = started.careActivityKind;
    locked.v3_care_activity_preset_seconds = started.careActivityPresetSeconds;
    locked.v3_care_activity_started_at = new Date(started.careActivityStartedAt);
    locked.v3_care_activity_status = started.careActivityStatus;
    locked.v3_care_activity_skill = null;
    locked.v3_care_activity_finished_at = null;
    locked.v3_care_cycle_started_at = new Date(cycleStartedAt);
    if (locked.v3_care_cycle_status !== "finished") {
      locked.v3_care_cycle_status =
        locked.v3_care_cycle_status == null
          ? "in_progress"
          : locked.v3_care_cycle_status;
    }

    await client.query("COMMIT");

    return {
      started: true,
      activity: started.activity,
      presetSeconds: started.presetSeconds,
      spentSeconds: started.presetSeconds,
      v3Roots: buildEconomyV3RootsPublicState(locked, {
        capital,
        streakDays: locked.streak_days,
      }),
    };
  } catch (err) {
    if (!(err instanceof EconomyV3CareStartError)) {
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
