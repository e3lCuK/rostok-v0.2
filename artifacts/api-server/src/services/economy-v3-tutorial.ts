/**
 * Economy v3 Tutorial helpers (production-safe).
 *
 * - Grant predictable root seconds once (idempotent).
 * - Clear v3 tutorial residue on tutorial/complete; v3_generation_anchor_at
 *   continues from the tutorial 12:00 wait start (client), then settle backfills.
 * Does not touch Economy v2 Care bank, excess formulas, or Metelka.
 */

import { pool } from "@workspace/db";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  buildEconomyV3RootsPublicState,
  clampReserveSeconds,
  normalizeDailyCap,
  normalizeTransferredRoots,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
  type RootKind,
} from "./economy-v3-roots";
import { computeV3EffectivePresetSeconds } from "./economy-v3-effective-capacity";
import {
  isEconomyV2TutorialActive,
  loadCapitalForUser,
} from "./economy-v2-energy-settle";
import { syncTutorialV3WaitEnergyInTransaction } from "./economy-v3-roots-settle";
import {
  grantTutorialV3RootsPure,
  V3_TUTORIAL_ROOT_SECONDS,
} from "./economy-v3-tutorial-pure";

export {
  grantTutorialV3RootsPure,
  V3_TUTORIAL_ROOT_SECONDS,
} from "./economy-v3-tutorial-pure";

export class EconomyV3TutorialError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3TutorialError";
    this.status = status;
    this.code = code;
  }
}

const V3_TUTORIAL_SELECT = `
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
  ${V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS.trim()}
`;

export type GrantTutorialV3RootsResult = {
  granted: true;
  alreadyPrepared: boolean;
  changed: boolean;
  rootsSeconds: Record<RootKind, number>;
  v3Roots: EconomyV3RootsPublicState;
};

/**
 * Idempotent tutorial root grant. Requires ENABLE_ECONOMY_V3_ROOTS + tutorial active.
 * Optional `kinds` stages the fill (water → sun → fertilizer).
 */
export async function grantTutorialV3Roots(
  userId: string | number,
  nowMs: number = Date.now(),
  options?: { kinds?: RootKind[] },
): Promise<GrantTutorialV3RootsResult> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3TutorialError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameRow = await client.query(
      `SELECT ${V3_TUTORIAL_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );
    if (gameRow.rowCount === 0) {
      throw new EconomyV3TutorialError(404, "not_found", "Game state not found");
    }
    const locked = gameRow.rows[0] as EconomyV3RootsRow;
    if (!isEconomyV2TutorialActive(locked.tutorial_done)) {
      throw new EconomyV3TutorialError(
        409,
        "tutorial_done",
        "Tutorial already completed",
      );
    }

    const dailyCap = normalizeDailyCap(locked.v3_daily_cap_seconds);
    const effectiveCap = computeV3EffectivePresetSeconds({
      basePresetSeconds: dailyCap,
      streakDays: (locked as { streak_days?: unknown }).streak_days,
    });
    const granted = grantTutorialV3RootsPure({
      rootWaterSeconds: locked.v3_root_water_seconds as number,
      rootSunSeconds: locked.v3_root_sun_seconds as number,
      rootFertilizerSeconds: locked.v3_root_fertilizer_seconds as number,
      reserveWaterSeconds: clampReserveSeconds(
        locked.v3_reserve_water_seconds,
        effectiveCap,
      ),
      reserveSunSeconds: clampReserveSeconds(
        locked.v3_reserve_sun_seconds,
        effectiveCap,
      ),
      reserveFertilizerSeconds: clampReserveSeconds(
        locked.v3_reserve_fertilizer_seconds,
        effectiveCap,
      ),
      transferredRoots: normalizeTransferredRoots(locked.v3_transferred_roots),
      effectivePresetSeconds: effectiveCap,
      kinds: options?.kinds,
    });

    const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();
    if (granted.changed) {
      await client.query(
        `UPDATE game_state
         SET v3_root_water_seconds = $2,
             v3_root_sun_seconds = $3,
             v3_root_fertilizer_seconds = $4,
             v3_generation_anchor_at = $5,
             v3_generation_progress = 0,
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          String(userId),
          granted.rootWaterSeconds,
          granted.rootSunSeconds,
          granted.rootFertilizerSeconds,
          new Date(now),
        ],
      );
      locked.v3_root_water_seconds = granted.rootWaterSeconds;
      locked.v3_root_sun_seconds = granted.rootSunSeconds;
      locked.v3_root_fertilizer_seconds = granted.rootFertilizerSeconds;
      locked.v3_generation_anchor_at = new Date(now);
      locked.v3_generation_progress = 0;
    }

    const capital = await loadCapitalForUser(client, userId);
    const v3Roots = buildEconomyV3RootsPublicState(locked, {
      capital,
      nowMs: now,
    });
    await client.query("COMMIT");
    return {
      granted: true,
      alreadyPrepared: granted.alreadyPrepared,
      changed: granted.changed,
      rootsSeconds: {
        water: granted.rootWaterSeconds,
        sun: granted.rootSunSeconds,
        fertilizer: granted.rootFertilizerSeconds,
      },
      v3Roots,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Arm the tutorial 12:00 generation clock (idempotent).
 * Sets v3_generation_anchor_at to the client wait start so later sync can
 * settle energy into roots like the main game when 12:00 elapses.
 */
export async function armTutorialV3Wait(
  userId: string | number,
  startedAtMs: number,
  nowMs: number = Date.now(),
): Promise<{ armed: true; startedAtMs: number; v3Roots: EconomyV3RootsPublicState }> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3TutorialError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }
  const started = Math.trunc(Number(startedAtMs));
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();
  if (!Number.isFinite(started) || started <= 0 || started > now + 1000) {
    throw new EconomyV3TutorialError(
      400,
      "invalid_started_at",
      "Invalid tutorial wait start",
    );
  }
  const maxAgeMs = 30 * 60 * 1000;
  if (started < now - maxAgeMs) {
    throw new EconomyV3TutorialError(
      400,
      "invalid_started_at",
      "Tutorial wait start is too old",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameRow = await client.query(
      `SELECT ${V3_TUTORIAL_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );
    if (gameRow.rowCount === 0) {
      throw new EconomyV3TutorialError(404, "not_found", "Game state not found");
    }
    const locked = gameRow.rows[0] as EconomyV3RootsRow;
    if (!isEconomyV2TutorialActive(locked.tutorial_done)) {
      throw new EconomyV3TutorialError(
        409,
        "tutorial_done",
        "Tutorial already completed",
      );
    }

    const existingMs = locked.v3_generation_anchor_at
      ? new Date(locked.v3_generation_anchor_at as string | Date).getTime()
      : NaN;
    // Keep an already-armed matching clock; otherwise write the client start.
    const shouldWrite =
      !Number.isFinite(existingMs) || Math.abs(existingMs - started) > 2000;
    if (shouldWrite) {
      await client.query(
        `UPDATE game_state
         SET v3_generation_anchor_at = $2,
             v3_generation_progress = 0,
             updated_at = NOW()
         WHERE user_id = $1`,
        [String(userId), new Date(started)],
      );
      locked.v3_generation_anchor_at = new Date(started);
      locked.v3_generation_progress = 0;
    }

    const capital = await loadCapitalForUser(client, userId);
    const v3Roots = buildEconomyV3RootsPublicState(locked, {
      capital,
      nowMs: now,
    });
    await client.query("COMMIT");
    return {
      armed: true,
      startedAtMs: shouldWrite
        ? started
        : Math.trunc(existingMs as number),
      v3Roots,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * After the tutorial 12:00 wait elapses — settle generation like main play
 * without completing the tutorial. Fills root energy cells.
 */
export async function syncTutorialV3WaitEnergy(
  userId: string | number,
  startedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
): Promise<{
  synced: true;
  wholeSeconds: number;
  v3Roots: EconomyV3RootsPublicState;
}> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3TutorialError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }
  try {
    return await syncTutorialV3WaitEnergyInTransaction(
      userId,
      startedAtMs,
      nowMs,
    );
  } catch (err) {
    if (err instanceof EconomyV3TutorialError) throw err;
    const code = (err as { code?: string }).code;
    if (code === "not_found" || code === "tutorial_done" || code === "invalid_started_at") {
      throw new EconomyV3TutorialError(
        code === "not_found" ? 404 : code === "tutorial_done" ? 409 : 400,
        code,
        (err as Error).message,
      );
    }
    throw err;
  }
}

/** SQL fragment clearing v3 tutorial residue (roots/reserves/care/freeze). */
export const V3_TUTORIAL_COMPLETE_CLEAR_SQL = `
  v3_root_water_seconds = 0,
  v3_root_sun_seconds = 0,
  v3_root_fertilizer_seconds = 0,
  v3_reserve_water_seconds = 0,
  v3_reserve_sun_seconds = 0,
  v3_reserve_fertilizer_seconds = 0,
  v3_generation_progress = 0,
  /*
   * $3 = tutorial 12:00 wait start (client), so live cycle continues from the
   * tutorial countdown. Separate bind from v2_energy_anchor_at ($2 bigint) —
   * sharing one param caused Postgres 42P08 (bigint vs timestamp).
   */
  v3_generation_anchor_at = $3,
  v3_generation_frozen_at = NULL,
  v3_insurance_deadline_at = NULL,
  v3_first_transferred_root = NULL,
  v3_transferred_roots = '{}'::text[],
  v3_care_activity_kind = NULL,
  v3_care_activity_preset_seconds = NULL,
  v3_care_activity_started_at = NULL,
  v3_care_activity_status = NULL,
  v3_care_activity_skill = NULL,
  v3_care_activity_finished_at = NULL,
  v3_care_cycle_water_completed = FALSE,
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
  pending_base_reward = 0,
  pending_bonus_reward = 0,
  /* Keep tutorial collectibles: +1 мм / +1 яблоко; wipe XP / session stats. */
  tree_growth_mm = 1,
  tree_growth_remainder = 0,
  total_apples = 1,
  player_xp = 0,
  player_level = 1,
  xp_history = '[]'::jsonb,
  total_sessions = 0,
  total_water_drops = 0,
  total_sun_catches = 0,
  total_leaf_picks = 0,
  streak_days = 0,
  last_streak_date = NULL
`;
