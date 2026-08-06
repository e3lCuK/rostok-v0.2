import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  excessBonusRate,
  excessCycleFromSeconds,
  excessPresetSeconds,
} from "./economy-v2-excess";

type Row = Record<string, unknown>;

const { connectMock, releaseMock, state } = vi.hoisted(() => {
  const releaseMock = vi.fn();
  const state = {
    game: null as Row | null,
    capital: 100_000 as number | string,
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

    if (text.includes("FROM accounts") && text.includes("active_balance")) {
      return { rows: [{ active_balance: state.capital }] };
    }

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
      if (params.length > 6) {
        state.game.v2_excess_elapsed_ms = params[6];
      }
      return { rows: [] };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_active = TRUE")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      if (state.game.v2_excess_session_active === true) {
        return { rows: [] };
      }
      // version=2 start: $2=version … $11=seed
      const hasVersion = text.includes("v2_excess_session_version");
      const p = hasVersion
        ? {
            version: params[1],
            startedAt: params[2],
            sourceSeconds: params[3],
            sourceElapsedMs: params[4],
            capital: params[5],
            baseIncome: params[6],
            preset: params[7],
            rate: params[8],
            webCount: params[9],
            seed: params[10],
          }
        : {
            version: null,
            startedAt: params[1],
            sourceSeconds: params[2],
            sourceElapsedMs: params[3],
            capital: params[4],
            baseIncome: null,
            preset: params[5],
            rate: params[6],
            webCount: params[7],
            seed: params[8],
          };
      state.game.v2_excess_session_active = true;
      state.game.v2_excess_session_version = p.version;
      state.game.v2_excess_session_started_at = p.startedAt;
      state.game.v2_excess_session_source_seconds = p.sourceSeconds;
      state.game.v2_excess_session_source_elapsed_ms = p.sourceElapsedMs;
      state.game.v2_excess_session_capital = p.capital;
      state.game.v2_excess_session_base_income = p.baseIncome;
      state.game.v2_excess_session_base_web_cleared = false;
      state.game.v2_excess_session_base_web_collection_mode = null;
      state.game.v2_excess_session_preset_seconds = p.preset;
      state.game.v2_excess_session_rate = p.rate;
      state.game.v2_excess_session_web_count = p.webCount;
      state.game.v2_excess_session_layout_seed = p.seed;
      state.game.v2_excess_session_cleared_web_ids = [];
      return {
        rows: [
          {
            v2_excess_seconds: state.game.v2_excess_seconds,
            v2_excess_elapsed_ms: state.game.v2_excess_elapsed_ms ?? 0,
            v2_excess_base_income: state.game.v2_excess_base_income ?? 0,
            v2_excess_session_active: true,
            v2_excess_session_version: p.version,
            v2_excess_session_started_at: p.startedAt,
            v2_excess_session_source_seconds: p.sourceSeconds,
            v2_excess_session_source_elapsed_ms: p.sourceElapsedMs,
            v2_excess_session_capital: p.capital,
            v2_excess_session_base_income: p.baseIncome,
            v2_excess_session_base_web_cleared: false,
            v2_excess_session_base_web_collection_mode: null,
            v2_excess_session_preset_seconds: p.preset,
            v2_excess_session_rate: p.rate,
            v2_excess_session_web_count: p.webCount,
            v2_excess_session_layout_seed: p.seed,
            v2_excess_session_cleared_web_ids: [],
          },
        ],
      };
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
      return {
        rows: [
          {
            v2_excess_seconds: state.game.v2_excess_seconds,
            v2_excess_session_active: state.game.v2_excess_session_active,
            v2_excess_session_started_at: state.game.v2_excess_session_started_at,
            v2_excess_session_source_seconds:
              state.game.v2_excess_session_source_seconds,
            v2_excess_session_preset_seconds:
              state.game.v2_excess_session_preset_seconds,
            v2_excess_session_rate: state.game.v2_excess_session_rate,
            v2_excess_session_web_count: state.game.v2_excess_session_web_count,
            v2_excess_session_layout_seed:
              state.game.v2_excess_session_layout_seed,
            v2_excess_session_cleared_web_ids: next,
          },
        ],
      };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_session_active = FALSE") &&
      text.includes("v2_excess_session_started_at = NULL")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
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
      return { rows: [] };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("v2_excess_seconds = $2") &&
      !text.includes("v2_excess_session")
    ) {
      state.updates.push({ sql: text, params });
      if (!state.game) return { rows: [] };
      state.game.v2_excess_seconds = params[1];
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in excess-session test mock: ${text}`);
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
  EconomyV2ExcessSessionError,
  startEconomyV2ExcessSession,
} from "./economy-v2-excess-session";
import {
  debugMutateEconomyV2Excess,
  parseDebugExcessAction,
} from "./economy-v2-excess-debug";
import {
  buildEconomyV2ExcessPublicState,
  inactiveExcessSession,
  readExcessSessionFromRow,
} from "./economy-v2-excess";

const NOW = 1_700_000_000_000;
const USER = "42";

function baseGame(overrides: Partial<Row> = {}): Row {
  return {
    v2_energy_seconds: 0,
    v2_energy_anchor_at: NOW,
    v2_root_ready_mask: "0",
    v2_root_generation_progress: "0",
    v2_excess_seconds: 0,
    v2_excess_elapsed_ms: 0,
    v2_excess_session_active: false,
    v2_excess_session_started_at: null,
    v2_excess_session_source_seconds: null,
    v2_excess_session_source_elapsed_ms: null,
    v2_excess_session_capital: null,
    v2_excess_session_preset_seconds: null,
    v2_excess_session_rate: null,
    v2_excess_session_web_count: null,
    v2_excess_session_layout_seed: null,
    v2_excess_session_cleared_web_ids: [],
    ...overrides,
  };
}

describe("startEconomyV2ExcessSession", () => {
  beforeEach(() => {
    state.game = null;
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
    releaseMock.mockClear();
    connectMock.mockClear();
  });

  it("1. rejects when excess < 5", async () => {
    state.game = baseGame({ v2_excess_seconds: 4 });
    await expect(startEconomyV2ExcessSession(USER, NOW)).rejects.toMatchObject({
      code: "excess_not_available",
      status: 409,
    });
    expect(state.game.v2_excess_session_active).toBe(false);
  });

  it("2. allows start at excess = 5", async () => {
    state.game = baseGame({
      v2_excess_seconds: 5,
      v2_excess_elapsed_ms: 12_000,
    });
    const r = await startEconomyV2ExcessSession(USER, NOW);
    expect(r.session.active).toBe(true);
    expect(r.session.sourceSeconds).toBe(5);
    expect(r.session.sourceElapsedMs).toBe(12_000);
    expect(r.session.capital).toBe(state.capital);
    expect(r.session.presetSeconds).toBe(5);
    expect(r.excessSeconds).toBe(5);
  });

  it("5–6. start freezes sourceElapsedMs and capital", async () => {
    state.capital = 77_777;
    state.game = baseGame({
      v2_excess_seconds: 10,
      v2_excess_elapsed_ms: 45_000,
    });
    const r = await startEconomyV2ExcessSession(USER, NOW);
    expect(r.session.sourceElapsedMs).toBe(45_000);
    expect(r.session.capital).toBe(77_777);
    expect(state.game.v2_excess_session_source_elapsed_ms).toBe(45_000);
    expect(state.game.v2_excess_session_capital).toBe(77_777);
  });

  it("7. post-start excess growth does not change session snapshot", async () => {
    state.game = baseGame({
      v2_excess_seconds: 12,
      v2_excess_elapsed_ms: 20_000,
    });
    const r = await startEconomyV2ExcessSession(USER, NOW);
    expect(r.session.sourceSeconds).toBe(12);
    expect(r.session.sourceElapsedMs).toBe(20_000);
    state.game.v2_excess_seconds = 14;
    state.game.v2_excess_elapsed_ms = 30_000;
    const again = readExcessSessionFromRow(state.game);
    expect(again.sourceSeconds).toBe(12);
    expect(again.sourceElapsedMs).toBe(20_000);
  });

  it("3. allows start when excess > 5", async () => {
    state.game = baseGame({ v2_excess_seconds: 25 });
    const r = await startEconomyV2ExcessSession(USER, NOW);
    expect(r.session.active).toBe(true);
    expect(r.session.sourceSeconds).toBe(25);
  });

  it("4–8. freezes source, preset, rate, startedAt, active, webCount, seed", async () => {
    const source = 12.5;
    state.game = baseGame({ v2_excess_seconds: source });
    const cycle = excessCycleFromSeconds(source);
    const r = await startEconomyV2ExcessSession(USER, NOW);

    expect(r.session.sourceSeconds).toBeCloseTo(source, 10);
    expect(r.session.presetSeconds).toBe(excessPresetSeconds(cycle));
    expect(r.session.presetSeconds).toBeGreaterThanOrEqual(5);
    expect(r.session.presetSeconds).toBeLessThanOrEqual(25);
    expect(r.session.rate).toBeCloseTo(excessBonusRate(cycle), 12);
    expect(r.session.startedAt).toBe(NOW);
    expect(r.session.active).toBe(true);
    expect(r.session.webCount).toBe(
      Math.round(2.4 * (r.session.presetSeconds as number)),
    );
    expect(r.session.layoutSeed).not.toBeNull();
    expect(r.session.webs.length).toBe((r.session.webCount ?? 0) + 1);
    expect(r.session.clearedWebIds).toEqual([]);
    expect(r.session.clearedWebCount).toBe(0);
    expect(r.session.remainingWebCount).toBe(r.session.webCount);
    expect(r.excess.session).toEqual(r.session);
    expect(state.game.v2_excess_session_web_count).toBe(r.session.webCount);
    expect(state.game.v2_excess_session_layout_seed).toBe(r.session.layoutSeed);
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual([]);
  });

  it("layout is stable across repeated reads with same seed", async () => {
    state.game = baseGame({ v2_excess_seconds: 10 });
    const r = await startEconomyV2ExcessSession(USER, NOW);
    const again = readExcessSessionFromRow(state.game!);
    expect(again.webs).toEqual(r.session.webs);
    expect(again.webCount).toBe(r.session.webCount);
    expect(again.layoutSeed).toBe(r.session.layoutSeed);
  });

  it("9. does not reduce v2_excess_seconds on start", async () => {
    state.game = baseGame({ v2_excess_seconds: 18 });
    const r = await startEconomyV2ExcessSession(USER, NOW);
    expect(r.excessSeconds).toBe(18);
    expect(state.game.v2_excess_seconds).toBe(18);
  });

  it("10. rejects second start while active", async () => {
    state.game = baseGame({ v2_excess_seconds: 10 });
    await startEconomyV2ExcessSession(USER, NOW);
    await expect(startEconomyV2ExcessSession(USER, NOW + 1)).rejects.toMatchObject({
      code: "excess_session_already_active",
      status: 409,
    });
  });

  it("11. parallel starts create only one session", async () => {
    state.game = baseGame({ v2_excess_seconds: 20 });
    const results = await Promise.allSettled([
      startEconomyV2ExcessSession(USER, NOW),
      startEconomyV2ExcessSession(USER, NOW + 1),
    ]);
    const ok = results.filter((x) => x.status === "fulfilled");
    const fail = results.filter((x) => x.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect((fail[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      EconomyV2ExcessSessionError,
    );
    expect((fail[0] as PromiseRejectedResult).reason.code).toBe(
      "excess_session_already_active",
    );
    expect(state.game!.v2_excess_session_active).toBe(true);
  });

  it("12. later excess accrual does not change session snapshot", async () => {
    state.game = baseGame({ v2_excess_seconds: 12 });
    const started = await startEconomyV2ExcessSession(USER, NOW);
    expect(started.session.sourceSeconds).toBe(12);

    state.game.v2_excess_seconds = 14;
    const publicState = buildEconomyV2ExcessPublicState(
      state.game.v2_excess_seconds,
      readExcessSessionFromRow(state.game),
    );
    expect(publicState.excessSeconds).toBe(14);
    expect(publicState.session.sourceSeconds).toBe(12);
    expect(publicState.session.presetSeconds).toBe(started.session.presetSeconds);
    expect(publicState.session.rate).toBe(started.session.rate);
  });

  it("15. snapshot active / inactive shapes", () => {
    expect(buildEconomyV2ExcessPublicState(0).session).toEqual(
      inactiveExcessSession(),
    );
    expect(
      readExcessSessionFromRow({
        v2_excess_session_active: false,
        v2_excess_session_started_at: 1,
        v2_excess_session_source_seconds: 9,
      }),
    ).toEqual(inactiveExcessSession());

    const active = readExcessSessionFromRow({
      v2_excess_session_active: true,
      v2_excess_session_started_at: NOW,
      v2_excess_session_source_seconds: "7.5",
      v2_excess_session_preset_seconds: 5,
      v2_excess_session_rate: "0.014",
      v2_excess_session_web_count: 12,
      v2_excess_session_layout_seed: 12345,
    });
    expect(active.active).toBe(true);
    expect(active.startedAt).toBe(NOW);
    expect(active.sourceSeconds).toBeCloseTo(7.5, 10);
    expect(active.presetSeconds).toBe(5);
    expect(active.rate).toBeCloseTo(0.014, 10);
    expect(active.webCount).toBe(12);
    expect(active.layoutSeed).toBe(12345);
    expect(active.clearedWebIds).toEqual([]);
    expect(active.clearedWebCount).toBe(0);
    expect(active.remainingWebCount).toBe(12);
    expect(active.webs).toHaveLength(13);
    expect(active.webs.every((w) => w.cleared === false)).toBe(true);
    expect(active.specialWebId).toBe("web-special");
  });

  it("16. migration defaults look inactive", () => {
    const row = baseGame();
    expect(row.v2_excess_session_active).toBe(false);
    expect(readExcessSessionFromRow(row)).toEqual(inactiveExcessSession());
  });
});

describe("debug resetSession", () => {
  beforeEach(() => {
    state.game = null;
    state.updates = [];
    state.lockQueue = Promise.resolve();
    state.unlock = null;
    releaseMock.mockClear();
  });

  it("accepts resetSession action", () => {
    expect(parseDebugExcessAction({ action: "resetSession" })).toEqual({
      action: "resetSession",
    });
  });

  it("13–14. clears session only; keeps excess", async () => {
    state.game = baseGame({
      v2_excess_seconds: 22,
      v2_excess_session_active: true,
      v2_excess_session_started_at: NOW,
      v2_excess_session_source_seconds: 12,
      v2_excess_session_preset_seconds: 5,
      v2_excess_session_rate: 0.014,
    });

    const r = await debugMutateEconomyV2Excess(USER, { action: "resetSession" });
    expect(r.excessSeconds).toBe(22);
    expect(r.excess.session.active).toBe(false);
    expect(r.excess.session.sourceSeconds).toBeNull();
    expect(state.game.v2_excess_seconds).toBe(22);
    expect(state.game.v2_excess_session_active).toBe(false);
    expect(state.game.v2_excess_session_started_at).toBeNull();
    expect(state.game.v2_excess_session_source_seconds).toBeNull();
    expect(state.game.v2_excess_session_web_count).toBeNull();
    expect(state.game.v2_excess_session_layout_seed).toBeNull();
    expect(state.game.v2_excess_session_cleared_web_ids).toEqual([]);
  });
});
