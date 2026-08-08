/**
 * Local/debug mutations for Economy v3 root seconds + activity reserves.
 *
 * Hard-capped by effectivePresetSeconds (base + visit bonus). Never writes above cap.
 * Persisted over-capacity values are normalized into excess (production overflow path).
 * Artificial debug set/add overflow is clamped and reported — not sent to excess.
 *
 * Does NOT change: Economy v2 balance/XP/tree (except excess when normalizing real overflow).
 * Does NOT start Care or auto-transfer.
 * fillToCapacity clears transferred-root + Care-cycle markers so debug «fill →
 * click roots → Care» works again after a prior transfer/cycle.
 */

import { pool } from "@workspace/db";
import { V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS } from "./economy-v3-care-columns";
import {
  clampV3CapacitySeconds,
  computeV3EffectivePresetSeconds,
  normalizeV3StorageToEffectiveCapacity,
  splitV3CapacityOverflow,
} from "./economy-v3-effective-capacity";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  buildEconomyV3RootsPublicState,
  normalizeDailyCap,
  type EconomyV3RootsPublicState,
  type EconomyV3RootsRow,
  type RootKind,
} from "./economy-v3-roots";
import { normalizeExcessSeconds } from "./economy-v2-excess";
import { loadCapitalForUser } from "./economy-v2-energy-settle";
import type { EconomyV3DbClient } from "./economy-v3-roots-settle";

export class EconomyV3RootsDebugError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3RootsDebugError";
    this.status = status;
    this.code = code;
  }
}

export type DebugV3ActivitySeconds = {
  water?: number;
  sun?: number;
  fertilizer?: number;
};

export type DebugV3ClampFieldReport = {
  requestedSeconds: number;
  appliedSeconds: number;
  capacitySeconds: number;
  clamped: boolean;
};

export type DebugV3AddFieldReport = {
  requestedAddition: number;
  appliedAddition: number;
  discardedDebugAddition: number;
  beforeSeconds: number;
  afterSeconds: number;
  capacitySeconds: number;
};

export type DebugV3ClampReport = {
  capacitySeconds: number;
  roots?: Partial<Record<RootKind, DebugV3ClampFieldReport>>;
  reserves?: Partial<Record<RootKind, DebugV3ClampFieldReport>>;
  addRoots?: Partial<Record<RootKind, DebugV3AddFieldReport>>;
  addReserves?: Partial<Record<RootKind, DebugV3AddFieldReport>>;
};

export type DebugV3RootsAction =
  | { action: "reset" }
  | {
      action: "set";
      roots?: DebugV3ActivitySeconds;
      reserves?: DebugV3ActivitySeconds;
    }
  | {
      action: "add";
      roots?: DebugV3ActivitySeconds;
      reserves?: DebugV3ActivitySeconds;
    }
  | {
      action: "fillToCapacity";
      /** Default true when omitted with reserves omitted. */
      roots?: boolean;
      reserves?: boolean;
    };

export type DebugV3RootsMutateResult = {
  v3Roots: EconomyV3RootsPublicState;
  capacitySeconds: number;
  clamp: DebugV3ClampReport | null;
};

const V3_DEBUG_SELECT = `
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
  v2_excess_seconds,
  ${V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS.trim()}
`;

const ROOT_KINDS: RootKind[] = ["water", "sun", "fertilizer"];

/** Accept only whole integers (including 0). Reject NaN / fractional / non-numeric. */
export function parseDebugWholeSeconds(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) return null;
    return raw;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^-?\d+$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isInteger(n)) return null;
    return n;
  }
  return null;
}

/** Clamp debug write to [0, capacity]; report requested vs applied. */
export function applyDebugSecondsClamp(
  requested: number,
  capacitySeconds: number,
): DebugV3ClampFieldReport {
  const appliedSeconds = clampV3CapacitySeconds(requested, capacitySeconds);
  return {
    requestedSeconds: requested,
    appliedSeconds,
    capacitySeconds,
    clamped: appliedSeconds !== requested,
  };
}

/** Debug add: fill room up to capacity; discard leftover artificially. */
export function applyDebugSecondsAdd(
  currentSeconds: number,
  requestedAddition: number,
  capacitySeconds: number,
): DebugV3AddFieldReport {
  const current = clampV3CapacitySeconds(currentSeconds, capacitySeconds);
  const addition = Math.max(0, Math.floor(requestedAddition));
  const room = Math.max(0, capacitySeconds - current);
  const appliedAddition = Math.min(addition, room);
  return {
    requestedAddition: addition,
    appliedAddition,
    discardedDebugAddition: addition - appliedAddition,
    beforeSeconds: current,
    afterSeconds: current + appliedAddition,
    capacitySeconds,
  };
}

/** Alias — ordinary ledger clamp. */
export const clampToEffectivePreset = clampV3CapacitySeconds;

/** Alias — production overflow split (accepted + overflow). */
export function normalizeEnergyToCapacity(input: {
  currentSeconds: unknown;
  capacitySeconds: unknown;
}): { acceptedSeconds: number; overflowSeconds: number } {
  const split = splitV3CapacityOverflow({
    seconds: input.currentSeconds,
    capacitySeconds: input.capacitySeconds,
  });
  return {
    acceptedSeconds: split.keptSeconds,
    overflowSeconds: split.overflowSeconds,
  };
}

function parseActivityMap(
  raw: unknown,
  label: "roots" | "reserves",
): DebugV3ActivitySeconds | { error: string } {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: `${label} must be an object` };
  }
  const out: DebugV3ActivitySeconds = {};
  const obj = raw as Record<string, unknown>;
  for (const kind of ROOT_KINDS) {
    if (!Object.prototype.hasOwnProperty.call(obj, kind)) continue;
    const n = parseDebugWholeSeconds(obj[kind]);
    if (n == null) {
      return { error: `${label}.${kind} must be a whole integer` };
    }
    out[kind] = n;
  }
  for (const key of Object.keys(obj)) {
    if (!ROOT_KINDS.includes(key as RootKind)) {
      return { error: `${label} unknown key: ${key}` };
    }
  }
  return out;
}

/**
 * Parse POST body into a debug action.
 * `action: "set"` may be omitted when roots/reserves are present.
 */
export function parseDebugV3RootsBody(
  body: unknown,
): DebugV3RootsAction | { error: string } {
  if (body == null || typeof body !== "object") {
    return { error: "Expected JSON body" };
  }
  const o = body as {
    action?: unknown;
    roots?: unknown;
    reserves?: unknown;
  };

  if (o.action === "reset") {
    return { action: "reset" };
  }

  if (o.action === "fillToCapacity") {
    const fillRoots = o.roots === undefined ? true : o.roots === true;
    const fillReserves =
      o.reserves === undefined ? true : o.reserves === true;
    if (!fillRoots && !fillReserves) {
      return { error: "fillToCapacity requires roots and/or reserves true" };
    }
    return {
      action: "fillToCapacity",
      roots: fillRoots,
      reserves: fillReserves,
    };
  }

  if (o.action === "add") {
    const roots = parseActivityMap(o.roots, "roots");
    if ("error" in roots) return roots;
    const reserves = parseActivityMap(o.reserves, "reserves");
    if ("error" in reserves) return reserves;
    const hasRoots = Object.keys(roots).length > 0;
    const hasReserves = Object.keys(reserves).length > 0;
    if (!hasRoots && !hasReserves) {
      return { error: "add requires roots and/or reserves" };
    }
    for (const map of [roots, reserves]) {
      for (const v of Object.values(map)) {
        if (v != null && v < 0) {
          return { error: "add deltas must be >= 0" };
        }
      }
    }
    return {
      action: "add",
      ...(hasRoots ? { roots } : {}),
      ...(hasReserves ? { reserves } : {}),
    };
  }

  if (o.action != null && o.action !== "set") {
    return {
      error: 'action must be "set", "reset", "add", or "fillToCapacity"',
    };
  }

  const roots = parseActivityMap(o.roots, "roots");
  if ("error" in roots) return roots;
  const reserves = parseActivityMap(o.reserves, "reserves");
  if ("error" in reserves) return reserves;
  const hasRoots = Object.keys(roots).length > 0;
  const hasReserves = Object.keys(reserves).length > 0;
  if (!hasRoots && !hasReserves) {
    return { error: "set requires roots and/or reserves" };
  }
  return {
    action: "set",
    ...(hasRoots ? { roots } : {}),
    ...(hasReserves ? { reserves } : {}),
  };
}

function applyKindSet(
  kind: RootKind,
  requested: number | undefined,
  current: { water: number; sun: number; fertilizer: number },
  capacity: number,
  reports: Partial<Record<RootKind, DebugV3ClampFieldReport>>,
): void {
  if (requested == null) return;
  const report = applyDebugSecondsClamp(requested, capacity);
  reports[kind] = report;
  current[kind] = report.appliedSeconds;
}

function applyKindAdd(
  kind: RootKind,
  requested: number | undefined,
  current: { water: number; sun: number; fertilizer: number },
  capacity: number,
  reports: Partial<Record<RootKind, DebugV3AddFieldReport>>,
): void {
  if (requested == null) return;
  const report = applyDebugSecondsAdd(current[kind], requested, capacity);
  reports[kind] = report;
  current[kind] = report.afterSeconds;
}

export async function debugMutateEconomyV3Roots(
  userId: string | number,
  body: DebugV3RootsAction,
  nowMs: number = Date.now(),
): Promise<DebugV3RootsMutateResult> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3RootsDebugError(
      403,
      "feature_disabled",
      "Economy v3 roots are disabled",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gameRow = await client.query(
      `SELECT ${V3_DEBUG_SELECT}
       FROM game_state
       WHERE user_id = $1
       FOR UPDATE`,
      [String(userId)],
    );

    if (gameRow.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new EconomyV3RootsDebugError(
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
    const dailyCap = normalizeDailyCap(locked.v3_daily_cap_seconds);
    const effectiveCap = computeV3EffectivePresetSeconds({
      basePresetSeconds: dailyCap,
      streakDays: locked.streak_days,
    });

    // Real persisted overflow → excess (idempotent). Debug artificial writes do not.
    const normalized = normalizeV3StorageToEffectiveCapacity({
      rootWaterSeconds: locked.v3_root_water_seconds,
      rootSunSeconds: locked.v3_root_sun_seconds,
      rootFertilizerSeconds: locked.v3_root_fertilizer_seconds,
      reserveWaterSeconds: locked.v3_reserve_water_seconds,
      reserveSunSeconds: locked.v3_reserve_sun_seconds,
      reserveFertilizerSeconds: locked.v3_reserve_fertilizer_seconds,
      effectivePresetSeconds: effectiveCap,
    });

    let excessSeconds = normalizeExcessSeconds(
      Number(locked.v2_excess_seconds ?? 0) + normalized.overflowSeconds,
    );

    const roots = {
      water: normalized.rootWaterSeconds,
      sun: normalized.rootSunSeconds,
      fertilizer: normalized.rootFertilizerSeconds,
    };
    const reserves = {
      water: normalized.reserveWaterSeconds,
      sun: normalized.reserveSunSeconds,
      fertilizer: normalized.reserveFertilizerSeconds,
    };

    let clampReport: DebugV3ClampReport | null = null;

    if (body.action === "reset") {
      roots.water = 0;
      roots.sun = 0;
      roots.fertilizer = 0;
      reserves.water = 0;
      reserves.sun = 0;
      reserves.fertilizer = 0;

      // Persist overflow→excess in the same statement when present so energy is
      // not lost, while keeping the usual reset columns free of v2_excess when
      // there is nothing to normalize.
      if (normalized.overflowSeconds > 0) {
        await client.query(
          `UPDATE game_state
           SET v3_root_water_seconds = 0,
               v3_root_sun_seconds = 0,
               v3_root_fertilizer_seconds = 0,
               v3_reserve_water_seconds = 0,
               v3_reserve_sun_seconds = 0,
               v3_reserve_fertilizer_seconds = 0,
               v2_excess_seconds = $3,
               v3_generation_progress = 0,
               v3_generation_rr_cursor = 0,
               v3_generation_frozen_at = NULL,
               v3_insurance_deadline_at = NULL,
               v3_first_transferred_root = NULL,
               v3_transferred_roots = '{}'::text[],
               v3_generation_anchor_at = $2,
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
               v3_care_activity_kind = NULL,
               v3_care_activity_preset_seconds = NULL,
               v3_care_activity_started_at = NULL,
               v3_care_activity_finished_at = NULL,
               v3_care_activity_status = NULL,
               v3_care_activity_skill = NULL,
               updated_at = NOW()
           WHERE user_id = $1`,
          [String(userId), new Date(nowMs), excessSeconds],
        );
      } else {
        await client.query(
          `UPDATE game_state
           SET v3_root_water_seconds = 0,
               v3_root_sun_seconds = 0,
               v3_root_fertilizer_seconds = 0,
               v3_reserve_water_seconds = 0,
               v3_reserve_sun_seconds = 0,
               v3_reserve_fertilizer_seconds = 0,
               v3_generation_progress = 0,
               v3_generation_rr_cursor = 0,
               v3_generation_frozen_at = NULL,
               v3_insurance_deadline_at = NULL,
               v3_first_transferred_root = NULL,
               v3_transferred_roots = '{}'::text[],
               v3_generation_anchor_at = $2,
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
               v3_care_activity_kind = NULL,
               v3_care_activity_preset_seconds = NULL,
               v3_care_activity_started_at = NULL,
               v3_care_activity_finished_at = NULL,
               v3_care_activity_status = NULL,
               v3_care_activity_skill = NULL,
               updated_at = NOW()
           WHERE user_id = $1`,
          [String(userId), new Date(nowMs)],
        );
      }

      locked.v3_root_water_seconds = 0;
      locked.v3_root_sun_seconds = 0;
      locked.v3_root_fertilizer_seconds = 0;
      locked.v3_reserve_water_seconds = 0;
      locked.v3_reserve_sun_seconds = 0;
      locked.v3_reserve_fertilizer_seconds = 0;
      locked.v3_generation_progress = 0;
      locked.v3_generation_rr_cursor = 0;
      locked.v3_generation_frozen_at = null;
      locked.v3_insurance_deadline_at = null;
      locked.v3_first_transferred_root = null;
      locked.v3_transferred_roots = [];
      locked.v3_generation_anchor_at = new Date(nowMs).toISOString();
      locked.v3_care_cycle_water_completed = false;
      locked.v3_care_cycle_water_preset_seconds = null;
      locked.v3_care_cycle_water_skill = null;
      locked.v3_care_cycle_sun_completed = false;
      locked.v3_care_cycle_sun_preset_seconds = null;
      locked.v3_care_cycle_sun_skill = null;
      locked.v3_care_cycle_fertilizer_completed = false;
      locked.v3_care_cycle_fertilizer_preset_seconds = null;
      locked.v3_care_cycle_fertilizer_skill = null;
      locked.v3_care_cycle_started_at = null;
      locked.v3_care_cycle_completed_at = null;
      locked.v3_care_cycle_finished_at = null;
      locked.v3_care_cycle_status = null;
      locked.v3_care_cycle_total_preset_seconds = null;
      locked.v3_care_cycle_average_skill = null;
      locked.v3_care_cycle_claimed_at = null;
      locked.v3_care_cycle_claimed_xp = null;
      locked.v3_care_cycle_claimed_tree_growth = null;
      locked.v3_care_cycle_claimed_base_income = null;
      locked.v3_care_cycle_claimed_bonus_income = null;
      locked.v3_care_cycle_claimed_total_income = null;
      locked.v3_care_activity_kind = null;
      locked.v3_care_activity_preset_seconds = null;
      locked.v3_care_activity_started_at = null;
      locked.v3_care_activity_finished_at = null;
      locked.v3_care_activity_status = null;
      locked.v3_care_activity_skill = null;
      locked.v2_excess_seconds = excessSeconds;
    } else {
      const rootReports: Partial<Record<RootKind, DebugV3ClampFieldReport>> =
        {};
      const reserveReports: Partial<
        Record<RootKind, DebugV3ClampFieldReport>
      > = {};
      const addRootReports: Partial<Record<RootKind, DebugV3AddFieldReport>> =
        {};
      const addReserveReports: Partial<
        Record<RootKind, DebugV3AddFieldReport>
      > = {};

      if (body.action === "fillToCapacity") {
        if (body.roots !== false) {
          for (const kind of ROOT_KINDS) {
            const report = applyDebugSecondsClamp(effectiveCap, effectiveCap);
            rootReports[kind] = report;
            roots[kind] = report.appliedSeconds;
          }
        }
        if (body.reserves !== false) {
          for (const kind of ROOT_KINDS) {
            const report = applyDebugSecondsClamp(effectiveCap, effectiveCap);
            reserveReports[kind] = report;
            reserves[kind] = report.appliedSeconds;
          }
        }
      } else if (body.action === "add") {
        for (const kind of ROOT_KINDS) {
          applyKindAdd(
            kind,
            body.roots?.[kind],
            roots,
            effectiveCap,
            addRootReports,
          );
          applyKindAdd(
            kind,
            body.reserves?.[kind],
            reserves,
            effectiveCap,
            addReserveReports,
          );
        }
      } else {
        for (const kind of ROOT_KINDS) {
          applyKindSet(
            kind,
            body.roots?.[kind],
            roots,
            effectiveCap,
            rootReports,
          );
          applyKindSet(
            kind,
            body.reserves?.[kind],
            reserves,
            effectiveCap,
            reserveReports,
          );
        }
      }

      clampReport = {
        capacitySeconds: effectiveCap,
        ...(Object.keys(rootReports).length > 0 ? { roots: rootReports } : {}),
        ...(Object.keys(reserveReports).length > 0
          ? { reserves: reserveReports }
          : {}),
        ...(Object.keys(addRootReports).length > 0
          ? { addRoots: addRootReports }
          : {}),
        ...(Object.keys(addReserveReports).length > 0
          ? { addReserves: addReserveReports }
          : {}),
      };

      const secondsParams = [
        String(userId),
        roots.water,
        roots.sun,
        roots.fertilizer,
        reserves.water,
        reserves.sun,
        reserves.fertilizer,
        excessSeconds,
      ] as const;

      if (body.action === "fillToCapacity") {
        // Clear transfer + Care journal so filled roots are clickable again and
        // activities can light after reserve transfer (stale transferredRoots /
        // completed flags previously made fill→click a no-op).
        await client.query(
          `UPDATE game_state
           SET v3_root_water_seconds = $2,
               v3_root_sun_seconds = $3,
               v3_root_fertilizer_seconds = $4,
               v3_reserve_water_seconds = $5,
               v3_reserve_sun_seconds = $6,
               v3_reserve_fertilizer_seconds = $7,
               v2_excess_seconds = $8,
               v3_first_transferred_root = NULL,
               v3_transferred_roots = '{}'::text[],
               v3_generation_frozen_at = NULL,
               v3_insurance_deadline_at = NULL,
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
               v3_care_activity_kind = NULL,
               v3_care_activity_preset_seconds = NULL,
               v3_care_activity_started_at = NULL,
               v3_care_activity_finished_at = NULL,
               v3_care_activity_status = NULL,
               v3_care_activity_skill = NULL,
               updated_at = NOW()
           WHERE user_id = $1`,
          [...secondsParams],
        );
        locked.v3_first_transferred_root = null;
        locked.v3_transferred_roots = [];
        locked.v3_generation_frozen_at = null;
        locked.v3_insurance_deadline_at = null;
        locked.v3_care_cycle_water_completed = false;
        locked.v3_care_cycle_water_preset_seconds = null;
        locked.v3_care_cycle_water_skill = null;
        locked.v3_care_cycle_sun_completed = false;
        locked.v3_care_cycle_sun_preset_seconds = null;
        locked.v3_care_cycle_sun_skill = null;
        locked.v3_care_cycle_fertilizer_completed = false;
        locked.v3_care_cycle_fertilizer_preset_seconds = null;
        locked.v3_care_cycle_fertilizer_skill = null;
        locked.v3_care_cycle_started_at = null;
        locked.v3_care_cycle_completed_at = null;
        locked.v3_care_cycle_finished_at = null;
        locked.v3_care_cycle_status = null;
        locked.v3_care_cycle_total_preset_seconds = null;
        locked.v3_care_cycle_average_skill = null;
        locked.v3_care_cycle_claimed_at = null;
        locked.v3_care_cycle_claimed_xp = null;
        locked.v3_care_cycle_claimed_tree_growth = null;
        locked.v3_care_cycle_claimed_base_income = null;
        locked.v3_care_cycle_claimed_bonus_income = null;
        locked.v3_care_cycle_claimed_total_income = null;
        locked.v3_care_activity_kind = null;
        locked.v3_care_activity_preset_seconds = null;
        locked.v3_care_activity_started_at = null;
        locked.v3_care_activity_finished_at = null;
        locked.v3_care_activity_status = null;
        locked.v3_care_activity_skill = null;
      } else {
        await client.query(
          `UPDATE game_state
           SET v3_root_water_seconds = $2,
               v3_root_sun_seconds = $3,
               v3_root_fertilizer_seconds = $4,
               v3_reserve_water_seconds = $5,
               v3_reserve_sun_seconds = $6,
               v3_reserve_fertilizer_seconds = $7,
               v2_excess_seconds = $8,
               updated_at = NOW()
           WHERE user_id = $1`,
          [...secondsParams],
        );
      }

      locked.v3_root_water_seconds = roots.water;
      locked.v3_root_sun_seconds = roots.sun;
      locked.v3_root_fertilizer_seconds = roots.fertilizer;
      locked.v3_reserve_water_seconds = reserves.water;
      locked.v3_reserve_sun_seconds = reserves.sun;
      locked.v3_reserve_fertilizer_seconds = reserves.fertilizer;
      locked.v2_excess_seconds = excessSeconds;
    }

    await client.query("COMMIT");

    const v3Roots = buildEconomyV3RootsPublicState(locked, { capital });
    return {
      v3Roots,
      capacitySeconds: effectiveCap,
      clamp: clampReport,
    };
  } catch (err) {
    if (err instanceof EconomyV3RootsDebugError) throw err;
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
