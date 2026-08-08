import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  debugMutateEconomyV3Roots,
  EconomyV3RootsDebugError,
  parseDebugV3RootsBody,
  parseDebugWholeSeconds,
} from "./economy-v3-roots-debug";

const NOW = 1_700_000_000_000;
const REF = 10_000;

function baseLockedRow(overrides: Record<string, unknown> = {}) {
  return {
    tutorial_done: true,
    v3_root_water_seconds: 7,
    v3_root_sun_seconds: 13,
    v3_root_fertilizer_seconds: 15,
    v3_reserve_water_seconds: 3,
    v3_reserve_sun_seconds: 4,
    v3_reserve_fertilizer_seconds: 5,
    v3_daily_cap_seconds: 20,
    v3_day_key: "2026-07-23",
    v3_generation_anchor_at: new Date(NOW - 60_000).toISOString(),
    v3_generation_frozen_at: new Date(NOW - 30_000).toISOString(),
    v3_insurance_deadline_at: new Date(NOW + 30_000).toISOString(),
    v3_generation_progress: 0.4,
    v3_first_transferred_root: "water",
    v3_transferred_roots: ["water"],
    v3_care_activity_kind: "sun",
    v3_care_activity_preset_seconds: 5,
    v3_care_activity_started_at: new Date(NOW - 10_000).toISOString(),
    v3_care_activity_status: "active",
    v3_care_activity_skill: null,
    v3_care_activity_finished_at: null,
    v3_care_cycle_water_completed: true,
    v3_care_cycle_water_preset_seconds: 5,
    v3_care_cycle_water_skill: 0.5,
    v3_care_cycle_sun_completed: false,
    v3_care_cycle_sun_preset_seconds: null,
    v3_care_cycle_sun_skill: null,
    v3_care_cycle_fertilizer_completed: false,
    v3_care_cycle_fertilizer_preset_seconds: null,
    v3_care_cycle_fertilizer_skill: null,
    v3_care_cycle_started_at: new Date(NOW - 20_000).toISOString(),
    v3_care_cycle_completed_at: null,
    v3_care_cycle_finished_at: null,
    v3_care_cycle_status: "in_progress",
    v3_care_cycle_total_preset_seconds: null,
    v3_care_cycle_average_skill: null,
    v3_care_cycle_claimed_at: null,
    v3_care_cycle_claimed_xp: null,
    v3_care_cycle_claimed_tree_growth: null,
    v3_care_cycle_claimed_base_income: null,
    v3_care_cycle_claimed_bonus_income: null,
    v3_care_cycle_claimed_total_income: null,
    v2_income_anchor_at: null,
    v2_freshness: 1,
    v2_ordinary_income_elapsed_ms: 0,
    ...overrides,
  };
}

function mockTxn(row: Record<string, unknown>) {
  queryMock
    .mockResolvedValueOnce(undefined) // BEGIN
    .mockResolvedValueOnce({ rows: [row] }) // SELECT FOR UPDATE
    .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] }) // capital
    .mockResolvedValueOnce(undefined) // UPDATE
    .mockResolvedValueOnce(undefined); // COMMIT
}

describe("parseDebugWholeSeconds / parseDebugV3RootsBody", () => {
  it("accepts whole integers including 0; rejects fractional/NaN", () => {
    expect(parseDebugWholeSeconds(0)).toBe(0);
    expect(parseDebugWholeSeconds(25)).toBe(25);
    expect(parseDebugWholeSeconds("7")).toBe(7);
    expect(parseDebugWholeSeconds(4.5)).toBeNull();
    expect(parseDebugWholeSeconds(NaN)).toBeNull();
    expect(parseDebugWholeSeconds("1.2")).toBeNull();
  });

  it("parses reset and set bodies", () => {
    expect(parseDebugV3RootsBody({ action: "reset" })).toEqual({
      action: "reset",
    });
    expect(
      parseDebugV3RootsBody({ roots: { water: 4, sun: 4, fertilizer: 4 } }),
    ).toEqual({
      action: "set",
      roots: { water: 4, sun: 4, fertilizer: 4 },
    });
    expect(
      parseDebugV3RootsBody({
        action: "set",
        reserves: { water: 0 },
      }),
    ).toEqual({ action: "set", reserves: { water: 0 } });
    expect(parseDebugV3RootsBody({ action: "set" })).toEqual({
      error: "set requires roots and/or reserves",
    });
    expect(parseDebugV3RootsBody({ roots: { water: 1.5 } })).toEqual({
      error: "roots.water must be a whole integer",
    });
  });
});

describe("debugMutateEconomyV3Roots", () => {
  const prevFlag = process.env.ENABLE_ECONOMY_V3_ROOTS;

  beforeEach(() => {
    queryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    else process.env.ENABLE_ECONOMY_V3_ROOTS = prevFlag;
  });

  it("403 when feature disabled", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    await expect(
      debugMutateEconomyV3Roots(1, { action: "reset" }, NOW),
    ).rejects.toMatchObject({
      status: 403,
      code: "feature_disabled",
    });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("uses BEGIN + SELECT FOR UPDATE + COMMIT", async () => {
    mockTxn(baseLockedRow());
    await debugMutateEconomyV3Roots(9, { action: "reset" }, NOW);
    expect(queryMock.mock.calls[0][0]).toBe("BEGIN");
    expect(String(queryMock.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("set roots clamps to effective capacity", async () => {
    mockTxn(baseLockedRow({ v3_daily_cap_seconds: 25, streak_days: 0 }));
    const result = await debugMutateEconomyV3Roots(
      9,
      { action: "set", roots: { water: -3, sun: 40, fertilizer: 7 } },
      NOW,
    );
    expect(result.v3Roots.roots.water.seconds).toBe(0);
    expect(result.v3Roots.roots.sun.seconds).toBe(26);
    expect(result.v3Roots.roots.fertilizer.seconds).toBe(7);
    expect(result.capacitySeconds).toBe(26);
    expect(result.clamp?.roots?.sun).toEqual({
      requestedSeconds: 40,
      appliedSeconds: 26,
      capacitySeconds: 26,
      clamped: true,
    });

    const updateParams = queryMock.mock.calls[3][1] as unknown[];
    expect(updateParams.slice(1, 4)).toEqual([0, 26, 7]);
    const updateSql = String(queryMock.mock.calls[3][0]);
    expect(updateSql).toContain("v3_root_water_seconds");
    expect(updateSql).not.toContain("v2_energy_seconds");
    expect(updateSql).not.toContain("active_balance");
  });

  it("set root/reserve = 100 clamps to Day1 effective 21", async () => {
    mockTxn(baseLockedRow({ v3_daily_cap_seconds: 20, streak_days: 1 }));
    const result = await debugMutateEconomyV3Roots(
      9,
      {
        action: "set",
        roots: { water: 100 },
        reserves: { fertilizer: 100 },
      },
      NOW,
    );
    expect(result.capacitySeconds).toBe(21);
    expect(result.v3Roots.roots.water.seconds).toBe(21);
    expect(result.v3Roots.reserves.fertilizer.seconds).toBe(21);
    expect(result.clamp?.roots?.water).toMatchObject({
      requestedSeconds: 100,
      appliedSeconds: 21,
      capacitySeconds: 21,
      clamped: true,
    });
  });

  it("add +50 at empty root does not exceed Day1 cap 21", async () => {
    mockTxn(
      baseLockedRow({
        v3_daily_cap_seconds: 20,
        streak_days: 1,
        v3_root_water_seconds: 0,
      }),
    );
    const result = await debugMutateEconomyV3Roots(
      9,
      { action: "add", roots: { water: 50 } },
      NOW,
    );
    expect(result.v3Roots.roots.water.seconds).toBe(21);
    expect(result.clamp?.addRoots?.water?.appliedAddition).toBe(21);
    expect(result.clamp?.addRoots?.water?.discardedDebugAddition).toBe(29);
  });

  it("fillToCapacity fills roots to Day2 effective 22 (not 21)", async () => {
    mockTxn(
      baseLockedRow({
        v3_daily_cap_seconds: 20,
        streak_days: 2,
        v3_root_water_seconds: 0,
        v3_root_sun_seconds: 0,
        v3_root_fertilizer_seconds: 0,
      }),
    );
    const result = await debugMutateEconomyV3Roots(
      9,
      { action: "fillToCapacity", roots: true, reserves: false },
      NOW,
    );
    expect(result.capacitySeconds).toBe(22);
    expect(result.v3Roots.effectivePresetSeconds).toBe(22);
    expect(result.v3Roots.currentVisitDay).toBe(2);
    expect(result.v3Roots.activeDailyBonusSeconds).toBe(2);
    expect(result.v3Roots.roots.water.seconds).toBe(22);
    expect(result.v3Roots.roots.sun.seconds).toBe(22);
    expect(result.v3Roots.roots.fertilizer.seconds).toBe(22);
    expect(result.v3Roots.reserves.water.seconds).toBe(3);
    // Stale transfer / Care journal must clear so roots are clickable again.
    expect(result.v3Roots.roots.water.transferred).toBe(false);
    expect(result.v3Roots.roots.sun.transferred).toBe(false);
    expect(result.v3Roots.roots.fertilizer.transferred).toBe(false);
    expect(result.v3Roots.generation.transferredRoots).toEqual([]);
    expect(result.v3Roots.generation.firstTransferredRoot).toBeNull();
    expect(result.v3Roots.careCycle.activities.water.completed).toBe(false);
    expect(result.v3Roots.careSession.status).toBeNull();
  });

  it("fillToCapacity can still fill roots and reserves via API (UI removed)", async () => {
    mockTxn(baseLockedRow({ v3_daily_cap_seconds: 20, streak_days: 1 }));
    const result = await debugMutateEconomyV3Roots(
      9,
      { action: "fillToCapacity" },
      NOW,
    );
    expect(result.capacitySeconds).toBe(21);
    expect(result.v3Roots.roots.water.seconds).toBe(21);
    expect(result.v3Roots.roots.sun.seconds).toBe(21);
    expect(result.v3Roots.roots.fertilizer.seconds).toBe(21);
    expect(result.v3Roots.reserves.water.seconds).toBe(21);
    expect(result.v3Roots.reserves.sun.seconds).toBe(21);
    expect(result.v3Roots.reserves.fertilizer.seconds).toBe(21);
  });

  it("parses fillToCapacity body", () => {
    expect(parseDebugV3RootsBody({ action: "fillToCapacity" })).toEqual({
      action: "fillToCapacity",
      roots: true,
      reserves: true,
    });
    expect(
      parseDebugV3RootsBody({
        action: "fillToCapacity",
        roots: true,
        reserves: false,
      }),
    ).toEqual({
      action: "fillToCapacity",
      roots: true,
      reserves: false,
    });
  });

  it("set reserves clamps to effective capacity", async () => {
    mockTxn(baseLockedRow({ v3_daily_cap_seconds: 20, streak_days: 0 }));
    const result = await debugMutateEconomyV3Roots(
      9,
      {
        action: "set",
        reserves: { water: -1, sun: 99, fertilizer: 8 },
      },
      NOW,
    );
    expect(result.v3Roots.reserves.water.seconds).toBe(0);
    expect(result.v3Roots.reserves.sun.seconds).toBe(21);
    expect(result.v3Roots.reserves.fertilizer.seconds).toBe(8);
  });

  it("reset clears only v3 state (roots, reserves, freeze, care)", async () => {
    mockTxn(baseLockedRow());
    const result = await debugMutateEconomyV3Roots(9, { action: "reset" }, NOW);

    expect(result.v3Roots.roots.water.seconds).toBe(0);
    expect(result.v3Roots.roots.sun.seconds).toBe(0);
    expect(result.v3Roots.roots.fertilizer.seconds).toBe(0);
    expect(result.v3Roots.reserves.water.seconds).toBe(0);
    expect(result.v3Roots.generation.frozenAt).toBeNull();
    expect(result.v3Roots.generation.progress).toBe(0);
    expect(result.v3Roots.generation.transferredRoots).toEqual([]);
    expect(result.v3Roots.careSession.active).toBe(false);
    expect(result.v3Roots.careCycle.status).toBeNull();

    const updateSql = String(queryMock.mock.calls[3][0]);
    expect(updateSql).toContain("v3_generation_frozen_at = NULL");
    expect(updateSql).toContain("v3_insurance_deadline_at = NULL");
    expect(updateSql).toContain("v3_care_activity_kind = NULL");
    expect(updateSql).toContain("v3_care_cycle_status = NULL");
    expect(updateSql).not.toContain("v2_energy_seconds");
    expect(updateSql).not.toContain("v2_root_ready_mask");
    expect(updateSql).not.toContain("v2_excess");
    expect(updateSql).not.toContain("active_balance");
    expect(updateSql).not.toContain("tree_mm");
    expect(updateSql).not.toContain("apples");
  });

  it("add +10 at root 18/21 applies 3 and discards 7", async () => {
    mockTxn(
      baseLockedRow({
        v3_daily_cap_seconds: 20,
        streak_days: 1,
        v3_root_water_seconds: 18,
      }),
    );
    const result = await debugMutateEconomyV3Roots(
      9,
      { action: "add", roots: { water: 10 } },
      NOW,
    );
    expect(result.capacitySeconds).toBe(21);
    expect(result.v3Roots.roots.water.seconds).toBe(21);
    expect(result.clamp?.addRoots?.water).toEqual({
      requestedAddition: 10,
      appliedAddition: 3,
      discardedDebugAddition: 7,
      beforeSeconds: 18,
      afterSeconds: 21,
      capacitySeconds: 21,
    });
  });

  it("persisted root 25 at cap 21 normalizes to 21 and adds 4 excess", async () => {
    mockTxn(
      baseLockedRow({
        v3_daily_cap_seconds: 20,
        streak_days: 1,
        v3_root_water_seconds: 25,
        v2_excess_seconds: 1,
      }),
    );
    const result = await debugMutateEconomyV3Roots(
      9,
      { action: "set", roots: { sun: 5 } },
      NOW,
    );
    expect(result.v3Roots.roots.water.seconds).toBe(21);
    expect(result.v3Roots.roots.sun.seconds).toBe(5);
    const updateParams = queryMock.mock.calls[3][1] as unknown[];
    expect(updateParams[1]).toBe(21); // water kept
    expect(updateParams[7]).toBe(5); // excess 1+4
  });

  it("parses add body", () => {
    expect(
      parseDebugV3RootsBody({ action: "add", roots: { water: 10 } }),
    ).toEqual({ action: "add", roots: { water: 10 } });
    expect(parseDebugV3RootsBody({ action: "add" })).toEqual({
      error: "add requires roots and/or reserves",
    });
  });

  it("404 when game_state missing", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      debugMutateEconomyV3Roots(9, { action: "reset" }, NOW),
    ).rejects.toBeInstanceOf(EconomyV3RootsDebugError);
  });
});
