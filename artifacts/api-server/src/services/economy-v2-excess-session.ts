/**
 * Economy v2 excess Metelka session — start + clear (finish/payout later).
 *
 * On start (version=2): settle → snapshot source/preset/rate/webCount/seed/
 * capital/elapsed/baseIncome → mark active. Does NOT deduct ledgers on start.
 * Incomplete financial-cycle tail is excluded from the paid snapshot so it
 * stays on live ledgers and keeps accruing (finish deducts only paid share).
 */

import { pool } from "@workspace/db";
import {
  buildEconomyV2ExcessPublicState,
  computeExcessSessionSnapshot,
  emptyExcessResult,
  isExcessAvailable,
  normalizeExcessSeconds,
  readExcessSessionFromRow,
  V2_EXCESS_SESSION_VERSION,
  type EconomyV2ExcessPublicState,
  type EconomyV2ExcessSessionPublicState,
} from "./economy-v2-excess";
import {
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
  splitMetelkaPaidFinancialCycles,
} from "./economy-v2-excess-income";
import { createExcessWebLayoutSeed } from "./economy-v2-excess-webs";
import {
  loadCapitalForUser,
  settleEconomyV2EnergyInTransaction,
  type EconomyV2DbClient,
  type LockedEnergyRow,
} from "./economy-v2-energy-settle";

export class EconomyV2ExcessSessionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV2ExcessSessionError";
    this.status = status;
    this.code = code;
  }
}

export type EconomyV2ExcessStartResult = {
  excessSeconds: number;
  excess: EconomyV2ExcessPublicState;
  session: EconomyV2ExcessSessionPublicState;
};

type ExcessSessionLockRow = LockedEnergyRow & {
  v2_excess_session_active?: unknown;
  v2_excess_session_version?: unknown;
  v2_excess_session_started_at?: unknown;
  v2_excess_session_source_seconds?: unknown;
  v2_excess_session_source_elapsed_ms?: unknown;
  v2_excess_session_capital?: unknown;
  v2_excess_session_base_income?: unknown;
  v2_excess_session_base_web_cleared?: unknown;
  v2_excess_session_base_web_collection_mode?: unknown;
  v2_excess_session_base_income_applied?: unknown;
  v2_excess_session_preset_seconds?: unknown;
  v2_excess_session_rate?: unknown;
  v2_excess_session_web_count?: unknown;
  v2_excess_session_layout_seed?: unknown;
  v2_excess_session_cleared_web_ids?: unknown;
  v2_excess_session_finished_at?: unknown;
  v2_excess_session_finish_reason?: unknown;
  v2_excess_session_final_cleared_count?: unknown;
  v2_excess_session_final_web_count?: unknown;
  v2_excess_session_skill?: unknown;
  v2_excess_session_bonus_raw_unlocked?: unknown;
};

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1 || raw === "1";
}

async function withExcessSessionTransaction<T>(
  fn: (client: EconomyV2DbClient) => Promise<T>,
): Promise<T> {
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

const SESSION_LOCK_SELECT = `v2_energy_seconds, v2_energy_anchor_at,
            tutorial_done,
            v2_root_ready_mask, v2_root_generation_progress,
            v2_excess_seconds,
            v2_excess_elapsed_ms,
            v2_excess_base_income,
            v2_ordinary_income_elapsed_ms,
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
            v2_excess_session_bonus_raw_unlocked,
            v3_root_water_seconds,
            v3_root_sun_seconds,
            v3_root_fertilizer_seconds,
            v3_metelka_required,
            v3_metelka_completed_for_cycle`;

async function lockExcessSessionRow(
  client: EconomyV2DbClient,
  userId: string | number,
): Promise<ExcessSessionLockRow> {
  const gameRow = await client.query(
    `SELECT ${SESSION_LOCK_SELECT}
     FROM game_state
     WHERE user_id = $1
     FOR UPDATE`,
    [String(userId)],
  );

  if (gameRow.rows.length === 0) {
    throw new EconomyV2ExcessSessionError(404, "not_found", "Game state not found");
  }

  return gameRow.rows[0] as ExcessSessionLockRow;
}

/**
 * Start one Metelka attempt: settle, require excess ≥ 5, no active session,
 * freeze source/preset/rate/webCount/layoutSeed/capital/sourceElapsedMs/baseIncome.
 * Leaves live ledgers unchanged. Paid snapshot uses only complete financial
 * cycles (T(K)); the incomplete tail stays for continued accrual.
 */
export async function startEconomyV2ExcessSession(
  userId: string | number,
  nowMs: number = Date.now(),
): Promise<EconomyV2ExcessStartResult> {
  // Clear pending result cards (v2 acknowledge path) before opening a new attempt.
  try {
    const { acknowledgeEconomyV2ExcessResult } = await import(
      "./economy-v2-excess-acknowledge"
    );
    await acknowledgeEconomyV2ExcessResult(userId);
  } catch {
    // ignore — no pending result
  }
  // Legacy active finishable sessions / pending that ack skipped.
  try {
    const { finishEconomyV2ExcessSession } = await import(
      "./economy-v2-excess-finish"
    );
    await finishEconomyV2ExcessSession(userId, nowMs);
  } catch {
    // ignore — no pending result / not finishable
  }

  return withExcessSessionTransaction(async (client) => {
    const row = await lockExcessSessionRow(client, userId);
    const capital = await loadCapitalForUser(client, userId);
    const settled = await settleEconomyV2EnergyInTransaction(
      client,
      userId,
      row,
      nowMs,
      capital,
    );

    if (asBool(row.v2_excess_session_active)) {
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_session_already_active",
        "An excess Metelka session is already active",
      );
    }

    if (row.v2_excess_session_finished_at != null) {
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_session_result_pending",
        "Could not clear previous Metelka result",
      );
    }

    if (!isExcessAvailable(settled.excessSeconds)) {
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_not_available",
        "Need at least 5 excess seconds to start Metelka",
      );
    }

    // Gameplay T / rate / webs from the full live ledger; money uses only
    // complete financial cycles. Partial cycle stays on live ledgers.
    const snap = computeExcessSessionSnapshot(settled.excessSeconds);
    const paid = splitMetelkaPaidFinancialCycles({
      excessElapsedMs: settled.excessElapsedMs,
      excessSeconds: settled.excessSeconds,
      excessBaseIncome: settled.excessBaseIncome,
      capital,
    });
    const sourceElapsedMs = normalizeExcessElapsedMs(paid.paidElapsedMs);
    const sourceSeconds = normalizeExcessSeconds(paid.paidSeconds);
    const sessionBaseIncome = normalizeExcessBaseIncome(paid.paidBaseIncome);
    const layoutSeed = createExcessWebLayoutSeed();

    const updated = await client.query(
      `UPDATE game_state
       SET v2_excess_session_active = TRUE,
           v2_excess_session_version = $2,
           v2_excess_session_started_at = $3,
           v2_excess_session_source_seconds = $4,
           v2_excess_session_source_elapsed_ms = $5,
           v2_excess_session_capital = $6,
           v2_excess_session_base_income = $7,
           v2_excess_session_base_web_cleared = FALSE,
           v2_excess_session_base_web_collection_mode = NULL,
           v2_excess_session_base_income_applied = FALSE,
           v2_excess_session_preset_seconds = $8,
           v2_excess_session_rate = $9,
           v2_excess_session_web_count = $10,
           v2_excess_session_layout_seed = $11,
           v2_excess_session_cleared_web_ids = '{}',
           v2_excess_session_finished_at = NULL,
           v2_excess_session_finish_reason = NULL,
           v2_excess_session_final_cleared_count = NULL,
           v2_excess_session_final_web_count = NULL,
           v2_excess_session_skill = NULL,
           v2_excess_session_xp_max = NULL,
           v2_excess_session_xp_raw = 0,
           v2_excess_session_xp_awarded = 0,
           v2_excess_session_xp_applied = FALSE,
           v2_excess_session_gross_income = NULL,
           v2_excess_session_payment_factor = NULL,
           v2_excess_session_paid_income = NULL,
           v2_excess_session_income_applied = FALSE,
           v2_excess_session_bonus_raw_unlocked = 0,
           updated_at = NOW()
       WHERE user_id = $1
         AND v2_excess_session_active = FALSE
         AND v2_excess_session_finished_at IS NULL
       RETURNING v2_excess_seconds,
                 v2_excess_elapsed_ms,
                 v2_excess_base_income,
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
                 v2_excess_session_gross_income,
                 v2_excess_session_payment_factor,
                 v2_excess_session_paid_income,
                 v2_excess_session_income_applied,
                 v2_excess_session_xp_awarded,
                 v2_excess_session_xp_raw,
                 v2_excess_session_bonus_raw_unlocked`,
      [
        String(userId),
        V2_EXCESS_SESSION_VERSION,
        nowMs,
        sourceSeconds,
        sourceElapsedMs,
        capital,
        sessionBaseIncome,
        snap.presetSeconds,
        snap.rate,
        snap.webCount,
        layoutSeed,
      ],
    );

    if (updated.rows.length === 0) {
      throw new EconomyV2ExcessSessionError(
        409,
        "excess_session_already_active",
        "An excess Metelka session is already active",
      );
    }

    const outRow = updated.rows[0] as ExcessSessionLockRow;
    const session = readExcessSessionFromRow(outRow);
    const excessSeconds = normalizeExcessSeconds(outRow.v2_excess_seconds);
    const excessElapsedMs = normalizeExcessElapsedMs(outRow.v2_excess_elapsed_ms);
    const excess = buildEconomyV2ExcessPublicState(
      excessSeconds,
      session,
      emptyExcessResult(),
      excessElapsedMs,
      outRow.v2_excess_base_income,
    );

    return { excessSeconds, excess, session };
  });
}

/** Clear session + result fields (debug / acknowledge). Does not touch excess. */
export function clearExcessSessionSqlParams(): {
  sql: string;
} {
  return {
    sql: `UPDATE game_state
       SET v2_excess_session_active = FALSE,
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
           updated_at = NOW()
       WHERE user_id = $1`,
  };
}

export { readExcessSessionFromRow };
