/**
 * Persist Economy v3 round-robin root generation + insurance auto-transfer.
 * When all activity reserves are full, diverts generation into the existing
 * v2 excess ledger (v2_excess_seconds / elapsed / base_income).
 * Does not mutate Metelka session columns or Care.
 */

import { pool } from "@workspace/db";
import {
  loadCapitalForUser,
  isEconomyV2TutorialActive,
  type EconomyV2DbClient,
} from "./economy-v2-energy-settle";
import {
  buildEconomyV2ExcessFromRow,
  isExcessAvailable,
  normalizeExcessSeconds,
  type EconomyV2ExcessPublicState,
} from "./economy-v2-excess";
import {
  computeBaseIncomeForElapsedMs,
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
} from "./economy-v2-excess-income";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import {
  computeV3EffectivePresetSeconds,
  V3_EFFECTIVE_CAPACITY_MAX,
} from "./economy-v3-effective-capacity";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  autoTransferEconomyV3RemainingPure,
  buildEconomyV3RootsPublicState,
  clampReserveSeconds,
  clampRootSeconds,
  economyV3DayKeyUtc,
  normalizeDailyCap,
  normalizeGenerationProgress,
  normalizeGenerationRrCursor,
  normalizeTransferredRoots,
  parseNullableTimestampMs,
  settleEconomyV3Roots,
  toEconomyV3AutoTransferPublic,
  validateRootKind,
  type EconomyV3AutoTransferPublic,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
  type SettleEconomyV3RootsResult,
} from "./economy-v3-roots";
import {
  advanceV3MetelkaCycleFlags,
  computeV3RootsFull,
  readV3MetelkaCompletedForCycle,
  readV3MetelkaRequired,
} from "./economy-v3-metelka-cycle";

export type EconomyV3DbClient = EconomyV2DbClient;

export type PersistedEconomyV3ExcessLedger = {
  excessSeconds: number;
  excessElapsedMs: number;
  excessBaseIncome: number;
  excess: EconomyV2ExcessPublicState;
};

export type PersistedEconomyV3Roots = SettleEconomyV3RootsResult & {
  snapshot: EconomyV3RootsPublicState;
  /** Present only when this settle request applied insurance auto-transfer. */
  autoTransfer: EconomyV3AutoTransferPublic | null;
  /** Present when this settle wrote the shared excess ledger. */
  excessLedger: PersistedEconomyV3ExcessLedger | null;
};

const V3_SETTLE_SELECT = `
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
  v2_excess_session_income_applied,
  ${V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS.trim()}
`;

type EconomyV3SettleRow = EconomyV3RootsRow & {
  streak_days?: unknown;
  v2_excess_seconds?: unknown;
  v2_excess_elapsed_ms?: unknown;
  v2_excess_base_income?: unknown;
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
  v2_excess_session_xp_max?: unknown;
  v2_excess_session_xp_raw?: unknown;
  v2_excess_session_xp_awarded?: unknown;
  v2_excess_session_xp_applied?: unknown;
  v2_excess_session_gross_income?: unknown;
  v2_excess_session_payment_factor?: unknown;
  v2_excess_session_paid_income?: unknown;
  v2_excess_session_income_applied?: unknown;
};

function sumDiscardedByRoot(
  discarded: Partial<Record<"water" | "sun" | "fertilizer", number>>,
): number {
  return (
    (discarded.water ?? 0) +
    (discarded.sun ?? 0) +
    (discarded.fertilizer ?? 0)
  );
}

/**
 * Settle v3 roots inside an open transaction.
 * After generation settle, applies insurance auto-transfer when due.
 * When ordinaryFull, accrues into the shared v2 excess ledger.
 * Capacity-normalize overflow and transfer overflow ADD to excess (never clear).
 * Caller must hold SELECT … FOR UPDATE on game_state for this user.
 */
export async function settleEconomyV3RootsInTransaction(
  client: EconomyV3DbClient,
  userId: string | number,
  lockedRow: EconomyV3SettleRow,
  nowMs: number = Date.now(),
  capital?: number,
  options?: {
    /**
     * Tutorial 12:00 wait expired — run main generation once without
     * completing the tutorial (fills root cells like live play).
     */
    forceGenerate?: boolean;
  },
): Promise<PersistedEconomyV3Roots> {
  const resolvedCapital =
    capital !== undefined
      ? capital
      : await loadCapitalForUser(client, userId);

  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();
  const rowTutorialActive = isEconomyV2TutorialActive(lockedRow.tutorial_done);
  // forceGenerate: run main settle math during tutorial wait expiry, but never
  // auto-transfer (player still collects roots manually in the tutorial).
  const tutorialActive = options?.forceGenerate ? false : rowTutorialActive;
  const basePresetSeconds = normalizeDailyCap(lockedRow.v3_daily_cap_seconds);
  const streakDays = lockedRow.streak_days;
  const effectivePresetSeconds = computeV3EffectivePresetSeconds({
    basePresetSeconds,
    streakDays,
  });
  const excessBaseBefore = normalizeExcessBaseIncome(
    lockedRow.v2_excess_base_income,
  );

  const settled = settleEconomyV3Roots({
    rootWaterSeconds: clampRootSeconds(
      lockedRow.v3_root_water_seconds,
      V3_EFFECTIVE_CAPACITY_MAX,
    ),
    rootSunSeconds: clampRootSeconds(
      lockedRow.v3_root_sun_seconds,
      V3_EFFECTIVE_CAPACITY_MAX,
    ),
    rootFertilizerSeconds: clampRootSeconds(
      lockedRow.v3_root_fertilizer_seconds,
      V3_EFFECTIVE_CAPACITY_MAX,
    ),
    generationProgress: normalizeGenerationProgress(
      lockedRow.v3_generation_progress,
    ),
    generationRrCursor: normalizeGenerationRrCursor(
      lockedRow.v3_generation_rr_cursor,
    ),
    generationAnchorAt: parseNullableTimestampMs(
      lockedRow.v3_generation_anchor_at,
    ),
    generationFrozenAt: parseNullableTimestampMs(
      lockedRow.v3_generation_frozen_at,
    ),
    dayKey:
      lockedRow.v3_day_key == null || String(lockedRow.v3_day_key).trim() === ""
        ? null
        : String(lockedRow.v3_day_key).trim(),
    capital: resolvedCapital,
    nowMs: now,
    tutorialActive,
    transferredRoots: normalizeTransferredRoots(
      lockedRow.v3_transferred_roots,
    ),
    reserveWaterSeconds: clampReserveSeconds(
      lockedRow.v3_reserve_water_seconds,
      V3_EFFECTIVE_CAPACITY_MAX,
    ),
    reserveSunSeconds: clampReserveSeconds(
      lockedRow.v3_reserve_sun_seconds,
      V3_EFFECTIVE_CAPACITY_MAX,
    ),
    reserveFertilizerSeconds: clampReserveSeconds(
      lockedRow.v3_reserve_fertilizer_seconds,
      V3_EFFECTIVE_CAPACITY_MAX,
    ),
    dailyCapSeconds: basePresetSeconds,
    streakDays,
    excessSeconds: normalizeExcessSeconds(lockedRow.v2_excess_seconds),
    excessElapsedMs: normalizeExcessElapsedMs(lockedRow.v2_excess_elapsed_ms),
  });

  const excessBaseIncrement = computeBaseIncomeForElapsedMs({
    capital: resolvedCapital,
    elapsedMs: settled.excessElapsedMsGenerated,
  });
  const nextExcessBaseIncome = excessBaseBefore + excessBaseIncrement;

  // After generation: latch Metelka-required when all roots hit capacity.
  // (Auto-transfer may drain roots further below — re-advance after auto.)
  let metelkaRequired = readV3MetelkaRequired(lockedRow.v3_metelka_required);
  let metelkaCompletedForCycle = readV3MetelkaCompletedForCycle(
    lockedRow.v3_metelka_completed_for_cycle,
  );
  const cycleAfterSettle = advanceV3MetelkaCycleFlags({
    rootsFull: computeV3RootsFull({
      rootWaterSeconds: settled.rootWaterSeconds,
      rootSunSeconds: settled.rootSunSeconds,
      rootFertilizerSeconds: settled.rootFertilizerSeconds,
      capacitySeconds: effectivePresetSeconds,
    }),
    required: metelkaRequired,
    completedForCycle: metelkaCompletedForCycle,
  });
  metelkaRequired = cycleAfterSettle.required;
  metelkaCompletedForCycle = cycleAfterSettle.completedForCycle;

  const firstRaw = lockedRow.v3_first_transferred_root;
  const firstTransferredRoot =
    firstRaw != null && validateRootKind(firstRaw) ? firstRaw : null;

  // Tutorial: player must transfer remaining roots manually (production 60s unchanged).
  const auto = rowTutorialActive
    ? null
    : autoTransferEconomyV3RemainingPure({
        nowMs: now,
        rootWaterSeconds: settled.rootWaterSeconds,
        rootSunSeconds: settled.rootSunSeconds,
        rootFertilizerSeconds: settled.rootFertilizerSeconds,
        reserveWaterSeconds: settled.reserveWaterSeconds,
        reserveSunSeconds: settled.reserveSunSeconds,
        reserveFertilizerSeconds: settled.reserveFertilizerSeconds,
        dailyCapSeconds: effectivePresetSeconds,
        capacitySeconds: effectivePresetSeconds,
        transferredRoots: normalizeTransferredRoots(
          lockedRow.v3_transferred_roots,
        ),
        firstTransferredRoot,
        generationFrozenAt: parseNullableTimestampMs(
          lockedRow.v3_generation_frozen_at,
        ),
        insuranceDeadlineAt: parseNullableTimestampMs(
          lockedRow.v3_insurance_deadline_at,
        ),
        generationProgress: settled.generationProgress,
        generationAnchorAt: settled.generationAnchorAt,
      });

  if (auto?.applied) {
    // Overflow from auto-transfer ADDs to excess; never clears prior ledger.
    const autoDiscard = sumDiscardedByRoot(auto.discardedByRoot);
    const excessAfterAuto = normalizeExcessSeconds(
      settled.excessSeconds + autoDiscard,
    );
    const excessElapsedAfterAuto = normalizeExcessElapsedMs(
      settled.excessElapsedMs,
    );
    const excessBaseAfterAuto = nextExcessBaseIncome;

    const cycleAfterAuto = advanceV3MetelkaCycleFlags({
      rootsFull: computeV3RootsFull({
        rootWaterSeconds: auto.rootWaterSeconds,
        rootSunSeconds: auto.rootSunSeconds,
        rootFertilizerSeconds: auto.rootFertilizerSeconds,
        capacitySeconds: effectivePresetSeconds,
      }),
      required: metelkaRequired,
      completedForCycle: metelkaCompletedForCycle,
    });
    metelkaRequired = cycleAfterAuto.required;
    metelkaCompletedForCycle = cycleAfterAuto.completedForCycle;

    await client.query(
      `UPDATE game_state
       SET v3_root_water_seconds = $2,
           v3_root_sun_seconds = $3,
           v3_root_fertilizer_seconds = $4,
           v3_reserve_water_seconds = $5,
           v3_reserve_sun_seconds = $6,
           v3_reserve_fertilizer_seconds = $7,
           v3_daily_cap_seconds = $8,
           v3_generation_progress = $9,
           v3_generation_rr_cursor = $10,
           v3_generation_anchor_at = $11,
           v3_day_key = $12,
           v3_generation_frozen_at = NULL,
           v3_insurance_deadline_at = NULL,
           v3_first_transferred_root = NULL,
           v3_transferred_roots = '{}'::text[],
           v2_excess_seconds = $13,
           v2_excess_elapsed_ms = $14,
           v2_excess_base_income = $15,
           v3_metelka_required = $16,
           v3_metelka_completed_for_cycle = $17,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        auto.rootWaterSeconds,
        auto.rootSunSeconds,
        auto.rootFertilizerSeconds,
        auto.reserveWaterSeconds,
        auto.reserveSunSeconds,
        auto.reserveFertilizerSeconds,
        basePresetSeconds,
        auto.generationProgress,
        settled.generationRrCursor,
        new Date(auto.generationAnchorAt),
        settled.dayKey,
        excessAfterAuto,
        excessElapsedAfterAuto,
        excessBaseAfterAuto,
        metelkaRequired,
        metelkaCompletedForCycle,
      ],
    );

    lockedRow.v3_root_water_seconds = auto.rootWaterSeconds;
    lockedRow.v3_root_sun_seconds = auto.rootSunSeconds;
    lockedRow.v3_root_fertilizer_seconds = auto.rootFertilizerSeconds;
    lockedRow.v3_reserve_water_seconds = auto.reserveWaterSeconds;
    lockedRow.v3_reserve_sun_seconds = auto.reserveSunSeconds;
    lockedRow.v3_reserve_fertilizer_seconds = auto.reserveFertilizerSeconds;
    lockedRow.v3_daily_cap_seconds = basePresetSeconds;
    lockedRow.v3_generation_progress = auto.generationProgress;
    lockedRow.v3_generation_rr_cursor = settled.generationRrCursor;
    lockedRow.v3_generation_anchor_at = new Date(auto.generationAnchorAt);
    lockedRow.v3_day_key = settled.dayKey;
    lockedRow.v3_generation_frozen_at = null;
    lockedRow.v3_insurance_deadline_at = null;
    lockedRow.v3_first_transferred_root = null;
    lockedRow.v3_transferred_roots = [];
    lockedRow.v2_excess_seconds = excessAfterAuto;
    lockedRow.v2_excess_elapsed_ms = excessElapsedAfterAuto;
    lockedRow.v2_excess_base_income = excessBaseAfterAuto;
    lockedRow.v3_metelka_required = metelkaRequired;
    lockedRow.v3_metelka_completed_for_cycle = metelkaCompletedForCycle;

    const snapshot = buildEconomyV3RootsPublicState(lockedRow, {
      capital: resolvedCapital,
      nowMs: now,
      generatingExcess: settled.generatingExcess,
      excessAvailable: isExcessAvailable(excessAfterAuto),
      metelkaRequired,
      metelkaCompletedForCycle,
      streakDays,
    });

    const excess = buildEconomyV2ExcessFromRow({
      ...lockedRow,
      v2_excess_seconds: excessAfterAuto,
      v2_excess_elapsed_ms: excessElapsedAfterAuto,
      v2_excess_base_income: excessBaseAfterAuto,
    });

    return {
      ...settled,
      rootWaterSeconds: auto.rootWaterSeconds,
      rootSunSeconds: auto.rootSunSeconds,
      rootFertilizerSeconds: auto.rootFertilizerSeconds,
      reserveWaterSeconds: auto.reserveWaterSeconds,
      reserveSunSeconds: auto.reserveSunSeconds,
      reserveFertilizerSeconds: auto.reserveFertilizerSeconds,
      generationProgress: auto.generationProgress,
      generationAnchorAt: auto.generationAnchorAt,
      excessSeconds: excessAfterAuto,
      excessElapsedMs: excessElapsedAfterAuto,
      excessGenerated: settled.excessGenerated,
      snapshot,
      autoTransfer: toEconomyV3AutoTransferPublic(auto),
      excessLedger: {
        excessSeconds: excessAfterAuto,
        excessElapsedMs: excessElapsedAfterAuto,
        excessBaseIncome: excessBaseAfterAuto,
        excess,
      },
    };
  }

  // Always persist clamped reserves too — capacity-normalize may have reduced them.
  await client.query(
    `UPDATE game_state
     SET v3_root_water_seconds = $2,
         v3_root_sun_seconds = $3,
         v3_root_fertilizer_seconds = $4,
         v3_reserve_water_seconds = $5,
         v3_reserve_sun_seconds = $6,
         v3_reserve_fertilizer_seconds = $7,
         v3_generation_progress = $8,
         v3_generation_rr_cursor = $9,
         v3_generation_anchor_at = $10,
         v3_day_key = $11,
         v2_excess_seconds = $12,
         v2_excess_elapsed_ms = $13,
         v2_excess_base_income = $14,
         v3_metelka_required = $15,
         v3_metelka_completed_for_cycle = $16,
         updated_at = NOW()
     WHERE user_id = $1`,
    [
      String(userId),
      settled.rootWaterSeconds,
      settled.rootSunSeconds,
      settled.rootFertilizerSeconds,
      settled.reserveWaterSeconds,
      settled.reserveSunSeconds,
      settled.reserveFertilizerSeconds,
      settled.generationProgress,
      settled.generationRrCursor,
      new Date(settled.generationAnchorAt),
      settled.dayKey,
      settled.excessSeconds,
      settled.excessElapsedMs,
      nextExcessBaseIncome,
      metelkaRequired,
      metelkaCompletedForCycle,
    ],
  );

  lockedRow.v3_root_water_seconds = settled.rootWaterSeconds;
  lockedRow.v3_root_sun_seconds = settled.rootSunSeconds;
  lockedRow.v3_root_fertilizer_seconds = settled.rootFertilizerSeconds;
  lockedRow.v3_reserve_water_seconds = settled.reserveWaterSeconds;
  lockedRow.v3_reserve_sun_seconds = settled.reserveSunSeconds;
  lockedRow.v3_reserve_fertilizer_seconds = settled.reserveFertilizerSeconds;
  lockedRow.v3_generation_progress = settled.generationProgress;
  lockedRow.v3_generation_rr_cursor = settled.generationRrCursor;
  lockedRow.v3_generation_anchor_at = new Date(settled.generationAnchorAt);
  lockedRow.v3_day_key = settled.dayKey;
  lockedRow.v2_excess_seconds = settled.excessSeconds;
  lockedRow.v2_excess_elapsed_ms = settled.excessElapsedMs;
  lockedRow.v2_excess_base_income = nextExcessBaseIncome;
  lockedRow.v3_metelka_required = metelkaRequired;
  lockedRow.v3_metelka_completed_for_cycle = metelkaCompletedForCycle;

  const excess = buildEconomyV2ExcessFromRow({
    ...lockedRow,
    v2_excess_seconds: settled.excessSeconds,
    v2_excess_elapsed_ms: settled.excessElapsedMs,
    v2_excess_base_income: nextExcessBaseIncome,
  });

  const snapshot = buildEconomyV3RootsPublicState(lockedRow, {
    capital: resolvedCapital,
    nowMs: now,
    generatingExcess: settled.generatingExcess,
    excessAvailable: isExcessAvailable(settled.excessSeconds),
    metelkaRequired,
    metelkaCompletedForCycle,
    streakDays,
    metelkaSessionActive:
      (lockedRow as { v2_excess_session_active?: unknown })
        .v2_excess_session_active === true,
    metelkaPendingResult:
      (lockedRow as { v2_excess_session_finished_at?: unknown })
        .v2_excess_session_finished_at != null,
  });

  return {
    ...settled,
    snapshot,
    autoTransfer: null,
    excessLedger: {
      excessSeconds: settled.excessSeconds,
      excessElapsedMs: settled.excessElapsedMs,
      excessBaseIncome: nextExcessBaseIncome,
      excess,
    },
  };
}

/**
 * Tutorial 12:00 elapsed — force main-game generation once (roots fill),
 * keep tutorial_done=false. Idempotent across polls via generation anchor.
 */
export async function syncTutorialV3WaitEnergyInTransaction(
  userId: string | number,
  startedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
): Promise<{
  synced: true;
  wholeSeconds: number;
  v3Roots: EconomyV3RootsPublicState;
}> {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameRow = await client.query(
      `SELECT ${V3_SETTLE_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );
    if (gameRow.rows.length === 0) {
      const err = new Error("Game state not found") as Error & { code: string };
      err.code = "not_found";
      throw err;
    }
    const locked = gameRow.rows[0] as EconomyV3SettleRow;
    if (!isEconomyV2TutorialActive(locked.tutorial_done)) {
      const err = new Error("Tutorial already completed") as Error & {
        code: string;
      };
      err.code = "tutorial_done";
      throw err;
    }

    const clientStart = Number(startedAtMs);
    const existingMs = parseNullableTimestampMs(locked.v3_generation_anchor_at);
    if (existingMs == null) {
      if (!Number.isFinite(clientStart) || clientStart <= 0) {
        const err = new Error("Tutorial wait start required") as Error & {
          code: string;
        };
        err.code = "invalid_started_at";
        throw err;
      }
      const started = Math.trunc(clientStart);
      locked.v3_generation_anchor_at = new Date(started);
      locked.v3_generation_progress = 0;
      await client.query(
        `UPDATE game_state
         SET v3_generation_anchor_at = $2,
             v3_generation_progress = 0,
             updated_at = NOW()
         WHERE user_id = $1`,
        [String(userId), locked.v3_generation_anchor_at],
      );
    }

    const capital = await loadCapitalForUser(
      client as EconomyV3DbClient,
      userId,
    );
    const persisted = await settleEconomyV3RootsInTransaction(
      client as EconomyV3DbClient,
      userId,
      locked,
      now,
      capital,
      { forceGenerate: true },
    );
    await client.query("COMMIT");
    return {
      synced: true,
      wholeSeconds: persisted.wholeSeconds,
      v3Roots: persisted.snapshot,
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
 * Begin/commit settle for GET /game/state (and future callers).
 * No-op when feature flag is off — returns null without touching the DB.
 */
export async function settleAndPersistEconomyV3Roots(
  userId: string | number,
  nowMs: number = Date.now(),
): Promise<PersistedEconomyV3Roots | null> {
  if (!isEconomyV3RootsEnabled()) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameRow = await client.query(
      `SELECT ${V3_SETTLE_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const locked = gameRow.rows[0] as EconomyV3SettleRow;
    const capital = await loadCapitalForUser(
      client as EconomyV3DbClient,
      userId,
    );
    const persisted = await settleEconomyV3RootsInTransaction(
      client as EconomyV3DbClient,
      userId,
      locked,
      nowMs,
      capital,
    );
    await client.query("COMMIT");
    return persisted;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Test helper: UTC day key for a fixed nowMs. */
export function economyV3DayKeyForTests(nowMs: number): string {
  return economyV3DayKeyUtc(nowMs);
}
