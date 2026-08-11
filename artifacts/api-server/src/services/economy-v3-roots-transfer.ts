/**
 * Manual Economy v3 root → activity reserve transfer.
 * First transfer freezes the trio; third clears freeze and opens a new cycle.
 * Auto-transfer is not executed here.
 */

import { pool } from "@workspace/db";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import {
  computeV3EffectivePresetSeconds,
} from "./economy-v3-effective-capacity";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  buildEconomyV3RootsPublicState,
  clampReserveSeconds,
  normalizeDailyCap,
  normalizeTransferredRoots,
  parseNullableTimestampMs,
  transferEconomyV3RootPure,
  validateRootKind,
  type EconomyV3AutoTransferPublic,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
  type RootKind,
} from "./economy-v3-roots";
import {
  settleEconomyV3RootsInTransaction,
  type EconomyV3DbClient,
} from "./economy-v3-roots-settle";
import {
  isEconomyV2TutorialActive,
  loadCapitalForUser,
} from "./economy-v2-energy-settle";
import {
  normalizeExcessSeconds,
} from "./economy-v2-excess";
import {
  advanceV3MetelkaCycleFlags,
  computeV3RootsFull,
  readV3MetelkaCompletedForCycle,
  readV3MetelkaRequired,
} from "./economy-v3-metelka-cycle";
import {
  grantTutorialV3RootsPure,
  V3_TUTORIAL_ROOT_SECONDS,
} from "./economy-v3-tutorial-pure";

export class EconomyV3RootsTransferError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3RootsTransferError";
    this.status = status;
    this.code = code;
  }
}

export type TransferEconomyV3RootResult = {
  transferred: true;
  root: RootKind;
  transferredSeconds: number;
  acceptedSeconds: number;
  discardedSeconds: number;
  startedFreeze: boolean;
  cycleCompleted: boolean;
  /** Set when settle applied insurance auto-transfer in this request. */
  autoTransfer: EconomyV3AutoTransferPublic | null;
  /** True when the requested root was completed by auto-transfer (no double credit). */
  viaAutoTransfer: boolean;
  v3Roots: EconomyV3RootsPublicState;
};

const V3_TRANSFER_SELECT = `
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
  ${V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS.trim()}
`;

/**
 * Settle then transfer one root into its matching reserve under FOR UPDATE.
 */
export async function transferEconomyV3Root(
  userId: string | number,
  rootRaw: unknown,
  nowMs: number = Date.now(),
): Promise<TransferEconomyV3RootResult> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3RootsTransferError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  if (!validateRootKind(rootRaw)) {
    throw new EconomyV3RootsTransferError(
      400,
      "unknown_root",
      'root must be "water", "sun", or "fertilizer"',
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_TRANSFER_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3RootsTransferError(
        404,
        "not_found",
        "Game state not found",
      );
    }

    const locked = gameRow.rows[0] as EconomyV3RootsRow & {
      v2_excess_seconds?: unknown;
      streak_days?: unknown;
    };
    const capital = await loadCapitalForUser(
      client as EconomyV3DbClient,
      userId,
    );

    const settled = await settleEconomyV3RootsInTransaction(
      client as EconomyV3DbClient,
      userId,
      locked,
      nowMs,
      capital,
    );

    // Deadline race: settle already auto-transferred remaining roots (incl. this one).
    if (
      settled.autoTransfer?.applied &&
      settled.autoTransfer.roots.includes(rootRaw)
    ) {
      await client.query("COMMIT");
      return {
        transferred: true,
        root: rootRaw,
        transferredSeconds:
          (settled.autoTransfer.acceptedByRoot[rootRaw] ?? 0) +
          (settled.autoTransfer.discardedByRoot[rootRaw] ?? 0),
        acceptedSeconds: settled.autoTransfer.acceptedByRoot[rootRaw] ?? 0,
        discardedSeconds: settled.autoTransfer.discardedByRoot[rootRaw] ?? 0,
        startedFreeze: false,
        cycleCompleted: true,
        autoTransfer: settled.autoTransfer,
        viaAutoTransfer: true,
        v3Roots: settled.snapshot,
      };
    }

    // Metelka-before-transfer: block manual collect until Metelka finishes.
    if (settled.snapshot.metelkaCycle?.transferLocked === true) {
      await client.query("COMMIT");
      throw new EconomyV3RootsTransferError(
        409,
        "metelka_transfer_locked",
        "Сначала пройдите Метёлку — потом собирайте энергию из корней",
      );
    }

    const basePresetSeconds = normalizeDailyCap(locked.v3_daily_cap_seconds);
    const effectivePresetSeconds = computeV3EffectivePresetSeconds({
      basePresetSeconds,
      streakDays: locked.streak_days,
    });

    const firstRaw = locked.v3_first_transferred_root;
    const firstTransferredRoot =
      firstRaw != null && validateRootKind(firstRaw) ? firstRaw : null;

    // Tutorial: force two-cell (10s) fills before collect so activity presets
    // show 10 с (stale 5s grants / local-only pops cannot under-spend).
    let rootWaterSeconds = settled.rootWaterSeconds;
    let rootSunSeconds = settled.rootSunSeconds;
    let rootFertilizerSeconds = settled.rootFertilizerSeconds;
    if (isEconomyV2TutorialActive(locked.tutorial_done)) {
      const transferredSet = new Set(
        normalizeTransferredRoots(locked.v3_transferred_roots),
      );
      const forceTutorialFill = (kind: RootKind, sec: number): number => {
        if (transferredSet.has(kind)) return sec;
        // Upgrade any present energy, and always the root about to be collected.
        if (sec > 0 || kind === rootRaw) {
          return Math.max(sec, V3_TUTORIAL_ROOT_SECONDS);
        }
        return sec;
      };
      const bumped = grantTutorialV3RootsPure({
        rootWaterSeconds,
        rootSunSeconds,
        rootFertilizerSeconds,
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
        transferredRoots: normalizeTransferredRoots(locked.v3_transferred_roots),
        effectivePresetSeconds,
      });
      rootWaterSeconds = forceTutorialFill("water", bumped.rootWaterSeconds);
      rootSunSeconds = forceTutorialFill("sun", bumped.rootSunSeconds);
      rootFertilizerSeconds = forceTutorialFill(
        "fertilizer",
        bumped.rootFertilizerSeconds,
      );
      const rootsChanged =
        rootWaterSeconds !== settled.rootWaterSeconds ||
        rootSunSeconds !== settled.rootSunSeconds ||
        rootFertilizerSeconds !== settled.rootFertilizerSeconds;
      if (rootsChanged) {
        await client.query(
          `UPDATE game_state
           SET v3_root_water_seconds = $2,
               v3_root_sun_seconds = $3,
               v3_root_fertilizer_seconds = $4,
               updated_at = NOW()
           WHERE user_id = $1`,
          [
            String(userId),
            rootWaterSeconds,
            rootSunSeconds,
            rootFertilizerSeconds,
          ],
        );
        locked.v3_root_water_seconds = rootWaterSeconds;
        locked.v3_root_sun_seconds = rootSunSeconds;
        locked.v3_root_fertilizer_seconds = rootFertilizerSeconds;
      }
    }

    const transferred = transferEconomyV3RootPure({
      root: rootRaw,
      rootWaterSeconds,
      rootSunSeconds,
      rootFertilizerSeconds,
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
      capacitySeconds: effectivePresetSeconds,
      transferredRoots: normalizeTransferredRoots(locked.v3_transferred_roots),
      firstTransferredRoot,
      nowMs,
      generationFrozenAt: parseNullableTimestampMs(
        locked.v3_generation_frozen_at,
      ),
      insuranceDeadlineAt: parseNullableTimestampMs(
        locked.v3_insurance_deadline_at,
      ),
      generationProgress: settled.generationProgress,
      generationAnchorAt: settled.generationAnchorAt,
    });

    if (!transferred.ok) {
      // Persist settle side-effects even when transfer is rejected.
      await client.query("COMMIT");
      const status =
        transferred.code === "unknown_root"
          ? 400
          : transferred.code === "already_transferred" ||
              transferred.code === "empty_root" ||
              transferred.code === "reserve_full"
            ? 409
            : 400;
      throw new EconomyV3RootsTransferError(
        status,
        transferred.code,
        transferred.message,
      );
    }

    // Overflow ADDs to excess ledger; prior excess is kept.
    const excessBefore = normalizeExcessSeconds(
      locked.v2_excess_seconds ?? settled.excessSeconds,
    );
    const excessAfter = normalizeExcessSeconds(
      excessBefore + transferred.discardedSeconds,
    );

    const cycleAfterTransfer = advanceV3MetelkaCycleFlags({
      rootsFull: computeV3RootsFull({
        rootWaterSeconds: transferred.rootWaterSeconds,
        rootSunSeconds: transferred.rootSunSeconds,
        rootFertilizerSeconds: transferred.rootFertilizerSeconds,
        capacitySeconds: effectivePresetSeconds,
      }),
      required: readV3MetelkaRequired(locked.v3_metelka_required),
      completedForCycle: readV3MetelkaCompletedForCycle(
        locked.v3_metelka_completed_for_cycle,
      ),
    });

    await client.query(
      `UPDATE game_state
       SET v3_root_water_seconds = $2,
           v3_root_sun_seconds = $3,
           v3_root_fertilizer_seconds = $4,
           v3_reserve_water_seconds = $5,
           v3_reserve_sun_seconds = $6,
           v3_reserve_fertilizer_seconds = $7,
           v3_daily_cap_seconds = $8,
           v3_transferred_roots = $9::text[],
           v3_first_transferred_root = $10,
           v3_generation_frozen_at = $11,
           v3_insurance_deadline_at = $12,
           v3_generation_progress = $13,
           v3_generation_anchor_at = $14,
           v3_metelka_required = $15,
           v3_metelka_completed_for_cycle = $16,
           v2_excess_seconds = $17,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        transferred.rootWaterSeconds,
        transferred.rootSunSeconds,
        transferred.rootFertilizerSeconds,
        transferred.reserveWaterSeconds,
        transferred.reserveSunSeconds,
        transferred.reserveFertilizerSeconds,
        basePresetSeconds,
        transferred.transferredRoots,
        transferred.firstTransferredRoot,
        transferred.generationFrozenAt == null
          ? null
          : new Date(transferred.generationFrozenAt),
        transferred.insuranceDeadlineAt == null
          ? null
          : new Date(transferred.insuranceDeadlineAt),
        transferred.generationProgress,
        new Date(transferred.generationAnchorAt),
        cycleAfterTransfer.required,
        cycleAfterTransfer.completedForCycle,
        excessAfter,
      ],
    );

    locked.v3_root_water_seconds = transferred.rootWaterSeconds;
    locked.v3_root_sun_seconds = transferred.rootSunSeconds;
    locked.v3_root_fertilizer_seconds = transferred.rootFertilizerSeconds;
    locked.v3_reserve_water_seconds = transferred.reserveWaterSeconds;
    locked.v3_reserve_sun_seconds = transferred.reserveSunSeconds;
    locked.v3_reserve_fertilizer_seconds =
      transferred.reserveFertilizerSeconds;
    locked.v3_daily_cap_seconds = basePresetSeconds;
    locked.v3_transferred_roots = transferred.transferredRoots;
    locked.v3_first_transferred_root = transferred.firstTransferredRoot;
    locked.v3_generation_frozen_at =
      transferred.generationFrozenAt == null
        ? null
        : new Date(transferred.generationFrozenAt);
    locked.v3_insurance_deadline_at =
      transferred.insuranceDeadlineAt == null
        ? null
        : new Date(transferred.insuranceDeadlineAt);
    locked.v3_generation_progress = transferred.generationProgress;
    locked.v3_generation_anchor_at = new Date(transferred.generationAnchorAt);
    locked.v3_day_key = settled.dayKey;
    locked.v3_metelka_required = cycleAfterTransfer.required;
    locked.v3_metelka_completed_for_cycle =
      cycleAfterTransfer.completedForCycle;
    locked.v2_excess_seconds = excessAfter;

    await client.query("COMMIT");

    const snapshot = buildEconomyV3RootsPublicState(locked, {
      capital,
      streakDays: locked.streak_days,
    });
    return {
      transferred: true,
      root: transferred.root,
      transferredSeconds: transferred.transferredSeconds,
      acceptedSeconds: transferred.acceptedSeconds,
      discardedSeconds: transferred.discardedSeconds,
      startedFreeze: transferred.startedFreeze,
      cycleCompleted: transferred.cycleCompleted,
      autoTransfer: settled.autoTransfer,
      viaAutoTransfer: false,
      v3Roots: snapshot,
    };
  } catch (err) {
    if (!(err instanceof EconomyV3RootsTransferError)) {
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
