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

import { finishEconomyV3CareActivity } from "./economy-v3-care-finish";

const NOW = 1_700_000_000_000;

describe("finishEconomyV3CareActivity", () => {
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
    await expect(
      finishEconomyV3CareActivity("42", "water", 0.5, NOW),
    ).rejects.toMatchObject({
      code: "feature_disabled",
      status: 403,
    });
    expect(poolConnectMock).not.toHaveBeenCalled();
  });

  it("12–14. finish stores skill; repeat is idempotent; reserves unchanged", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: true,
      tree_growth_mm: 0,
      tree_growth_remainder: 0,
      pending_base_reward: 0,
      pending_bonus_reward: 0,
      v2_freshness: 1,
      v3_root_water_seconds: 0,
      v3_root_sun_seconds: 0,
      v3_root_fertilizer_seconds: 0,
      v3_reserve_water_seconds: 5,
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
      v3_care_activity_kind: "water" as string | null,
      v3_care_activity_preset_seconds: 7 as number | null,
      v3_care_activity_started_at: new Date(NOW) as Date | null,
      v3_care_activity_status: "active" as string | null,
      v3_care_activity_skill: null as number | null,
      v3_care_activity_finished_at: null as Date | null,
      v3_care_cycle_water_completed: false,
      v3_care_cycle_water_preset_seconds: null as number | null,
      v3_care_cycle_water_skill: null as number | null,
      v3_care_cycle_sun_completed: false,
      v3_care_cycle_sun_preset_seconds: null as number | null,
      v3_care_cycle_sun_skill: null as number | null,
      v3_care_cycle_fertilizer_completed: false,
      v3_care_cycle_fertilizer_preset_seconds: null as number | null,
      v3_care_cycle_fertilizer_skill: null as number | null,
      v3_care_cycle_started_at: new Date(NOW) as Date | null,
      v3_care_cycle_completed_at: null as Date | null,
      v3_care_cycle_status: null as string | null,
    };

    let finishUpdates = 0;
    let pendingUpdates = 0;
    let catchUpdates = 0;
    let catchDelta = 0;
    let accountCredits = 0;
    let incomeHistoryInserts = 0;
    clientQueryMock.mockImplementation(async (text: string, params?: unknown[]) => {
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (String(text).includes("FROM accounts") && String(text).includes("FOR UPDATE")) {
        return { rows: [{ balance: 100000, earned: 0, active_balance: "100000", active_earned: "0" }] };
      }
      if (String(text).includes("SELECT active_balance")) {
        return { rows: [{ active_balance: "100000" }] };
      }
      if (String(text).includes("FOR UPDATE")) {
        return { rows: [{ ...state }] };
      }
      if (String(text).includes("UPDATE accounts")) {
        accountCredits += 1;
        return { rows: [] };
      }
      if (String(text).includes("INSERT INTO income_history")) {
        incomeHistoryInserts += 1;
        return { rows: [] };
      }
      if (String(text).includes("UPDATE game_state")) {
        if (String(text).includes("total_water_drops")) {
          catchUpdates += 1;
          catchDelta = Number(params?.[1]);
          return { rows: [] };
        }
        if (String(text).includes("pending_base_reward")) {
          pendingUpdates += 1;
          state.pending_base_reward = Number(params?.[1]);
          state.pending_bonus_reward = Number(params?.[2]);
          return { rows: [] };
        }
        if (String(text).includes("v3_care_activity_skill")) {
          finishUpdates += 1;
          state.v3_care_activity_skill = Number(params?.[1]);
          state.v3_care_activity_finished_at = params?.[2] as Date;
          state.v3_care_activity_status = String(params?.[3]);
          state.v3_care_cycle_water_completed = Boolean(params?.[4]);
          state.v3_care_cycle_water_preset_seconds = params?.[5] as number | null;
          state.v3_care_cycle_water_skill = params?.[6] as number | null;
          state.v3_care_cycle_sun_completed = Boolean(params?.[7]);
          state.v3_care_cycle_sun_preset_seconds = params?.[8] as number | null;
          state.v3_care_cycle_sun_skill = params?.[9] as number | null;
          state.v3_care_cycle_fertilizer_completed = Boolean(params?.[10]);
          state.v3_care_cycle_fertilizer_preset_seconds =
            params?.[11] as number | null;
          state.v3_care_cycle_fertilizer_skill = params?.[12] as number | null;
          state.v3_care_cycle_completed_at = (params?.[13] as Date | null) ?? null;
          state.v3_care_cycle_status = String(params?.[14]);
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await finishEconomyV3CareActivity(
      "42",
      "water",
      0.55,
      NOW + 1,
      12,
    );
    expect(first.finished).toBe(true);
    expect(first.alreadyCompleted).toBe(false);
    expect(first.skill).toBe(0.55);
    expect(first.income.total).toBeGreaterThan(0);
    expect(first.income.presetSeconds).toBe(7);
    // Money stays pending — balance unchanged until coin / claimAll.
    expect(first.balances.balance).toBe(100000);
    expect(first.pendingBaseReward + first.pendingBonusReward).toBeCloseTo(
      first.income.total,
      8,
    );
    expect(pendingUpdates).toBe(1);
    expect(accountCredits).toBe(0);
    expect(incomeHistoryInserts).toBe(0);
    expect(first.v3Roots.careSession.status).toBe("completed");
    expect(first.v3Roots.careSession.skill).toBe(0.55);
    expect(first.v3Roots.careCycle.activities.water).toEqual({
      completed: true,
      presetSeconds: 7,
      skill: 0.55,
    });
    expect(first.v3Roots.careSession.active).toBe(false);
    expect(first.v3Roots.reserves.water.seconds).toBe(5);
    expect(first.v3Roots.reserves.sun.seconds).toBe(10);
    expect(finishUpdates).toBe(1);
    expect(catchUpdates).toBe(1);
    expect(catchDelta).toBe(12);

    const second = await finishEconomyV3CareActivity(
      "42",
      "water",
      0.9,
      NOW + 2,
      99,
    );
    expect(second.alreadyCompleted).toBe(true);
    expect(second.skill).toBe(0.55);
    expect(second.income.total).toBe(0);
    expect(second.pendingBaseReward).toBe(first.pendingBaseReward);
    expect(second.pendingBonusReward).toBe(first.pendingBonusReward);
    expect(second.balances.balance).toBe(100000);
    expect(second.v3Roots.careSession.skill).toBe(0.55);
    expect(second.v3Roots.careCycle.activities.water.skill).toBe(0.55);
    expect(finishUpdates).toBe(1);
    expect(pendingUpdates).toBe(1);
    expect(catchUpdates).toBe(1);
    expect(accountCredits).toBe(0);
    expect(state.v3_reserve_water_seconds).toBe(5);
  });

  it("increments catch counters during tutorial (achievements)", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: false,
      tree_growth_mm: 0,
      tree_growth_remainder: 0,
      pending_base_reward: 0,
      pending_bonus_reward: 0,
      v2_freshness: 1,
      v3_root_water_seconds: 0,
      v3_root_sun_seconds: 0,
      v3_root_fertilizer_seconds: 0,
      v3_reserve_water_seconds: 5,
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
      v3_care_activity_kind: "sun" as string | null,
      v3_care_activity_preset_seconds: 7 as number | null,
      v3_care_activity_started_at: new Date(NOW) as Date | null,
      v3_care_activity_status: "active" as string | null,
      v3_care_activity_skill: null as number | null,
      v3_care_activity_finished_at: null as Date | null,
      v3_care_cycle_water_completed: false,
      v3_care_cycle_water_preset_seconds: null as number | null,
      v3_care_cycle_water_skill: null as number | null,
      v3_care_cycle_sun_completed: false,
      v3_care_cycle_sun_preset_seconds: null as number | null,
      v3_care_cycle_sun_skill: null as number | null,
      v3_care_cycle_fertilizer_completed: false,
      v3_care_cycle_fertilizer_preset_seconds: null as number | null,
      v3_care_cycle_fertilizer_skill: null as number | null,
      v3_care_cycle_started_at: new Date(NOW) as Date | null,
      v3_care_cycle_completed_at: null as Date | null,
      v3_care_cycle_status: null as string | null,
    };

    let sunCatchUpdates = 0;
    let sunCatchDelta = 0;
    let pendingUpdates = 0;
    clientQueryMock.mockImplementation(async (text: string, params?: unknown[]) => {
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (String(text).includes("FROM accounts") && String(text).includes("FOR UPDATE")) {
        return { rows: [{ balance: 100000, earned: 0, active_balance: "100000", active_earned: "0" }] };
      }
      if (String(text).includes("SELECT active_balance")) {
        return { rows: [{ active_balance: "100000" }] };
      }
      if (String(text).includes("FOR UPDATE")) {
        return { rows: [{ ...state }] };
      }
      if (String(text).includes("UPDATE game_state")) {
        if (String(text).includes("total_sun_catches")) {
          sunCatchUpdates += 1;
          sunCatchDelta = Number(params?.[1]);
          return { rows: [] };
        }
        if (String(text).includes("pending_base_reward")) {
          pendingUpdates += 1;
          return { rows: [] };
        }
        if (String(text).includes("v3_care_activity_skill")) {
          state.v3_care_activity_status = "completed";
          state.v3_care_activity_skill = 0.4;
          return { rows: [] };
        }
      }
      return { rows: [] };
    });

    const result = await finishEconomyV3CareActivity(
      "42",
      "sun",
      0.4,
      NOW + 1,
      7,
    );
    expect(result.finished).toBe(true);
    expect(result.alreadyCompleted).toBe(false);
    expect(sunCatchUpdates).toBe(1);
    expect(sunCatchDelta).toBe(7);
    // Tutorial must not persist pending income.
    expect(pendingUpdates).toBe(0);
    expect(result.pendingBaseReward).toBe(0);
  });
});
