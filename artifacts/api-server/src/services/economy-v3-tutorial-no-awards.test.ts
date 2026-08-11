/**
 * Tutorial claim persists skill XP only (not income/growth/anchors).
 * Trusted gate: game_state.tutorial_done === false (isEconomyV2TutorialActive).
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { poolConnectMock, clientQueryMock, poolQueryMock } = vi.hoisted(() => ({
  poolConnectMock: vi.fn(),
  clientQueryMock: vi.fn(),
  poolQueryMock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    connect: poolConnectMock,
    query: poolQueryMock,
  },
}));

import { finishEconomyV3CareActivity } from "./economy-v3-care-finish";
import { claimEconomyV3CareCycle } from "./economy-v3-care-claim-cycle";
import { V3_TUTORIAL_COMPLETE_CLEAR_SQL } from "./economy-v3-tutorial";

const NOW = 1_700_000_000_000;

function baseCareState(overrides: Record<string, unknown> = {}) {
  return {
    tutorial_done: false,
    streak_days: 0,
    tree_growth_mm: 12,
    tree_growth_remainder: 0.3,
    pending_base_reward: 0,
    pending_bonus_reward: 0,
    player_xp: 40,
    player_level: 1,
    total_apples: 2,
    v2_freshness: 1,
    v3_root_water_seconds: 0,
    v3_root_sun_seconds: 0,
    v3_root_fertilizer_seconds: 0,
    v3_reserve_water_seconds: 5,
    v3_reserve_sun_seconds: 5,
    v3_reserve_fertilizer_seconds: 5,
    v3_daily_cap_seconds: 20,
    v3_day_key: "2026-07-23",
    v3_generation_anchor_at: new Date(NOW),
    v3_generation_frozen_at: null as Date | null,
    v3_insurance_deadline_at: null as Date | null,
    v3_generation_progress: 0,
    v3_generation_rr_cursor: 0,
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
    v3_care_cycle_sun_completed: true,
    v3_care_cycle_sun_preset_seconds: 7 as number | null,
    v3_care_cycle_sun_skill: 0.5 as number | null,
    v3_care_cycle_fertilizer_completed: true,
    v3_care_cycle_fertilizer_preset_seconds: 7 as number | null,
    v3_care_cycle_fertilizer_skill: 0.5 as number | null,
    v3_care_cycle_started_at: new Date(NOW) as Date | null,
    v3_care_cycle_completed_at: null as Date | null,
    v3_care_cycle_finished_at: null as Date | null,
    v3_care_cycle_status: null as string | null,
    v3_care_cycle_total_preset_seconds: null as number | null,
    v3_care_cycle_average_skill: null as number | null,
    v3_care_cycle_claimed_at: null as Date | null,
    v3_care_cycle_claimed_xp: null as number | null,
    v3_care_cycle_claimed_tree_growth: null as number | null,
    v3_care_cycle_claimed_base_income: null as number | null,
    v3_care_cycle_claimed_bonus_income: null as number | null,
    v3_care_cycle_claimed_total_income: null as number | null,
    ...overrides,
  };
}

describe("tutorial does not persist real economy awards", () => {
  const prevFlag = process.env.ENABLE_ECONOMY_V3_ROOTS;

  beforeEach(() => {
    poolConnectMock.mockReset();
    clientQueryMock.mockReset();
    poolQueryMock.mockReset();
    clientQueryMock.mockResolvedValue({ rows: [] });
    poolConnectMock.mockResolvedValue({
      query: clientQueryMock,
      release: vi.fn(),
    });
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    } else {
      process.env.ENABLE_ECONOMY_V3_ROOTS = prevFlag;
    }
  });

  it("1. tutorial finish-activity does not write pending income", async () => {
    const state = baseCareState({ tutorial_done: false });
    let pendingUpdates = 0;
    let accountCredits = 0;

    clientQueryMock.mockImplementation(async (text: string, params?: unknown[]) => {
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (String(text).includes("FROM accounts") && String(text).includes("FOR UPDATE")) {
        return {
          rows: [
            {
              balance: 100000,
              earned: 0,
              active_balance: "100000",
              active_earned: "0",
            },
          ],
        };
      }
      if (String(text).includes("FOR UPDATE")) {
        return { rows: [{ ...state }] };
      }
      if (String(text).includes("UPDATE accounts")) {
        accountCredits += 1;
        return { rows: [] };
      }
      if (String(text).includes("UPDATE game_state")) {
        if (String(text).includes("pending_base_reward")) {
          pendingUpdates += 1;
          state.pending_base_reward = Number(params?.[1]);
          state.pending_bonus_reward = Number(params?.[2]);
        }
        if (String(text).includes("v3_care_activity_skill")) {
          state.v3_care_activity_status = "completed";
          state.v3_care_cycle_water_completed = true;
          state.v3_care_cycle_water_preset_seconds = 7;
          state.v3_care_cycle_water_skill = Number(params?.[1]);
          state.v3_care_cycle_completed_at = new Date(NOW + 1);
          state.v3_care_cycle_status = "completed";
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await finishEconomyV3CareActivity(
      "42",
      "water",
      0.8,
      NOW + 1,
    );
    expect(result.income.total).toBeGreaterThan(0); // preview calculated
    expect(result.pendingBaseReward).toBe(0);
    expect(result.pendingBonusReward).toBe(0);
    expect(result.balances.balance).toBe(100000);
    expect(pendingUpdates).toBe(0);
    expect(accountCredits).toBe(0);
    expect(state.pending_base_reward).toBe(0);
    expect(state.tree_growth_mm).toBe(12);
  });

  it("1b. post-tutorial finish still writes pending (coin mechanics intact)", async () => {
    const state = baseCareState({ tutorial_done: true });
    let pendingUpdates = 0;

    clientQueryMock.mockImplementation(async (text: string, params?: unknown[]) => {
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (String(text).includes("FROM accounts") && String(text).includes("FOR UPDATE")) {
        return {
          rows: [
            {
              balance: 100000,
              earned: 0,
              active_balance: "100000",
              active_earned: "0",
            },
          ],
        };
      }
      if (String(text).includes("FOR UPDATE")) {
        return { rows: [{ ...state }] };
      }
      if (String(text).includes("UPDATE game_state")) {
        if (String(text).includes("pending_base_reward")) {
          pendingUpdates += 1;
          state.pending_base_reward = Number(params?.[1]);
          state.pending_bonus_reward = Number(params?.[2]);
        }
        if (String(text).includes("v3_care_activity_skill")) {
          state.v3_care_activity_status = "completed";
          state.v3_care_cycle_water_completed = true;
          state.v3_care_cycle_water_preset_seconds = 7;
          state.v3_care_cycle_water_skill = Number(params?.[1]);
          state.v3_care_cycle_completed_at = new Date(NOW + 1);
          state.v3_care_cycle_status = "completed";
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await finishEconomyV3CareActivity(
      "42",
      "water",
      0.8,
      NOW + 1,
    );
    expect(result.income.total).toBeGreaterThan(0);
    expect(pendingUpdates).toBe(1);
    expect(result.pendingBaseReward + result.pendingBonusReward).toBeCloseTo(
      result.income.total,
      8,
    );
    expect(result.balances.balance).toBe(100000);
  });

  it("5. tutorial claim-cycle awards skill XP but not income/growth", async () => {
    const state = baseCareState({
      tutorial_done: false,
      player_xp: 100,
      player_level: 1,
      pending_base_reward: 0,
      pending_bonus_reward: 0,
      total_apples: 7,
      tree_growth_mm: 40,
      v3_care_activity_kind: null,
      v3_care_activity_preset_seconds: null,
      v3_care_activity_started_at: null,
      v3_care_activity_status: null,
      v3_care_activity_skill: null,
      v3_care_activity_finished_at: null,
      v3_care_cycle_water_completed: true,
      v3_care_cycle_water_preset_seconds: 5,
      v3_care_cycle_water_skill: 0.5,
      v3_care_cycle_sun_completed: true,
      v3_care_cycle_sun_preset_seconds: 10,
      v3_care_cycle_sun_skill: 0.8,
      v3_care_cycle_fertilizer_completed: true,
      v3_care_cycle_fertilizer_preset_seconds: 15,
      v3_care_cycle_fertilizer_skill: 1,
      v3_care_cycle_status: "finished",
      v3_care_cycle_finished_at: new Date(NOW + 10),
      v3_care_cycle_completed_at: new Date(NOW + 3),
      v3_care_cycle_total_preset_seconds: 30,
      v3_care_cycle_average_skill: (0.5 + 0.8 + 1) / 3,
      v2_income_anchor_at: NOW - 3_600_000,
      v2_ordinary_income_elapsed_ms: 3_600_000,
    });

    let xpUpdates = 0;
    let claimedXp = 0;
    clientQueryMock.mockImplementation(async (text: string, params?: unknown[]) => {
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [] };
      }
      if (
        String(text).includes("FROM accounts") ||
        String(text).includes("active_balance")
      ) {
        return { rows: [{ active_balance: "100000", balance: 100000 }] };
      }
      if (String(text).includes("FOR UPDATE")) {
        return { rows: [{ ...state }] };
      }
      if (String(text).includes("UPDATE game_state")) {
        if (String(text).includes("player_xp")) {
          xpUpdates += 1;
          state.player_xp = Number(params?.[1]);
          state.player_level = Number(params?.[2]);
          claimedXp = Number(params?.[4]);
        }
        if (String(text).includes("v3_care_cycle_claimed_at")) {
          state.v3_care_cycle_claimed_at = new Date(NOW + 2);
          state.v3_care_cycle_claimed_xp = claimedXp;
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    const claimed = await claimEconomyV3CareCycle("42", NOW + 2);
    expect(claimed.claimed).toBe(true);
    expect(claimed.xp).toBeGreaterThan(0);
    expect(claimed.playerXp).toBe(100 + claimed.xp);
    expect(claimed.treeGrowth).toBe(0);
    expect(claimed.income.total).toBe(0);
    expect(claimed.treeGrowthMm).toBe(40);
    expect(claimed.totalApples).toBe(7);
    expect(claimed.pendingBaseReward).toBe(0);
    expect(xpUpdates).toBe(1);
  });

  it("tutorial/complete SQL clears pending rewards but keeps +1 мм / +1 apple / XP / catches", () => {
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).toMatch(/pending_base_reward\s*=\s*0/);
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).toMatch(/pending_bonus_reward\s*=\s*0/);
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).toMatch(/tree_growth_mm\s*=\s*1/);
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).toMatch(/total_apples\s*=\s*1/);
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).not.toMatch(/player_xp\s*=\s*0/);
    // Tutorial catches count toward achievements — must not wipe.
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).not.toMatch(/total_water_drops\s*=\s*0/);
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).not.toMatch(/total_sun_catches\s*=\s*0/);
    expect(V3_TUTORIAL_COMPLETE_CLEAR_SQL).not.toMatch(/total_leaf_picks\s*=\s*0/);
  });
});
