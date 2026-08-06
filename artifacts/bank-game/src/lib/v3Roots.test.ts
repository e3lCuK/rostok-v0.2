import { describe, expect, it } from "vitest";
import type { UserState } from "./engine";
import type { EconomyV3RootsState } from "./api";
import {
  applyEconomyV3FromServerGame,
  applyEconomyV3RootsToState,
  clampV3DailyCap,
  clampV3ReserveSeconds,
  clampV3RootSeconds,
  economyV3DebugReadout,
  normalizeEconomyV3RootsSnapshot,
} from "./v3Roots";

function sampleServerV3(overrides: Record<string, unknown> = {}): unknown {
  return {
    enabled: true,
    dailyCapSeconds: 20,
    dayKey: "2026-07-23",
    roots: {
      water: {
        seconds: 7,
        fullSegments: 1,
        partialSegmentSeconds: 2,
        capacitySeconds: 25,
        fillFraction: 0.28,
        playableFromRoot: true,
        transferred: false,
        frozen: false,
      },
      sun: {
        seconds: 3,
        fullSegments: 0,
        partialSegmentSeconds: 3,
        capacitySeconds: 25,
        fillFraction: 0.12,
        playableFromRoot: true,
        transferred: false,
        frozen: false,
      },
      fertilizer: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
        transferred: false,
        frozen: false,
      },
    },
    reserves: {
      water: { seconds: 5, capacitySeconds: 20, playable: true },
      sun: { seconds: 0, capacitySeconds: 20, playable: false },
      fertilizer: { seconds: 12, capacitySeconds: 20, playable: true },
    },
    careAvailability: {
      water: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
      sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      fertilizer: { reserveSeconds: 12, playable: true, maxPresetSeconds: 12 },
    },
    careSession: {
      active: false,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      finishedAt: null,
      status: null,
      skill: null,
    },
    careCycle: {
      startedAt: null,
      completedAt: null,
      finishedAt: null,
      status: "in_progress",
      allCompleted: false,
      readyToFinish: false,
      totalPresetSeconds: null,
      averageSkill: null,
      activities: {
        water: { completed: true, presetSeconds: 5, skill: 0.5 },
        sun: { completed: false, presetSeconds: null, skill: null },
        fertilizer: { completed: false, presetSeconds: null, skill: null },
      },
      rewardPreview: {
        available: false,
        xp: 0,
        apples: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
      claim: {
        claimed: false,
        claimedAt: null,
        xp: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
    },
    generation: {
      anchorAt: "2026-07-23T00:00:00.000Z",
      progress: 0.4,
      frozenAt: null,
      insuranceDeadlineAt: null,
      firstTransferredRoot: null,
      transferredRoots: [],
      secondsUntilNextWholeSecond: 100,
      accumulating: true,
    },
    ...overrides,
  };
}

function baseState(): UserState {
  return {
    balances: {
      balance: 100_000,
      earned: 0,
      totalDaysEarned: 0,
      startDate: 1,
    },
    game: {
      lastSessionTime: null,
      sessionInProgress: false,
      water: false,
      sun: false,
      fertilizer: false,
      streakDays: 0,
      missedSessions: 0,
      pendingBaseReward: 0,
      pendingBonusReward: 0,
      pendingStoredSessions: 1,
      treeGrowthMM: 0,
      treeGrowthRemainder: 0,
      playerXP: 0,
      playerLevel: 1,
      xpHistory: [],
      totalApples: 0,
      purchasedItems: [],
      tutorialDone: true,
      v2EnergySeconds: 10,
      v2Roots: null,
      v2Excess: null,
      v3Roots: null,
    },
    history: [],
  };
}

describe("normalizeEconomyV3RootsSnapshot", () => {
  it("absent / disabled snapshot → null (old UI path)", () => {
    expect(normalizeEconomyV3RootsSnapshot(undefined)).toBeNull();
    expect(normalizeEconomyV3RootsSnapshot(null)).toBeNull();
    expect(normalizeEconomyV3RootsSnapshot({ enabled: false })).toBeNull();
    expect(normalizeEconomyV3RootsSnapshot({})).toBeNull();
  });

  it("normalizes three roots and three reserves separately", () => {
    const snap = normalizeEconomyV3RootsSnapshot(sampleServerV3());
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.enabled).toBe(true);
    expect(snap.roots.water.seconds).toBe(7);
    expect(snap.roots.sun.seconds).toBe(3);
    expect(snap.roots.fertilizer.seconds).toBe(0);
    expect(snap.reserves.water.seconds).toBe(5);
    expect(snap.reserves.sun.seconds).toBe(0);
    expect(snap.reserves.fertilizer.seconds).toBe(12);
    expect(snap.careCycle.status).toBe("in_progress");
    expect(snap.careCycle.rewardPreview.available).toBe(false);
    expect(snap.careCycle.claim.claimed).toBe(false);
  });

  it("clamps invalid root / reserve / dailyCap values", () => {
    expect(clampV3RootSeconds(99)).toBe(30);
    expect(clampV3RootSeconds(99, 25)).toBe(25);
    expect(clampV3RootSeconds(-3)).toBe(0);
    expect(clampV3DailyCap(2)).toBe(5);
    expect(clampV3DailyCap(40)).toBe(25);
    expect(clampV3DailyCap("x")).toBe(20);
    expect(clampV3ReserveSeconds(99, 20)).toBe(20);

    const snap = normalizeEconomyV3RootsSnapshot(
      sampleServerV3({
        dailyCapSeconds: 100,
        roots: {
          water: { seconds: 999, fillFraction: 2 },
          sun: { seconds: -1 },
          fertilizer: {},
        },
        reserves: {
          water: { seconds: 50 },
          sun: { seconds: "nope" },
          fertilizer: { seconds: 3 },
        },
      }),
    );
    expect(snap?.dailyCapSeconds).toBe(25);
    // Root without server capacitySeconds falls back to absolute max 30.
    expect(snap?.roots.water.seconds).toBe(30);
    expect(snap?.roots.sun.seconds).toBe(0);
    expect(snap?.reserves.water.seconds).toBe(25);
    expect(snap?.roots.water.fillFraction).toBe(1);
  });

  it("does not invent reward math — keeps server rewardPreview numbers", () => {
    const snap = normalizeEconomyV3RootsSnapshot(
      sampleServerV3({
        careCycle: {
          status: "finished",
          allCompleted: true,
          readyToFinish: false,
          activities: {
            water: { completed: true, presetSeconds: 5, skill: 1 },
            sun: { completed: true, presetSeconds: 5, skill: 1 },
            fertilizer: { completed: true, presetSeconds: 5, skill: 1 },
          },
          rewardPreview: {
            available: true,
            xp: 42,
            apples: 0,
            treeGrowth: 3,
            income: { base: 1.1, bonus: 0.2, total: 1.3 },
          },
          claim: {
            claimed: true,
            claimedAt: "2026-07-23T12:00:00.000Z",
            xp: 42,
            treeGrowth: 3,
            income: { base: 1.1, bonus: 0.2, total: 1.3 },
          },
        },
      }),
    );
    expect(snap?.careCycle.rewardPreview).toEqual({
      available: true,
      xp: 42,
      apples: 0,
      treeGrowth: 3,
      income: { base: 1.1, bonus: 0.2, total: 1.3 },
    });
    expect(snap?.careCycle.claim.claimed).toBe(true);
  });
});

describe("applyEconomyV3* / commitState path", () => {
  it("commit-style apply updates v3 snapshot without touching v2 bank", () => {
    const normalized = normalizeEconomyV3RootsSnapshot(
      sampleServerV3(),
    ) as EconomyV3RootsState;
    const next = applyEconomyV3RootsToState(baseState(), normalized, null);
    expect(next.game.v2EnergySeconds).toBe(10);
    expect(next.game.v3Roots?.roots.water.seconds).toBe(7);
    expect(next.game.v3AutoTransfer).toBeNull();
  });

  it("applyEconomyV3FromServerGame merges getState payload", () => {
    const next = applyEconomyV3FromServerGame(baseState(), {
      v3Roots: sampleServerV3() as EconomyV3RootsState,
      v3AutoTransfer: {
        applied: true,
        at: "2026-07-23T01:00:00.000Z",
        roots: ["water"],
        acceptedByRoot: { water: 5 },
        discardedByRoot: {},
      },
    });
    expect(next.game.v3Roots?.enabled).toBe(true);
    expect(next.game.v3AutoTransfer?.applied).toBe(true);
    expect(next.game.v3AutoTransfer?.roots).toEqual(["water"]);
  });

  it("missing v3Roots leaves previous snapshot when key absent", () => {
    const withV3 = applyEconomyV3RootsToState(
      baseState(),
      normalizeEconomyV3RootsSnapshot(sampleServerV3()),
    );
    const same = applyEconomyV3FromServerGame(withV3, {
      // no v3Roots key — partial update
    } as { v2Excess?: unknown });
    expect(same.game.v3Roots?.roots.water.seconds).toBe(7);
  });
});

describe("economyV3DebugReadout", () => {
  it("null when snapshot absent; populated when enabled", () => {
    expect(economyV3DebugReadout(null)).toBeNull();
    const snap = normalizeEconomyV3RootsSnapshot(sampleServerV3());
    const r = economyV3DebugReadout(snap);
    expect(r).toEqual({
      enabled: true,
      effectivePresetSeconds: 20,
      waterRootSeconds: 7,
      sunRootSeconds: 3,
      fertilizerRootSeconds: 0,
      waterReserveSeconds: 5,
      sunReserveSeconds: 0,
      fertilizerReserveSeconds: 12,
      frozen: false,
      accumulating: true,
      careCycleStatus: "in_progress",
      ordinaryFull: false,
      rootsFull: false,
      generatingExcess: false,
      excessAvailable: false,
      metelkaRequired: false,
      metelkaPhase: "roots_accumulating",
    });
    expect(
      economyV3DebugReadout(snap, { excessAvailable: true })?.excessAvailable,
    ).toBe(true);
  });
});
