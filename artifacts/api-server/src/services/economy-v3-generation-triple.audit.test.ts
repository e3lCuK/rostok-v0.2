/**
 * AUDIT — Economy v3 generation: one cycle → three root credits?
 *
 * Does not change production formulas. Documents round-robin settle vs
 * PRODUCT TARGET (1 usable second total per ~12 min cycle).
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { poolConnectMock, clientQueryMock } = vi.hoisted(() => ({
  poolConnectMock: vi.fn(),
  clientQueryMock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    connect: poolConnectMock,
    query: vi.fn(),
  },
}));

import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import {
  settleEconomyV3Roots,
  transferEconomyV3RootPure,
} from "./economy-v3-roots";
import { transferEconomyV3Root } from "./economy-v3-roots-transfer";

const NOW = 1_700_000_000_000;
/** At K=100_000, 1 game-second of generation = 720 real seconds. */
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

/** Product expectation from the audit brief (not current code). */
const TARGET_TOTAL_RESERVE_DELTA_PER_CYCLE = 1;

describe("AUDIT pure settle: round-robin distribution (ACTUAL)", () => {
  const base = {
    rootWaterSeconds: 0,
    rootSunSeconds: 0,
    rootFertilizerSeconds: 0,
    generationProgress: 0,
    generationFrozenAt: null as number | null,
    dayKey: "2026-07-25",
    capital: 100_000,
    tutorialActive: false,
    reserveWaterSeconds: 0,
    reserveSunSeconds: 0,
    reserveFertilizerSeconds: 0,
    dailyCapSeconds: 20,
    visitBonusSeconds: 0,
  };

  it("1. exactly one cycle elapsed → wholeSeconds=1 and water +=1 only", () => {
    const r = settleEconomyV3Roots({
      ...base,
      generationAnchorAt: NOW - T * 1000,
      nowMs: NOW,
    });
    expect(r.generatedRaw).toBeCloseTo(1, 9);
    expect(r.wholeSeconds).toBe(1);
    expect(r.rootWaterSeconds).toBe(1);
    expect(r.rootSunSeconds).toBe(0);
    expect(r.rootFertilizerSeconds).toBe(0);
    expect(
      r.rootWaterSeconds + r.rootSunSeconds + r.rootFertilizerSeconds,
    ).toBe(1);
  });

  it("2–7. three generation cycles then transfer Water → Sun → Fertilizer → reserves +3", () => {
    let progress = 0;
    let anchor: number | null = null;
    let cursor = 0;
    let roots = { water: 0, sun: 0, fertilizer: 0 };

    const init = settleEconomyV3Roots({
      ...base,
      generationAnchorAt: null,
      nowMs: NOW,
    });
    anchor = init.generationAnchorAt;
    cursor = init.generationRrCursor;

    for (let i = 0; i < 3; i++) {
      const settled = settleEconomyV3Roots({
        ...base,
        rootWaterSeconds: roots.water,
        rootSunSeconds: roots.sun,
        rootFertilizerSeconds: roots.fertilizer,
        generationProgress: progress,
        generationAnchorAt: anchor,
        generationRrCursor: cursor,
        nowMs: anchor! + T * 1000,
      });
      progress = settled.generationProgress;
      anchor = settled.generationAnchorAt;
      cursor = settled.generationRrCursor;
      roots = {
        water: settled.rootWaterSeconds,
        sun: settled.rootSunSeconds,
        fertilizer: settled.rootFertilizerSeconds,
      };
      expect(settled.wholeSeconds).toBe(1);
    }

    expect(roots).toEqual({ water: 1, sun: 1, fertilizer: 1 });

    const t0 = {
      rootWaterSeconds: roots.water,
      rootSunSeconds: roots.sun,
      rootFertilizerSeconds: roots.fertilizer,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      transferredRoots: [] as const,
      firstTransferredRoot: null as null,
      nowMs: anchor!,
      generationFrozenAt: null as number | null,
      insuranceDeadlineAt: null as number | null,
      generationProgress: progress,
      generationAnchorAt: anchor,
    };

    const water = transferEconomyV3RootPure({ ...t0, root: "water" });
    expect(water.ok).toBe(true);
    if (!water.ok) return;
    expect(water.acceptedSeconds).toBe(1);
    expect(water.reserveWaterSeconds).toBe(1);
    expect(water.rootSunSeconds).toBe(1);
    expect(water.rootFertilizerSeconds).toBe(1);
    expect(water.startedFreeze).toBe(true);
    expect(water.generationFrozenAt).toBe(anchor);
    expect(water.generationAnchorAt).toBe(anchor);

    const sun = transferEconomyV3RootPure({
      ...t0,
      root: "sun",
      rootWaterSeconds: water.rootWaterSeconds,
      rootSunSeconds: water.rootSunSeconds,
      rootFertilizerSeconds: water.rootFertilizerSeconds,
      reserveWaterSeconds: water.reserveWaterSeconds,
      reserveSunSeconds: water.reserveSunSeconds,
      reserveFertilizerSeconds: water.reserveFertilizerSeconds,
      transferredRoots: water.transferredRoots,
      firstTransferredRoot: water.firstTransferredRoot,
      generationFrozenAt: water.generationFrozenAt,
      insuranceDeadlineAt: water.insuranceDeadlineAt,
      generationProgress: water.generationProgress,
      generationAnchorAt: water.generationAnchorAt,
      nowMs: anchor! + 1_000,
    });
    expect(sun.ok).toBe(true);
    if (!sun.ok) return;
    expect(sun.acceptedSeconds).toBe(1);
    expect(sun.reserveSunSeconds).toBe(1);
    expect(sun.rootFertilizerSeconds).toBe(1);
    expect(sun.generationFrozenAt).toBe(water.generationFrozenAt);

    const fert = transferEconomyV3RootPure({
      ...t0,
      root: "fertilizer",
      rootWaterSeconds: sun.rootWaterSeconds,
      rootSunSeconds: sun.rootSunSeconds,
      rootFertilizerSeconds: sun.rootFertilizerSeconds,
      reserveWaterSeconds: sun.reserveWaterSeconds,
      reserveSunSeconds: sun.reserveSunSeconds,
      reserveFertilizerSeconds: sun.reserveFertilizerSeconds,
      transferredRoots: sun.transferredRoots,
      firstTransferredRoot: sun.firstTransferredRoot,
      generationFrozenAt: sun.generationFrozenAt,
      insuranceDeadlineAt: sun.insuranceDeadlineAt,
      generationProgress: sun.generationProgress,
      generationAnchorAt: sun.generationAnchorAt,
      nowMs: anchor! + 2_000,
    });
    expect(fert.ok).toBe(true);
    if (!fert.ok) return;
    expect(fert.acceptedSeconds).toBe(1);
    expect(fert.cycleCompleted).toBe(true);

    const actualTotalReserve =
      fert.reserveWaterSeconds +
      fert.reserveSunSeconds +
      fert.reserveFertilizerSeconds;
    expect(actualTotalReserve).toBe(3);

    expect({
      actualTotalReserveDelta: actualTotalReserve,
      productTargetTotalReserveDelta: TARGET_TOTAL_RESERVE_DELTA_PER_CYCLE,
      ratesActualPerGenerationCycle: { per12Min: 1, perHour: 5, per8Hours: 40 },
      ratesTarget: { per12Min: 1, perHour: 5, per8Hours: 40 },
    }).toMatchObject({
      actualTotalReserveDelta: 3,
      productTargetTotalReserveDelta: 1,
    });
  });

  it("ratesheet ACTUAL from code: 1 root-second / 720s → 5/h → 40/8h", () => {
    const perCycle = 1;
    expect(perCycle * (3600 / T)).toBe(5);
    expect(perCycle * ((8 * 3600) / T)).toBe(40);
  });
});

describe("AUDIT sequential transferEconomyV3Root (mocked DB)", () => {
  const prevFlag = process.env.ENABLE_ECONOMY_V3_ROOTS;

  beforeEach(() => {
    poolConnectMock.mockReset();
    clientQueryMock.mockReset();
    clientQueryMock.mockResolvedValue({ rows: [] });
    poolConnectMock.mockResolvedValue({
      query: clientQueryMock,
      release: vi.fn(),
    });
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    } else {
      process.env.ENABLE_ECONOMY_V3_ROOTS = prevFlag;
    }
  });

  it("service path: one settled cycle → water transfer → reserve +1", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: true,
      v3_root_water_seconds: 0,
      v3_root_sun_seconds: 0,
      v3_root_fertilizer_seconds: 0,
      v3_reserve_water_seconds: 0,
      v3_reserve_sun_seconds: 0,
      v3_reserve_fertilizer_seconds: 0,
      v3_daily_cap_seconds: 20,
      v3_day_key: "2026-07-25" as string | null,
      v3_generation_anchor_at: new Date(NOW - T * 1000) as Date | null,
      v3_generation_frozen_at: null as Date | null,
      v3_insurance_deadline_at: null as Date | null,
      v3_generation_progress: 0,
      v3_generation_rr_cursor: 0,
      v3_first_transferred_root: null as string | null,
      v3_transferred_roots: [] as string[],
      v2_excess_seconds: 0,
      v2_excess_elapsed_ms: 0,
      v2_excess_base_income: 0,
    };

    clientQueryMock.mockImplementation(
      async (text: string, params?: unknown[]) => {
        if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
          return { rows: [] };
        }
        if (String(text).includes("SELECT active_balance")) {
          return { rows: [{ active_balance: "100000" }] };
        }
        if (String(text).includes("FOR UPDATE")) {
          return { rows: [{ ...state }] };
        }
        if (String(text).includes("UPDATE game_state")) {
          // Settle UPDATE (roots + anchor, no reserves).
          if (
            String(text).includes("v3_generation_progress") &&
            !String(text).includes("v3_reserve_water_seconds")
          ) {
            state.v3_root_water_seconds = Number(params?.[1]);
            state.v3_root_sun_seconds = Number(params?.[2]);
            state.v3_root_fertilizer_seconds = Number(params?.[3]);
            if (String(text).includes("v3_reserve_water_seconds")) {
              state.v3_reserve_water_seconds = Number(params?.[4]);
              state.v3_reserve_sun_seconds = Number(params?.[5]);
              state.v3_reserve_fertilizer_seconds = Number(params?.[6]);
              state.v3_generation_progress = Number(params?.[7]);
              state.v3_generation_rr_cursor = Number(params?.[8]);
              state.v3_generation_anchor_at = params?.[9] as Date;
              state.v3_day_key = String(params?.[10]);
            } else {
              state.v3_generation_progress = Number(params?.[4]);
              state.v3_generation_rr_cursor = Number(params?.[5]);
              state.v3_generation_anchor_at = params?.[6] as Date;
              state.v3_day_key = String(params?.[7]);
            }
            return { rows: [] };
          }
          // Transfer UPDATE (roots + reserves + freeze).
          if (String(text).includes("v3_reserve_water_seconds")) {
            state.v3_root_water_seconds = Number(params?.[1]);
            state.v3_root_sun_seconds = Number(params?.[2]);
            state.v3_root_fertilizer_seconds = Number(params?.[3]);
            state.v3_reserve_water_seconds = Number(params?.[4]);
            state.v3_reserve_sun_seconds = Number(params?.[5]);
            state.v3_reserve_fertilizer_seconds = Number(params?.[6]);
            state.v3_daily_cap_seconds = Number(params?.[7]);
            state.v3_transferred_roots = (params?.[8] as string[]) ?? [];
            state.v3_first_transferred_root =
              (params?.[9] as string | null) ?? null;
            state.v3_generation_frozen_at =
              (params?.[10] as Date | null) ?? null;
            state.v3_insurance_deadline_at =
              (params?.[11] as Date | null) ?? null;
            state.v3_generation_progress = Number(params?.[12]);
            state.v3_generation_anchor_at = params?.[13] as Date;
            return { rows: [] };
          }
        }
        return { rows: [] };
      },
    );

    const w = await transferEconomyV3Root("42", "water", NOW);
    expect(w.acceptedSeconds).toBe(1);
    expect(w.v3Roots.reserves.water.seconds).toBe(1);
    expect(w.v3Roots.roots.sun.seconds).toBe(0);
    expect(w.v3Roots.roots.fertilizer.seconds).toBe(0);
    expect(w.startedFreeze).toBe(true);
    expect(state.v3_generation_frozen_at).not.toBeNull();

    const total =
      state.v3_reserve_water_seconds +
      state.v3_reserve_sun_seconds +
      state.v3_reserve_fertilizer_seconds;
    expect(total).toBe(1);
  });
});

describe("PRODUCT TARGET (one settle cycle → +1 total reserve)", () => {
  it("one cycle should yield +1 total usable reserve, not +3", () => {
    const settled = settleEconomyV3Roots({
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      generationProgress: 0,
      generationFrozenAt: null,
      generationAnchorAt: NOW - T * 1000,
      nowMs: NOW,
      dayKey: "2026-07-25",
      capital: 100_000,
      tutorialActive: false,
    });

    let roots = {
      water: settled.rootWaterSeconds,
      sun: settled.rootSunSeconds,
      fertilizer: settled.rootFertilizerSeconds,
    };
    let reserves = { water: 0, sun: 0, fertilizer: 0 };
    let transferred: Array<"water" | "sun" | "fertilizer"> = [];
    let frozenAt: number | null = null;
    let insurance: number | null = null;
    let first: "water" | "sun" | "fertilizer" | null = null;
    let progress = settled.generationProgress;
    let anchor = settled.generationAnchorAt;

    const water = transferEconomyV3RootPure({
      root: "water",
      rootWaterSeconds: roots.water,
      rootSunSeconds: roots.sun,
      rootFertilizerSeconds: roots.fertilizer,
      reserveWaterSeconds: reserves.water,
      reserveSunSeconds: reserves.sun,
      reserveFertilizerSeconds: reserves.fertilizer,
      dailyCapSeconds: 20,
      transferredRoots: transferred,
      firstTransferredRoot: first,
      nowMs: NOW,
      generationFrozenAt: frozenAt,
      insuranceDeadlineAt: insurance,
      generationProgress: progress,
      generationAnchorAt: anchor,
    });
    expect(water.ok).toBe(true);
    if (!water.ok) return;
    reserves = {
      water: water.reserveWaterSeconds,
      sun: water.reserveSunSeconds,
      fertilizer: water.reserveFertilizerSeconds,
    };

    const total = reserves.water + reserves.sun + reserves.fertilizer;
    expect(total).toBe(TARGET_TOTAL_RESERVE_DELTA_PER_CYCLE);
  });
});
