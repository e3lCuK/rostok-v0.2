/**
 * Local/debug mutations for Economy v2 root readyMask.
 * Server is the sole source of truth — no frontend mask override.
 *
 * Does NOT change: v2_energy_seconds (Care bank), Care, XP, income, freshness.
 */

import { pool } from "@workspace/db";
import {
  maxAddableReadySections,
} from "./economy-v2-capacity";
import {
  loadCapitalForUser,
  type EconomyV2DbClient,
  type LockedEnergyRow,
} from "./economy-v2-energy-settle";
import {
  buildEconomyV2RootsPublicState,
  countReadySections,
  maskToString,
  parseRootGenerationProgress,
  parseRootReadyMask,
  placeMaturedSections,
  type EconomyV2RootsPublicState,
} from "./economy-v2-roots";

export class EconomyV2RootsDebugError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV2RootsDebugError";
    this.status = status;
    this.code = code;
  }
}

export type DebugRootsAction =
  | { action: "reset" }
  | { action: "add"; count: number };

export type DebugRootsMutateResult = {
  readyMask: string;
  readyCount: number;
  generationProgress: number;
  energySeconds: number;
  anchorAt: number;
  roots: EconomyV2RootsPublicState;
};

function parseEnergySeconds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function parseAnchorAt(raw: unknown): number {
  if (raw == null || raw === "") return Date.now();
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : Date.now();
}

/**
 * Atomically mutate server readyMask for debug.
 * Uses the same 0→59 free-slot fill as production settle (`placeMaturedSections`).
 */
export async function debugMutateEconomyV2Roots(
  userId: string | number,
  body: DebugRootsAction,
  nowMs: number = Date.now(),
): Promise<DebugRootsMutateResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT v2_energy_seconds, v2_energy_anchor_at,
              v2_root_ready_mask, v2_root_generation_progress
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV2RootsDebugError(404, "not_found", "Game state not found");
    }

    const row = gameRow.rows[0] as LockedEnergyRow;
    const capital = await loadCapitalForUser(client as EconomyV2DbClient, userId);
    const energySeconds = parseEnergySeconds(row.v2_energy_seconds);
    let mask = parseRootReadyMask(row.v2_root_ready_mask);
    let progress = parseRootGenerationProgress(row.v2_root_generation_progress);
    let anchorAt = parseAnchorAt(row.v2_energy_anchor_at);

    if (body.action === "reset") {
      mask = 0n;
      progress = 0;
      anchorAt = nowMs;
    } else {
      const count = body.count;
      if (!Number.isInteger(count) || count < 1) {
        await client.query("ROLLBACK");
        throw new EconomyV2RootsDebugError(
          400,
          "invalid_count",
          "count must be a positive integer",
        );
      }
      const readyCount = countReadySections(mask);
      const addable = maxAddableReadySections(
        {
          energySeconds,
          readyCount,
          generationProgress: progress,
        },
        count,
      );
      const placed = placeMaturedSections(mask, addable);
      mask = placed.mask;
      // Keep generationProgress and anchor — bank/income clock untouched on add.
    }

    await client.query(
      `UPDATE game_state
       SET v2_root_ready_mask = $2,
           v2_root_generation_progress = $3,
           v2_energy_anchor_at = $4,
           updated_at = NOW()
       WHERE user_id = $1`,
      [String(userId), maskToString(mask), progress, anchorAt],
    );

    await client.query("COMMIT");

    const roots = buildEconomyV2RootsPublicState({
      rootReadyMask: mask,
      rootGenerationProgress: progress,
      capital,
      energySeconds,
    });

    return {
      readyMask: roots.readyMask,
      readyCount: countReadySections(mask),
      generationProgress: roots.generationProgress,
      energySeconds,
      anchorAt,
      roots,
    };
  } catch (err) {
    if (err instanceof EconomyV2RootsDebugError) throw err;
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
