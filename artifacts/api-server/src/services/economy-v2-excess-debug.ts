/**
 * Local/debug mutations for Economy v2 excess (t_excess) + session reset.
 * Does NOT change bank, Care, XP, or income formulas.
 *
 * Primary UI action: addPresetSeconds — add N game-seconds to the excess
 * ledger, fill all three v3 roots to effective capacity (SoT), recompute live
 * Metelka preset from the ledger (clamp 5…25). Financial elapsed uses the
 * accumulative generation model:
 *   nextElapsed = currentElapsed + N × secondsPerGameSecondForCapital(K) × 1000
 * (simulates natural formation of N excess seconds; does not rewrite history
 * by current capital, does not replace with T-min elapsed, does not start at 0).
 * Resets generation anchors; clears frozen Metelka session.
 *
 * Legacy: add/set (raw ledger), setPreset, setElapsed, setFinancial.
 */

import { pool } from "@workspace/db";
import {
  buildEconomyV2ExcessFromRow,
  buildEconomyV2ExcessPublicState,
  deriveExcessPresetSeconds,
  emptyExcessResult,
  inactiveExcessSession,
  minExcessSecondsForPreset,
  normalizeExcessSeconds,
  V2_EXCESS_PRESET_MAX,
  V2_EXCESS_PRESET_MIN,
  type EconomyV2ExcessPublicState,
} from "./economy-v2-excess";
import { V2_BASE_APR } from "./economy-v2-care-income";
import {
  computeBaseIncomeForElapsedMs,
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
} from "./economy-v2-excess-income";
import { clearExcessSessionSqlParams } from "./economy-v2-excess-session";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import { buildV3EffectiveCapacityBreakdown } from "./economy-v3-effective-capacity";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import { loadCapitalForUser } from "./economy-v2-energy-settle";
import {
  buildEconomyV3RootsPublicState,
  normalizeDailyCap,
  secondsPerGameSecondForCapital,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
} from "./economy-v3-roots";
import type { EconomyV3DbClient } from "./economy-v3-roots-settle";

/**
 * Wall-clock ms to naturally *generate* `ledgerGameSeconds` at `capital`
 * (720/M(K)). Used as the delta for debug Add and for setPreset natural path.
 */
export function debugMetelkaElapsedMsForLedger(
  ledgerGameSeconds: number,
  capital: number,
): number {
  const ledger = normalizeExcessSeconds(ledgerGameSeconds);
  if (ledger <= 0) return 0;
  const perSec = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(perSec) || perSec <= 0) return 0;
  return normalizeExcessElapsedMs(ledger * perSec * 1000);
}

/**
 * Accumulative financial elapsed after debug Add of `addedLedgerSeconds`.
 * Keeps prior elapsed; adds generation-time for N at current capital only.
 */
export function debugMetelkaElapsedMsAfterAdd(
  currentElapsedMs: number,
  addedLedgerSeconds: number,
  capital: number,
): number {
  const current = normalizeExcessElapsedMs(currentElapsedMs);
  const delta = debugMetelkaElapsedMsForLedger(addedLedgerSeconds, capital);
  return normalizeExcessElapsedMs(current + delta);
}

/**
 * @deprecated Pure wall-clock Add settle — replaced by debugMetelkaElapsedMsAfterAdd.
 * Kept for diagnostic callers / migration tests only.
 */
export function debugMetelkaSettleWallClockElapsed(input: {
  currentLedgerSeconds: number;
  currentElapsedMs: number;
  financialAnchorMs: number | null;
  nowMs: number;
}): number {
  const ledger = normalizeExcessSeconds(input.currentLedgerSeconds);
  if (ledger <= 0) return 0;
  const current = normalizeExcessElapsedMs(input.currentElapsedMs);
  const anchor = input.financialAnchorMs;
  const nowMs = Number(input.nowMs);
  if (
    anchor == null ||
    !Number.isFinite(anchor) ||
    !Number.isFinite(nowMs) ||
    anchor > nowMs
  ) {
    return current;
  }
  return normalizeExcessElapsedMs(current + Math.max(0, nowMs - anchor));
}

/**
 * Wall-clock ms for the minimum ledger of target preset T at capital.
 * Prefer `debugMetelkaElapsedMsForLedger(actualLedger, capital)` when the
 * installed ledger may exceed the minimum (fat T=25).
 */
export function debugMetelkaElapsedMsForTargetPreset(
  presetSeconds: number,
  capital: number,
): number {
  const T = Math.round(Number(presetSeconds) || 0);
  if (!Number.isFinite(T) || T <= 0) return 0;
  return debugMetelkaElapsedMsForLedger(
    minExcessSecondsForPreset(T),
    capital,
  );
}

/** target T = clamp(currentLiveT + deltaSeconds, 5…25). */
export function debugTargetPresetAfterAdd(
  currentLivePreset: number,
  deltaSeconds: number,
): number {
  const cur = Math.round(Number(currentLivePreset) || V2_EXCESS_PRESET_MIN);
  const d = Math.round(Number(deltaSeconds) || 0);
  return Math.min(
    V2_EXCESS_PRESET_MAX,
    Math.max(V2_EXCESS_PRESET_MIN, cur + d),
  );
}

export class EconomyV2ExcessDebugError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV2ExcessDebugError";
    this.status = status;
    this.code = code;
  }
}

export type DebugExcessAction =
  | { action: "reset" }
  | { action: "add"; seconds: number }
  | { action: "set"; seconds: number }
  | {
      /**
       * Primary debug UI: +N game-seconds to excess ledger.
       * Also fills all three v3 roots to effective capacity.
       * Financial elapsed: current + N×secondsPerGameSecondForCapital(K)×1000.
       */
      action: "addPresetSeconds";
      seconds: number;
    }
  | {
      action: "setPreset";
      presetSeconds: number;
      /**
       * Financial wall-clock ms.
       * Omit → natural generation time for min ledger at capital.
       * Pass 0 to test zero-money / missing_excess_elapsed_history.
       */
      elapsedMs?: number;
    }
  | { action: "setFinancial"; seconds: number; elapsedMs: number }
  | { action: "setElapsed"; elapsedMs: number }
  | { action: "resetSession" };

export type DebugExcessMutateResult = {
  excessSeconds: number;
  excessElapsedMs: number;
  excessBaseIncome: number;
  excess: EconomyV2ExcessPublicState;
  /** Present after addPresetSeconds (roots filled to capacity). */
  v3Roots?: EconomyV3RootsPublicState;
  /** Effective root capacity used when filling roots. */
  capacitySeconds?: number;
};

export function parseDebugExcessAction(
  body: unknown,
): DebugExcessAction | { error: string } {
  if (body == null || typeof body !== "object") {
    return { error: "Expected JSON body with action" };
  }
  const action = (body as { action?: unknown }).action;
  if (action === "reset") {
    return { action: "reset" };
  }
  if (action === "resetSession") {
    return { action: "resetSession" };
  }
  if (action === "add") {
    const raw = (body as { seconds?: unknown }).seconds;
    const seconds =
      typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return { error: "add requires positive finite seconds" };
    }
    return { action: "add", seconds };
  }
  if (action === "addPresetSeconds") {
    const raw = (body as { seconds?: unknown }).seconds;
    const seconds =
      typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    if (!Number.isFinite(seconds)) {
      return { error: "addPresetSeconds requires finite seconds" };
    }
    const n = Math.round(seconds);
    if (!Number.isInteger(n) || n < 1 || n > V2_EXCESS_PRESET_MAX) {
      return {
        error: `addPresetSeconds seconds must be an integer in 1…${V2_EXCESS_PRESET_MAX}`,
      };
    }
    return { action: "addPresetSeconds", seconds: n };
  }
  if (action === "set") {
    const raw = (body as { seconds?: unknown }).seconds;
    const seconds =
      typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    if (!Number.isFinite(seconds)) {
      return { error: "set requires finite seconds" };
    }
    if (seconds < 0) {
      return { error: "excess seconds cannot be negative" };
    }
    return { action: "set", seconds };
  }
  if (action === "setPreset") {
    const raw = (body as { presetSeconds?: unknown }).presetSeconds;
    const presetSeconds =
      typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    if (!Number.isFinite(presetSeconds)) {
      return { error: "setPreset requires finite presetSeconds" };
    }
    const T = Math.round(presetSeconds);
    if (T < V2_EXCESS_PRESET_MIN || T > V2_EXCESS_PRESET_MAX) {
      return {
        error: `setPreset presetSeconds must be an integer in ${V2_EXCESS_PRESET_MIN}…${V2_EXCESS_PRESET_MAX}`,
      };
    }
    const hasElapsed = Object.prototype.hasOwnProperty.call(
      body as object,
      "elapsedMs",
    );
    if (!hasElapsed) {
      return { action: "setPreset", presetSeconds: T };
    }
    const rawMs = (body as { elapsedMs?: unknown }).elapsedMs;
    const elapsedMs =
      typeof rawMs === "number" ? rawMs : parseFloat(String(rawMs ?? ""));
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return { error: "setPreset elapsedMs must be non-negative finite" };
    }
    return { action: "setPreset", presetSeconds: T, elapsedMs };
  }
  if (action === "setElapsed") {
    const rawMs = (body as { elapsedMs?: unknown }).elapsedMs;
    const elapsedMs =
      typeof rawMs === "number" ? rawMs : parseFloat(String(rawMs ?? ""));
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return { error: "setElapsed requires non-negative elapsedMs" };
    }
    return { action: "setElapsed", elapsedMs };
  }
  if (action === "setFinancial") {
    const rawSec = (body as { seconds?: unknown }).seconds;
    const rawMs = (body as { elapsedMs?: unknown }).elapsedMs;
    const seconds =
      typeof rawSec === "number" ? rawSec : parseFloat(String(rawSec ?? ""));
    const elapsedMs =
      typeof rawMs === "number" ? rawMs : parseFloat(String(rawMs ?? ""));
    if (!Number.isFinite(seconds) || seconds < 0) {
      return { error: "setFinancial requires non-negative seconds" };
    }
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return { error: "setFinancial requires non-negative elapsedMs" };
    }
    return { action: "setFinancial", seconds, elapsedMs };
  }
  return {
    error:
      'action must be "reset", "add", "addPresetSeconds", "set", "setPreset", "setElapsed", "setFinancial", or "resetSession"',
  };
}

const SESSION_SELECT = `v2_excess_seconds,
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
              v2_excess_session_xp_max,
              v2_excess_session_xp_raw,
              v2_excess_session_xp_awarded,
              v2_excess_session_xp_applied,
              v2_excess_session_gross_income,
              v2_excess_session_payment_factor,
              v2_excess_session_paid_income,
              v2_excess_session_income_applied`;

/** SELECT for addPresetSeconds — excess + v3 roots public snapshot fields. */
const ADD_PRESET_SELECT = `
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
  ${V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS.trim()},
  ${SESSION_SELECT}
`;

/**
 * Primary debug UI: add N excess game-seconds and fill roots to capacity.
 * Invariant: after success, excess > 0 ⇒ all three roots are at effectiveCap.
 */
async function debugAddPresetSecondsFillRoots(
  userId: string | number,
  addSeconds: number,
): Promise<DebugExcessMutateResult> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV2ExcessDebugError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${ADD_PRESET_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV2ExcessDebugError(404, "not_found", "Game state not found");
    }

    const locked = gameRow.rows[0] as EconomyV3RootsRow & Record<string, unknown>;
    const capital = await loadCapitalForUser(
      client as EconomyV3DbClient,
      userId,
    );
    const dailyCap = normalizeDailyCap(locked.v3_daily_cap_seconds);
    const capacity = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: dailyCap,
      streakDays: locked.streak_days,
    }).effectivePresetSeconds;

    const currentLedger = normalizeExcessSeconds(locked.v2_excess_seconds);
    const currentElapsed = normalizeExcessElapsedMs(locked.v2_excess_elapsed_ms);
    const currentBase = normalizeExcessBaseIncome(locked.v2_excess_base_income);
    const nextSeconds = normalizeExcessSeconds(currentLedger + addSeconds);
    const nowMs = Date.now();
    // Simulate natural formation of N excess seconds at current capital.
    const deltaElapsedMs = debugMetelkaElapsedMsForLedger(addSeconds, capital);
    const nextElapsed = debugMetelkaElapsedMsAfterAdd(
      currentElapsed,
      addSeconds,
      capital,
    );
    const nextBaseIncome = normalizeExcessBaseIncome(
      currentBase +
        (deltaElapsedMs > 0
          ? computeBaseIncomeForElapsedMs({
              capital,
              elapsedMs: deltaElapsedMs,
              annualRate: V2_BASE_APR,
            })
          : 0),
    );

    await client.query(
      `UPDATE game_state
       SET v3_root_water_seconds = $2,
           v3_root_sun_seconds = $3,
           v3_root_fertilizer_seconds = $4,
           v2_excess_seconds = $5,
           v2_excess_elapsed_ms = $6,
           v2_excess_base_income = $7,
           v3_generation_anchor_at = to_timestamp($8::double precision / 1000.0),
           v2_energy_anchor_at = $8,
           v3_generation_frozen_at = NULL,
           v3_metelka_required = TRUE,
           v3_metelka_completed_for_cycle = FALSE,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        capacity,
        capacity,
        capacity,
        nextSeconds,
        nextElapsed,
        nextBaseIncome,
        nowMs,
      ],
    );

    const { sql: clearSql } = clearExcessSessionSqlParams();
    await client.query(clearSql, [String(userId)]);

    await client.query("COMMIT");

    locked.v3_root_water_seconds = capacity;
    locked.v3_root_sun_seconds = capacity;
    locked.v3_root_fertilizer_seconds = capacity;
    locked.v2_excess_seconds = nextSeconds;
    locked.v2_excess_elapsed_ms = nextElapsed;
    locked.v2_excess_base_income = nextBaseIncome;
    locked.v3_metelka_required = true;
    locked.v3_metelka_completed_for_cycle = false;
    locked.v2_excess_session_active = false;
    locked.v2_excess_session_started_at = null;
    locked.v2_excess_session_finished_at = null;
    locked.v2_excess_session_finish_reason = null;
    locked.v2_excess_session_version = null;
    locked.v2_excess_session_preset_seconds = null;

    const excess = buildEconomyV2ExcessPublicState(
      nextSeconds,
      inactiveExcessSession(),
      emptyExcessResult(),
      nextElapsed,
      nextBaseIncome,
    );
    const v3Roots = buildEconomyV3RootsPublicState(locked, {
      capital,
      excessAvailable: excess.excessAvailable,
      metelkaRequired: true,
      metelkaCompletedForCycle: false,
    });

    return {
      excessSeconds: nextSeconds,
      excessElapsedMs: nextElapsed,
      excessBaseIncome: nextBaseIncome,
      excess,
      v3Roots,
      capacitySeconds: capacity,
    };
  } catch (err) {
    if (err instanceof EconomyV2ExcessDebugError) throw err;
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

export async function debugMutateEconomyV2Excess(
  userId: string | number,
  body: DebugExcessAction,
): Promise<DebugExcessMutateResult> {
  if (body.action === "addPresetSeconds") {
    return debugAddPresetSecondsFillRoots(userId, body.seconds);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${SESSION_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV2ExcessDebugError(404, "not_found", "Game state not found");
    }

    const row = gameRow.rows[0] as Record<string, unknown>;
    let nextSeconds = normalizeExcessSeconds(row.v2_excess_seconds);
    let nextElapsed = normalizeExcessElapsedMs(row.v2_excess_elapsed_ms);
    let nextBaseIncome = normalizeExcessBaseIncome(row.v2_excess_base_income);
    let clearSession = false;
    /** Reset generation/energy anchors so settle cannot re-add pre-debug wall-clock. */
    let resetFinancialAnchor = false;
    /** Pair D_base ledger with the new financial elapsed (production helper). */
    let syncBaseIncomeFromElapsed = false;
    const nowMs = Date.now();

    if (body.action === "resetSession") {
      const { sql } = clearExcessSessionSqlParams();
      await client.query(sql, [String(userId)]);
      await client.query("COMMIT");
      const excess = buildEconomyV2ExcessPublicState(
        nextSeconds,
        inactiveExcessSession(),
        emptyExcessResult(),
        nextElapsed,
        nextBaseIncome,
      );
      return {
        excessSeconds: nextSeconds,
        excessElapsedMs: nextElapsed,
        excessBaseIncome: nextBaseIncome,
        excess,
      };
    }

    const accRow = await client.query(
      `SELECT active_balance FROM accounts WHERE user_id = $1`,
      [String(userId)],
    );
    const capitalRaw = parseFloat(String(accRow.rows[0]?.active_balance ?? "0"));
    const capital = Number.isFinite(capitalRaw) && capitalRaw > 0 ? capitalRaw : 0;

    if (body.action === "reset") {
      nextSeconds = 0;
      nextElapsed = 0;
      nextBaseIncome = 0;
      // Debug reset also closes any frozen Metelka session so live T is unambiguous.
      clearSession = true;
      resetFinancialAnchor = true;
    } else if (body.action === "add") {
      // Synthetic: game seconds only — do not invent financial elapsed / base income.
      // Does not clear an active session (freeze stays; UI must show it).
      nextSeconds = currentPlus(nextSeconds, body.seconds);
    } else if (body.action === "set") {
      nextSeconds = body.seconds;
    } else if (body.action === "setPreset") {
      // Ledger for target T via production formula — never excessSeconds = T.
      nextSeconds = minExcessSecondsForPreset(body.presetSeconds);
      // Explicit 0 = zero-money path; omit → natural generation wall-clock.
      if (body.elapsedMs !== undefined) {
        nextElapsed = body.elapsedMs;
        syncBaseIncomeFromElapsed = body.elapsedMs > 0;
        if (body.elapsedMs <= 0) nextBaseIncome = 0;
      } else {
        nextElapsed = debugMetelkaElapsedMsForLedger(nextSeconds, capital);
        syncBaseIncomeFromElapsed = true;
      }
      // Clear frozen session so the next start matches the new live T.
      clearSession = true;
      resetFinancialAnchor = true;
      if (deriveExcessPresetSeconds(nextSeconds) !== body.presetSeconds) {
        await client.query("ROLLBACK");
        throw new EconomyV2ExcessDebugError(
          500,
          "preset_ledger_mismatch",
          `min ledger for T=${body.presetSeconds} did not derive that T`,
        );
      }
    } else if (body.action === "setElapsed") {
      // Keep ledger; only set financial wall-clock (debug money input).
      nextElapsed = body.elapsedMs;
      syncBaseIncomeFromElapsed = body.elapsedMs > 0;
      if (body.elapsedMs <= 0) nextBaseIncome = 0;
      resetFinancialAnchor = true;
    } else {
      nextSeconds = body.seconds;
      nextElapsed = body.elapsedMs;
      syncBaseIncomeFromElapsed = body.elapsedMs > 0;
      if (body.elapsedMs <= 0) nextBaseIncome = 0;
      resetFinancialAnchor = true;
      // setFinancial does not invent base income beyond paired elapsed.
    }

    nextSeconds = normalizeExcessSeconds(nextSeconds);
    nextElapsed = normalizeExcessElapsedMs(nextElapsed);
    if (syncBaseIncomeFromElapsed) {
      nextBaseIncome = normalizeExcessBaseIncome(
        computeBaseIncomeForElapsedMs({
          capital,
          elapsedMs: nextElapsed,
          annualRate: V2_BASE_APR,
        }),
      );
    } else {
      nextBaseIncome = normalizeExcessBaseIncome(nextBaseIncome);
    }

    // Atomic: ledger/elapsed (+ optional anchors) in one UPDATE before COMMIT.
    // Public response is built from these values — no settle with stale anchor.
    if (resetFinancialAnchor) {
      // v3_generation_anchor_at = TIMESTAMP; v2_energy_anchor_at = BIGINT ms.
      // Clear freeze so settle cannot reuse a pre-debug wall-clock window.
      await client.query(
        `UPDATE game_state
         SET v2_excess_seconds = $2,
             v2_excess_elapsed_ms = $3,
             v2_excess_base_income = $4,
             v3_generation_anchor_at = to_timestamp($5::double precision / 1000.0),
             v2_energy_anchor_at = $5,
             v3_generation_frozen_at = NULL,
             updated_at = NOW()
         WHERE user_id = $1`,
        [String(userId), nextSeconds, nextElapsed, nextBaseIncome, nowMs],
      );
    } else {
      await client.query(
        `UPDATE game_state
         SET v2_excess_seconds = $2,
             v2_excess_elapsed_ms = $3,
             v2_excess_base_income = $4,
             updated_at = NOW()
         WHERE user_id = $1`,
        [String(userId), nextSeconds, nextElapsed, nextBaseIncome],
      );
    }

    if (clearSession) {
      const { sql } = clearExcessSessionSqlParams();
      await client.query(sql, [String(userId)]);
    }

    await client.query("COMMIT");

    const excess = clearSession
      ? buildEconomyV2ExcessPublicState(
          nextSeconds,
          inactiveExcessSession(),
          emptyExcessResult(),
          nextElapsed,
          nextBaseIncome,
        )
      : buildEconomyV2ExcessFromRow({
          ...row,
          v2_excess_seconds: nextSeconds,
          v2_excess_elapsed_ms: nextElapsed,
          v2_excess_base_income: nextBaseIncome,
        });
    return {
      excessSeconds: nextSeconds,
      excessElapsedMs: nextElapsed,
      excessBaseIncome: nextBaseIncome,
      excess,
    };
  } catch (err) {
    if (err instanceof EconomyV2ExcessDebugError) throw err;
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

function currentPlus(current: number, add: number): number {
  return current + add;
}
