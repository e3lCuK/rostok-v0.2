/**
 * Debug mutations for Economy v2 Care bank (v2_energy_seconds).
 * Always returns a fresh roots public snapshot so the timer/capacity UI
 * cannot stay stuck on a stale storageFull / null countdown.
 */

import { pool } from "@workspace/db";
import {
  CAPACITY_EPSILON,
  computeV2StorageCapacity,
  maxBankSecondsUnderStorageCap,
  normalizeBankSecondsForCapacity,
  normalizeFractionalProgress,
} from "./economy-v2-capacity";
import { loadCapitalForUser, type EconomyV2DbClient } from "./economy-v2-energy-settle";
import {
  buildEconomyV2RootsPublicState,
  countReadySections,
  flushProgressIntoReadySections,
  maskToString,
  parseRootGenerationProgress,
  parseRootReadyMask,
  type EconomyV2RootsPublicState,
} from "./economy-v2-roots";

export class EconomyV2EnergyDebugError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV2EnergyDebugError";
    this.status = status;
    this.code = code;
  }
}

const V2_ENERGY_MIN = 0;
const V2_ENERGY_MAX = 60;
const COOLDOWN_MS = 8 * 60 * 60 * 1000;
const UNLOCK_SLACK_MS = 60_000;

export type DebugEnergyMutateInput = {
  setSeconds?: number;
  deltaSeconds?: number;
};

export type DebugEnergyMutateResult = {
  energySeconds: number;
  energyAnchorAt: number;
  lastSessionTime: number | null;
  missedSessions: number;
  /** Fresh capacity / countdown after bank change. */
  roots: EconomyV2RootsPublicState;
  /** Compact capacity diagnostics (dev). */
  capacity: {
    bankSeconds: number;
    readyCount: number;
    generationProgress: number;
    occupied: number;
    freeCapacity: number;
    storageFull: boolean;
    storageOverCapacity: boolean;
  };
};

function clampEnergy(value: number, maxAllowed: number): number {
  const cap = Math.min(V2_ENERGY_MAX, Math.max(V2_ENERGY_MIN, maxAllowed));
  return Math.min(cap, Math.max(V2_ENERGY_MIN, value));
}

/** Snap dust at the cap to exact 60 (avoids 59.999… / 60.0000001). */
export function snapBankSeconds(raw: number): number {
  const n = normalizeBankSecondsForCapacity(raw);
  if (n >= V2_ENERGY_MAX - CAPACITY_EPSILON) return V2_ENERGY_MAX;
  if (n <= V2_ENERGY_MIN + CAPACITY_EPSILON) return V2_ENERGY_MIN;
  return n;
}

/**
 * «Заполнить до 60»: bank=60, mask cleared, progress=0.
 * Must NOT leave room for leftover ready/progress (that yielded bank=59).
 */
export function isDebugFillToCap(setSeconds: number | undefined): boolean {
  if (setSeconds == null || !Number.isFinite(setSeconds)) return false;
  return setSeconds >= V2_ENERGY_MAX - CAPACITY_EPSILON;
}

/**
 * After bank changes: flush near-1 progress into ready, then clamp fractional
 * progress so occupied never exceeds 60.
 */
export function normalizeRootsAfterBankChange(input: {
  energySeconds: number;
  rootReadyMask: bigint;
  generationProgress: number;
}): { mask: bigint; progress: number } {
  const flushed = flushProgressIntoReadySections({
    energySeconds: input.energySeconds,
    mask: input.rootReadyMask,
    progress: input.generationProgress,
  });
  let progress = flushed.progress;
  const readyCount = countReadySections(flushed.mask);
  const room = 60 - input.energySeconds - readyCount;
  if (room <= CAPACITY_EPSILON) {
    progress = 0;
  } else if (progress > room) {
    progress = normalizeFractionalProgress(Math.min(progress, room));
  }
  return { mask: flushed.mask, progress };
}

export async function debugMutateEconomyV2Energy(
  userId: string | number,
  body: DebugEnergyMutateInput,
  nowMs: number = Date.now(),
): Promise<DebugEnergyMutateResult> {
  const hasSet = body.setSeconds !== undefined && body.setSeconds !== null;
  const hasDelta = body.deltaSeconds !== undefined && body.deltaSeconds !== null;
  if (!hasSet && !hasDelta) {
    throw new EconomyV2EnergyDebugError(
      400,
      "invalid_request",
      "Expected finite deltaSeconds and/or setSeconds",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT v2_energy_seconds, v2_energy_anchor_at, last_session_time, missed_sessions,
              v2_root_ready_mask, v2_root_generation_progress
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      throw new EconomyV2EnergyDebugError(404, "not_found", "Game state not found");
    }

    const row = gameRow.rows[0] as Record<string, unknown>;
    const maskIn = parseRootReadyMask(row.v2_root_ready_mask);
    const progressIn = parseRootGenerationProgress(row.v2_root_generation_progress);
    const settled = normalizeBankSecondsForCapacity(
      typeof row.v2_energy_seconds === "number"
        ? row.v2_energy_seconds
        : parseFloat(String(row.v2_energy_seconds ?? "0")),
    );

    let nextEnergy: number;
    let nextMask: bigint;
    let nextProgress: number;

    if (hasSet && isDebugFillToCap(Number(body.setSeconds))) {
      // Fill: exact 60 bank, wipe ready + progress — never clamp under leftover roots.
      nextEnergy = V2_ENERGY_MAX;
      nextMask = 0n;
      nextProgress = 0;
    } else {
      const readyCount = countReadySections(maskIn);
      const maxBank = maxBankSecondsUnderStorageCap({
        readyCount,
        generationProgress: progressIn,
      });
      nextEnergy = snapBankSeconds(
        clampEnergy(
          hasSet ? Number(body.setSeconds) : settled + Number(body.deltaSeconds),
          maxBank,
        ),
      );
      const normalized = normalizeRootsAfterBankChange({
        energySeconds: nextEnergy,
        rootReadyMask: maskIn,
        generationProgress: progressIn,
      });
      nextMask = normalized.mask;
      nextProgress = normalized.progress;
    }

    const unlockLastSession =
      nextEnergy > 0 ? nowMs - COOLDOWN_MS - UNLOCK_SLACK_MS : null;

    await client.query(
      `UPDATE game_state SET
         v2_energy_seconds = $2,
         v2_energy_anchor_at = $3,
         v2_root_ready_mask = $4,
         v2_root_generation_progress = $5,
         last_session_time = COALESCE($6, last_session_time),
         updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        nextEnergy,
        nowMs,
        maskToString(nextMask),
        nextProgress,
        nextEnergy > 0 ? unlockLastSession : null,
      ],
    );

    const capital = await loadCapitalForUser(
      client as EconomyV2DbClient,
      userId,
    );
    const roots = buildEconomyV2RootsPublicState({
      rootReadyMask: nextMask,
      rootGenerationProgress: nextProgress,
      capital,
      energySeconds: nextEnergy,
    });
    const capacity = computeV2StorageCapacity({
      energySeconds: nextEnergy,
      readyCount: countReadySections(nextMask),
      generationProgress: nextProgress,
    });

    await client.query("COMMIT");

    const lastSessionTime =
      nextEnergy > 0
        ? unlockLastSession
        : row.last_session_time != null
          ? parseInt(String(row.last_session_time), 10)
          : null;

    const energyOut = snapBankSeconds(nextEnergy);

    return {
      energySeconds: energyOut,
      energyAnchorAt: nowMs,
      lastSessionTime: Number.isFinite(lastSessionTime as number)
        ? (lastSessionTime as number)
        : null,
      missedSessions: parseInt(String(row.missed_sessions ?? "0"), 10) || 0,
      roots,
      capacity: {
        bankSeconds: snapBankSeconds(capacity.bankSeconds),
        readyCount: capacity.readyCount,
        generationProgress: capacity.generationProgress,
        occupied: capacity.occupied,
        freeCapacity: capacity.freeCapacity,
        storageFull: capacity.storageFull,
        storageOverCapacity: capacity.overCapacity,
      },
    };
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
