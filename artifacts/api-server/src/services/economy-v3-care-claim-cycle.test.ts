/**
 * Economy v3 Care claim-cycle — awards XP/pending once from rewardPreview.
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

import { claimEconomyV3CareCycle } from "./economy-v3-care-claim-cycle";
import {
  buildEconomyV3CareRewardPreview,
} from "./economy-v3-care-reward-preview";
import {
  claimEconomyV3CareCyclePure,
  buildV3CareCycle,
} from "./economy-v3-roots";

const NOW = 1_700_000_000_000;
const ANCHOR = NOW - 3_600_000;

function finishedTrioState(overrides: Record<string, unknown> = {}) {
  return {
    tutorial_done: true,
    player_xp: 100,
    player_level: 1,
    pending_base_reward: 2,
    pending_bonus_reward: 1,
    total_apples: 7,
    tree_growth_mm: 40,
    tree_growth_remainder: 0,
    v3_long_care_cycles: 0,
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
    v3_care_cycle_water_preset_seconds: 5,
    v3_care_cycle_water_skill: 0.5,
    v3_care_cycle_sun_completed: true,
    v3_care_cycle_sun_preset_seconds: 10,
    v3_care_cycle_sun_skill: 0.8,
    v3_care_cycle_fertilizer_completed: true,
    v3_care_cycle_fertilizer_preset_seconds: 15,
    v3_care_cycle_fertilizer_skill: 1,
    v3_care_cycle_started_at: new Date(NOW),
    v3_care_cycle_completed_at: new Date(NOW + 3),
    v3_care_cycle_finished_at: new Date(NOW + 10),
    v3_care_cycle_status: "finished" as string | null,
    v3_care_cycle_total_preset_seconds: 30,
    v3_care_cycle_average_skill: (0.5 + 0.8 + 1) / 3,
    v3_care_cycle_claimed_at: null as Date | null,
    v3_care_cycle_claimed_xp: null as number | null,
    v3_care_cycle_claimed_tree_growth: null as number | null,
    v3_care_cycle_claimed_base_income: null as number | null,
    v3_care_cycle_claimed_bonus_income: null as number | null,
    v3_care_cycle_claimed_total_income: null as number | null,
    v2_income_anchor_at: ANCHOR as number | Date,
    v2_freshness: 1,
    v2_ordinary_income_elapsed_ms: 3_600_000,
    ...overrides,
  };
}

describe("claimEconomyV3CareCyclePure", () => {
  const preview = buildEconomyV3CareRewardPreview(
    {
      status: "finished",
      allCompleted: true,
      activities: {
        water: { completed: true, presetSeconds: 5, skill: 0.5 },
        sun: { completed: true, presetSeconds: 10, skill: 0.8 },
        fertilizer: { completed: true, presetSeconds: 15, skill: 1 },
      },
    },
    {
      capital: 100_000,
      incomeAnchorAt: ANCHOR,
      nowMs: NOW,
      freshness: 1,
      ordinaryIncomeElapsedMs: 3_600_000,
    },
  );

  it("rejects before finish / pending session / invalid preview", () => {
    expect(
      claimEconomyV3CareCyclePure({
        careSessionStatus: null,
        cycleStatus: "ready",
        cycleClaimedAt: null,
        storedClaim: null,
        rewardPreviewAvailable: true,
        rewardPreview: preview,
        nowMs: NOW,
      }),
    ).toMatchObject({ ok: false, code: "care_cycle_not_finished" });

    expect(
      claimEconomyV3CareCyclePure({
        careSessionStatus: "completed",
        cycleStatus: "finished",
        cycleClaimedAt: null,
        storedClaim: null,
        rewardPreviewAvailable: true,
        rewardPreview: preview,
        nowMs: NOW,
      }),
    ).toMatchObject({ ok: false, code: "activity_session_pending" });

    expect(
      claimEconomyV3CareCyclePure({
        careSessionStatus: null,
        cycleStatus: "finished",
        cycleClaimedAt: null,
        storedClaim: null,
        rewardPreviewAvailable: false,
        rewardPreview: { ...preview, available: false },
        nowMs: NOW,
      }),
    ).toMatchObject({ ok: false, code: "reward_preview_unavailable" });
  });

  it("first claim applies preview; repeat is idempotent", () => {
    const first = claimEconomyV3CareCyclePure({
      careSessionStatus: null,
      cycleStatus: "finished",
      cycleClaimedAt: null,
      storedClaim: null,
      rewardPreviewAvailable: true,
      rewardPreview: preview,
      nowMs: NOW + 50,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadyClaimed).toBe(false);
    expect(first.applyAwards).toBe(true);
    expect(first.snapshot.xp).toBe(preview.xp);
    expect(first.snapshot.treeGrowth).toBe(preview.treeGrowth);
    expect(first.snapshot.treeGrowth).toBeGreaterThan(0);
    expect(first.snapshot.income.total).toBe(preview.income.total);

    const second = claimEconomyV3CareCyclePure({
      careSessionStatus: null,
      cycleStatus: "finished",
      cycleClaimedAt: first.snapshot.claimedAt,
      storedClaim: first.snapshot,
      rewardPreviewAvailable: true,
      rewardPreview: preview,
      nowMs: NOW + 99,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyClaimed).toBe(true);
    expect(second.applyAwards).toBe(false);
    expect(second.snapshot).toEqual(first.snapshot);
  });
});

describe("claimEconomyV3CareCycle", () => {
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

  it("feature flag off → 403 without DB", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    await expect(claimEconomyV3CareCycle("42", NOW)).rejects.toMatchObject({
      code: "feature_disabled",
      status: 403,
    });
    expect(poolConnectMock).not.toHaveBeenCalled();
  });

  it("awards XP + tree mm once; pending/apples unchanged; repeat/parallel idempotent", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";
    const state = finishedTrioState();

    let awardUpdates = 0;
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
      if (
        String(text).includes("UPDATE game_state") &&
        String(text).includes("v3_care_cycle_claimed_at")
      ) {
        awardUpdates += 1;
        state.player_xp = Number(params?.[1]);
        state.player_level = Number(params?.[2]);
        state.v3_care_cycle_claimed_at = params?.[3] as Date;
        state.v3_care_cycle_claimed_xp = Number(params?.[4]);
        state.v3_care_cycle_claimed_tree_growth = Number(params?.[5]);
        state.v3_care_cycle_claimed_base_income = Number(params?.[6]);
        state.v3_care_cycle_claimed_bonus_income = Number(params?.[7]);
        state.v3_care_cycle_claimed_total_income = Number(params?.[8]);
        // $10 is BIGINT ms — must not share the TIMESTAMP bind ($4).
        state.v2_income_anchor_at = Number(params?.[9]);
        state.v2_ordinary_income_elapsed_ms = 0;
        state.tree_growth_mm = Number(params?.[10]);
        state.tree_growth_remainder = Number(params?.[11]);
        state.v3_long_care_cycles = Number(params?.[12]);
        expect(params?.[3]).toBeInstanceOf(Date);
        expect(typeof params?.[9]).toBe("number");
        expect(String(text)).toMatch(/v2_income_anchor_at\s*=\s*\$10/);
        expect(String(text)).toMatch(/tree_growth_mm\s*=\s*\$11/);
        expect(String(text)).toMatch(/v3_long_care_cycles\s*=\s*\$13/);
        expect(String(text)).not.toMatch(/pending_base_reward/);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const expectedPreview = buildV3CareCycle(state, {
      capital: 100_000,
      nowMs: NOW,
    }).rewardPreview;
    expect(expectedPreview.available).toBe(true);
    expect(expectedPreview.treeGrowth).toBeGreaterThan(0);

    const first = await claimEconomyV3CareCycle("42", NOW);
    expect(first.alreadyClaimed).toBe(false);
    expect(first.xp).toBe(expectedPreview.xp);
    expect(first.income).toEqual(expectedPreview.income);
    expect(first.income.total).toBe(expectedPreview.income.total);
    expect(first.playerXp).toBe(100 + expectedPreview.xp);
    expect(first.pendingBaseReward).toBe(2);
    expect(first.pendingBonusReward).toBe(1);
    expect(first.totalApples).toBe(7);
    expect(first.treeGrowth).toBe(expectedPreview.treeGrowth);
    expect(first.treeGrowthMm).toBe(40 + expectedPreview.treeGrowth);
    expect(state.total_apples).toBe(7);
    expect(state.tree_growth_mm).toBe(40 + expectedPreview.treeGrowth);
    expect(state.v3_long_care_cycles).toBe(1);
    expect(first.v3Roots.careCycle.claim.claimed).toBe(true);
    expect(first.v3Roots.careCycle.claim.xp).toBe(expectedPreview.xp);
    expect(first.v3Roots.careCycle.claim.treeGrowth).toBe(
      expectedPreview.treeGrowth,
    );
    expect(first.v3Roots.reserves.water.seconds).toBe(8);
    expect(first.v3Roots.roots.water.seconds).toBe(3);
    expect(awardUpdates).toBe(1);

    const second = await claimEconomyV3CareCycle("42", NOW + 100);
    expect(second.alreadyClaimed).toBe(true);
    expect(second.xp).toBe(first.xp);
    expect(second.playerXp).toBe(first.playerXp);
    expect(second.pendingBaseReward).toBe(first.pendingBaseReward);
    expect(second.pendingBonusReward).toBe(first.pendingBonusReward);
    expect(second.treeGrowthMm).toBe(first.treeGrowthMm);
    expect(state.v3_long_care_cycles).toBe(1);
    expect(awardUpdates).toBe(1);

    const [p1, p2] = await Promise.all([
      claimEconomyV3CareCycle("42", NOW + 200),
      claimEconomyV3CareCycle("42", NOW + 201),
    ]);
    expect(p1.alreadyClaimed).toBe(true);
    expect(p2.alreadyClaimed).toBe(true);
    expect(awardUpdates).toBe(1);
    expect(state.player_xp).toBe(100 + expectedPreview.xp);
  });

  it("claim before finish / pending session / missing skill → 409", async () => {
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
            finishedTrioState({
              v3_care_cycle_status: "ready",
              v3_care_cycle_finished_at: null,
            }),
          ],
        };
      }
      return { rows: [] };
    });
    await expect(claimEconomyV3CareCycle("42", NOW)).rejects.toMatchObject({
      code: "care_cycle_not_finished",
      status: 409,
    });

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
            finishedTrioState({
              v3_care_activity_status: "active",
              v3_care_activity_kind: "water",
            }),
          ],
        };
      }
      return { rows: [] };
    });
    await expect(claimEconomyV3CareCycle("42", NOW)).rejects.toMatchObject({
      code: "activity_session_pending",
      status: 409,
    });

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
            finishedTrioState({
              v3_care_cycle_water_skill: null,
            }),
          ],
        };
      }
      return { rows: [] };
    });
    await expect(claimEconomyV3CareCycle("42", NOW)).rejects.toMatchObject({
      code: "reward_preview_unavailable",
      status: 409,
    });
  });
});
