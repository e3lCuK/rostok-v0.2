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

import { settleAndPersistEconomyV3Roots } from "./economy-v3-roots-settle";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";

const NOW = 1_700_000_000_000;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("settleAndPersistEconomyV3Roots", () => {
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

  it("14. feature flag off does not open a DB transaction", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    const result = await settleAndPersistEconomyV3Roots("42", NOW);
    expect(result).toBeNull();
    expect(poolConnectMock).not.toHaveBeenCalled();
  });

  it("11. two settles with advancing now do not double-count the same window", async () => {
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
      v3_day_key: null as string | null,
      v3_generation_anchor_at: new Date(NOW - T * 1000),
      v3_generation_frozen_at: null,
      v3_insurance_deadline_at: null,
      v3_generation_progress: 0,
      v3_generation_rr_cursor: 0,
      v3_first_transferred_root: null,
      v3_transferred_roots: [],
    };

    clientQueryMock.mockImplementation(async (text: string, params?: unknown[]) => {
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
        state.v3_root_water_seconds = Number(params?.[1]);
        state.v3_root_sun_seconds = Number(params?.[2]);
        state.v3_root_fertilizer_seconds = Number(params?.[3]);
        // Non-auto path now also writes reserves ($5-$7) then progress/cursor/anchor/dayKey.
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
      return { rows: [] };
    });

    const first = await settleAndPersistEconomyV3Roots("42", NOW);
    expect(first?.wholeSeconds).toBe(1);
    expect(first?.rootWaterSeconds).toBe(1);
    expect(first?.snapshot.roots.water.seconds).toBe(1);
    expect(first?.dayKey).toBeTruthy();

    const second = await settleAndPersistEconomyV3Roots("42", NOW);
    expect(second?.wholeSeconds).toBe(0);
    expect(second?.rootWaterSeconds).toBe(1);

    const third = await settleAndPersistEconomyV3Roots("42", NOW + T * 1000);
    expect(third?.wholeSeconds).toBe(1);
    expect(third?.rootWaterSeconds).toBe(1);
    expect(third?.rootSunSeconds).toBe(1);
    expect(third?.rootFertilizerSeconds).toBe(0);
    expect(third?.generationRrCursor).toBe(2);
  });

  it("auto-transfer at deadline; second settle is idempotent", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";
    const frozenAt = NOW - 60_000;
    const deadline = frozenAt + 60_000;

    const state = {
      tutorial_done: true,
      v3_root_water_seconds: 0,
      v3_root_sun_seconds: 7,
      v3_root_fertilizer_seconds: 4,
      v3_reserve_water_seconds: 3,
      v3_reserve_sun_seconds: 0,
      v3_reserve_fertilizer_seconds: 0,
      v3_daily_cap_seconds: 25,
      v3_day_key: "2026-07-23",
      v3_generation_anchor_at: new Date(frozenAt),
      v3_generation_frozen_at: new Date(frozenAt) as Date | null,
      v3_insurance_deadline_at: new Date(deadline) as Date | null,
      v3_generation_progress: 0.4,
      v3_generation_rr_cursor: 0,
      v3_first_transferred_root: "water" as string | null,
      v3_transferred_roots: ["water"] as string[],
    };

    clientQueryMock.mockImplementation(async (text: string, params?: unknown[]) => {
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
        // Auto-transfer UPDATE writes reserves + clears freeze fields.
        if (String(text).includes("v3_generation_frozen_at = NULL")) {
          state.v3_root_water_seconds = Number(params?.[1]);
          state.v3_root_sun_seconds = Number(params?.[2]);
          state.v3_root_fertilizer_seconds = Number(params?.[3]);
          state.v3_reserve_water_seconds = Number(params?.[4]);
          state.v3_reserve_sun_seconds = Number(params?.[5]);
          state.v3_reserve_fertilizer_seconds = Number(params?.[6]);
          state.v3_daily_cap_seconds = Number(params?.[7]);
          state.v3_generation_progress = Number(params?.[8]);
          state.v3_generation_rr_cursor = Number(params?.[9]);
          state.v3_generation_anchor_at = params?.[10] as Date;
          state.v3_day_key = String(params?.[11]);
          state.v3_generation_frozen_at = null;
          state.v3_insurance_deadline_at = null;
          state.v3_first_transferred_root = null;
          state.v3_transferred_roots = [];
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await settleAndPersistEconomyV3Roots("42", deadline);
    expect(first?.autoTransfer?.applied).toBe(true);
    expect(first?.autoTransfer?.roots).toEqual(["sun", "fertilizer"]);
    expect(first?.snapshot.reserves.sun.seconds).toBe(7);
    expect(first?.snapshot.reserves.fertilizer.seconds).toBe(4);
    expect(first?.snapshot.reserves.water.seconds).toBe(3);
    expect(first?.snapshot.generation.frozenAt).toBeNull();
    expect(first?.snapshot.generation.insuranceDeadlineAt).toBeNull();
    // Clock continues through freeze (60s ≈ 1/12 cycle) and is kept on thaw.
    expect(first?.snapshot.generation.progress).toBeCloseTo(0.4 + 60 / T, 5);
    expect(first?.generationAnchorAt).toBe(deadline);

    const second = await settleAndPersistEconomyV3Roots("42", deadline + 1_000);
    expect(second?.autoTransfer).toBeNull();
    expect(second?.snapshot.reserves.sun.seconds).toBe(7);
    expect(second?.snapshot.reserves.fertilizer.seconds).toBe(4);
    expect(second?.rootSunSeconds).toBe(0);
    expect(second?.rootFertilizerSeconds).toBe(0);
  });
});
