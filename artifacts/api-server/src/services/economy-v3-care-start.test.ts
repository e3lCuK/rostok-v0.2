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

import { startEconomyV3CareActivity } from "./economy-v3-care-start";

const NOW = 1_700_000_000_000;

describe("startEconomyV3CareActivity", () => {
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

  it("14. feature flag off → 403 without DB", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    await expect(
      startEconomyV3CareActivity("42", "water", 5, NOW),
    ).rejects.toMatchObject({
      code: "feature_disabled",
      status: 403,
    });
    expect(poolConnectMock).not.toHaveBeenCalled();
  });

  it("12–13. second start while active rejects without double debit", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: true,
      v3_root_water_seconds: 0,
      v3_root_sun_seconds: 0,
      v3_root_fertilizer_seconds: 0,
      v3_reserve_water_seconds: 12,
      v3_reserve_sun_seconds: 10,
      v3_reserve_fertilizer_seconds: 8,
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
      v3_care_cycle_water_completed: false,
      v3_care_cycle_sun_completed: false,
      v3_care_cycle_fertilizer_completed: false,
      v3_care_cycle_started_at: null as Date | null,
      v3_care_cycle_completed_at: null as Date | null,
      v3_care_cycle_status: null as string | null,
      v2_excess_seconds: 0,
      v2_excess_session_active: false,
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
        if (String(text).includes("v3_care_activity_status")) {
          state.v3_reserve_water_seconds = Number(params?.[1]);
          state.v3_reserve_sun_seconds = Number(params?.[2]);
          state.v3_reserve_fertilizer_seconds = Number(params?.[3]);
          state.v3_care_activity_kind = String(params?.[4]);
          state.v3_care_activity_preset_seconds = Number(params?.[5]);
          state.v3_care_activity_started_at = params?.[6] as Date;
          state.v3_care_activity_status = String(params?.[7]);
          if (params?.[8] != null) {
            state.v3_care_cycle_started_at = params[8] as Date;
          }
          if (state.v3_care_cycle_status == null) {
            state.v3_care_cycle_status = "in_progress";
          }
        } else if (String(text).includes("v3_root_water_seconds")) {
          // settle update — ignore for this test
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await startEconomyV3CareActivity("42", "water", 5, NOW);
    expect(first.started).toBe(true);
    expect(first.v3Roots.reserves.water.seconds).toBe(7);
    expect(first.v3Roots.careSession.active).toBe(true);
    expect(first.v3Roots.careCycle.startedAt).toBe(new Date(NOW).toISOString());
    expect(first.v3Roots.careCycle.status).toBe("in_progress");
    expect(state.v3_reserve_water_seconds).toBe(7);
    expect(state.v3_care_cycle_started_at).toEqual(new Date(NOW));
    expect(state.v3_care_cycle_status).toBe("in_progress");

    await expect(
      startEconomyV3CareActivity("42", "sun", 5, NOW + 1),
    ).rejects.toMatchObject({ code: "activity_in_progress", status: 409 });

    expect(state.v3_reserve_water_seconds).toBe(7);
    expect(state.v3_reserve_sun_seconds).toBe(10);
    expect(state.v3_care_activity_status).toBe("active");
  });

  it("metelka_required_before_care: excess available rejects without debit", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: true,
      streak_days: 1,
      v3_root_water_seconds: 21,
      v3_root_sun_seconds: 21,
      v3_root_fertilizer_seconds: 21,
      v3_reserve_water_seconds: 12,
      v3_reserve_sun_seconds: 10,
      v3_reserve_fertilizer_seconds: 8,
      v3_daily_cap_seconds: 20,
      v3_day_key: "2026-07-23",
      v3_generation_anchor_at: new Date(NOW),
      v3_generation_frozen_at: null as Date | null,
      v3_insurance_deadline_at: null as Date | null,
      v3_generation_progress: 0,
      v3_generation_rr_cursor: 0,
      v3_first_transferred_root: null as string | null,
      v3_transferred_roots: [] as string[],
      v3_metelka_required: true,
      v3_metelka_completed_for_cycle: false,
      v3_care_activity_kind: null as string | null,
      v3_care_activity_preset_seconds: null as number | null,
      v3_care_activity_started_at: null as Date | null,
      v3_care_activity_status: null as string | null,
      v3_care_cycle_water_completed: false,
      v3_care_cycle_sun_completed: false,
      v3_care_cycle_fertilizer_completed: false,
      v3_care_cycle_started_at: null as Date | null,
      v3_care_cycle_completed_at: null as Date | null,
      v3_care_cycle_status: null as string | null,
      v2_excess_seconds: 12,
      v2_excess_elapsed_ms: 0,
      v2_excess_base_income: 0,
      v2_excess_session_active: false,
    };

    clientQueryMock.mockImplementation(async (text: string) => {
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
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      startEconomyV3CareActivity("42", "water", 5, NOW),
    ).rejects.toMatchObject({
      code: "metelka_required_before_care",
      status: 409,
    });

    expect(state.v3_reserve_water_seconds).toBe(12);
    expect(state.v3_care_activity_status).toBeNull();
  });
});
