import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { connectMock, releaseMock, state } = vi.hoisted(() => {
  const releaseMock = vi.fn();
  const state = {
    game: null as Row | null,
    capital: 100_000 as number | string,
    updates: [] as Array<{ sql: string; params: unknown[] }>,
    lockQueue: Promise.resolve(),
    unlock: null as null | (() => void),
    failAfterUpdates: 0 as number,
    updatesInTx: 0,
  };

  function asInt(raw: unknown): number {
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
    return Number.isFinite(n) ? n : 0;
  }

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();

    if (text === "BEGIN") {
      const prev = state.lockQueue;
      let releaseLock!: () => void;
      state.lockQueue = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await prev;
      state.unlock = releaseLock;
      state.updatesInTx = 0;
      return { rows: [] };
    }

    if (text === "COMMIT" || text === "ROLLBACK") {
      state.unlock?.();
      state.unlock = null;
      return { rows: [] };
    }

    if (text.includes("FROM game_state") && text.includes("FOR UPDATE")) {
      if (!state.game) return { rows: [] };
      return { rows: [{ ...state.game }] };
    }

    if (text.includes("FROM accounts") && text.includes("active_balance")) {
      return { rows: [{ active_balance: state.capital }] };
    }

    if (text.startsWith("UPDATE game_state")) {
      state.updatesInTx += 1;
      if (
        state.failAfterUpdates > 0 &&
        state.updatesInTx === state.failAfterUpdates
      ) {
        throw new Error("artificial_update_failure");
      }
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };

      if (
        text.includes("v2_energy_seconds = $2") &&
        text.includes("v2_energy_anchor_at = $3") &&
        text.includes("v2_root_ready_mask")
      ) {
        state.game.v2_energy_seconds = params[1];
        state.game.v2_energy_anchor_at = params[2];
        state.game.v2_root_ready_mask = params[3];
        state.game.v2_root_generation_progress = params[4];
        if (params.length > 5) {
          state.game.v2_excess_seconds = params[5];
        }
        if (params.length > 6) {
          state.game.v2_excess_elapsed_ms = params[6];
        }
        if (params.length > 7) {
          state.game.v2_excess_base_income = params[7];
        }
        if (params.length > 8) {
          state.game.v2_ordinary_income_elapsed_ms = params[8];
        }
      } else if (
        text.includes("v2_energy_seconds = $2") &&
        text.includes("v2_energy_anchor_at = $3")
      ) {
        state.game.v2_energy_seconds = params[1];
        state.game.v2_energy_anchor_at = params[2];
      } else if (text.includes("v2_care_in_progress = TRUE")) {
        state.game.v2_care_in_progress = true;
        state.game.v2_care_cycle_id = params[1];
        state.game.v2_care_water_seconds = params[2];
        state.game.v2_care_sun_seconds = params[3];
        state.game.v2_care_fertilizer_seconds = params[4];
        state.game.v2_care_water_completed = false;
        state.game.v2_care_sun_completed = false;
        state.game.v2_care_fertilizer_completed = false;
        state.game.v2_care_started_at = params[5];
        state.game.v2_care_water_score = null;
        state.game.v2_care_sun_score = null;
        state.game.v2_care_fertilizer_score = null;
      } else if (text.includes("v2_care_in_progress = FALSE")) {
        state.game.v2_care_in_progress = false;
        state.game.v2_care_cycle_id = null;
        state.game.v2_care_water_seconds = 0;
        state.game.v2_care_sun_seconds = 0;
        state.game.v2_care_fertilizer_seconds = 0;
        state.game.v2_care_water_completed = false;
        state.game.v2_care_sun_completed = false;
        state.game.v2_care_fertilizer_completed = false;
        state.game.v2_care_started_at = null;
        state.game.v2_care_water_score = null;
        state.game.v2_care_sun_score = null;
        state.game.v2_care_fertilizer_score = null;
      } else if (text.includes("v2_income_anchor_at")) {
        // $2 energy, $3 skill, $4 count, $5 xp, $6 level, $7 history,
        // $8 last_session, $9 streak, $10 streak_date, $11/$12 pending, $13 anchor, $14 freshness
        state.game.v2_energy_seconds = params[1];
        const skill = params[2];
        const count = params[3];
        state.game.player_xp = params[4];
        state.game.player_level = params[5];
        state.game.xp_history = JSON.parse(String(params[6]));
        state.game.last_session_time = params[7];
        state.game.streak_days = params[8];
        state.game.last_streak_date = params[9];
        state.game.pending_base_reward = params[10];
        state.game.pending_bonus_reward = params[11];
        state.game.v2_income_anchor_at = params[12];
        state.game.v2_freshness = params[13];
        state.game.pending_stored_sessions = 0;
        state.game.total_sessions = asInt(state.game.total_sessions) + 1;
        if (text.includes("v2_care_water_completed = TRUE")) {
          state.game.v2_care_water_completed = true;
          state.game.v2_care_water_score = skill;
          state.game.total_water_drops =
            asInt(state.game.total_water_drops) + asInt(count);
        } else if (text.includes("v2_care_sun_completed = TRUE")) {
          state.game.v2_care_sun_completed = true;
          state.game.v2_care_sun_score = skill;
          state.game.total_sun_catches =
            asInt(state.game.total_sun_catches) + asInt(count);
        } else if (text.includes("v2_care_fertilizer_completed = TRUE")) {
          state.game.v2_care_fertilizer_completed = true;
          state.game.v2_care_fertilizer_score = skill;
          state.game.total_leaf_picks =
            asInt(state.game.total_leaf_picks) + asInt(count);
        }
      } else if (
        text.includes("v2_energy_seconds = $2") &&
        text.includes("player_xp") &&
        (text.includes("v2_care_water_completed = TRUE") ||
          text.includes("v2_care_sun_completed = TRUE") ||
          text.includes("v2_care_fertilizer_completed = TRUE"))
      ) {
        state.game.v2_energy_seconds = params[1];
        const skill = params[2];
        const count = params[3];
        state.game.player_xp = params[4];
        state.game.player_level = params[5];
        if (text.includes("v2_care_water_completed = TRUE")) {
          state.game.v2_care_water_completed = true;
          state.game.v2_care_water_score = skill;
          state.game.total_water_drops =
            asInt(state.game.total_water_drops) + asInt(count);
        } else if (text.includes("v2_care_sun_completed = TRUE")) {
          state.game.v2_care_sun_completed = true;
          state.game.v2_care_sun_score = skill;
          state.game.total_sun_catches =
            asInt(state.game.total_sun_catches) + asInt(count);
        } else if (text.includes("v2_care_fertilizer_completed = TRUE")) {
          state.game.v2_care_fertilizer_completed = true;
          state.game.v2_care_fertilizer_score = skill;
          state.game.total_leaf_picks =
            asInt(state.game.total_leaf_picks) + asInt(count);
        }
      } else if (text.includes("v2_energy_seconds = $2")) {
        state.game.v2_energy_seconds = params[1];
      }

      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in care test mock: ${text}`);
  });

  const connectMock = vi.fn(async () => ({
    query,
    release: releaseMock,
  }));

  return { connectMock, releaseMock, state, query };
});

vi.mock("@workspace/db", () => ({
  pool: {
    connect: connectMock,
    query: vi.fn(),
  },
}));

import {
  completeEconomyV2CareActivity,
  EconomyV2CareError,
  finishEconomyV2Care,
  startEconomyV2Care,
} from "./economy-v2-care";
import { roundMoneyToKopecks, V2_BASE_APR, V2_SECONDS_PER_YEAR } from "./economy-v2-care-income";

const NOW = 1_700_000_000_000;
const USER = "42";

function result(skillScore: number, collected = 1) {
  return { skillScore, collected };
}

function baseGame(overrides: Partial<Row> = {}): Row {
  return {
    v2_energy_seconds: 15,
    v2_energy_anchor_at: NOW,
    v2_root_ready_mask: "0",
    v2_root_generation_progress: "0",
    v2_excess_seconds: 0,
    v2_care_in_progress: false,
    v2_care_cycle_id: null,
    v2_care_water_seconds: 0,
    v2_care_sun_seconds: 0,
    v2_care_fertilizer_seconds: 0,
    v2_care_water_completed: false,
    v2_care_sun_completed: false,
    v2_care_fertilizer_completed: false,
    v2_care_started_at: null,
    v2_care_water_score: null,
    v2_care_sun_score: null,
    v2_care_fertilizer_score: null,
    v2_income_anchor_at: NOW - 86_400_000,
    v2_freshness: 1,
    last_session_time: 1_600_000_000_000,
    session_water_score: 40,
    session_sun_score: 40,
    session_fertilizer_score: 40,
    player_xp: 0,
    player_level: 1,
    xp_history: [],
    missed_sessions: 9,
    streak_days: 0,
    last_streak_date: null,
    pending_base_reward: 0,
    pending_bonus_reward: 0,
    pending_stored_sessions: 1,
    total_sessions: 0,
    total_water_drops: 0,
    total_sun_catches: 0,
    total_leaf_picks: 0,
    ...overrides,
  };
}

describe("Economy v2 Care — dedicated scores + income", () => {
  beforeEach(() => {
    connectMock.mockClear();
    releaseMock.mockClear();
    state.updates = [];
    state.capital = 100_000;
    state.game = baseGame();
    state.failAfterUpdates = 0;
    state.updatesInTx = 0;
  });

  it("start resets dedicated scores; does not write session_*_score", async () => {
    state.game = baseGame({
      v2_energy_seconds: 15,
      v2_care_water_score: 99,
      session_water_score: 40,
      missed_sessions: 9,
    });
    const start = await startEconomyV2Care(USER, NOW);
    expect(start.scores).toEqual({ water: null, sun: null, fertilizer: null });
    expect(state.game.v2_care_water_score).toBeNull();
    expect(state.game.session_water_score).toBe(40); // untouched
    expect(state.game.missed_sessions).toBe(9);
    for (const u of state.updates) {
      expect(u.sql).not.toMatch(/session_water_score|missed_sessions/);
    }
  });

  it("blocks start when pending rewards exist", async () => {
    state.game = baseGame({
      v2_energy_seconds: 15,
      pending_base_reward: 1.5,
    });
    await expect(startEconomyV2Care(USER, NOW)).rejects.toMatchObject({
      status: 409,
      code: "pending_rewards",
    });
  });

  it("Water writes only v2_care_water_score; not session_water_score", async () => {
    state.game = baseGame({ v2_energy_seconds: 15 });
    const start = await startEconomyV2Care(USER, NOW);
    const water = await completeEconomyV2CareActivity(
      USER,
      start.cycleId,
      "water",
      result(100, 6),
      NOW,
    );
    expect(water.skillScore).toBe(100);
    expect(state.game!.v2_care_water_score).toBe(100);
    expect(state.game!.session_water_score).toBe(40);
    expect(state.game!.missed_sessions).toBe(9); // unread / unchanged
  });

  it("third activity: no missed/stored/random; pending_stored=0; income once", async () => {
    // 1h ordinary window (no overflow at bank=15, REF capital).
    const windowMs = 3_600_000;
    state.game = baseGame({
      v2_energy_seconds: 15,
      missed_sessions: 9,
      v2_income_anchor_at: NOW - windowMs,
      v2_energy_anchor_at: NOW - windowMs,
      v2_freshness: 1,
    });
    const start = await startEconomyV2Care(USER, NOW);
    await completeEconomyV2CareActivity(USER, start.cycleId, "water", result(100), NOW);
    await completeEconomyV2CareActivity(USER, start.cycleId, "sun", result(100), NOW);
    const third = await completeEconomyV2CareActivity(
      USER,
      start.cycleId,
      "fertilizer",
      result(100),
      NOW,
    );

    const yearFrac = windowMs / 1000 / V2_SECONDS_PER_YEAR;
    const expectedBase = roundMoneyToKopecks(100_000 * V2_BASE_APR * yearFrac);
    const expectedBonus = roundMoneyToKopecks(100_000 * 0.03 * yearFrac);

    expect(third.sessionComplete).toBe(true);
    expect(third.cycleSkill).toBe(1);
    expect(third.baseReward).toBe(expectedBase);
    expect(third.bonusReward).toBe(expectedBonus);
    expect(third.pendingStoredSessions).toBe(0);
    expect(third.storedSessions).toBe(1);
    expect(state.game!.pending_stored_sessions).toBe(0);
    expect(state.game!.missed_sessions).toBe(9); // not used, not cleared
    expect(state.game!.v2_income_anchor_at).toBe(NOW);
    expect(Number(state.game!.v2_freshness)).toBeCloseTo(1, 9);
    expect(state.game!.v2_care_fertilizer_score).toBe(100);

    // SQL must not reference missed_sessions or Math.random path
    for (const u of state.updates) {
      expect(u.sql).not.toMatch(/missed_sessions/);
    }

    const repeat = await completeEconomyV2CareActivity(
      USER,
      start.cycleId,
      "fertilizer",
      result(1),
      NOW,
    );
    expect(repeat.spentSeconds).toBe(0);
    expect(repeat.baseReward).toBe(0);
    expect(state.game!.pending_base_reward).toBe(expectedBase);
    expect(state.game!.total_sessions).toBe(1);
  });

  it("first Care with null income anchor → 0 money, sets anchor", async () => {
    state.game = baseGame({
      v2_energy_seconds: 15,
      v2_income_anchor_at: null,
      v2_freshness: 0.9,
    });
    const start = await startEconomyV2Care(USER, NOW);
    await completeEconomyV2CareActivity(USER, start.cycleId, "water", result(100), NOW);
    await completeEconomyV2CareActivity(USER, start.cycleId, "sun", result(100), NOW);
    const third = await completeEconomyV2CareActivity(
      USER,
      start.cycleId,
      "fertilizer",
      result(100),
      NOW,
    );
    expect(third.baseReward).toBe(0);
    expect(third.bonusReward).toBe(0);
    expect(state.game!.v2_income_anchor_at).toBe(NOW);
    expect(Number(state.game!.v2_freshness)).toBeCloseTo(0.95, 9);
  });

  it("parallel Water → one spend/score", async () => {
    state.game = baseGame({ v2_energy_seconds: 15 });
    const start = await startEconomyV2Care(USER, NOW);
    const [a, b] = await Promise.all([
      completeEconomyV2CareActivity(USER, start.cycleId, "water", result(100), NOW),
      completeEconomyV2CareActivity(USER, start.cycleId, "water", result(50), NOW),
    ]);
    expect(a.spentSeconds + b.spentSeconds).toBe(5);
    expect(state.game!.v2_care_water_score).toBe(100);
    expect(state.game!.player_xp).toBe(20);
  });

  it("finish clears dedicated scores; no XP/pending rewrite", async () => {
    state.game = baseGame({ v2_energy_seconds: 15 });
    const start = await startEconomyV2Care(USER, NOW);
    await completeEconomyV2CareActivity(USER, start.cycleId, "water", result(100), NOW);
    await completeEconomyV2CareActivity(USER, start.cycleId, "sun", result(100), NOW);
    await completeEconomyV2CareActivity(USER, start.cycleId, "fertilizer", result(100), NOW);
    const xp = state.game!.player_xp;
    const pending = state.game!.pending_base_reward;
    await finishEconomyV2Care(USER, start.cycleId, NOW);
    expect(state.game!.v2_care_water_score).toBeNull();
    expect(state.game!.player_xp).toBe(xp);
    expect(state.game!.pending_base_reward).toBe(pending);
  });

  it("old cycleId changes nothing", async () => {
    state.game = baseGame({ v2_energy_seconds: 15 });
    await startEconomyV2Care(USER, NOW);
    await expect(
      completeEconomyV2CareActivity(USER, "wrong", "water", result(100), NOW),
    ).rejects.toMatchObject({ status: 409, code: "cycle_mismatch" });
  });
});
