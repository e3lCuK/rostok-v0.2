import { pool } from "@workspace/db";
import {
  loadCapitalForUser,
  settleEconomyV2EnergyInTransaction,
  isEconomyV2TutorialActive,
  type EconomyV2DbClient,
  type LockedEnergyRow,
} from "./economy-v2-energy-settle";
import {
  buildEconomyV2RootsPublicState,
  collectRootSectionPure,
  maskToString,
  parseRootGenerationProgress,
  parseRootReadyMask,
  type EconomyV2RootsPublicState,
  V2_ROOT_SECTION_COUNT,
} from "./economy-v2-roots";

export class EconomyV2RootsCollectError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV2RootsCollectError";
    this.status = status;
    this.code = code;
  }
}

export type CollectRootSectionResult = {
  collected: true;
  collectedSectionIndex: number;
  energySeconds: number;
  roots: EconomyV2RootsPublicState;
};

/**
 * Atomically settle roots then collect one ready section into the Care bank.
 *
 * Contract for empty / already-collected section: 409 section_not_ready
 * (no energy added). Parallel taps on the same section: only one +1.
 * Settle side-effects are committed even when collect fails (bank full / not ready).
 */
export async function collectEconomyV2RootSection(
  userId: string | number,
  sectionIndexRaw: unknown,
  nowMs: number = Date.now(),
): Promise<CollectRootSectionResult> {
  const sectionIndex =
    typeof sectionIndexRaw === "number"
      ? sectionIndexRaw
      : parseInt(String(sectionIndexRaw ?? ""), 10);

  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= V2_ROOT_SECTION_COUNT
  ) {
    throw new EconomyV2RootsCollectError(
      400,
      "invalid_section",
      `sectionIndex must be an integer 0–${V2_ROOT_SECTION_COUNT - 1}`,
    );
  }

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
      throw new EconomyV2RootsCollectError(404, "not_found", "Game state not found");
    }

    const row = gameRow.rows[0] as LockedEnergyRow;
    if (isEconomyV2TutorialActive(row.tutorial_done)) {
      await client.query("ROLLBACK");
      throw new EconomyV2RootsCollectError(
        403,
        "tutorial_active",
        "Root collect is unavailable until the tutorial is finished",
      );
    }
    const capital = await loadCapitalForUser(client as EconomyV2DbClient, userId);

    const settled = await settleEconomyV2EnergyInTransaction(
      client as EconomyV2DbClient,
      userId,
      row,
      nowMs,
      capital,
    );

    const collected = collectRootSectionPure({
      energySeconds: settled.energySeconds,
      rootReadyMask: settled.rootReadyMask,
      sectionIndex,
    });

    if (!collected.ok) {
      // Persist settle (matured sections) even when this tap cannot collect.
      await client.query("COMMIT");
      if (collected.code === "section_not_ready") {
        throw new EconomyV2RootsCollectError(
          409,
          "section_not_ready",
          "Root section is not ready to collect",
        );
      }
      if (collected.code === "energy_bank_full") {
        throw new EconomyV2RootsCollectError(
          409,
          "energy_bank_full",
          "Collected energy bank is full (60)",
        );
      }
      throw new EconomyV2RootsCollectError(
        400,
        "invalid_section",
        "Invalid section index",
      );
    }

    await client.query(
      `UPDATE game_state
       SET v2_energy_seconds = $2,
           v2_root_ready_mask = $3,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        collected.energySeconds,
        maskToString(collected.rootReadyMask),
      ],
    );

    await client.query("COMMIT");

    const roots = buildEconomyV2RootsPublicState({
      rootReadyMask: collected.rootReadyMask,
      rootGenerationProgress: settled.rootGenerationProgress,
      capital,
      energySeconds: collected.energySeconds,
    });

    return {
      collected: true,
      collectedSectionIndex: sectionIndex,
      energySeconds: collected.energySeconds,
      roots,
    };
  } catch (err) {
    if (err instanceof EconomyV2RootsCollectError) throw err;
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

/** Helper for GET state mapping without a transaction. */
export function rootsStateFromRow(
  row: {
    v2_energy_seconds?: unknown;
    v2_root_ready_mask?: unknown;
    v2_root_generation_progress?: unknown;
  },
  capital: number,
): EconomyV2RootsPublicState {
  const energyRaw = row.v2_energy_seconds;
  const energySeconds =
    typeof energyRaw === "number"
      ? energyRaw
      : parseFloat(String(energyRaw ?? "0"));
  return buildEconomyV2RootsPublicState({
    rootReadyMask: parseRootReadyMask(row.v2_root_ready_mask),
    rootGenerationProgress: parseRootGenerationProgress(
      row.v2_root_generation_progress,
    ),
    capital,
    energySeconds: Number.isFinite(energySeconds) ? energySeconds : 0,
  });
}
