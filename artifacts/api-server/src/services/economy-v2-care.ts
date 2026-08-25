import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  allocationCostForActivity,
  createEconomyV2CareAllocation,
  isEconomyV2CareActivity,
  V2_CARE_MIN_ACTIVITY_SECONDS,
  V2_CARE_MIN_TOTAL_SECONDS,
  type EconomyV2CareActivity,
  type EconomyV2CareAllocation,
} from "./economy-v2-care-allocation";
import {
  computeEconomyV2ActivityXp,
  computeEconomyV2CycleXp,
  calcPlayerLevel,
  parseEconomyV2CareActivityResult,
  EconomyV2CareResultError,
} from "./economy-v2-care-xp";
import { computeEconomyV2CareIncome } from "./economy-v2-care-income";
import { computeStreakUpdate } from "./economy-v2-care-rewards";
import {
  loadCapitalForUser,
  settleEconomyV2EnergyInTransaction,
  type EconomyV2DbClient,
} from "./economy-v2-energy-settle";

export type EconomyV2CareCompleted = {
  water: boolean;
  sun: boolean;
  fertilizer: boolean;
};

export type EconomyV2CareScores = {
  water: number | null;
  sun: number | null;
  fertilizer: number | null;
};

export type EconomyV2CareState = {
  inProgress: boolean;
  cycleId: string | null;
  allocation: EconomyV2CareAllocation;
  completed: EconomyV2CareCompleted;
  allCompleted: boolean;
  startedAt: number | null;
  scores: EconomyV2CareScores;
};

export type EconomyV2CareStartResult = {
  cycleId: string;
  allocation: EconomyV2CareAllocation;
  completed: EconomyV2CareCompleted;
  allCompleted: boolean;
  energySeconds: number;
  scores: EconomyV2CareScores;
};

export type EconomyV2CareXpHistoryEntry = {
  date: string;
  n: number;
  pct: number;
  xp: number;
};

export type EconomyV2CareActivityResult = {
  cycleId: string;
  activity: EconomyV2CareActivity;
  spentSeconds: number;
  energySeconds: number;
  skillScore: number;
  activityXp: number;
  totalCycleXp: number;
  cycleSkill: number;
  completed: EconomyV2CareCompleted;
  allCompleted: boolean;
  sessionComplete: boolean;
  scores: EconomyV2CareScores;
  baseReward: number;
  bonusReward: number;
  pendingBaseReward: number;
  pendingBonusReward: number;
  /** Deprecated UI field — always 0 in v2 income path. */
  pendingStoredSessions: number;
  /** @deprecated Always 1; not used in v2 money calculation. */
  storedSessions: number;
  xpGained: number;
  playerXp: number;
  playerLevel: number;
  freshness?: number;
  prevLevel?: number;
  newLevel?: number;
  levelUp?: boolean;
  xpHistory?: EconomyV2CareXpHistoryEntry[];
};

export type EconomyV2CareFinishResult = {
  finished: true;
  energySeconds: number;
};

export class EconomyV2CareError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV2CareError";
    this.status = status;
    this.code = code;
  }
}

type CareRow = {
  v2_energy_seconds: unknown;
  v2_energy_anchor_at: unknown;
  tutorial_done?: unknown;
  v2_root_ready_mask?: unknown;
  v2_root_generation_progress?: unknown;
  v2_care_in_progress: unknown;
  v2_care_cycle_id: unknown;
  v2_care_water_seconds: unknown;
  v2_care_sun_seconds: unknown;
  v2_care_fertilizer_seconds: unknown;
  v2_care_water_completed: unknown;
  v2_care_sun_completed: unknown;
  v2_care_fertilizer_completed: unknown;
  v2_care_started_at: unknown;
  v2_care_water_score?: unknown;
  v2_care_sun_score?: unknown;
  v2_care_fertilizer_score?: unknown;
  v2_income_anchor_at?: unknown;
  v2_freshness?: unknown;
  v2_ordinary_income_elapsed_ms?: unknown;
  v2_excess_base_income?: unknown;
  player_xp?: unknown;
  player_level?: unknown;
  xp_history?: unknown;
  streak_days?: unknown;
  last_streak_date?: unknown;
  pending_base_reward?: unknown;
  pending_bonus_reward?: unknown;
  pending_stored_sessions?: unknown;
  total_sessions?: unknown;
};

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1;
}

function asInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function asFloat(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function asNullableString(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  return String(raw);
}

function asNullableInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function readAllocation(row: CareRow): EconomyV2CareAllocation {
  const waterSeconds = asInt(row.v2_care_water_seconds);
  const sunSeconds = asInt(row.v2_care_sun_seconds);
  const fertilizerSeconds = asInt(row.v2_care_fertilizer_seconds);
  return {
    waterSeconds,
    sunSeconds,
    fertilizerSeconds,
    totalAllocatedSeconds: waterSeconds + sunSeconds + fertilizerSeconds,
  };
}

function readCompleted(row: CareRow): EconomyV2CareCompleted {
  return {
    water: asBool(row.v2_care_water_completed),
    sun: asBool(row.v2_care_sun_completed),
    fertilizer: asBool(row.v2_care_fertilizer_completed),
  };
}

function isAllCompleted(completed: EconomyV2CareCompleted): boolean {
  return completed.water && completed.sun && completed.fertilizer;
}

function readDedicatedScores(row: CareRow): EconomyV2CareScores {
  return {
    water: asNullableInt(row.v2_care_water_score),
    sun: asNullableInt(row.v2_care_sun_score),
    fertilizer: asNullableInt(row.v2_care_fertilizer_score),
  };
}

/** Scores for XP/income — completed activities only; missing → 0. */
function scoresForMath(scores: EconomyV2CareScores): {
  water: number;
  sun: number;
  fertilizer: number;
} {
  return {
    water: scores.water ?? 0,
    sun: scores.sun ?? 0,
    fertilizer: scores.fertilizer ?? 0,
  };
}

function parseXpHistory(raw: unknown): EconomyV2CareXpHistoryEntry[] {
  try {
    const arr = Array.isArray(raw)
      ? raw
      : raw
        ? JSON.parse(String(raw))
        : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function dedicatedScoreColumn(activity: EconomyV2CareActivity): string {
  switch (activity) {
    case "water":
      return "v2_care_water_score";
    case "sun":
      return "v2_care_sun_score";
    case "fertilizer":
      return "v2_care_fertilizer_score";
  }
}

function counterColumn(activity: EconomyV2CareActivity): string {
  switch (activity) {
    case "water":
      return "total_water_drops";
    case "sun":
      return "total_sun_catches";
    case "fertilizer":
      return "total_leaf_picks";
  }
}

function completedColumn(activity: EconomyV2CareActivity): string {
  switch (activity) {
    case "water":
      return "v2_care_water_completed";
    case "sun":
      return "v2_care_sun_completed";
    case "fertilizer":
      return "v2_care_fertilizer_completed";
  }
}

export function emptyEconomyV2CareState(): EconomyV2CareState {
  return {
    inProgress: false,
    cycleId: null,
    allocation: {
      waterSeconds: 0,
      sunSeconds: 0,
      fertilizerSeconds: 0,
      totalAllocatedSeconds: 0,
    },
    completed: { water: false, sun: false, fertilizer: false },
    allCompleted: false,
    startedAt: null,
    scores: { water: null, sun: null, fertilizer: null },
  };
}

export function mapGameStateRowToV2Care(
  row: Record<string, unknown> | null | undefined,
): EconomyV2CareState {
  if (!row) return emptyEconomyV2CareState();
  const careRow = row as CareRow;
  const completed = readCompleted(careRow);
  return {
    inProgress: asBool(careRow.v2_care_in_progress),
    cycleId: asNullableString(careRow.v2_care_cycle_id),
    allocation: readAllocation(careRow),
    completed,
    allCompleted: isAllCompleted(completed),
    startedAt: asNullableInt(careRow.v2_care_started_at),
    scores: readDedicatedScores(careRow),
  };
}

async function withCareTransaction<T>(
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
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

async function lockGameState(
  client: EconomyV2DbClient,
  userId: string | number,
): Promise<CareRow> {
  const gameRow = await client.query(
    `SELECT
       v2_energy_seconds,
       v2_energy_anchor_at,
       tutorial_done,
       v2_root_ready_mask,
       v2_root_generation_progress,
       v2_excess_seconds,
       v2_excess_elapsed_ms,
       v2_excess_base_income,
       v2_ordinary_income_elapsed_ms,
       v2_care_in_progress,
       v2_care_cycle_id,
       v2_care_water_seconds,
       v2_care_sun_seconds,
       v2_care_fertilizer_seconds,
       v2_care_water_completed,
       v2_care_sun_completed,
       v2_care_fertilizer_completed,
       v2_care_started_at,
       v2_care_water_score,
       v2_care_sun_score,
       v2_care_fertilizer_score,
       v2_income_anchor_at,
       v2_freshness,
       player_xp,
       player_level,
       xp_history,
       streak_days,
       last_streak_date,
       pending_base_reward,
       pending_bonus_reward,
       pending_stored_sessions,
       total_sessions
     FROM game_state
     WHERE user_id = $1
     FOR UPDATE`,
    [String(userId)],
  );

  if (gameRow.rows.length === 0) {
    throw new EconomyV2CareError(404, "not_found", "Game state not found");
  }

  return gameRow.rows[0] as CareRow;
}

function buildActivityResponse(input: {
  cycleId: string;
  activity: EconomyV2CareActivity;
  spentSeconds: number;
  energySeconds: number;
  skillScore: number;
  activityXp: number;
  totalCycleXp: number;
  cycleSkill: number;
  completed: EconomyV2CareCompleted;
  scores: EconomyV2CareScores;
  sessionComplete: boolean;
  baseReward: number;
  bonusReward: number;
  pendingBaseReward: number;
  pendingBonusReward: number;
  playerXp: number;
  playerLevel: number;
  freshness?: number;
  prevLevel?: number;
  newLevel?: number;
  levelUp?: boolean;
  xpHistory?: EconomyV2CareXpHistoryEntry[];
}): EconomyV2CareActivityResult {
  const allCompleted = isAllCompleted(input.completed);
  return {
    cycleId: input.cycleId,
    activity: input.activity,
    spentSeconds: input.spentSeconds,
    energySeconds: input.energySeconds,
    skillScore: input.skillScore,
    activityXp: input.activityXp,
    totalCycleXp: input.totalCycleXp,
    cycleSkill: input.cycleSkill,
    completed: input.completed,
    allCompleted,
    sessionComplete: input.sessionComplete,
    scores: input.scores,
    baseReward: input.baseReward,
    bonusReward: input.bonusReward,
    pendingBaseReward: input.pendingBaseReward,
    pendingBonusReward: input.pendingBonusReward,
    pendingStoredSessions: 0,
    storedSessions: 1,
    xpGained: input.sessionComplete ? input.totalCycleXp : input.activityXp,
    playerXp: input.playerXp,
    playerLevel: input.playerLevel,
    freshness: input.freshness,
    prevLevel: input.prevLevel,
    newLevel: input.newLevel,
    levelUp: input.levelUp,
    xpHistory: input.xpHistory,
  };
}

/**
 * Start (or resume) an Economy v2 Care cycle.
 * Snapshots allocation once; does not spend energy.
 */
export async function startEconomyV2Care(
  userId: string | number,
  nowMs: number = Date.now(),
): Promise<EconomyV2CareStartResult> {
  return withCareTransaction(async (client) => {
    const row = await lockGameState(client, userId);
    const capital = await loadCapitalForUser(client, userId);
    const settled = await settleEconomyV2EnergyInTransaction(
      client,
      userId,
      row,
      nowMs,
      capital,
    );

    if (asBool(row.v2_care_in_progress) && asNullableString(row.v2_care_cycle_id)) {
      const allocation = readAllocation(row);
      const completed = readCompleted(row);
      return {
        cycleId: String(row.v2_care_cycle_id),
        allocation,
        completed,
        allCompleted: isAllCompleted(completed),
        energySeconds: settled.energySeconds,
        scores: readDedicatedScores(row),
      };
    }

    const pendingBase = asFloat(row.pending_base_reward);
    const pendingBonus = asFloat(row.pending_bonus_reward);
    if (pendingBase > 0 || pendingBonus > 0) {
      throw new EconomyV2CareError(
        409,
        "pending_rewards",
        "Claim pending Care rewards before starting a new cycle",
      );
    }

    const total = Math.floor(settled.energySeconds);
    if (total < V2_CARE_MIN_TOTAL_SECONDS) {
      throw new EconomyV2CareError(
        409,
        "insufficient_energy",
        `Need at least ${V2_CARE_MIN_TOTAL_SECONDS} whole energy seconds to start Care (have ${total})`,
      );
    }

    const allocation = createEconomyV2CareAllocation(total);
    if (
      allocation.waterSeconds < V2_CARE_MIN_ACTIVITY_SECONDS ||
      allocation.sunSeconds < V2_CARE_MIN_ACTIVITY_SECONDS ||
      allocation.fertilizerSeconds < V2_CARE_MIN_ACTIVITY_SECONDS
    ) {
      throw new EconomyV2CareError(
        409,
        "insufficient_energy",
        "Each Care activity requires at least 5 seconds",
      );
    }

    const cycleId = randomUUID();
    await client.query(
      `UPDATE game_state
       SET v2_care_in_progress = TRUE,
           v2_care_cycle_id = $2,
           v2_care_water_seconds = $3,
           v2_care_sun_seconds = $4,
           v2_care_fertilizer_seconds = $5,
           v2_care_water_completed = FALSE,
           v2_care_sun_completed = FALSE,
           v2_care_fertilizer_completed = FALSE,
           v2_care_started_at = $6,
           v2_care_water_score = NULL,
           v2_care_sun_score = NULL,
           v2_care_fertilizer_score = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        cycleId,
        allocation.waterSeconds,
        allocation.sunSeconds,
        allocation.fertilizerSeconds,
        nowMs,
      ],
    );

    return {
      cycleId,
      allocation,
      completed: { water: false, sun: false, fertilizer: false },
      allCompleted: false,
      energySeconds: settled.energySeconds,
      scores: { water: null, sun: null, fertilizer: null },
    };
  });
}

/**
 * Complete one Care activity atomically with Economy v2 income on the third.
 */
export async function completeEconomyV2CareActivity(
  userId: string | number,
  cycleId: string,
  activityRaw: unknown,
  resultRaw: unknown,
  nowMs: number = Date.now(),
): Promise<EconomyV2CareActivityResult> {
  if (typeof cycleId !== "string" || cycleId.length === 0) {
    throw new EconomyV2CareError(400, "invalid_request", "cycleId is required");
  }
  if (!isEconomyV2CareActivity(activityRaw)) {
    throw new EconomyV2CareError(
      400,
      "invalid_activity",
      'activity must be "water", "sun", or "fertilizer"',
    );
  }
  const activity = activityRaw;

  let normalizedResult;
  try {
    normalizedResult = parseEconomyV2CareActivityResult(resultRaw);
  } catch (err) {
    if (err instanceof EconomyV2CareResultError) {
      throw new EconomyV2CareError(err.status, err.code, err.message);
    }
    throw err;
  }

  return withCareTransaction(async (client) => {
    const row = await lockGameState(client, userId);
    const capital = await loadCapitalForUser(client, userId);
    const settled = await settleEconomyV2EnergyInTransaction(
      client,
      userId,
      row,
      nowMs,
      capital,
    );

    if (!asBool(row.v2_care_in_progress)) {
      throw new EconomyV2CareError(
        409,
        "cycle_not_active",
        "Care cycle is not active",
      );
    }

    const activeCycleId = asNullableString(row.v2_care_cycle_id);
    if (!activeCycleId || activeCycleId !== cycleId) {
      throw new EconomyV2CareError(
        409,
        "cycle_mismatch",
        "Care cycleId does not match the active cycle",
      );
    }

    const allocation = readAllocation(row);
    const cost = allocationCostForActivity(allocation, activity);
    if (cost < V2_CARE_MIN_ACTIVITY_SECONDS) {
      throw new EconomyV2CareError(
        409,
        "invalid_allocation",
        "Activity cost in snapshot is below minimum",
      );
    }

    const completed = readCompleted(row);
    const scores = readDedicatedScores(row);
    const mathScores = scoresForMath(scores);
    const playerXp = asInt(row.player_xp);
    const playerLevel = asInt(row.player_level) || 1;
    const pendingBase = asFloat(row.pending_base_reward);
    const pendingBonus = asFloat(row.pending_bonus_reward);
    const freshness = asFloat(row.v2_freshness ?? 1);

    if (completed[activity]) {
      const savedScore = scores[activity] ?? 0;
      const totalCycleXp = computeEconomyV2CycleXp(
        allocation,
        mathScores,
        completed,
      );
      const cycleSkill =
        (mathScores.water + mathScores.sun + mathScores.fertilizer) / 300;
      const allDone = isAllCompleted(completed);
      return buildActivityResponse({
        cycleId: activeCycleId,
        activity,
        spentSeconds: 0,
        energySeconds: settled.energySeconds,
        skillScore: savedScore,
        activityXp: 0,
        totalCycleXp,
        cycleSkill,
        completed,
        scores,
        sessionComplete: allDone,
        baseReward: 0,
        bonusReward: 0,
        pendingBaseReward: pendingBase,
        pendingBonusReward: pendingBonus,
        playerXp,
        playerLevel,
        freshness,
        xpHistory: allDone ? parseXpHistory(row.xp_history) : undefined,
        prevLevel: playerLevel,
        newLevel: playerLevel,
        levelUp: false,
      });
    }

    if (settled.energySeconds + 1e-12 < cost) {
      throw new EconomyV2CareError(
        409,
        "insufficient_energy",
        `Not enough energy to complete ${activity} (need ${cost}, have ${settled.energySeconds})`,
      );
    }

    const nextEnergy = settled.energySeconds - cost;
    if (nextEnergy < 0) {
      throw new EconomyV2CareError(
        409,
        "insufficient_energy",
        "Energy would go below zero",
      );
    }

    const skillScore = normalizedResult.skillScore;
    const itemCount = Math.min(10_000, Math.max(0, normalizedResult.collected));
    const activityXp = computeEconomyV2ActivityXp(cost, skillScore);

    const nextScores: EconomyV2CareScores = {
      ...scores,
      [activity]: skillScore,
    };
    const nextMath = scoresForMath(nextScores);
    const nextCompleted: EconomyV2CareCompleted = {
      ...completed,
      [activity]: true,
    };
    const totalCycleXp = computeEconomyV2CycleXp(
      allocation,
      nextMath,
      nextCompleted,
    );
    const previousCycleXp = computeEconomyV2CycleXp(
      allocation,
      nextMath,
      { ...nextCompleted, [activity]: false },
    );
    const cycleSkill =
      (nextMath.water + nextMath.sun + nextMath.fertilizer) / 300;

    const prevLevel = playerLevel;
    const xpDelta = Math.max(0, totalCycleXp - previousCycleXp);
    const newTotalXp = playerXp + xpDelta;
    const newLevel = calcPlayerLevel(newTotalXp);
    const allDone = isAllCompleted(nextCompleted);

    const careCol = completedColumn(activity);
    const scoreCol = dedicatedScoreColumn(activity);
    const counterCol = counterColumn(activity);

    if (!allDone) {
      await client.query(
        `UPDATE game_state
         SET v2_energy_seconds = $2,
             ${careCol} = TRUE,
             ${scoreCol} = $3,
             ${counterCol} = COALESCE(${counterCol}, 0) + $4,
             player_xp = $5,
             player_level = $6,
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          String(userId),
          nextEnergy,
          skillScore,
          itemCount,
          newTotalXp,
          newLevel,
        ],
      );

      return buildActivityResponse({
        cycleId: activeCycleId,
        activity,
        spentSeconds: cost,
        energySeconds: nextEnergy,
        skillScore,
        activityXp,
        totalCycleXp,
        cycleSkill,
        completed: nextCompleted,
        scores: nextScores,
        sessionComplete: false,
        baseReward: 0,
        bonusReward: 0,
        pendingBaseReward: pendingBase,
        pendingBonusReward: pendingBonus,
        playerXp: newTotalXp,
        playerLevel: newLevel,
        freshness,
        prevLevel,
        newLevel,
        levelUp: newLevel > prevLevel,
      });
    }

    // Third activity — Economy v2 income (no missed/stored/random).
    const income = computeEconomyV2CareIncome({
      capital,
      incomeAnchorAt: asNullableInt(row.v2_income_anchor_at),
      nowMs,
      waterScore: nextMath.water,
      sunScore: nextMath.sun,
      fertilizerScore: nextMath.fertilizer,
      freshness,
      ordinaryIncomeElapsedMs: asFloat(row.v2_ordinary_income_elapsed_ms),
    });

    const streak = computeStreakUpdate({
      nowMs,
      lastStreakDate: asNullableString(row.last_streak_date),
      currentStreak: asInt(row.streak_days),
    });

    const today = new Date(nowMs).toISOString().slice(0, 10);
    const prevXpHistory = parseXpHistory(row.xp_history);
    const sameDayCount = prevXpHistory.filter((e) => e.date === today).length;
    const newXpEntry: EconomyV2CareXpHistoryEntry = {
      date: today,
      n: sameDayCount + 1,
      pct: totalCycleXp,
      xp: totalCycleXp,
    };
    const newXpHistory = [newXpEntry, ...prevXpHistory].slice(0, 5);

    const nextPendingBase = pendingBase + income.baseReward;
    const nextPendingBonus = pendingBonus + income.bonusReward;

    await client.query(
      `UPDATE game_state
       SET v2_energy_seconds = $2,
           ${careCol} = TRUE,
           ${scoreCol} = $3,
           ${counterCol} = COALESCE(${counterCol}, 0) + $4,
           player_xp = $5,
           player_level = $6,
           xp_history = $7::jsonb,
           last_session_time = $8,
           streak_days = $9,
           last_streak_date = $10,
           pending_stored_sessions = 0,
           pending_base_reward = $11,
           pending_bonus_reward = $12,
           v2_income_anchor_at = $13,
           v2_ordinary_income_elapsed_ms = 0,
           v2_freshness = $14,
           total_sessions = COALESCE(total_sessions, 0) + 1,
           updated_at = NOW()
       WHERE user_id = $1`,
      [
        String(userId),
        nextEnergy,
        skillScore,
        itemCount,
        newTotalXp,
        newLevel,
        JSON.stringify(newXpHistory),
        nowMs,
        streak.newStreak,
        streak.todayUTC,
        nextPendingBase,
        nextPendingBonus,
        nowMs,
        income.newFreshness,
      ],
    );

    return buildActivityResponse({
      cycleId: activeCycleId,
      activity,
      spentSeconds: cost,
      energySeconds: nextEnergy,
      skillScore,
      activityXp,
      totalCycleXp,
      cycleSkill: income.cycleSkill,
      completed: nextCompleted,
      scores: nextScores,
      sessionComplete: true,
      baseReward: income.baseReward,
      bonusReward: income.bonusReward,
      pendingBaseReward: nextPendingBase,
      pendingBonusReward: nextPendingBonus,
      playerXp: newTotalXp,
      playerLevel: newLevel,
      freshness: income.newFreshness,
      prevLevel,
      newLevel,
      levelUp: newLevel > prevLevel,
      xpHistory: newXpHistory,
    });
  });
}

/**
 * Finish a fully completed Care cycle. Clears snapshot; no rewards / XP.
 * Dedicated scores cleared with the snapshot after post-care can read GET state.
 */
export async function finishEconomyV2Care(
  userId: string | number,
  cycleId: string,
  nowMs: number = Date.now(),
): Promise<EconomyV2CareFinishResult> {
  if (typeof cycleId !== "string" || cycleId.length === 0) {
    throw new EconomyV2CareError(400, "invalid_request", "cycleId is required");
  }

  return withCareTransaction(async (client) => {
    const row = await lockGameState(client, userId);
    const capital = await loadCapitalForUser(client, userId);
    const settled = await settleEconomyV2EnergyInTransaction(
      client,
      userId,
      row,
      nowMs,
      capital,
    );

    if (!asBool(row.v2_care_in_progress)) {
      throw new EconomyV2CareError(
        409,
        "cycle_not_active",
        "Care cycle is not active",
      );
    }

    const activeCycleId = asNullableString(row.v2_care_cycle_id);
    if (!activeCycleId || activeCycleId !== cycleId) {
      throw new EconomyV2CareError(
        409,
        "cycle_mismatch",
        "Care cycleId does not match the active cycle",
      );
    }

    const completed = readCompleted(row);
    if (!isAllCompleted(completed)) {
      throw new EconomyV2CareError(
        409,
        "activities_incomplete",
        "All three Care activities must be completed before finish",
      );
    }

    await client.query(
      `UPDATE game_state
       SET v2_care_in_progress = FALSE,
           v2_care_cycle_id = NULL,
           v2_care_water_seconds = 0,
           v2_care_sun_seconds = 0,
           v2_care_fertilizer_seconds = 0,
           v2_care_water_completed = FALSE,
           v2_care_sun_completed = FALSE,
           v2_care_fertilizer_completed = FALSE,
           v2_care_started_at = NULL,
           v2_care_water_score = NULL,
           v2_care_sun_score = NULL,
           v2_care_fertilizer_score = NULL,
           updated_at = NOW()
       WHERE user_id = $1`,
      [String(userId)],
    );

    return {
      finished: true,
      energySeconds: settled.energySeconds,
    };
  });
}

export { isEconomyV2CareActivity };
export type { EconomyV2CareActivity, EconomyV2CareAllocation };
