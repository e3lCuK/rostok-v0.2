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

import { finishEconomyV3CareCycle } from "./economy-v3-care-finish-cycle";

const NOW = 1_700_000_000_000;

describe("finishEconomyV3CareCycle", () => {
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

  it("15. feature flag off → 403 without DB", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    await expect(finishEconomyV3CareCycle("42", NOW)).rejects.toMatchObject({
      code: "feature_disabled",
      status: 403,
    });
    expect(poolConnectMock).not.toHaveBeenCalled();
  });

  it("6–14. finishes cycle once; keeps results/reserves; no rewards", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: true,
      v3_root_water_seconds: 2,
      v3_root_sun_seconds: 3,
      v3_root_fertilizer_seconds: 4,
      v3_reserve_water_seconds: 1,
      v3_reserve_sun_seconds: 2,
      v3_reserve_fertilizer_seconds: 3,
      v3_daily_cap_seconds: 20,
      v3_day_key: "2026-07-23",
      v3_generation_anchor_at: new Date(NOW),
      v3_generation_frozen_at: null as Date | null,
      v3_insurance_deadline_at: null as Date | null,
      v3_generation_progress: 0,
      v3_first_transferred_root: null as string | null,
      v3_transferred_roots: [] as string[],
      v3_care_activity_kind: null as string | null,
      v3_care_activity_preset_seconds: null as number | null,
      v3_care_activity_started_at: null as Date | null,
      v3_care_activity_status: null as string | null,
      v3_care_activity_skill: null as number | null,
      v3_care_activity_finished_at: null as Date | null,
      v3_care_cycle_water_completed: true,
      v3_care_cycle_water_preset_seconds: 7,
      v3_care_cycle_water_skill: 0.2,
      v3_care_cycle_sun_completed: true,
      v3_care_cycle_sun_preset_seconds: 5,
      v3_care_cycle_sun_skill: 0.5,
      v3_care_cycle_fertilizer_completed: true,
      v3_care_cycle_fertilizer_preset_seconds: 6,
      v3_care_cycle_fertilizer_skill: 0.9,
      v3_care_cycle_started_at: new Date(NOW) as Date | null,
      v3_care_cycle_completed_at: new Date(NOW + 3) as Date | null,
      v3_care_cycle_finished_at: null as Date | null,
      v3_care_cycle_status: "ready" as string | null,
      v3_care_cycle_total_preset_seconds: null as number | null,
      v3_care_cycle_average_skill: null as number | null,
    };

    let finishUpdates = 0;
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
        if (String(text).includes("v3_care_cycle_finished_at")) {
          finishUpdates += 1;
          state.v3_care_cycle_status = String(params?.[1]);
          state.v3_care_cycle_finished_at = params?.[2] as Date;
          state.v3_care_cycle_total_preset_seconds = Number(params?.[3]);
          state.v3_care_cycle_average_skill = Number(params?.[4]);
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await finishEconomyV3CareCycle("42", NOW + 10);
    expect(first.finished).toBe(true);
    expect(first.alreadyFinished).toBe(false);
    expect(first.totalPresetSeconds).toBe(18);
    expect(first.averageSkill).toBeCloseTo((0.2 + 0.5 + 0.9) / 3, 10);
    expect(first.v3Roots.careCycle.status).toBe("finished");
    expect(first.v3Roots.careCycle.finishedAt).toBe(
      new Date(NOW + 10).toISOString(),
    );
    expect(first.v3Roots.careCycle.activities.water.skill).toBe(0.2);
    expect(first.v3Roots.reserves.water.seconds).toBe(1);
    expect(first.v3Roots.roots.water.seconds).toBe(2);
    expect(finishUpdates).toBe(1);

    const second = await finishEconomyV3CareCycle("42", NOW + 99);
    expect(second.alreadyFinished).toBe(true);
    expect(second.totalPresetSeconds).toBe(18);
    expect(second.v3Roots.careCycle.finishedAt).toBe(
      new Date(NOW + 10).toISOString(),
    );
    expect(finishUpdates).toBe(1);
    expect(state.v3_reserve_water_seconds).toBe(1);
  });
});
