import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, connectMock, releaseMock } = vi.hoisted(() => {
  const queryMock = vi.fn();
  const releaseMock = vi.fn();
  const connectMock = vi.fn(async () => ({
    query: queryMock,
    release: releaseMock,
  }));
  return { queryMock, connectMock, releaseMock };
});

vi.mock("@workspace/db", () => ({
  pool: {
    connect: connectMock,
    query: vi.fn(),
  },
}));

vi.mock("./economy-v3-feature", () => ({
  isEconomyV3RootsEnabled: () => true,
}));

import {
  debugMetelkaElapsedMsAfterAdd,
  debugMetelkaElapsedMsForLedger,
  debugMetelkaSettleWallClockElapsed,
  debugMutateEconomyV2Excess,
  debugTargetPresetAfterAdd,
  EconomyV2ExcessDebugError,
  parseDebugExcessAction,
} from "./economy-v2-excess-debug";
import {
  deriveExcessPresetSeconds,
  excessBonusRate,
  excessCycleFromSeconds,
  minExcessSecondsForPreset,
  MIN_LEDGER_SEARCH_STEP,
} from "./economy-v2-excess";
import { computeExcessWebCount } from "./economy-v2-excess-webs";
import { computeMetelkaFinishPendingAward } from "./economy-v2-excess-metelka-pending";
import { buildV3EffectiveCapacityBreakdown } from "./economy-v3-effective-capacity";
import { secondsPerGameSecondForCapital } from "./economy-v3-roots";

const REF_CAPITAL = 100_000;

function naturalElapsedMs(ledger: number, capital = REF_CAPITAL): number {
  return debugMetelkaElapsedMsForLedger(ledger, capital);
}

function excessRow(excess: string, elapsedMs: string = "0", baseIncome: string = "0") {
  return {
    v2_excess_seconds: excess,
    v2_excess_elapsed_ms: elapsedMs,
    v2_excess_base_income: baseIncome,
    v2_excess_session_active: false,
    v2_excess_session_started_at: null,
    v2_excess_session_source_seconds: null,
    v2_excess_session_preset_seconds: null,
    v2_excess_session_rate: null,
    v2_excess_session_web_count: null,
    v2_excess_session_layout_seed: null,
  };
}

/** Row for addPresetSeconds path (excess + v3 capacity SoT fields). */
function addPresetRow(
  excess: string,
  opts: {
    elapsedMs?: string;
    baseIncome?: string;
    dailyCap?: number;
    streakDays?: number;
    water?: number;
    sun?: number;
    fertilizer?: number;
    /** Financial / generation anchor ms. Default = now (wall delta ≈ 0). */
    anchorAtMs?: number;
  } = {},
) {
  const anchorMs =
    typeof opts.anchorAtMs === "number" && Number.isFinite(opts.anchorAtMs)
      ? opts.anchorAtMs
      : Date.now();
  return {
    ...excessRow(excess, opts.elapsedMs ?? "0", opts.baseIncome ?? "0"),
    tutorial_done: true,
    streak_days: opts.streakDays ?? 1,
    v3_daily_cap_seconds: opts.dailyCap ?? 20,
    v3_root_water_seconds: opts.water ?? 4,
    v3_root_sun_seconds: opts.sun ?? 9,
    v3_root_fertilizer_seconds: opts.fertilizer ?? 0,
    v3_reserve_water_seconds: 0,
    v3_reserve_sun_seconds: 0,
    v3_reserve_fertilizer_seconds: 0,
    v3_day_key: "2026-08-02",
    v3_generation_anchor_at: new Date(anchorMs),
    v3_generation_frozen_at: null,
    v3_insurance_deadline_at: null,
    v3_generation_progress: 0,
    v3_generation_rr_cursor: 0,
    v3_first_transferred_root: null,
    v3_transferred_roots: [],
    v3_metelka_required: false,
    v3_metelka_completed_for_cycle: false,
  };
}

function mockAddPresetChain(
  excess: string,
  opts: Parameters<typeof addPresetRow>[1] = {},
  capital: number = REF_CAPITAL,
) {
  queryMock
    .mockResolvedValueOnce(undefined) // BEGIN
    .mockResolvedValueOnce({ rows: [addPresetRow(excess, opts)] }) // SELECT
    .mockResolvedValueOnce({ rows: [{ active_balance: capital }] }) // capital
    .mockResolvedValueOnce(undefined) // UPDATE fill+excess
    .mockResolvedValueOnce(undefined) // clear session
    .mockResolvedValueOnce(undefined); // COMMIT
}

describe("parseDebugExcessAction", () => {
  it("14. rejects negative set", () => {
    expect(parseDebugExcessAction({ action: "set", seconds: -1 })).toEqual({
      error: "excess seconds cannot be negative",
    });
  });

  it("accepts reset / addPresetSeconds / add / set / setPreset / resetSession", () => {
    expect(parseDebugExcessAction({ action: "reset" })).toEqual({
      action: "reset",
    });
    expect(
      parseDebugExcessAction({ action: "addPresetSeconds", seconds: 5 }),
    ).toEqual({
      action: "addPresetSeconds",
      seconds: 5,
    });
    expect(parseDebugExcessAction({ action: "add", seconds: 5 })).toEqual({
      action: "add",
      seconds: 5,
    });
    expect(parseDebugExcessAction({ action: "add", seconds: 7 })).toEqual({
      action: "add",
      seconds: 7,
    });
    expect(parseDebugExcessAction({ action: "set", seconds: 12.5 })).toEqual({
      action: "set",
      seconds: 12.5,
    });
    expect(
      parseDebugExcessAction({ action: "setPreset", presetSeconds: 15 }),
    ).toEqual({
      action: "setPreset",
      presetSeconds: 15,
    });
    expect(parseDebugExcessAction({ action: "resetSession" })).toEqual({
      action: "resetSession",
    });
  });

  it("rejects addPresetSeconds outside 1…25", () => {
    expect(
      parseDebugExcessAction({ action: "addPresetSeconds", seconds: 0 }),
    ).toMatchObject({ error: expect.stringContaining("1…25") });
    expect(
      parseDebugExcessAction({ action: "addPresetSeconds", seconds: 26 }),
    ).toMatchObject({ error: expect.stringContaining("1…25") });
  });

  it("rejects setPreset outside 5…25", () => {
    expect(
      parseDebugExcessAction({ action: "setPreset", presetSeconds: 4 }),
    ).toMatchObject({ error: expect.stringContaining("5…25") });
    expect(
      parseDebugExcessAction({ action: "setPreset", presetSeconds: 26 }),
    ).toMatchObject({ error: expect.stringContaining("5…25") });
  });

  it("rejects non-positive add amounts", () => {
    expect(parseDebugExcessAction({ action: "add", seconds: 0 })).toMatchObject({
      error: expect.stringContaining("positive"),
    });
    expect(parseDebugExcessAction({ action: "add", seconds: -1 })).toMatchObject({
      error: expect.stringContaining("positive"),
    });
  });
});

describe("minExcessSecondsForPreset (production T inverse)", () => {
  it("for each T=5…25: min ledger derives T; previous step is lower T when T>5", () => {
    for (let T = 5; T <= 25; T++) {
      const ledger = minExcessSecondsForPreset(T);
      expect(deriveExcessPresetSeconds(ledger)).toBe(T);
      if (T === 5) {
        expect(ledger).toBe(5);
      } else {
        const prev = deriveExcessPresetSeconds(
          ledger - MIN_LEDGER_SEARCH_STEP,
        );
        expect(prev).toBeLessThan(T);
        expect(prev).toBeGreaterThanOrEqual(T - 1);
      }
      // Never confuse ledger with T itself (except coincidental T=5 floor).
      if (T > 5) {
        expect(ledger).toBeGreaterThan(T);
      }
    }
  });

  it("T=10 / T=25 map to expected webs via session snapshot formula", () => {
    expect(computeExcessWebCount(10)).toBe(24);
    expect(computeExcessWebCount(15)).toBe(36);
    expect(computeExcessWebCount(25)).toBe(60);
    expect(computeExcessWebCount(5)).toBe(12);
  });
});

describe("debugMutateEconomyV2Excess", () => {
  beforeEach(() => {
    queryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
  });

  function mockRowWithOptionalSessionClear(
    excess: string,
    elapsedMs: string = "0",
    baseIncome: string = "0",
    clearSession = false,
    capital: number = REF_CAPITAL,
  ) {
    const chain = [
      undefined, // BEGIN
      { rows: [excessRow(excess, elapsedMs, baseIncome)] }, // SELECT game_state
      { rows: [{ active_balance: capital }] }, // SELECT accounts
      undefined, // UPDATE excess
    ] as unknown[];
    if (clearSession) chain.push(undefined); // clear session
    chain.push(undefined); // COMMIT
    for (const v of chain) {
      queryMock.mockResolvedValueOnce(v);
    }
  }

  const UPDATE_IDX = 3;

  it("13. reset / add / set persist to DB", async () => {
    mockRowWithOptionalSessionClear("3", "5000", "0", true);
    const reset = await debugMutateEconomyV2Excess(1, { action: "reset" });
    expect(reset.excessSeconds).toBe(0);
    expect(reset.excessElapsedMs).toBe(0);
    expect(reset.excessBaseIncome).toBe(0);
    expect(queryMock.mock.calls[UPDATE_IDX][1][1]).toBe(0);
    expect(queryMock.mock.calls[UPDATE_IDX][1][2]).toBe(0);
    expect(queryMock.mock.calls[UPDATE_IDX][1][3]).toBe(0);
    expect(reset.excess.session.active).toBe(false);
    expect(String(queryMock.mock.calls[UPDATE_IDX + 1][0])).toContain(
      "v2_excess_session_active = FALSE",
    );

    queryMock.mockReset();
    mockRowWithOptionalSessionClear("0", "0", "0", false);
    const add = await debugMutateEconomyV2Excess(1, { action: "add", seconds: 25 });
    expect(add.excessSeconds).toBe(25);
    expect(add.excessElapsedMs).toBe(0);
    expect(add.excess.excessFinanciallyValid).toBe(false);
    expect(queryMock.mock.calls[UPDATE_IDX][1][1]).toBe(25);
    expect(queryMock.mock.calls[UPDATE_IDX][1][2]).toBe(0);

    queryMock.mockReset();
    mockRowWithOptionalSessionClear("10", "0", "0", false);
    const set = await debugMutateEconomyV2Excess(1, {
      action: "set",
      seconds: 12.5,
    });
    expect(set.excessSeconds).toBeCloseTo(12.5, 10);
    expect(set.excess.excessAvailable).toBe(true);
    expect(set.excess.excessFinanciallyValid).toBe(false);
  });

  it("addPresetSeconds: new excess → ledger=+N, elapsed=delta(N), roots full", async () => {
    mockAddPresetChain("0", { dailyCap: 20, streakDays: 1, water: 4, sun: 9 });
    const before = Date.now();
    const r = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 5,
    });
    const after = Date.now();
    const capacity = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 1,
    }).effectivePresetSeconds;
    expect(capacity).toBe(21);
    expect(r.excessSeconds).toBe(5);
    expect(r.excess.excessPresetSeconds).toBe(deriveExcessPresetSeconds(5));
    // K=100000 → 720s/game-sec → Add 5 = 1 hour financial elapsed.
    expect(r.excessElapsedMs).toBe(naturalElapsedMs(5));
    expect(r.excessElapsedMs).toBe(3_600_000);
    expect(r.capacitySeconds).toBe(capacity);
    expect(r.v3Roots?.roots.water.seconds).toBe(capacity);
    expect(r.v3Roots?.roots.sun.seconds).toBe(capacity);
    expect(r.v3Roots?.roots.fertilizer.seconds).toBe(capacity);
    expect(r.excess.session.active).toBe(false);

    const sql = String(queryMock.mock.calls[3][0]);
    const params = queryMock.mock.calls[3][1] as unknown[];
    expect(sql).toContain("v3_root_water_seconds = $2");
    expect(sql).toContain("v3_metelka_required = TRUE");
    expect(sql).toContain("v3_generation_frozen_at = NULL");
    expect(sql).toMatch(/v2_energy_anchor_at\s*=\s*\$8/);
    expect(params[1]).toBe(capacity);
    expect(params[2]).toBe(capacity);
    expect(params[3]).toBe(capacity);
    expect(params[4]).toBe(5);
    expect(params[5]).toBe(3_600_000);
    const anchorMs = Number(params[7]);
    expect(anchorMs).toBeGreaterThanOrEqual(before);
    expect(anchorMs).toBeLessThanOrEqual(after);
  });

  it("addPresetSeconds: existing excess keeps prior elapsed + delta(N)", async () => {
    const priorElapsed = 10 * 3_600_000; // 10 hours already accumulated
    mockAddPresetChain("7", {
      dailyCap: 20,
      streakDays: 1,
      elapsedMs: String(priorElapsed),
    });
    const r = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 5,
    });
    expect(r.excessSeconds).toBe(12);
    expect(r.excess.excessPresetSeconds).toBe(deriveExcessPresetSeconds(12));
    expect(r.excessElapsedMs).toBe(priorElapsed + naturalElapsedMs(5));
    expect(r.excessElapsedMs).toBe(11 * 3_600_000);
    expect(r.v3Roots?.roots.water.seconds).toBe(21);
  });

  it("addPresetSeconds uses visit-day capacity (day5 → 25 when base=20)", async () => {
    mockAddPresetChain("0", { dailyCap: 20, streakDays: 5 });
    const r = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 5,
    });
    expect(r.capacitySeconds).toBe(25);
    expect(r.v3Roots?.roots.water.seconds).toBe(25);
    expect(r.v3Roots?.effectivePresetSeconds).toBe(25);
  });

  it("repeat Add: elapsed accumulates (Add 5 → Add 25 → 6h)", async () => {
    mockAddPresetChain("0", { elapsedMs: "0" });
    const a = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 5,
    });
    expect(a.excessElapsedMs).toBe(naturalElapsedMs(5));
    expect(a.excessElapsedMs).toBe(3_600_000);

    queryMock.mockReset();
    mockAddPresetChain(String(a.excessSeconds), {
      elapsedMs: String(a.excessElapsedMs),
    });
    const b = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 25,
    });
    expect(b.excessSeconds).toBe(30);
    expect(b.excessElapsedMs).toBe(
      a.excessElapsedMs + naturalElapsedMs(25),
    );
    expect(b.excessElapsedMs).toBe(6 * 3_600_000);
    // From a clean start, Accumululative 5+25 equals full-ledger(30);
    // distinguish from "replace with only delta(25)".
    expect(b.excessElapsedMs).not.toBe(naturalElapsedMs(25));
    expect(b.excessElapsedMs).toBe(debugMetelkaElapsedMsAfterAdd(a.excessElapsedMs, 25, REF_CAPITAL));
  });

  it("T=25: Add grows ledger + elapsed; preset stays 25", async () => {
    const ledger25 = minExcessSecondsForPreset(25);
    const priorElapsed = naturalElapsedMs(ledger25);
    mockAddPresetChain(String(ledger25), {
      elapsedMs: String(priorElapsed),
    });
    const r = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 5,
    });
    expect(r.excess.excessPresetSeconds).toBe(25);
    expect(r.excessSeconds).toBeCloseTo(ledger25 + 5, 10);
    expect(r.excessElapsedMs).toBe(priorElapsed + naturalElapsedMs(5));
    expect(computeExcessWebCount(25)).toBe(60);
  });

  it("T=25 fat ledger: Add 25 grows seconds + delta elapsed (not full rewrite)", async () => {
    const ledger25 = minExcessSecondsForPreset(25);
    const fat = ledger25 + 100;
    const priorElapsed = 10 * 3_600_000;
    mockAddPresetChain(String(fat), {
      elapsedMs: String(priorElapsed),
    });
    const r = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 25,
    });
    expect(r.excess.excessPresetSeconds).toBe(25);
    expect(r.excessSeconds).toBeCloseTo(fat + 25, 10);
    expect(r.excessElapsedMs).toBe(priorElapsed + naturalElapsedMs(25));
    expect(r.excessElapsedMs).not.toBe(naturalElapsedMs(fat + 25));
  });

  it("helper AfterAdd accumulates; deprecated wall-clock helper kept", () => {
    expect(debugMetelkaElapsedMsAfterAdd(0, 5, REF_CAPITAL)).toBe(3_600_000);
    expect(
      debugMetelkaElapsedMsAfterAdd(10 * 3_600_000, 25, REF_CAPITAL),
    ).toBe(15 * 3_600_000);
    expect(
      debugMetelkaSettleWallClockElapsed({
        currentLedgerSeconds: 0,
        currentElapsedMs: 999,
        financialAnchorMs: Date.now() - 60_000,
        nowMs: Date.now(),
      }),
    ).toBe(0);
  });

  it("capital change: prior elapsed kept; new delta uses current speed", async () => {
    const prior = 600_000;
    mockAddPresetChain("10", { elapsedMs: String(prior) }, 100_000);
    const mid = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 5,
    });
    expect(mid.excessElapsedMs).toBe(prior + naturalElapsedMs(5, 100_000));

    queryMock.mockReset();
    mockAddPresetChain(
      String(mid.excessSeconds),
      { elapsedMs: String(mid.excessElapsedMs) },
      200_000,
    );
    const after = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 5,
    });
    expect(after.excessElapsedMs).toBe(
      mid.excessElapsedMs + naturalElapsedMs(5, 200_000),
    );
    // History is not rewritten as full ledger × current capital speed.
    expect(after.excessElapsedMs).not.toBe(
      naturalElapsedMs(after.excessSeconds, 200_000),
    );
  });

  it("legacy helper debugTargetPresetAfterAdd still clamps T+N", () => {
    expect(debugTargetPresetAfterAdd(5, 5)).toBe(10);
    expect(debugTargetPresetAfterAdd(20, 10)).toBe(25);
  });

  it("T=5/15/25 money from natural elapsed ≫ T×1000", async () => {
    for (const T of [5, 15, 25] as const) {
      queryMock.mockReset();
      mockRowWithOptionalSessionClear("0", "0", "0", true);
      const r = await debugMutateEconomyV2Excess(1, {
        action: "setPreset",
        presetSeconds: T,
      });
      expect(r.excessElapsedMs).toBe(naturalElapsedMs(r.excessSeconds));
      expect(r.excessElapsedMs).not.toBe(T * 1000);
      const rate = excessBonusRate(excessCycleFromSeconds(r.excessSeconds));
      const full = computeMetelkaFinishPendingAward({
        capital: REF_CAPITAL,
        sourceSeconds: r.excessSeconds,
        sourceElapsedMs: r.excessElapsedMs,
        annualRate: rate,
        presetSeconds: T,
        whiteWebCount: computeExcessWebCount(T),
        clearedWebIds: [],
      });
      const tiny = computeMetelkaFinishPendingAward({
        capital: REF_CAPITAL,
        sourceSeconds: r.excessSeconds,
        sourceElapsedMs: T * 1000,
        annualRate: rate,
        presetSeconds: T,
        whiteWebCount: computeExcessWebCount(T),
        clearedWebIds: [],
      });
      expect(full.earnedBase + full.earnedBonus).toBeGreaterThan(
        tiny.earnedBase + tiny.earnedBonus,
      );
    }
  });

  it("reset clears ledger + elapsed + session; live T back to min", async () => {
    mockRowWithOptionalSessionClear(
      String(minExcessSecondsForPreset(25)),
      "45000",
      "1.25",
      true,
    );
    const r = await debugMutateEconomyV2Excess(1, { action: "reset" });
    expect(r.excessSeconds).toBe(0);
    expect(r.excessElapsedMs).toBe(0);
    expect(r.excessBaseIncome).toBe(0);
    expect(r.excess.session.active).toBe(false);
    expect(deriveExcessPresetSeconds(r.excessSeconds)).toBe(5);
    const sql = String(queryMock.mock.calls[UPDATE_IDX][0]);
    expect(sql).toContain("v3_generation_anchor_at");
    expect(sql).toContain("v2_energy_anchor_at");
    expect(sql).toContain("v3_generation_frozen_at = NULL");
    expect(queryMock.mock.calls[UPDATE_IDX][1][2]).toBe(0);
  });

  it("reset → addPresetSeconds: ledger=+N, roots full, elapsed=delta(N)", async () => {
    const oldElapsed = 5 * 86400_000;
    mockRowWithOptionalSessionClear(
      String(minExcessSecondsForPreset(15)),
      String(oldElapsed),
      "10",
      true,
    );
    const reset = await debugMutateEconomyV2Excess(1, { action: "reset" });
    expect(reset.excessElapsedMs).toBe(0);
    expect(reset.excessSeconds).toBe(0);

    queryMock.mockReset();
    mockAddPresetChain("0", { elapsedMs: "0" });
    const add = await debugMutateEconomyV2Excess(1, {
      action: "addPresetSeconds",
      seconds: 10,
    });
    expect(add.excessSeconds).toBe(10);
    expect(add.excess.excessPresetSeconds).toBe(deriveExcessPresetSeconds(10));
    expect(add.excessElapsedMs).toBe(naturalElapsedMs(10));
    expect(add.excessElapsedMs).not.toBe(oldElapsed);
    expect(add.v3Roots?.roots.water.seconds).toBe(add.capacitySeconds);
    expect(add.v3Roots?.roots.sun.seconds).toBe(add.capacitySeconds);
    expect(add.v3Roots?.roots.fertilizer.seconds).toBe(add.capacitySeconds);
  });

  it.each([5, 10, 15, 20, 25] as const)(
    "setPreset T=%s → min ledger + natural elapsed",
    async (T) => {
      mockRowWithOptionalSessionClear("0", "0", "0", true);
      const r = await debugMutateEconomyV2Excess(1, {
        action: "setPreset",
        presetSeconds: T,
      });
      const expectedLedger = minExcessSecondsForPreset(T);
      expect(r.excessSeconds).toBe(expectedLedger);
      expect(r.excess.excessPresetSeconds).toBe(T);
      expect(r.excessElapsedMs).toBe(naturalElapsedMs(expectedLedger));
      expect(computeExcessWebCount(T)).toBe(Math.round(2.4 * T));
    },
  );

  it("setPreset elapsedMs=0 keeps zero money path", async () => {
    mockRowWithOptionalSessionClear("0", "0", "0", true);
    const preset = await debugMutateEconomyV2Excess(1, {
      action: "setPreset",
      presetSeconds: 15,
      elapsedMs: 0,
    });
    expect(preset.excessElapsedMs).toBe(0);
    expect(preset.excess.excessFinanciallyValid).toBe(false);
  });

  it("setElapsed after setPreset updates financial time without changing T", async () => {
    mockRowWithOptionalSessionClear("0", "0", "0", true);
    const preset = await debugMutateEconomyV2Excess(1, {
      action: "setPreset",
      presetSeconds: 15,
    });
    const ledger = preset.excessSeconds;
    queryMock.mockReset();
    mockRowWithOptionalSessionClear(
      String(ledger),
      String(preset.excessElapsedMs),
      "0",
      false,
    );
    const r = await debugMutateEconomyV2Excess(1, {
      action: "setElapsed",
      elapsedMs: 3_600_000,
    });
    expect(r.excessSeconds).toBe(ledger);
    expect(r.excess.excessPresetSeconds).toBe(15);
    expect(r.excessElapsedMs).toBe(3_600_000);
  });

  it("setFinancial pairs seconds + elapsed", async () => {
    mockRowWithOptionalSessionClear("0", "0", "0", false);
    const r = await debugMutateEconomyV2Excess(1, {
      action: "setFinancial",
      seconds: 10,
      elapsedMs: 3_600_000,
    });
    expect(r.excessSeconds).toBe(10);
    expect(r.excessElapsedMs).toBe(3_600_000);
    expect(queryMock.mock.calls[UPDATE_IDX][1][1]).toBe(10);
    expect(queryMock.mock.calls[UPDATE_IDX][1][2]).toBe(3_600_000);
  });

  it("12. reset clears excess-base; add does not invent base income", async () => {
    mockRowWithOptionalSessionClear("10", "5000", "1.25", true);
    const reset = await debugMutateEconomyV2Excess(1, { action: "reset" });
    expect(reset.excessBaseIncome).toBe(0);
    queryMock.mockReset();
    mockRowWithOptionalSessionClear("0", "0", "0", false);
    const add = await debugMutateEconomyV2Excess(1, { action: "add", seconds: 25 });
    expect(add.excessBaseIncome).toBe(0);
    expect(add.excessElapsedMs).toBe(0);
  });

  it("resetSession clears session and keeps excess", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_excess_seconds: "22",
            v2_excess_session_active: true,
            v2_excess_session_started_at: "1700000000000",
            v2_excess_session_source_seconds: "12",
            v2_excess_session_preset_seconds: 5,
            v2_excess_session_rate: "0.014",
          },
        ],
      })
      .mockResolvedValueOnce(undefined) // clear session UPDATE
      .mockResolvedValueOnce(undefined); // COMMIT

    const r = await debugMutateEconomyV2Excess(1, { action: "resetSession" });
    expect(r.excessSeconds).toBe(22);
    expect(r.excess.session.active).toBe(false);
    expect(String(queryMock.mock.calls[2][0])).toContain(
      "v2_excess_session_active = FALSE",
    );
  });

  it("missing game_state → 404", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      debugMutateEconomyV2Excess(9, { action: "reset" }),
    ).rejects.toBeInstanceOf(EconomyV2ExcessDebugError);
  });

  it("helper: natural elapsed = ledger * (720/M(K)) * 1000", () => {
    expect(secondsPerGameSecondForCapital(REF_CAPITAL)).toBe(720);
    expect(naturalElapsedMs(5)).toBe(5 * 720 * 1000);
    expect(naturalElapsedMs(3688.88)).toBeCloseTo(3688.88 * 720 * 1000, 0);
  });
});

describe("debug excess: single create path (no prepare-metelka)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexSrc = readFileSync(join(here, "../routes/index.ts"), "utf8");
  const serviceSrc = readFileSync(join(here, "economy-v2-excess-debug.ts"), "utf8");

  it("routes no longer register prepare-metelka", () => {
    expect(indexSrc).not.toContain("prepare-metelka");
    expect(indexSrc).not.toContain("PrepareMetelka");
    expect(indexSrc).toContain("registerDebugEconomyV2ExcessRoute");
  });

  it("addPresetSeconds is the sole fill-roots + add-excess implementation", () => {
    expect(serviceSrc).toContain("debugAddPresetSecondsFillRoots");
    expect(serviceSrc).toContain('action === "addPresetSeconds"');
    expect(serviceSrc).toMatch(
      /debugAddPresetSecondsFillRoots[\s\S]*?debugMetelkaElapsedMsAfterAdd\(/,
    );
    expect(serviceSrc).not.toMatch(
      /debugAddPresetSecondsFillRoots[\s\S]*?debugMetelkaSettleWallClockElapsed\(/,
    );
    expect(serviceSrc).not.toContain("prepareMetelka");
    expect(serviceSrc).not.toContain("DEBUG_PREPARE_METELKA");
  });
});
