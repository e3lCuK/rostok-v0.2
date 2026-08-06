import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { connectMock, releaseMock, state } = vi.hoisted(() => {
  const releaseMock = vi.fn();
  const state = {
    game: null as Row | null,
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

    if (text.includes("FROM game_state") && text.includes("FOR UPDATE")) {
      if (!state.game) return { rows: [] };
      return { rows: [{ ...state.game }] };
    }

    if (text.includes("FROM accounts") && text.includes("FOR UPDATE")) {
      return {
        rows: [{ active_balance: "100000", active_earned: "0" }],
      };
    }

    if (text.includes("FROM accounts") && !text.includes("FOR UPDATE")) {
      return {
        rows: [{ active_balance: "100000", active_earned: "0" }],
      };
    }

    if (text.startsWith("UPDATE accounts")) {
      state.updates.push({ sql: text, params });
      return { rows: [] };
    }

    if (text.startsWith("INSERT INTO income_history")) {
      state.updates.push({ sql: text, params });
      return { rows: [] };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_cleared_web_ids = $2")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      const webId = String(params[8] ?? params[2]);
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
      if (params[2] != null) state.game.v2_excess_session_xp_awarded = params[2];
      if (params[5] != null) state.game.v2_excess_session_paid_income = params[5];
      if (params[6] != null) state.game.player_xp = params[6];
      if (params[7] != null) state.game.player_level = params[7];
      return {
        rows: [
          {
            ...state.game,
            v2_excess_session_cleared_web_ids: next,
          },
        ],
      };
    }

    throw new Error(`Unexpected SQL in excess-web-clear test mock: ${text}`);
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

import { clearEconomyV2ExcessWeb } from "./economy-v2-excess-web-clear";
import { EconomyV2ExcessSessionError } from "./economy-v2-excess-session";
import { readExcessSessionFromRow } from "./economy-v2-excess";

const NOW = 1_700_000_000_000;
const USER = "42";
const PRESET = 5;
const WEB_COUNT = 12;
const SEED = 424242;

function activeSession(overrides: Partial<Row> = {}): Row {
  return {
    v2_excess_seconds: 10,
    v2_energy_seconds: 40,
    player_xp: 100,
    player_level: 1,
    v2_excess_session_active: true,
    v2_excess_session_started_at: NOW,
    v2_excess_session_source_seconds: 10,
    v2_excess_session_source_elapsed_ms: 3_600_000,
    v2_excess_session_capital: 100_000,
    v2_excess_session_preset_seconds: PRESET,
    v2_excess_session_rate: 0.014,
    v2_excess_session_web_count: WEB_COUNT,
    v2_excess_session_layout_seed: SEED,
    v2_excess_session_cleared_web_ids: [],
    v2_excess_session_xp_awarded: 0,
    v2_excess_session_paid_income: 0,
    ...overrides,
  };
}

describe("clearEconomyV2ExcessWeb", () => {
  beforeEach(() => {
    state.game = null;
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
    releaseMock.mockClear();
    connectMock.mockClear();
  });

  it("1–4. valid webId clears and updates counts", async () => {
    state.game = activeSession();
    const r = await clearEconomyV2ExcessWeb(USER, "web-7", NOW + 1000);
    expect(r.clearedWebId).toBe("web-7");
    expect(r.session.clearedWebIds).toEqual(["web-7"]);
    expect(r.session.clearedWebCount).toBe(1);
    expect(r.session.remainingWebCount).toBe(WEB_COUNT - 1);
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual(["web-7"]);
    const flagged = r.session.webs.find((w) => w.id === "web-7");
    expect(flagged?.cleared).toBe(true);
    expect(r.session.webs.filter((w) => !w.cleared)).toHaveLength(WEB_COUNT); // N-1 regular + special
    expect(r.session.webs).toHaveLength(WEB_COUNT + 1);
    expect(r.session.remainingWebCount).toBe(WEB_COUNT - 1);
  });

  it("5. invalid id rejected", async () => {
    state.game = activeSession();
    await expect(
      clearEconomyV2ExcessWeb(USER, "spider-1", NOW + 1000),
    ).rejects.toMatchObject({
      code: "invalid_excess_web_id",
      status: 400,
    });
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual([]);
  });

  it("6. id outside webCount rejected", async () => {
    state.game = activeSession();
    await expect(
      clearEconomyV2ExcessWeb(USER, "web-12", NOW + 1000),
    ).rejects.toMatchObject({
      code: "invalid_excess_web_id",
      status: 400,
    });
  });

  it("7. repeat clear rejected", async () => {
    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-3"],
    });
    await expect(
      clearEconomyV2ExcessWeb(USER, "web-3", NOW + 1000),
    ).rejects.toMatchObject({
      code: "excess_web_already_cleared",
      status: 409,
    });
  });

  it("8. parallel clears of same web count once", async () => {
    state.game = activeSession();
    const results = await Promise.allSettled([
      clearEconomyV2ExcessWeb(USER, "web-1", NOW + 500),
      clearEconomyV2ExcessWeb(USER, "web-1", NOW + 500),
    ]);
    const ok = results.filter((x) => x.status === "fulfilled");
    const fail = results.filter((x) => x.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect((fail[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      EconomyV2ExcessSessionError,
    );
    expect((fail[0] as PromiseRejectedResult).reason.code).toBe(
      "excess_web_already_cleared",
    );
    expect(state.game!.v2_excess_session_cleared_web_ids).toEqual(["web-1"]);
  });

  it("9. different webs clear independently", async () => {
    state.game = activeSession();
    const a = await clearEconomyV2ExcessWeb(USER, "web-0", NOW + 200);
    const b = await clearEconomyV2ExcessWeb(USER, "web-5", NOW + 300);
    expect(a.session.clearedWebCount).toBe(1);
    expect(b.session.clearedWebIds.sort()).toEqual(["web-0", "web-5"]);
    expect(b.session.remainingWebCount).toBe(WEB_COUNT - 2);
  });

  it("10. after session endAt clear rejected", async () => {
    state.game = activeSession();
    const endAt = NOW + PRESET * 1000;
    await expect(
      clearEconomyV2ExcessWeb(USER, "web-0", endAt),
    ).rejects.toMatchObject({
      code: "excess_session_time_expired",
      status: 409,
    });
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual([]);
  });

  it("11. before endAt clear allowed", async () => {
    state.game = activeSession();
    const endAt = NOW + PRESET * 1000;
    const r = await clearEconomyV2ExcessWeb(USER, "web-2", endAt - 1);
    expect(r.clearedWebId).toBe("web-2");
  });

  it("12. snapshot returns cleared flags", async () => {
    state.game = activeSession();
    const r = await clearEconomyV2ExcessWeb(USER, "web-4", NOW + 100);
    expect(r.session.webs.every((w) => typeof w.cleared === "boolean")).toBe(
      true,
    );
    expect(r.session.webs.find((w) => w.id === "web-4")?.cleared).toBe(true);
  });

  it("13. re-read returns same cleared state", async () => {
    state.game = activeSession();
    await clearEconomyV2ExcessWeb(USER, "web-6", NOW + 100);
    const again = readExcessSessionFromRow(state.game!);
    expect(again.clearedWebIds).toEqual(["web-6"]);
    expect(again.webs.find((w) => w.id === "web-6")?.cleared).toBe(true);
    expect(again.webs.find((w) => w.id === "web-0")?.cleared).toBe(false);
  });

  it("15. excess seconds unchanged on clear (money/XP may apply)", async () => {
    state.game = activeSession({
      v2_excess_seconds: 18,
      v2_energy_seconds: 55,
      player_xp: 999,
    });
    const r = await clearEconomyV2ExcessWeb(USER, "web-0", NOW + 50);
    expect(r.excessSeconds).toBe(18);
    expect(state.game.v2_excess_seconds).toBe(18);
    expect(state.game.v2_energy_seconds).toBe(55);
    expect(r.reward).toBeTruthy();
  });

  it("16. clearing all webs does not finish session", async () => {
    state.game = activeSession({ v2_excess_session_web_count: 3 });
    for (let i = 0; i < 3; i++) {
      await clearEconomyV2ExcessWeb(USER, `web-${i}`, NOW + 100 + i);
    }
    expect(state.game.v2_excess_session_active).toBe(true);
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual([
      "web-0",
      "web-1",
      "web-2",
    ]);
    const session = readExcessSessionFromRow(state.game);
    expect(session.active).toBe(true);
    expect(session.remainingWebCount).toBe(0);
    expect(session.clearedWebCount).toBe(3);
  });

  it("rejects when session inactive", async () => {
    state.game = activeSession({ v2_excess_session_active: false });
    await expect(
      clearEconomyV2ExcessWeb(USER, "web-0", NOW + 100),
    ).rejects.toMatchObject({
      code: "excess_session_not_active",
      status: 409,
    });
  });
});

describe("resetSession clears clearedWebIds", () => {
  beforeEach(() => {
    state.game = null;
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
  });

  it("14. resetSession clears clearedWebIds", async () => {
    // debugMutate uses its own SQL path — reuse session-test style via direct row mutate
    // through clearExcessSessionSqlParams by calling debug with a minimal mock.
    // Here we verify read after manual clear fields (same SQL fragment).
    const { clearExcessSessionSqlParams } = await import(
      "./economy-v2-excess-session"
    );
    const { sql } = clearExcessSessionSqlParams();
    expect(sql).toContain("v2_excess_session_cleared_web_ids = '{}'");

    state.game = activeSession({
      v2_excess_session_cleared_web_ids: ["web-0", "web-1"],
    });
    // Simulate reset SQL effect (debug route uses same fragment)
    state.game.v2_excess_session_active = false;
    state.game.v2_excess_session_started_at = null;
    state.game.v2_excess_session_source_seconds = null;
    state.game.v2_excess_session_preset_seconds = null;
    state.game.v2_excess_session_rate = null;
    state.game.v2_excess_session_web_count = null;
    state.game.v2_excess_session_layout_seed = null;
    state.game.v2_excess_session_cleared_web_ids = [];
    const session = readExcessSessionFromRow(state.game);
    expect(session.active).toBe(false);
    expect(session.clearedWebIds).toEqual([]);
  });
});
