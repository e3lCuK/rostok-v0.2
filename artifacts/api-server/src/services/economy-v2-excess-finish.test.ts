import { beforeEach, describe, expect, it, vi } from "vitest";

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
      return { rows: [{ ...state.account }] };
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
      const typeMatch = text.match(/VALUES\(\$1, \$2, '([^']+)', \$3\)/);
      state.incomeHistory.push({
        amount: Number(params[1]) || 0,
        type: typeMatch?.[1] ?? (text.includes("'excess'") ? "excess" : String(params[2])),
      });
      return { rows: [] };
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

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_seconds = $2") &&
      text.includes("v2_excess_session_active = TRUE")
    ) {
      // New finish: deduct excess + tally while still active, then clear.
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

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_income_applied = TRUE") &&
      text.includes("v2_excess_seconds = $2")
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
            v2_excess_session_gross_income:
              state.game.v2_excess_session_gross_income,
          },
        ],
      };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_finished_at = $2")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      if (
        state.game.v2_excess_session_active !== true ||
        state.game.v2_excess_session_finished_at != null ||
        state.game.v2_excess_session_xp_applied === true
      ) {
        return { rows: [] };
      }
      state.game.v2_excess_session_active = false;
      state.game.v2_excess_session_finished_at = params[1];
      state.game.v2_excess_session_finish_reason = params[2];
      state.game.v2_excess_session_final_cleared_count = params[3];
      state.game.v2_excess_session_final_web_count = params[4];
      state.game.v2_excess_session_skill = params[5];
      state.game.v2_excess_session_xp_max = params[6];
      state.game.v2_excess_session_xp_raw = params[7];
      state.game.v2_excess_session_xp_awarded = params[8];
      state.game.v2_excess_session_xp_applied = true;
      state.game.player_xp = params[9];
      state.game.player_level = params[10];
      state.game.v2_excess_session_gross_income = params[11];
      state.game.v2_excess_session_payment_factor = params[12];
      state.game.v2_excess_session_paid_income = params[13];
      state.game.v2_excess_session_income_applied = false;
      state.game.v2_excess_session_layout_seed = null;
      state.game.v2_excess_session_cleared_web_ids = [];
      return { rows: [{ ...state.game }] };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_active = FALSE") &&
      text.includes("v2_excess_session_finished_at = NULL")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      const prevXp = state.game.player_xp;
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
      state.game.player_xp = prevXp; // acknowledge/reset must not change XP
      return { rows: [] };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_cleared_web_ids = $2")
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

    throw new Error(`Unexpected SQL in excess-finish test mock: ${text}`);
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

import { finishEconomyV2ExcessSession } from "./economy-v2-excess-finish";
import { acknowledgeEconomyV2ExcessResult } from "./economy-v2-excess-acknowledge";
import { clearEconomyV2ExcessWeb } from "./economy-v2-excess-web-clear";
import { clearExcessSessionSqlParams } from "./economy-v2-excess-session";
import { EconomyV2ExcessSessionError } from "./economy-v2-excess-session";

const NOW = 1_700_000_000_000;
const USER = "42";
const PRESET = 5;
const WEB_COUNT = 12;

function activeSession(overrides: Partial<Row> = {}): Row {
  return {
    v2_excess_seconds: 10,
    v2_excess_elapsed_ms: 3_600_000,
    v2_energy_seconds: 40,
    player_xp: 100,
    player_level: 1,
    v2_player_xp: 100,
    v2_excess_session_active: true,
    v2_excess_session_started_at: NOW,
    v2_excess_session_source_seconds: 10,
    v2_excess_session_source_elapsed_ms: 3_600_000,
    v2_excess_session_capital: 100_000,
    v2_excess_session_preset_seconds: PRESET,
    v2_excess_session_rate: 0.014,
    v2_excess_session_web_count: WEB_COUNT,
    v2_excess_session_layout_seed: 424242,
    v2_excess_session_cleared_web_ids: [],
    v2_excess_session_finished_at: null,
    v2_excess_session_finish_reason: null,
    v2_excess_session_final_cleared_count: null,
    v2_excess_session_final_web_count: null,
    v2_excess_session_skill: null,
    v2_excess_session_xp_max: null,
    v2_excess_session_xp_raw: null,
    v2_excess_session_xp_awarded: null,
    v2_excess_session_xp_applied: false,
    v2_excess_session_gross_income: null,
    v2_excess_session_payment_factor: null,
    v2_excess_session_paid_income: null,
    v2_excess_session_income_applied: false,
    ...overrides,
  };
}

describe.skip("finishEconomyV2ExcessSession (legacy result card)", () => {
  beforeEach(() => {
    state.game = null;
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
    releaseMock.mockClear();
    connectMock.mockClear();
  });

  it("5. finish after time expired", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-0", "web-1"],
    });
    const endAt = NOW + PRESET * 1000;
    const r = await finishEconomyV2ExcessSession(USER, endAt);
    expect(r.result.available).toBe(true);
    expect(r.result.reason).toBe("time_expired");
    expect(r.result.clearedCount).toBe(2);
    expect(r.result.webCount).toBe(12);
    expect(r.result.skill).toBeCloseTo(2 / 12, 10);
    expect(r.excess.session.active).toBe(false);
    expect(state.game.v2_excess_session_active).toBe(false);
  });

  it("6. finish when all cleared before timer", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `web-${i}`);
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ids,
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 1000);
    expect(r.result.reason).toBe("all_webs_cleared");
    expect(r.result.skill).toBe(1);
    expect(r.result.clearedCount).toBe(12);
  });

  it("7. early finish rejected", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-0"],
    });
    await expect(
      finishEconomyV2ExcessSession(USER, NOW + 1000),
    ).rejects.toMatchObject({
      code: "excess_session_not_finishable",
      status: 409,
    });
  });

  it("8–9. reason and final counts persisted", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-0", "web-1", "web-2", "web-3", "web-4", "web-5"],
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000);
    expect(r.result.reason).toBe("time_expired");
    expect(state.game.v2_excess_session_finish_reason).toBe("time_expired");
    expect(state.game.v2_excess_session_final_cleared_count).toBe(6);
    expect(state.game.v2_excess_session_final_web_count).toBe(12);
    expect(Number(state.game.v2_excess_session_skill)).toBeCloseTo(0.5, 10);
  });

  it("10. repeat finish is idempotent", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-0"],
    });
    const first = await finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000);
    const second = await finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000 + 5000);
    expect(second.result).toEqual(first.result);
    expect(second.result.skill).toBe(first.result.skill);
    expect(second.result.finishedAt).toBe(first.result.finishedAt);
  });

  it("11. clear after finish rejected", async () => {
    state.game = activeSession();
    await finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000);
    await expect(
      clearEconomyV2ExcessWeb(USER, "web-0", NOW + PRESET * 1000 + 1),
    ).rejects.toMatchObject({
      code: "excess_session_finished",
      status: 409,
    });
  });

  it("12. result in snapshot", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 12 },
        (_, i) => `web-${i}`,
      ),
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 500);
    expect(r.excess.result.available).toBe(true);
    expect(r.excess.result.skill).toBe(1);
    expect(r.excess.session.active).toBe(false);
  });

  it("16. parallel finish creates one result", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-0"],
    });
    const results = await Promise.allSettled([
      finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000),
      finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000 + 1),
    ]);
    const ok = results.filter((x) => x.status === "fulfilled") as Array<
      PromiseFulfilledResult<Awaited<ReturnType<typeof finishEconomyV2ExcessSession>>>
    >;
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const skills = ok.map((x) => x.value.result.skill);
    expect(new Set(skills).size).toBe(1);
    expect(state.game!.v2_excess_session_final_cleared_count).toBe(1);
  });

  it("17. last clear then finish keeps clearedCount", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 11 },
        (_, i) => `web-${i}`,
      ),
    });
    await clearEconomyV2ExcessWeb(USER, "web-11", NOW + 100);
    const r = await finishEconomyV2ExcessSession(USER, NOW + 200);
    expect(r.result.reason).toBe("all_webs_cleared");
    expect(r.result.clearedCount).toBe(12);
    expect(r.result.skill).toBe(1);
  });

  it("18. XP / excess unchanged on finish for economy fields; XP awarded once", async () => {
    state.game = activeSession({
      v2_excess_seconds: 22,
      player_xp: 100,
      v2_excess_session_cleared_web_ids: ["web-0"],
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000);
    expect(r.excessSeconds).toBe(22);
    expect(state.game.v2_excess_seconds).toBe(22);
    // 1/12 of maxXp(5)=6 → raw 0.5 → awarded 1
    expect(r.playerXp).toBe(101);
    expect(r.xpGained).toBe(1);
    expect(r.result.xp.awarded).toBe(1);
    expect(r.result.xp.applied).toBe(true);
    expect(state.game.player_xp).toBe(101);
  });

  it("9–11. finish awards XP once; repeat/parallel do not double", async () => {
    state.game = activeSession({
      player_xp: 50,
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 12 },
        (_, i) => `web-${i}`,
      ),
    });
    const first = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(first.xpGained).toBe(6);
    expect(first.playerXp).toBe(56);
    expect(first.result.xp.max).toBe(6);
    expect(first.result.xp.raw).toBe(6);
    expect(first.result.xp.applied).toBe(true);

    const second = await finishEconomyV2ExcessSession(USER, NOW + 200);
    expect(second.playerXp).toBe(56);
    expect(second.xpGained).toBe(6);
    expect(state.game!.player_xp).toBe(56);
  });

  it("12. acknowledge credits paidIncome once and keeps player_xp", async () => {
    state.account = { active_balance: 100_000, active_earned: 50 };
    state.game = activeSession({
      player_xp: 200,
      v2_excess_seconds: 15,
      v2_excess_elapsed_ms: 4_000_000,
      v2_excess_session_source_seconds: 12,
      v2_excess_session_source_elapsed_ms: 3_600_000,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "time_expired",
      v2_excess_session_final_cleared_count: 3,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 0.25,
      v2_excess_session_xp_max: 6,
      v2_excess_session_xp_raw: 1.5,
      v2_excess_session_xp_awarded: 2,
      v2_excess_session_xp_applied: true,
      v2_excess_session_gross_income: 10,
      v2_excess_session_payment_factor: 0.5,
      v2_excess_session_paid_income: 5,
      v2_excess_session_income_applied: false,
    });
    const r = await acknowledgeEconomyV2ExcessResult(USER);
    expect(r.paidIncomeApplied).toBe(5);
    expect(r.balances.balance).toBe(100_005);
    expect(r.balances.earned).toBe(55);
    expect(state.game.player_xp).toBe(200);
    expect(state.game.v2_excess_session_finished_at).toBeNull();
    expect(state.game.v2_excess_seconds).toBe(3);
    // Paid financial snapshot deducted (anti double-pay).
    expect(state.game.v2_excess_elapsed_ms).toBe(400_000);
  });

  it("14. result contains XP fields", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-0", "web-1", "web-2", "web-3", "web-4", "web-5"],
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000);
    expect(r.result.xp.max).toBe(6);
    expect(r.result.xp.raw).toBe(3);
    expect(r.result.xp.awarded).toBe(3);
    expect(r.result.xp.applied).toBe(true);
  });

  it("15. resetSession SQL clears XP fields but mock keeps player_xp", () => {
    const { sql } = clearExcessSessionSqlParams();
    expect(sql).toContain("v2_excess_session_xp_max = NULL");
    expect(sql).toContain("v2_excess_session_xp_applied = FALSE");
    expect(sql).toContain("v2_excess_session_paid_income = NULL");
    expect(sql).not.toContain("player_xp");
  });

  it("16. apples/capital/income untouched — only player_xp and session fields change", async () => {
    state.game = activeSession({
      player_xp: 10,
      capital_balance: 999_999,
      tree_growth_mm: 42,
      apples: 7,
      v2_excess_session_cleared_web_ids: [],
    });
    await finishEconomyV2ExcessSession(USER, NOW + PRESET * 1000);
    expect(state.game.capital_balance).toBe(999_999);
    expect(state.game.tree_growth_mm).toBe(42);
    expect(state.game.apples).toBe(7);
    expect(state.game.v2_excess_seconds).toBe(10);
  });

  it("13–16. finish stores income preview; incomeApplied=false; balance unchanged", async () => {
    state.game = activeSession({
      v2_excess_session_capital: 100_000,
      v2_excess_session_source_elapsed_ms: 3_600_000,
      v2_excess_session_rate: 0.01,
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 12 },
        (_, i) => `web-${i}`,
      ),
      active_balance: 100_000,
      active_earned: 50,
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(r.result.income.available).toBe(true);
    expect(r.result.income.applied).toBe(false);
    expect(r.result.income.paymentFactor).toBe(1);
    expect(r.result.income.gross).toBeGreaterThan(0);
    expect(r.result.income.paid).toBeCloseTo(r.result.income.gross!, 8);
    expect(state.game.active_balance).toBe(100_000);
    expect(state.game.active_earned).toBe(50);
    expect(state.game.v2_excess_session_income_applied).toBe(false);

    const again = await finishEconomyV2ExcessSession(USER, NOW + 200);
    expect(again.result.income.paid).toBe(r.result.income.paid);
    expect(again.result.income.gross).toBe(r.result.income.gross);
  });

  it("17. legacy finish without elapsed → income unavailable", async () => {
    state.game = activeSession({
      v2_excess_session_source_elapsed_ms: 0,
      v2_excess_session_source_seconds: 10,
      v2_excess_session_cleared_web_ids: Array.from(
        { length: 12 },
        (_, i) => `web-${i}`,
      ),
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(r.result.income.available).toBe(false);
    expect(r.result.income.reason).toBe("missing_excess_elapsed_history");
    expect(r.result.income.paid).toBeNull();
    expect(state.game.v2_excess_session_paid_income).toBeNull();
  });
});

describe("acknowledgeEconomyV2ExcessResult", () => {
  beforeEach(() => {
    state.game = null;
    state.account = { active_balance: 100_000, active_earned: 50 };
    state.incomeHistory = [];
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
  });

  it("credits paidIncome once; second ack does not re-credit", async () => {
    state.game = activeSession({
      v2_excess_seconds: 15,
      v2_excess_elapsed_ms: 4_000_000,
      v2_excess_session_source_seconds: 12,
      v2_excess_session_source_elapsed_ms: 3_600_000,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "time_expired",
      v2_excess_session_final_cleared_count: 12,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 1,
      v2_excess_session_gross_income: 12.345,
      v2_excess_session_payment_factor: 1,
      v2_excess_session_paid_income: 12.35,
      v2_excess_session_income_applied: false,
    });
    const first = await acknowledgeEconomyV2ExcessResult(USER);
    expect(first.paidIncomeApplied).toBe(12.35);
    expect(first.balances.balance).toBe(100_012.35);
    expect(first.balances.earned).toBe(62.35);
    expect(first.excessSeconds).toBe(3);
    expect(first.result.available).toBe(false);
    expect(state.incomeHistory).toEqual([{ amount: 12.35, type: "excess" }]);

    const second = await acknowledgeEconomyV2ExcessResult(USER);
    expect(second.paidIncomeApplied).toBe(0);
    expect(second.balances.balance).toBe(100_012.35);
    expect(second.balances.earned).toBe(62.35);
    expect(state.account.active_balance).toBe(100_012.35);
    expect(state.incomeHistory).toHaveLength(1);
  });

  it("deducts paid snapshot ledger+elapsed; keeps accrual remainder during clean", async () => {
    state.game = activeSession({
      v2_excess_seconds: 15, // 12 source + 3 during clean
      v2_excess_elapsed_ms: 3_900_000, // 3_600_000 + 300_000
      v2_excess_session_source_seconds: 12,
      v2_excess_session_source_elapsed_ms: 3_600_000,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "all_cleared",
      v2_excess_session_final_cleared_count: 12,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 1,
      v2_excess_session_gross_income: 7.5,
      v2_excess_session_payment_factor: 1,
      v2_excess_session_paid_income: 7.5,
      v2_excess_session_income_applied: false,
    });
    const r = await acknowledgeEconomyV2ExcessResult(USER);
    expect(r.excessSeconds).toBe(3);
    expect(r.excessElapsedMs).toBe(300_000);
    expect(state.game.v2_excess_seconds).toBe(3);
    expect(state.game.v2_excess_elapsed_ms).toBe(300_000);
  });

  it("legacy unavailable income: no money, still clears + deducts snapshot", async () => {
    state.game = activeSession({
      v2_excess_seconds: 10,
      v2_excess_elapsed_ms: 0,
      v2_excess_session_source_seconds: 10,
      v2_excess_session_source_elapsed_ms: 0,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "time_expired",
      v2_excess_session_final_cleared_count: 3,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 0.25,
      v2_excess_session_gross_income: null,
      v2_excess_session_payment_factor: null,
      v2_excess_session_paid_income: null,
      v2_excess_session_income_applied: false,
    });
    const r = await acknowledgeEconomyV2ExcessResult(USER);
    expect(r.paidIncomeApplied).toBe(0);
    expect(r.balances.balance).toBe(100_000);
    expect(r.balances.earned).toBe(50);
    expect(r.excessSeconds).toBe(0);
    expect(r.result.available).toBe(false);
    expect(state.incomeHistory).toHaveLength(0);
  });

  it("alreadyApplied=true: no re-credit, clears result, does not re-deduct", async () => {
    state.game = activeSession({
      v2_excess_seconds: 18,
      v2_excess_elapsed_ms: 5_000_000,
      v2_excess_session_source_seconds: 12,
      v2_excess_session_source_elapsed_ms: 3_600_000,
      v2_excess_session_active: false,
      v2_excess_session_finished_at: NOW + 5000,
      v2_excess_session_finish_reason: "time_expired",
      v2_excess_session_final_cleared_count: 3,
      v2_excess_session_final_web_count: 12,
      v2_excess_session_skill: 0.25,
      v2_excess_session_gross_income: 12,
      v2_excess_session_paid_income: 12,
      v2_excess_session_income_applied: true,
    });
    const r = await acknowledgeEconomyV2ExcessResult(USER);
    expect(r.paidIncomeApplied).toBe(0);
    expect(r.excessSeconds).toBe(18);
    expect(r.result.available).toBe(false);
    expect(state.account.active_balance).toBe(100_000);
    expect(state.game.v2_excess_session_finished_at).toBeNull();
  });

  it("idempotent when already cleared", async () => {
    state.game = activeSession({
      v2_excess_session_active: false,
      v2_excess_session_finished_at: null,
    });
    const r = await acknowledgeEconomyV2ExcessResult(USER);
    expect(r.result.available).toBe(false);
    expect(r.paidIncomeApplied).toBe(0);
  });

  it("resetSession SQL clears result fields", () => {
    const { sql } = clearExcessSessionSqlParams();
    expect(sql).toContain("v2_excess_session_finished_at = NULL");
    expect(sql).toContain("v2_excess_session_finish_reason = NULL");
    expect(sql).toContain("v2_excess_session_skill = NULL");
    expect(sql).toContain("v2_excess_session_final_cleared_count = NULL");
  });
});

describe("finishEconomyV2ExcessSession (per-click rewards, no result card)", () => {
  beforeEach(() => {
    releaseMock.mockClear();
    connectMock.mockClear();
    state.game = null;
    state.account = { active_balance: 100_000, active_earned: 50 };
    state.incomeHistory = [];
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
  });

  function activeSession(overrides: Partial<Row> = {}): Row {
    return {
      v2_excess_seconds: 10,
      v2_excess_elapsed_ms: 3_600_000,
      player_xp: 100,
      player_level: 1,
      v2_excess_session_active: true,
      v2_excess_session_started_at: NOW,
      v2_excess_session_source_seconds: 10,
      v2_excess_session_source_elapsed_ms: 3_600_000,
      v2_excess_session_capital: 100_000,
      v2_excess_session_preset_seconds: 5,
      v2_excess_session_rate: 0.014,
      v2_excess_session_web_count: 12,
      v2_excess_session_layout_seed: 424242,
      v2_excess_session_cleared_web_ids: [],
      v2_excess_session_finished_at: null,
      v2_excess_session_xp_awarded: 0,
      v2_excess_session_paid_income: 0,
      v2_excess_session_xp_applied: false,
      v2_excess_session_income_applied: false,
      ...overrides,
    };
  }

  const NOW = 1_700_000_000_000;
  const USER = "42";

  it("time expired → auto-collects special, deducts excess, no result card", async () => {
    state.game = activeSession();
    const beforeBal = Number(state.account.active_balance);
    const r = await finishEconomyV2ExcessSession(USER, NOW + 5_000);
    expect(r.result.available).toBe(false);
    expect(r.finishReason).toBe("time_expired");
    expect(r.excess.session.active).toBe(false);
    expect(state.game.v2_excess_session_active).toBe(false);
    expect(state.game.v2_excess_session_finished_at).toBeNull();
    expect(Number(state.game.v2_excess_seconds)).toBe(0);
    expect(r.moneyGained).toBeGreaterThan(0);
    expect(Number(state.account.active_balance)).toBeGreaterThan(beforeBal);
  });

  it("all regular webs cleared → finish without pending result", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `web-${i}`);
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ids,
      v2_excess_session_xp_awarded: 6,
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(r.finishReason).toBe("all_webs_cleared");
    expect(r.result.available).toBe(false);
    expect(r.xpGained).toBe(6);
  });

  it("not finishable while time remains and webs left", async () => {
    state.game = activeSession();
    await expect(
      finishEconomyV2ExcessSession(USER, NOW + 100),
    ).rejects.toMatchObject({
      code: "excess_session_not_finishable",
      status: 409,
    });
  });

  it("idempotent when already idle", async () => {
    state.game = activeSession({
      v2_excess_session_active: false,
      v2_excess_session_finished_at: null,
    });
    const r = await finishEconomyV2ExcessSession(USER, NOW + 100);
    expect(r.result.available).toBe(false);
    expect(r.finishReason).toBeNull();
  });
});

describe("deductExcessSnapshotShare", () => {
  it("never goes negative", async () => {
    const { deductExcessSnapshotShare } = await import(
      "./economy-v2-excess-acknowledge"
    );
    expect(deductExcessSnapshotShare(5, 12)).toBe(0);
    expect(deductExcessSnapshotShare(15, 12)).toBe(3);
  });
});
