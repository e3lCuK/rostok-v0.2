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

import { acknowledgeEconomyV3CareActivity } from "./economy-v3-care-acknowledge";

const NOW = 1_700_000_000_000;

describe("acknowledgeEconomyV3CareActivity", () => {
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

  it("13. feature flag off → 403 without DB", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    await expect(
      acknowledgeEconomyV3CareActivity("42", "water"),
    ).rejects.toMatchObject({
      code: "feature_disabled",
      status: 403,
    });
    expect(poolConnectMock).not.toHaveBeenCalled();
  });

  it("7–9 / 12. clears completed session; repeat → no_completed_activity", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";

    const state = {
      tutorial_done: true,
      v3_root_water_seconds: 3,
      v3_root_sun_seconds: 4,
      v3_root_fertilizer_seconds: 5,
      v3_reserve_water_seconds: 0,
      v3_reserve_sun_seconds: 9,
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
      v3_care_activity_status: "completed" as string | null,
      v3_care_activity_skill: 0.5 as number | null,
      v3_care_activity_finished_at: new Date(NOW + 1) as Date | null,
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
        if (String(text).includes("v3_care_activity_kind = NULL")) {
          clearUpdates += 1;
          state.v3_care_activity_kind = null;
          state.v3_care_activity_preset_seconds = null;
          state.v3_care_activity_started_at = null;
          state.v3_care_activity_finished_at = null;
          state.v3_care_activity_status = null;
          state.v3_care_activity_skill = null;
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const first = await acknowledgeEconomyV3CareActivity("42", "water");
    expect(first.acknowledged).toBe(true);
    expect(first.v3Roots.careSession).toEqual({
      active: false,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      finishedAt: null,
      status: null,
      skill: null,
    });
    expect(first.v3Roots.reserves.sun.seconds).toBe(9);
    expect(first.v3Roots.roots.water.seconds).toBe(3);
    expect(clearUpdates).toBe(1);

    await expect(
      acknowledgeEconomyV3CareActivity("42", "water"),
    ).rejects.toMatchObject({
      code: "no_completed_activity",
      status: 409,
    });
    expect(clearUpdates).toBe(1);
    expect(state.v3_reserve_sun_seconds).toBe(9);
  });
});
