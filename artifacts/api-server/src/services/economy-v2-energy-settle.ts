import { pool } from "@workspace/db";
import {
  buildEconomyV2ExcessFromRow,
  normalizeExcessSeconds,
  type EconomyV2ExcessPublicState,
} from "./economy-v2-excess";
import {
  computeBaseIncomeForElapsedMs,
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
  normalizeOrdinaryIncomeElapsedMs,
} from "./economy-v2-excess-income";
import {
  buildEconomyV2RootsPublicState,
  countReadySections,
  maskToString,
  parseRootGenerationProgress,
  parseRootReadyMask,
  settleEconomyV2Roots,
  type EconomyV2RootsPublicState,
  type SettleEconomyV2RootsResult,
} from "./economy-v2-roots";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";

export type PersistedEconomyV2Energy = {
  energySeconds: number;
  energyAnchorAt: number;
  rootReadyMask: bigint;
  rootGenerationProgress: number;
  excessSeconds: number;
  excessElapsedMs: number;
  excessBaseIncome: number;
  ordinaryIncomeElapsedMs: number;
  roots: EconomyV2RootsPublicState;
  excess: EconomyV2ExcessPublicState;
};

/** Minimal query surface used inside an open transaction. */
export type EconomyV2DbClient = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

function parseEnergySeconds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function parseAnchorAt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function parseCapital(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export async function loadCapitalForUser(
  client: EconomyV2DbClient,
  userId: string | number,
): Promise<number> {
  const accRow = await client.query(
    `SELECT active_balance FROM accounts WHERE user_id = $1`,
    [userId],
  );
  return accRow.rows.length > 0
    ? parseCapital(accRow.rows[0].active_balance)
    : 0;
}

/**
 * Tutorial is active while `tutorial_done` is explicitly false.
 * Matches GET /game/state: `tutorialDone = tutorial_done !== false`
 * (missing / null / true → Economy v2 runs as normal).
 */
export function isEconomyV2TutorialActive(tutorialDoneRaw: unknown): boolean {
  return tutorialDoneRaw === false;
}

export type LockedEnergyRow = {
  v2_energy_seconds: unknown;
  v2_energy_anchor_at: unknown;
  /** When false, ordinary root generation and excess accrual are paused. */
  tutorial_done?: unknown;
  v2_root_ready_mask?: unknown;
  v2_root_generation_progress?: unknown;
  v2_excess_seconds?: unknown;
  v2_excess_elapsed_ms?: unknown;
  v2_excess_base_income?: unknown;
  v2_ordinary_income_elapsed_ms?: unknown;
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

/**
 * Settle root maturation using an already-open transaction.
 * Caller must hold SELECT … FOR UPDATE on game_state for this user.
 * Updates roots + generation anchor + excess; does NOT increase collected bank.
 */
export async function settleEconomyV2EnergyInTransaction(
  client: EconomyV2DbClient,
  userId: string | number,
  lockedRow: LockedEnergyRow,
  nowMs: number = Date.now(),
  capital?: number,
): Promise<PersistedEconomyV2Energy> {
  const resolvedCapital =
    capital !== undefined
      ? capital
      : await loadCapitalForUser(client, userId);

  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();

  // During Tutorial: do not mature ordinary roots or grow excess.
  // Advance the generation anchor to now so completing Tutorial cannot backfill
  // energy for time spent in the tutorial.
  if (isEconomyV2TutorialActive(lockedRow.tutorial_done)) {
    const energySeconds = parseEnergySeconds(lockedRow.v2_energy_seconds);
    const rootReadyMask = parseRootReadyMask(lockedRow.v2_root_ready_mask);
    const rootGenerationProgress = parseRootGenerationProgress(
      lockedRow.v2_root_generation_progress,
    );
    const excessSeconds = normalizeExcessSeconds(lockedRow.v2_excess_seconds);
    const excessElapsedMs = normalizeExcessElapsedMs(
      lockedRow.v2_excess_elapsed_ms,
    );
    const excessBaseIncome = normalizeExcessBaseIncome(
      lockedRow.v2_excess_base_income,
    );
    const ordinaryIncomeElapsedMs = normalizeOrdinaryIncomeElapsedMs(
      lockedRow.v2_ordinary_income_elapsed_ms,
    );

    await client.query(
      `UPDATE game_state
       SET v2_energy_anchor_at = $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [String(userId), now],
    );

    lockedRow.v2_energy_anchor_at = now;

    const roots = buildEconomyV2RootsPublicState({
      rootReadyMask,
      rootGenerationProgress,
      capital: resolvedCapital,
      energySeconds,
    });
    const excess = buildEconomyV2ExcessFromRow({
      ...lockedRow,
      v2_excess_seconds: excessSeconds,
      v2_excess_elapsed_ms: excessElapsedMs,
      v2_excess_base_income: excessBaseIncome,
    });

    return {
      energySeconds,
      energyAnchorAt: now,
      rootReadyMask,
      rootGenerationProgress,
      excessSeconds,
      excessElapsedMs,
      excessBaseIncome,
      ordinaryIncomeElapsedMs,
      roots,
      excess,
    };
  }

  // Economy v3 owns ordinary generation + excess gate when the flag is on.
  // Advance the v2 energy anchor only so one wall-clock window is never settled
  // by both v2 and v3 models. Preserve excess ledger / Metelka session as-is;
  // v3 settle writes excess when reserves are ordinary-full.
  if (isEconomyV3RootsEnabled()) {
    const energySeconds = parseEnergySeconds(lockedRow.v2_energy_seconds);
    const rootReadyMask = parseRootReadyMask(lockedRow.v2_root_ready_mask);
    const rootGenerationProgress = parseRootGenerationProgress(
      lockedRow.v2_root_generation_progress,
    );
    const excessSeconds = normalizeExcessSeconds(lockedRow.v2_excess_seconds);
    const excessElapsedMs = normalizeExcessElapsedMs(
      lockedRow.v2_excess_elapsed_ms,
    );
    const excessBaseIncome = normalizeExcessBaseIncome(
      lockedRow.v2_excess_base_income,
    );
    const ordinaryIncomeElapsedMs = normalizeOrdinaryIncomeElapsedMs(
      lockedRow.v2_ordinary_income_elapsed_ms,
    );

    await client.query(
      `UPDATE game_state
       SET v2_energy_anchor_at = $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [String(userId), now],
    );

    lockedRow.v2_energy_anchor_at = now;

    const roots = buildEconomyV2RootsPublicState({
      rootReadyMask,
      rootGenerationProgress,
      capital: resolvedCapital,
      energySeconds,
    });
    const excess = buildEconomyV2ExcessFromRow({
      ...lockedRow,
      v2_excess_seconds: excessSeconds,
      v2_excess_elapsed_ms: excessElapsedMs,
      v2_excess_base_income: excessBaseIncome,
    });

    return {
      energySeconds,
      energyAnchorAt: now,
      rootReadyMask,
      rootGenerationProgress,
      excessSeconds,
      excessElapsedMs,
      excessBaseIncome,
      ordinaryIncomeElapsedMs,
      roots,
      excess,
    };
  }

  const excessBaseBefore = normalizeExcessBaseIncome(
    lockedRow.v2_excess_base_income,
  );
  const ordinaryElapsedBefore = normalizeOrdinaryIncomeElapsedMs(
    lockedRow.v2_ordinary_income_elapsed_ms,
  );

  const settled: SettleEconomyV2RootsResult = settleEconomyV2Roots({
    energySeconds: parseEnergySeconds(lockedRow.v2_energy_seconds),
    energyAnchorAt: parseAnchorAt(lockedRow.v2_energy_anchor_at),
    rootReadyMask: parseRootReadyMask(lockedRow.v2_root_ready_mask),
    rootGenerationProgress: parseRootGenerationProgress(
      lockedRow.v2_root_generation_progress,
    ),
    excessSeconds: normalizeExcessSeconds(lockedRow.v2_excess_seconds),
    excessElapsedMs: normalizeExcessElapsedMs(lockedRow.v2_excess_elapsed_ms),
    capital: resolvedCapital,
    nowMs: now,
  });

  if (settled.storageOverCapacity) {
    console.warn(
      `[economy-v2] storage over capacity for user ${userId}: bank=${settled.energySeconds} ready=${countReadySections(settled.rootReadyMask)} progress=${settled.rootGenerationProgress} (not auto-corrected)`,
    );
  }

  const excessBaseIncrement = computeBaseIncomeForElapsedMs({
    capital: resolvedCapital,
    elapsedMs: settled.excessElapsedMsGenerated,
  });
  const nextExcessBaseIncome = excessBaseBefore + excessBaseIncrement;
  const nextOrdinaryIncomeElapsedMs =
    ordinaryElapsedBefore + settled.ordinaryElapsedMsGenerated;

  await client.query(
    `UPDATE game_state
     SET v2_energy_seconds = $2,
         v2_energy_anchor_at = $3,
         v2_root_ready_mask = $4,
         v2_root_generation_progress = $5,
         v2_excess_seconds = $6,
         v2_excess_elapsed_ms = $7,
         v2_excess_base_income = $8,
         v2_ordinary_income_elapsed_ms = $9,
         updated_at = NOW()
     WHERE user_id = $1`,
    [
      String(userId),
      settled.energySeconds,
      settled.energyAnchorAt,
      maskToString(settled.rootReadyMask),
      settled.rootGenerationProgress,
      settled.excessSeconds,
      settled.excessElapsedMs,
      nextExcessBaseIncome,
      nextOrdinaryIncomeElapsedMs,
    ],
  );

  lockedRow.v2_energy_seconds = settled.energySeconds;
  lockedRow.v2_energy_anchor_at = settled.energyAnchorAt;
  lockedRow.v2_root_ready_mask = maskToString(settled.rootReadyMask);
  lockedRow.v2_root_generation_progress = settled.rootGenerationProgress;
  lockedRow.v2_excess_seconds = settled.excessSeconds;
  lockedRow.v2_excess_elapsed_ms = settled.excessElapsedMs;
  lockedRow.v2_excess_base_income = nextExcessBaseIncome;
  lockedRow.v2_ordinary_income_elapsed_ms = nextOrdinaryIncomeElapsedMs;

  const roots = buildEconomyV2RootsPublicState({
    rootReadyMask: settled.rootReadyMask,
    rootGenerationProgress: settled.rootGenerationProgress,
    capital: resolvedCapital,
    energySeconds: settled.energySeconds,
  });
  const excess = buildEconomyV2ExcessFromRow({
    ...lockedRow,
    v2_excess_seconds: settled.excessSeconds,
    v2_excess_elapsed_ms: settled.excessElapsedMs,
    v2_excess_base_income: nextExcessBaseIncome,
  });

  return {
    energySeconds: settled.energySeconds,
    energyAnchorAt: settled.energyAnchorAt,
    rootReadyMask: settled.rootReadyMask,
    rootGenerationProgress: settled.rootGenerationProgress,
    excessSeconds: settled.excessSeconds,
    excessElapsedMs: settled.excessElapsedMs,
    excessBaseIncome: nextExcessBaseIncome,
    ordinaryIncomeElapsedMs: nextOrdinaryIncomeElapsedMs,
    roots,
    excess,
  };
}

/**
 * Atomically settle root energy for a user.
 *
 * Protection: BEGIN + SELECT … FOR UPDATE so concurrent GET /game/state
 * cannot mature the same elapsed window twice into the mask / excess.
 */
export async function settleAndPersistEconomyV2Energy(
  userId: string | number,
  nowMs: number = Date.now(),
): Promise<PersistedEconomyV2Energy | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT v2_energy_seconds, v2_energy_anchor_at,
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
              v2_excess_session_income_applied
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const settled = await settleEconomyV2EnergyInTransaction(
      client,
      userId,
      gameRow.rows[0] as LockedEnergyRow,
      nowMs,
    );

    await client.query("COMMIT");
    return settled;
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

export { parseEnergySeconds, parseAnchorAt, parseCapital };
