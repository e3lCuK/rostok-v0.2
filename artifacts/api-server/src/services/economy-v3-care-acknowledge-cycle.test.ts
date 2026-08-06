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

import { acknowledgeEconomyV3CareCycle } from "./economy-v3-care-acknowledge-cycle";

const NOW = 1_700_000_000_000;

describe("acknowledgeEconomyV3CareCycle", () => {
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

  it("flag off → 403 without DB", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    await expect(acknowledgeEconomyV3CareCycle("42")).rejects.toMatchObject({
      code: "feature_disabled",
      status: 403,
    });
    expect(poolConnectMock).not.toHaveBeenCalled();
  });

  it("clears finished cycle; keeps reserves/roots; repeat is no-op 409", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: true,
      v3_root_water_seconds: 3,
      v3_root_sun_seconds: 4,
      v3_root_fertilizer_seconds: 5,
      v3_reserve_water_seconds: 8,
      v3_reserve_sun_seconds: 9,
      v3_reserve_fertilizer_seconds: 10,
      v3_daily_cap_seconds: 20,
      v3_day_key: "2026-07-23",
      v3_generation_anchor_at: new Date(NOW),
      v3_generation_frozen_at: null as Date | null,
      v3_insurance_deadline_at: null as Date | null,
      v3_generation_progress: 0.2,
      v3_first_transferred_root: null as string | null,
      v3_transferred_roots: [] as string[],
      v3_care_activity_kind: null as string | null,
      v3_care_activity_preset_seconds: null as number | null,
      v3_care_activity_started_at: null as Date | null,
      v3_care_activity_status: null as string | null,
      v3_care_activity_skill: null as number | null,
      v3_care_activity_finished_at: null as Date | null,
      v3_care_cycle_water_completed: true,
      v3_care_cycle_water_preset_seconds: 7 as number | null,
      v3_care_cycle_water_skill: 0.2 as number | null,
      v3_care_cycle_sun_completed: true,
      v3_care_cycle_sun_preset_seconds: 5 as number | null,
      v3_care_cycle_sun_skill: 0.5 as number | null,
      v3_care_cycle_fertilizer_completed: true,
      v3_care_cycle_fertilizer_preset_seconds: 6 as number | null,
      v3_care_cycle_fertilizer_skill: 0.9 as number | null,
      v3_care_cycle_started_at: new Date(NOW) as Date | null,
      v3_care_cycle_completed_at: new Date(NOW + 3) as Date | null,
      v3_care_cycle_finished_at: new Date(NOW + 10) as Date | null,
      v3_care_cycle_status: "finished" as string | null,
      v3_care_cycle_total_preset_seconds: 18 as number | null,
      v3_care_cycle_average_skill: 0.533 as number | null,
      v3_care_cycle_claimed_at: new Date(NOW + 20) as Date | null,
      v3_care_cycle_claimed_xp: 40 as number | null,
      v3_care_cycle_claimed_tree_growth: 1 as number | null,
      v3_care_cycle_claimed_base_income: 1.2 as number | null,
      v3_care_cycle_claimed_bonus_income: 0.3 as number | null,
      v3_care_cycle_claimed_total_income: 1.5 as number | null,
    };

    let clearUpdates = 0;
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
        if (String(text).includes("v3_care_cycle_water_completed = FALSE")) {
          clearUpdates += 1;
          state.v3_care_cycle_water_completed = false;
          state.v3_care_cycle_water_preset_seconds = null;
          state.v3_care_cycle_water_skill = null;
          state.v3_care_cycle_sun_completed = false;
          state.v3_care_cycle_sun_preset_seconds = null;
          state.v3_care_cycle_sun_skill = null;
          state.v3_care_cycle_fertilizer_completed = false;
          state.v3_care_cycle_fertilizer_preset_seconds = null;
          state.v3_care_cycle_fertilizer_skill = null;
          state.v3_care_cycle_started_at = null;
          state.v3_care_cycle_completed_at = null;
          state.v3_care_cycle_finished_at = null;
          state.v3_care_cycle_status = null;
          state.v3_care_cycle_total_preset_seconds = null;
          state.v3_care_cycle_average_skill = null;
          state.v3_care_cycle_claimed_at = null;
          state.v3_care_cycle_claimed_xp = null;
          state.v3_care_cycle_claimed_tree_growth = null;
          state.v3_care_cycle_claimed_base_income = null;
          state.v3_care_cycle_claimed_bonus_income = null;
          state.v3_care_cycle_claimed_total_income = null;
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await acknowledgeEconomyV3CareCycle("42");
    expect(first.acknowledged).toBe(true);
    expect(first.v3Roots.careCycle.status).toBeNull();
    expect(first.v3Roots.careCycle.allCompleted).toBe(false);
    expect(first.v3Roots.careCycle.activities.water.completed).toBe(false);
    expect(first.v3Roots.careCycle.totalPresetSeconds).toBeNull();
    expect(first.v3Roots.careCycle.claim.claimed).toBe(false);
    expect(first.v3Roots.reserves.water.seconds).toBe(8);
    expect(first.v3Roots.roots.sun.seconds).toBe(4);
    expect(first.v3Roots.generation.progress).toBe(0.2);
    expect(clearUpdates).toBe(1);

    await expect(acknowledgeEconomyV3CareCycle("42")).rejects.toMatchObject({
      code: "care_cycle_not_finished",
      status: 409,
    });
    expect(clearUpdates).toBe(1);
    expect(state.v3_reserve_water_seconds).toBe(8);
  });

  it("finished but unclaimed → 409 care_cycle_not_claimed", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    clientQueryMock.mockImplementation(async (text: string) => {
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (String(text).includes("SELECT active_balance")) {
        return { rows: [{ active_balance: "100000" }] };
      }
      if (String(text).includes("FOR UPDATE")) {
        return {
          rows: [
            {
              tutorial_done: true,
              v3_care_activity_status: null,
              v3_care_cycle_status: "finished",
              v3_care_cycle_claimed_at: null,
              v3_root_water_seconds: 0,
              v3_root_sun_seconds: 0,
              v3_root_fertilizer_seconds: 0,
              v3_reserve_water_seconds: 0,
              v3_reserve_sun_seconds: 0,
              v3_reserve_fertilizer_seconds: 0,
              v3_daily_cap_seconds: 20,
              v3_day_key: null,
              v3_generation_anchor_at: null,
              v3_generation_frozen_at: null,
              v3_insurance_deadline_at: null,
              v3_generation_progress: 0,
              v3_first_transferred_root: null,
              v3_transferred_roots: [],
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(acknowledgeEconomyV3CareCycle("42")).rejects.toMatchObject({
      code: "care_cycle_not_claimed",
      status: 409,
    });
  });
});
