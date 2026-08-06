/**
 * Metelka session version=2.
 *
 * Clear: record-only cleared_web_ids.
 * Finish: Metelka pending (base + cleared bonus + XP prepared); no balance credit yet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeExcessV2BonusPaid,
  EXCESS_BASE_INCOME_WEB_ID,
  EXCESS_SPECIAL_WEB_ID,
} from "./economy-v2-excess-rewards";
import {
  computeExcessWebCount,
  generateExcessWebLayout,
} from "./economy-v2-excess-webs";
import { roundMoneyToKopecks } from "./economy-v2-excess-income";
import { V2_EXCESS_SESSION_VERSION } from "./economy-v2-excess";
import { computeExcessCleaningXp } from "./economy-v2-excess-xp";

type Row = Record<string, unknown>;

const { connectMock, releaseMock, state } = vi.hoisted(() => {
  const releaseMock = vi.fn();
  const state = {
    game: null as Row | null,
    account: {
      active_balance: 100_000,
      active_earned: 50,
    } as Row,
    incomeHistory: [] as Array<{ amount: number; type: string }>,
    updates: [] as Array<{ sql: string; params: unknown[] }>,
    lockQueue: Promise.resolve(),
    unlock: null as null | (() => void),
  };

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
      return { rows: [] };
    }

    if (text === "COMMIT" || text === "ROLLBACK") {
      state.unlock?.();
      state.unlock = null;
      return { rows: [] };
    }

    if (text.includes("FROM accounts") && text.startsWith("SELECT")) {
      return {
        rows: [
          {
            active_balance: state.account.active_balance,
            active_earned: state.account.active_earned,
          },
        ],
      };
    }

    if (
      text.startsWith("UPDATE accounts") &&
      text.includes("active_balance = active_balance + $2")
    ) {
      state.updates.push({ sql: text, params });
      const credit = Number(params[1]) || 0;
      state.account.active_balance =
        Number(state.account.active_balance) + credit;
      state.account.active_earned =
        Number(state.account.active_earned) + credit;
      return { rows: [{ ...state.account }] };
    }

    if (text.startsWith("INSERT INTO income_history")) {
      const typeMatch = text.match(/'([^']+)'/);
      state.incomeHistory.push({
        amount: Number(params[1]) || 0,
        type: typeMatch?.[1] ?? String(params[2]),
      });
      return { rows: [] };
    }

    // Immediate Metelka cash settlement — tree growth mm/remainder.
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("tree_growth_mm = $2") &&
      text.includes("tree_growth_remainder = $3")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      state.game.tree_growth_mm = params[1];
      state.game.tree_growth_remainder = params[2];
      return { rows: [{ ...state.game }] };
    }

    if (text.includes("FROM game_state") && text.includes("FOR UPDATE")) {
      if (!state.game) return { rows: [] };
      return { rows: [{ ...state.game }] };
    }

    if (
      text.includes("FROM game_state") &&
      !text.includes("FOR UPDATE") &&
      text.startsWith("SELECT")
    ) {
      if (!state.game) return { rows: [] };
      return { rows: [{ ...state.game }] };
    }

    // Settle energy UPDATE (session start)
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_energy_seconds = $2") &&
      text.includes("v2_excess_seconds = $6")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      state.game.v2_energy_seconds = params[1];
      state.game.v2_energy_anchor_at = params[2];
      state.game.v2_root_ready_mask = params[3];
      state.game.v2_root_generation_progress = params[4];
      state.game.v2_excess_seconds = params[5];
      if (params.length > 6) state.game.v2_excess_elapsed_ms = params[6];
      if (params.length > 7) state.game.v2_excess_base_income = params[7];
      return { rows: [] };
    }

    // Start session version=2
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_active = TRUE") &&
      text.includes("v2_excess_session_version = $2")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      if (state.game.v2_excess_session_active === true) return { rows: [] };
      state.game.v2_excess_session_active = true;
      state.game.v2_excess_session_version = params[1];
      state.game.v2_excess_session_started_at = params[2];
      state.game.v2_excess_session_source_seconds = params[3];
      state.game.v2_excess_session_source_elapsed_ms = params[4];
      state.game.v2_excess_session_capital = params[5];
      state.game.v2_excess_session_base_income = params[6];
      state.game.v2_excess_session_base_web_cleared = false;
      state.game.v2_excess_session_base_web_collection_mode = null;
      state.game.v2_excess_session_base_income_applied = false;
      state.game.v2_excess_session_preset_seconds = params[7];
      state.game.v2_excess_session_rate = params[8];
      state.game.v2_excess_session_web_count = params[9];
      state.game.v2_excess_session_layout_seed = params[10];
      state.game.v2_excess_session_cleared_web_ids = [];
      state.game.v2_excess_session_finished_at = null;
      state.game.v2_excess_session_xp_awarded = 0;
      state.game.v2_excess_session_xp_raw = 0;
      state.game.v2_excess_session_bonus_raw_unlocked = 0;
      return { rows: [{ ...state.game }] };
    }

    // Finish v2 — deduct excess + Metelka pending + session wipe.
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_active = FALSE") &&
      text.includes("v2_excess_base_income = $4")
    ) {
      state.updates.push({ sql: text, params });
      if (
        !state.game ||
        state.game.v2_excess_session_active !== true ||
        state.game.v2_excess_session_finished_at != null
      ) {
        return { rows: [] };
      }
      // Finish replaces any prior unclaimed Metelka pending (no block).
      state.game.v2_excess_seconds = params[1];
      state.game.v2_excess_elapsed_ms = params[2];
      state.game.v2_excess_base_income = params[3];
      state.game.player_xp = params[4];
      state.game.player_level = params[5];
      if (text.includes("metelka_pending_active = TRUE")) {
        state.game.metelka_pending_active = true;
        state.game.metelka_pending_base = params[6];
        state.game.metelka_pending_bonus = params[7];
        state.game.metelka_pending_xp = params[8];
        state.game.metelka_pending_created_at = params[9];
        state.game.metelka_pending_claim_token = params[10];
        state.game.metelka_pending_claimed_at = null;
      } else if (
        params.length > 7 &&
        text.includes("pending_base_reward = $7")
      ) {
        state.game.pending_base_reward = params[6];
        state.game.pending_bonus_reward = params[7];
      }
      state.game.v2_excess_session_active = false;
      state.game.v2_excess_session_version = null;
      state.game.v2_excess_session_started_at = null;
      state.game.v2_excess_session_source_seconds = null;
      state.game.v2_excess_session_source_elapsed_ms = null;
      state.game.v2_excess_session_capital = null;
      state.game.v2_excess_session_base_income = null;
      state.game.v2_excess_session_base_web_cleared = false;
      state.game.v2_excess_session_base_web_collection_mode = null;
      state.game.v2_excess_session_base_income_applied = false;
      state.game.v2_excess_session_preset_seconds = null;
      state.game.v2_excess_session_rate = null;
      state.game.v2_excess_session_web_count = null;
      state.game.v2_excess_session_layout_seed = null;
      state.game.v2_excess_session_cleared_web_ids = [];
      state.game.v2_excess_session_finished_at = null;
      state.game.v2_excess_session_finish_reason = null;
      state.game.v2_excess_session_final_cleared_count = null;
      state.game.v2_excess_session_final_web_count = null;
      state.game.v2_excess_session_skill = null;
      state.game.v2_excess_session_xp_max = null;
      state.game.v2_excess_session_xp_raw = null;
      state.game.v2_excess_session_xp_awarded = null;
      state.game.v2_excess_session_xp_applied = false;
      state.game.v2_excess_session_gross_income = null;
      state.game.v2_excess_session_payment_factor = null;
      state.game.v2_excess_session_paid_income = null;
      state.game.v2_excess_session_income_applied = false;
      state.game.v2_excess_session_bonus_raw_unlocked = 0;
      return { rows: [{ ...state.game }] };
    }

    // V2 clear base (red) web — mark cleared; cash settled separately.
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_base_web_cleared = TRUE") &&
      text.includes("collection_mode = 'manual'")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game || state.game.v2_excess_session_base_web_cleared === true) {
        return { rows: [] };
      }
      state.game.v2_excess_session_base_web_cleared = true;
      state.game.v2_excess_session_base_web_collection_mode = "manual";
      state.game.v2_excess_session_base_income_applied = true;
      return { rows: [{ ...state.game }] };
    }

    // V2 clear white web — record-only (cleared_web_ids only).
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_cleared_web_ids = $2") &&
      text.includes("AND NOT ($3 = ANY") &&
      !text.includes("player_xp")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      const webId = String(params[2]);
      const cleared = Array.isArray(state.game.v2_excess_session_cleared_web_ids)
        ? ([...state.game.v2_excess_session_cleared_web_ids] as string[])
        : [];
      if (
        state.game.v2_excess_session_active !== true ||
        cleared.includes(webId)
      ) {
        return { rows: [] };
      }
      const next = Array.isArray(params[1])
        ? (params[1] as string[])
        : [...cleared, webId];
      state.game.v2_excess_session_cleared_web_ids = next;
      return { rows: [{ ...state.game }] };
    }

    // Legacy V2 clear white (old XP path) — kept for mock completeness.
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_bonus_raw_unlocked = $6") &&
      text.includes("player_xp = $8")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      const webId = String(params[9]);
      const cleared = Array.isArray(state.game.v2_excess_session_cleared_web_ids)
        ? ([...state.game.v2_excess_session_cleared_web_ids] as string[])
        : [];
      if (
        state.game.v2_excess_session_active !== true ||
        cleared.includes(webId)
      ) {
        return { rows: [] };
      }
      const next = Array.isArray(params[1])
        ? (params[1] as string[])
        : [...cleared, webId];
      state.game.v2_excess_session_cleared_web_ids = next;
      state.game.v2_excess_session_xp_awarded = params[2];
      state.game.v2_excess_session_xp_max = params[3];
      state.game.v2_excess_session_xp_raw = params[4];
      state.game.v2_excess_session_bonus_raw_unlocked = params[5];
      state.game.v2_excess_session_gross_income = params[6];
      state.game.player_xp = params[7];
      state.game.player_level = params[8];
      return { rows: [{ ...state.game }] };
    }

    // Legacy clear with rewards (50/50 formula)
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_cleared_web_ids = $2") &&
      text.includes("player_xp = $7")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      const webId = String(params[8]);
      const cleared = Array.isArray(state.game.v2_excess_session_cleared_web_ids)
        ? ([...state.game.v2_excess_session_cleared_web_ids] as string[])
        : [];
      if (
        state.game.v2_excess_session_active !== true ||
        cleared.includes(webId)
      ) {
        return { rows: [] };
      }
      state.game.v2_excess_session_cleared_web_ids = params[1];
      state.game.v2_excess_session_xp_awarded = params[2];
      state.game.v2_excess_session_paid_income = params[5];
      state.game.player_xp = params[6];
      state.game.player_level = params[7];
      return { rows: [{ ...state.game }] };
    }

    // V2 acknowledge deduct + mark applied (legacy pending-result settlement only)
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_base_income = $4") &&
      text.includes("v2_excess_session_income_applied = TRUE")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      if (
        state.game.v2_excess_session_finished_at == null ||
        state.game.v2_excess_session_income_applied === true
      ) {
        return { rows: [] };
      }
      state.game.v2_excess_seconds = params[1];
      state.game.v2_excess_elapsed_ms = params[2];
      state.game.v2_excess_base_income = params[3];
      state.game.v2_excess_session_income_applied = true;
      state.game.v2_excess_session_base_income_applied = true;
      return {
        rows: [
          {
            v2_excess_session_paid_income:
              state.game.v2_excess_session_paid_income,
            v2_excess_session_base_income:
              state.game.v2_excess_session_base_income,
          },
        ],
      };
    }

    // Legacy acknowledge
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_income_applied = TRUE") &&
      text.includes("v2_excess_seconds = $2") &&
      text.includes("v2_excess_session_finished_at IS NOT NULL") &&
      !text.includes("v2_excess_base_income = $4")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      if (
        state.game.v2_excess_session_finished_at == null ||
        state.game.v2_excess_session_income_applied === true
      ) {
        return { rows: [] };
      }
      state.game.v2_excess_seconds = params[1];
      state.game.v2_excess_elapsed_ms = params[2];
      state.game.v2_excess_session_income_applied = true;
      return {
        rows: [
          {
            v2_excess_session_paid_income:
              state.game.v2_excess_session_paid_income,
          },
        ],
      };
    }

    // Legacy finish: deduct excess while active
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_seconds = $2") &&
      text.includes("v2_excess_session_active = TRUE") &&
      text.includes("v2_excess_session_income_applied = TRUE")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game || state.game.v2_excess_session_active !== true) {
        return { rows: [] };
      }
      state.game.v2_excess_seconds = params[1];
      state.game.v2_excess_elapsed_ms = params[2];
      state.game.v2_excess_session_cleared_web_ids = params[3];
      state.game.v2_excess_session_paid_income = params[4];
      state.game.v2_excess_session_xp_awarded = params[5];
      state.game.v2_excess_session_xp_max = params[6];
      state.game.v2_excess_session_xp_raw = params[7];
      state.game.v2_excess_session_skill = params[8];
      state.game.v2_excess_session_gross_income = params[9];
      state.game.v2_excess_session_finish_reason = params[10];
      state.game.v2_excess_session_final_cleared_count = params[11];
      state.game.v2_excess_session_final_web_count = params[12];
      state.game.v2_excess_session_xp_applied = true;
      state.game.v2_excess_session_income_applied = true;
      return { rows: [{ ...state.game }] };
    }

    // Clear session SQL (used by acknowledge + old pending-result settlement)
    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_active = FALSE") &&
      text.includes("v2_excess_session_finished_at = NULL") &&
      text.includes("v2_excess_session_version = NULL")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      const prevXp = state.game.player_xp;
      const prevBase = state.game.v2_excess_base_income;
      const prevSec = state.game.v2_excess_seconds;
      const prevEl = state.game.v2_excess_elapsed_ms;
      for (const key of Object.keys(state.game)) {
        if (key.startsWith("v2_excess_session_")) {
          if (key.includes("cleared_web_ids")) {
            state.game[key] = [];
          } else if (
            key.includes("active") ||
            key.includes("applied") ||
            key.includes("base_web_cleared")
          ) {
            state.game[key] = false;
          } else if (key.includes("bonus_raw_unlocked")) {
            state.game[key] = 0;
          } else {
            state.game[key] = null;
          }
        }
      }
      state.game.v2_excess_session_active = false;
      state.game.v2_excess_session_finished_at = null;
      state.game.v2_excess_session_version = null;
      state.game.player_xp = prevXp;
      state.game.v2_excess_base_income = prevBase;
      state.game.v2_excess_seconds = prevSec;
      state.game.v2_excess_elapsed_ms = prevEl;
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in excess-v2 test mock: ${text}`);
  });

  const connectMock = vi.fn(async () => ({
    query,
    release: releaseMock,
  }));

  return { connectMock, releaseMock, state };
});

vi.mock("@workspace/db", () => ({
  pool: {
    connect: connectMock,
    query: vi.fn(),
  },
}));

import { startEconomyV2ExcessSession } from "./economy-v2-excess-session";
import { clearEconomyV2ExcessWeb } from "./economy-v2-excess-web-clear";
import { finishEconomyV2ExcessSession } from "./economy-v2-excess-finish";
import { acknowledgeEconomyV2ExcessResult } from "./economy-v2-excess-acknowledge";
import { readExcessSessionFromRow } from "./economy-v2-excess";

const NOW = 1_700_000_000_000;
const USER = "42";

function idleGame(overrides: Partial<Row> = {}): Row {
  return {
    v2_energy_seconds: 40,
    v2_energy_anchor_at: NOW - 60_000,
    tutorial_done: true,
    v2_root_ready_mask: 0,
    v2_root_generation_progress: 0,
    v2_excess_seconds: 12,
    v2_excess_elapsed_ms: 3_600_000,
    v2_excess_base_income: 10,
    v2_ordinary_income_elapsed_ms: 0,
    pending_base_reward: 0,
    pending_bonus_reward: 0,
    metelka_pending_active: false,
    metelka_pending_base: 0,
    metelka_pending_bonus: 0,
    metelka_pending_xp: 0,
    metelka_pending_created_at: null,
    metelka_pending_claim_token: null,
    metelka_pending_claimed_at: null,
    tree_growth_mm: 0,
    tree_growth_remainder: 0,
    player_xp: 100,
    player_level: 1,
    v2_excess_session_active: false,
    v2_excess_session_version: null,
    v2_excess_session_finished_at: null,
    v2_excess_session_base_web_cleared: false,
    v2_excess_session_income_applied: false,
    v2_excess_session_xp_applied: false,
    ...overrides,
  };
}

function activeV2(overrides: Partial<Row> = {}): Row {
  return {
    ...idleGame(),
    v2_excess_session_active: true,
    v2_excess_session_version: V2_EXCESS_SESSION_VERSION,
    v2_excess_session_started_at: NOW,
    v2_excess_session_source_seconds: 12,
    v2_excess_session_source_elapsed_ms: 3_600_000,
    v2_excess_session_capital: 100_000,
    v2_excess_session_base_income: 10,
    v2_excess_session_base_web_cleared: false,
    v2_excess_session_base_web_collection_mode: null,
    v2_excess_session_base_income_applied: false,
    v2_excess_session_preset_seconds: 5,
    v2_excess_session_rate: 0.014,
    v2_excess_session_web_count: 12,
    v2_excess_session_layout_seed: 424242,
    v2_excess_session_cleared_web_ids: [],
    v2_excess_session_finished_at: null,
    v2_excess_session_xp_awarded: 0,
    v2_excess_session_xp_raw: 0,
    v2_excess_session_bonus_raw_unlocked: 0,
    v2_excess_session_paid_income: null,
    v2_excess_session_income_applied: false,
    v2_excess_session_xp_applied: false,
    ...overrides,
  };
}

describe("economy-v2-excess version=2", () => {
  beforeEach(() => {
    state.game = null;
    state.account = { active_balance: 100_000, active_earned: 50 };
    state.incomeHistory = [];
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
    releaseMock.mockClear();
    connectMock.mockClear();
  });

  it("1. new session gets version=2", async () => {
    state.game = idleGame();
    const r = await startEconomyV2ExcessSession(USER, NOW);
    expect(r.session.version).toBe(2);
    expect(state.game.v2_excess_session_version).toBe(2);
  });

  it("2. start snapshots v2_excess_base_income", async () => {
    state.game = idleGame({ v2_excess_base_income: 10.55 });
    const r = await startEconomyV2ExcessSession(USER, NOW);
    expect(r.session.baseIncome).toBeCloseTo(10.55, 8);
    expect(Number(state.game.v2_excess_session_base_income)).toBeCloseTo(
      10.55,
      8,
    );
    expect(Number(state.game.v2_excess_base_income)).toBeCloseTo(10.55, 8);
  });

  it("3. accrual after start does not change snapshot", async () => {
    state.game = activeV2({
      v2_excess_session_base_income: 10,
      v2_excess_base_income: 12,
    });
    const session = readExcessSessionFromRow(state.game);
    expect(session.baseIncome).toBe(10);
    expect(Number(state.game.v2_excess_base_income)).toBe(12);
  });

  it("4. active session layout is white webs only", () => {
    expect(computeExcessWebCount(5)).toBe(12);
    state.game = activeV2();
    const session = readExcessSessionFromRow(state.game);
    expect(session.webCount).toBe(12);
    expect(session.whiteWebCount).toBe(12);
    expect(session.webs).toHaveLength(12);
    expect(session.baseWebId).toBeNull();
    expect(session.specialWebId).toBeNull();
    expect(session.webs.every((w) => w.type === "regular")).toBe(true);
    expect(session.webs.some((w) => w.id === EXCESS_BASE_INCOME_WEB_ID)).toBe(
      false,
    );
    expect(session.webs.some((w) => w.id === EXCESS_SPECIAL_WEB_ID)).toBe(
      false,
    );
  });

  it("5. T=25 → 60 white webs in session layout", () => {
    expect(computeExcessWebCount(25)).toBe(60);
    const layout = generateExcessWebLayout({ seed: 7, webCount: 60 });
    expect(layout).toHaveLength(60);
    expect(layout.every((w) => w.id.startsWith("web-"))).toBe(true);
  });

  it("6. clear red webId rejected; no balance / history change", async () => {
    state.game = activeV2({ player_xp: 200 });
    const beforeBal = Number(state.account.active_balance);
    await expect(
      clearEconomyV2ExcessWeb(USER, EXCESS_BASE_INCOME_WEB_ID, NOW + 100),
    ).rejects.toMatchObject({ code: "invalid_excess_web_id", status: 400 });
    expect(Number(state.account.active_balance)).toBe(beforeBal);
    expect(state.incomeHistory).toEqual([]);
    expect(state.game.player_xp).toBe(200);
  });

  it("7. white clear is record-only: progress + zero rewards", async () => {
    state.game = activeV2({
      player_xp: 50,
      tree_growth_mm: 17,
      tree_growth_remainder: 0.4,
      pending_base_reward: 1.5,
      pending_bonus_reward: 0.25,
    });
    const beforeBal = Number(state.account.active_balance);
    const r = await clearEconomyV2ExcessWeb(USER, "web-0", NOW + 50);
    expect(r.reward.kind).toBe("progress");
    expect(r.reward.moneyGained).toBe(0);
    expect(r.reward.xpGained).toBe(0);
    expect(r.rewardDelta?.kind).toBe("progress");
    expect(r.session.clearedWebIds).toEqual(["web-0"]);
    expect(r.session.clearedWebCount).toBe(1);
    expect(r.session.remainingWebCount).toBe(11);
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual(["web-0"]);
    expect(Number(state.account.active_balance)).toBe(beforeBal);
    expect(r.playerXp).toBe(50);
    expect(state.game.player_xp).toBe(50);
    expect(state.incomeHistory).toEqual([]);
    expect(Number(state.game.pending_base_reward)).toBe(1.5);
    expect(Number(state.game.pending_bonus_reward)).toBe(0.25);
    expect(Number(state.game.tree_growth_mm)).toBe(17);
    expect(Number(state.game.tree_growth_remainder)).toBe(0.4);
  });

  it("8. second white clear increases progress only", async () => {
    state.game = activeV2({
      player_xp: 50,
      v2_excess_session_cleared_web_ids: ["web-0"],
    });
    const beforeBal = Number(state.account.active_balance);
    const r = await clearEconomyV2ExcessWeb(USER, "web-1", NOW + 60);
    expect(r.reward.moneyGained).toBe(0);
    expect(r.reward.xpGained).toBe(0);
    expect(r.session.clearedWebCount).toBe(2);
    expect(r.session.remainingWebCount).toBe(10);
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual([
      "web-0",
      "web-1",
    ]);
    expect(Number(state.account.active_balance)).toBe(beforeBal);
    expect(state.incomeHistory).toEqual([]);
  });

  it("9. repeat clear same white: 409, no duplicate progress / awards", async () => {
    state.game = activeV2({
      player_xp: 50,
      v2_excess_session_cleared_web_ids: ["web-3"],
    });
    await expect(
      clearEconomyV2ExcessWeb(USER, "web-3", NOW + 100),
    ).rejects.toMatchObject({
      code: "excess_web_already_cleared",
      status: 409,
    });
    expect(state.game.player_xp).toBe(50);
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual(["web-3"]);
    expect(state.incomeHistory).toEqual([]);
  });

  it("10. finish after all whites: Metelka pending with full D_base+D_excess+XP; no balance credit", async () => {
    state.game = activeV2({
      player_xp: 100,
      v2_excess_session_source_seconds: 5,
      v2_excess_seconds: 5,
      pending_base_reward: 0,
      pending_bonus_reward: 0,
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 12 },
        (_, i) => `web-${i}`,
      ),
    });
    const beforeBal = Number(state.account.active_balance);
    const elapsedMs = 3_600_000;
    const rate = 0.014;
    const expectedBase = 10; // frozen session base snapshot
    const gross = roundMoneyToKopecks(
      100_000 * (elapsedMs / (365 * 24 * 3600 * 1000)) * rate,
    );
    const maxXp = computeExcessCleaningXp({
      presetSeconds: 5,
      skill: 1,
    }).awardedXp;
    const r = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(r.result.available).toBe(false);
    expect(r.finishReason).toBe("all_webs_cleared");
    expect(r.moneyGained).toBe(0);
    expect(r.xpGained).toBe(0);
    expect(r.playerXp).toBe(100);
    expect(r.metelkaPendingReward?.active).toBe(true);
    expect(r.metelkaPendingReward?.baseAmount).toBe(expectedBase);
    expect(roundMoneyToKopecks(r.metelkaPendingReward!.bonusAmount)).toBe(gross);
    expect(r.metelkaPendingReward?.xpAmount).toBe(maxXp);
    expect(r.metelkaPendingReward?.totalAmount).toBe(
      roundMoneyToKopecks(expectedBase + gross),
    );
    expect(r.metelkaPendingReward?.claimToken).toBeTruthy();
    expect(state.game.metelka_pending_active).toBe(true);
    expect(Number(state.game.pending_base_reward)).toBe(0);
    expect(Number(state.account.active_balance)).toBe(beforeBal);
    expect(Number(state.game.v2_excess_seconds)).toBe(0);
    // Paid sourceElapsed deducted so the next Metelka cannot re-pay it.
    expect(Number(state.game.v2_excess_elapsed_ms)).toBe(0);
    expect(r.excessElapsedMs).toBe(0);
    expect(state.incomeHistory).toEqual([]);
    expect(state.game.player_xp).toBe(100);
  });

  it("11. finish after partial whites: full base, 75% D_excess at skill 0.5, skill XP", async () => {
    state.game = activeV2({
      player_xp: 88,
      v2_excess_session_source_seconds: 5,
      v2_excess_seconds: 5,
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 6 },
        (_, i) => `web-${i}`,
      ),
    });
    const beforeBal = Number(state.account.active_balance);
    const elapsedMs = 3_600_000;
    const rate = 0.014;
    const gross = 100_000 * (elapsedMs / (365 * 24 * 3600 * 1000)) * rate;
    const expectedBonus = roundMoneyToKopecks(gross * 0.75); // 0.5+0.5*0.5
    const halfXp = computeExcessCleaningXp({
      presetSeconds: 5,
      skill: 0.5,
    }).awardedXp;
    const r = await finishEconomyV2ExcessSession(USER, NOW + 5_000);
    expect(r.finishReason).toBe("time_expired");
    expect(r.moneyGained).toBe(0);
    expect(r.xpGained).toBe(0);
    expect(r.playerXp).toBe(88);
    expect(r.metelkaPendingReward?.active).toBe(true);
    expect(r.metelkaPendingReward?.baseAmount).toBe(10);
    expect(r.metelkaPendingReward!.bonusAmount).toBe(expectedBonus);
    expect(r.metelkaPendingReward?.xpAmount).toBe(halfXp);
    expect(Number(state.account.active_balance)).toBe(beforeBal);
    expect(state.incomeHistory).toEqual([]);
  });

  it("11b. finish with zero clears: full base, 50% D_excess, 0 XP", async () => {
    state.game = activeV2({
      player_xp: 10,
      v2_excess_session_source_seconds: 5,
      v2_excess_seconds: 5,
      v2_excess_session_cleared_web_ids: [],
    });
    const elapsedMs = 3_600_000;
    const rate = 0.014;
    const gross = 100_000 * (elapsedMs / (365 * 24 * 3600 * 1000)) * rate;
    const expectedBonus = roundMoneyToKopecks(gross * 0.5);
    const r = await finishEconomyV2ExcessSession(USER, NOW + 5_000);
    expect(r.finishReason).toBe("time_expired");
    expect(r.metelkaPendingReward?.active).toBe(true);
    expect(r.metelkaPendingReward?.baseAmount).toBe(10);
    expect(r.metelkaPendingReward?.bonusAmount).toBe(expectedBonus);
    expect(r.metelkaPendingReward?.xpAmount).toBe(0);
    expect(r.moneyGained).toBe(0);
    expect(r.xpGained).toBe(0);
    expect(state.game.player_xp).toBe(10);
  });

  it("11c. finish replaces prior unclaimed pending (no hang at timer 0)", async () => {
    state.game = activeV2({
      metelka_pending_active: true,
      metelka_pending_base: 1.23,
      metelka_pending_bonus: 0.45,
      metelka_pending_xp: 3,
      metelka_pending_claim_token: "tok-old",
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 12 },
        (_, i) => `web-${i}`,
      ),
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(r.finishReason).toBe("all_webs_cleared");
    expect(r.excess.session.active).toBe(false);
    expect(r.metelkaPendingReward?.active).toBe(true);
    expect(r.metelkaPendingReward?.claimToken).not.toBe("tok-old");
    expect(state.game.metelka_pending_claim_token).not.toBe("tok-old");
    expect(state.game.v2_excess_session_active).toBe(false);
  });

  it("12. Skill helper still works (legacy formula retained)", () => {
    const gross = 20;
    expect(computeExcessV2BonusPaid(gross, 0)).toBe(0);
    expect(computeExcessV2BonusPaid(gross, 0.5)).toBe(
      roundMoneyToKopecks(10),
    );
    expect(computeExcessV2BonusPaid(gross, 1)).toBe(roundMoneyToKopecks(20));
  });

  it("13. acknowledge settles a leftover (pre-migration) pending v2 result", async () => {
    state.game = activeV2({
      v2_excess_seconds: 15,
      v2_excess_elapsed_ms: 3_900_000,
      v2_excess_base_income: 12,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "time_expired",
      v2_excess_session_final_cleared_count: 6,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 0.5,
      v2_excess_session_gross_income: 20,
      v2_excess_session_payment_factor: 0.5,
      v2_excess_session_paid_income: 20,
      v2_excess_session_base_income: 10,
      v2_excess_session_base_web_cleared: true,
      v2_excess_session_base_web_collection_mode: "automatic",
      v2_excess_session_xp_applied: true,
      v2_excess_session_income_applied: false,
    });
    const r = await acknowledgeEconomyV2ExcessResult(USER);
    expect(r.paidIncomeApplied).toBe(20);
    expect(Number(state.game.v2_excess_base_income)).toBe(2);
    expect(Number(state.game.v2_excess_seconds)).toBe(3);
    // Paid financial snapshot deducted (remainder during-clean keeps).
    expect(Number(state.game.v2_excess_elapsed_ms)).toBe(300_000);
    expect(state.incomeHistory).toEqual([
      { amount: 10, type: "excess_base" },
      { amount: 10, type: "excess_bonus" },
    ]);
    expect(state.game.v2_excess_session_finished_at).toBeNull();
  });

  it("14. repeat acknowledge does not re-credit", async () => {
    state.game = activeV2({
      v2_excess_base_income: 12,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "time_expired",
      v2_excess_session_final_cleared_count: 12,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 1,
      v2_excess_session_gross_income: 8,
      v2_excess_session_payment_factor: 1,
      v2_excess_session_paid_income: 18,
      v2_excess_session_base_income: 10,
      v2_excess_session_xp_applied: true,
      v2_excess_session_income_applied: false,
    });
    const first = await acknowledgeEconomyV2ExcessResult(USER);
    expect(first.paidIncomeApplied).toBe(18);
    const second = await acknowledgeEconomyV2ExcessResult(USER);
    expect(second.paidIncomeApplied).toBe(0);
    expect(state.incomeHistory).toHaveLength(2);
  });

  it("finish fully settles a leftover pending v2 result instead of leaving it stuck", async () => {
    state.game = activeV2({
      v2_excess_seconds: 15,
      v2_excess_elapsed_ms: 3_900_000,
      v2_excess_base_income: 12,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "time_expired",
      v2_excess_session_final_cleared_count: 6,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 0.5,
      v2_excess_session_gross_income: 20,
      v2_excess_session_payment_factor: 0.5,
      v2_excess_session_paid_income: 20,
      v2_excess_session_base_income: 10,
      v2_excess_session_base_web_cleared: true,
      v2_excess_session_base_web_collection_mode: "automatic",
      v2_excess_session_xp_applied: true,
      v2_excess_session_income_applied: false,
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 6000);
    expect(r.moneyGained).toBe(20);
    expect(r.result.available).toBe(false);
    expect(state.game.v2_excess_session_finished_at).toBeNull();
    expect(Number(state.game.v2_excess_base_income)).toBe(2);

    const again = await finishEconomyV2ExcessSession(USER, NOW + 7000);
    expect(again.moneyGained).toBe(0);
    expect(again.finishReason).toBeNull();
  });

  it("15. legacy keeps old formula path (no version=2 fields)", async () => {
    state.game = activeV2({
      v2_excess_session_version: 1,
      v2_excess_session_base_income: null,
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 5_000);
    expect(r.result.available).toBe(false);
    expect(r.finishReason).toBe("time_expired");
    expect(state.game.v2_excess_session_finished_at).toBeNull();
    expect(Number(state.game.v2_excess_seconds)).toBe(0);
  });

  it("ledger preserve: excess untouched by white-web clears", async () => {
    state.game = activeV2({
      v2_excess_seconds: 18,
      v2_excess_elapsed_ms: 4_000_000,
      v2_excess_base_income: 10,
    });
    await clearEconomyV2ExcessWeb(USER, "web-0", NOW + 10);
    await clearEconomyV2ExcessWeb(USER, "web-1", NOW + 20);
    expect(Number(state.game.v2_excess_seconds)).toBe(18);
    expect(Number(state.game.v2_excess_elapsed_ms)).toBe(4_000_000);
    expect(Number(state.game.v2_excess_base_income)).toBe(10);
  });

  it("finish idempotent: repeat finish after settle is a no-op", async () => {
    state.game = activeV2({
      v2_excess_session_source_seconds: 5,
      v2_excess_seconds: 5,
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 12 },
        (_, i) => `web-${i}`,
      ),
    });
    const first = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(first.moneyGained).toBe(0);
    expect(first.xpGained).toBe(0);
    expect(first.metelkaPendingReward?.active).toBe(true);
    const token = first.metelkaPendingReward?.claimToken;
    const base = first.metelkaPendingReward?.baseAmount;
    const bonus = first.metelkaPendingReward?.bonusAmount;
    expect(state.game.v2_excess_session_active).toBe(false);

    // Second finish: no active session → no-op (pending already exists may 409
    // if somehow session still active; here session wiped so idle path).
    const second = await finishEconomyV2ExcessSession(USER, NOW + 200);
    expect(second.result.available).toBe(false);
    expect(second.moneyGained).toBe(0);
    expect(second.xpGained).toBe(0);
    expect(second.finishReason).toBeNull();
    expect(state.game.metelka_pending_claim_token).toBe(token);
    expect(Number(state.game.metelka_pending_base)).toBe(base);
    expect(Number(state.game.metelka_pending_bonus)).toBe(bonus);
  });
});
