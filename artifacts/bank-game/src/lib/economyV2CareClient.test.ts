import { describe, expect, it } from "vitest";
import {
  applyV2CareActivityToState,
  applyV2CareFinishToState,
  applyV2CareSnapshotToState,
  applyV2CareStartToState,
  canStartV2Care,
  emptyV2CareState,
  v2CareActionsLeft,
  V2_CARE_MIN_START_SECONDS,
} from "./economyV2CareClient";
import type { EconomyV2CareActivityResponse } from "./api";
import type { UserState } from "./engine";

function baseState(overrides: Partial<UserState["game"]> = {}): UserState {
  return {
    balances: {
      balance: 100_000,
      earned: 0,
      totalDaysEarned: 0,
      startDate: 1_700_000_000_000,
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
      v2EnergySeconds: 15,
      v2EnergyAnchorAt: null,
      v2Care: emptyV2CareState(),
      ...overrides,
    },
    history: [],
  };
}

function activityResult(
  overrides: Partial<EconomyV2CareActivityResponse> = {},
): EconomyV2CareActivityResponse {
  return {
    cycleId: "c15",
    activity: "water",
    spentSeconds: 5,
    energySeconds: 10.2,
    skillScore: 100,
    activityXp: 20,
    totalCycleXp: 20,
    cycleSkill: 1 / 3,
    completed: { water: true, sun: false, fertilizer: false },
    allCompleted: false,
    sessionComplete: false,
    scores: { water: 100, sun: null, fertilizer: null },
    baseReward: 0,
    bonusReward: 0,
    pendingBaseReward: 0,
    pendingBonusReward: 0,
    pendingStoredSessions: 0,
    storedSessions: 1,
    xpGained: 20,
    playerXp: 20,
    playerLevel: 1,
    ...overrides,
  };
}

describe("economyV2CareClient — v2 income / dedicated scores", () => {
  it("blocks start below 15 whole seconds", () => {
    expect(canStartV2Care(14)).toBe(false);
    expect(canStartV2Care(15)).toBe(true);
    expect(V2_CARE_MIN_START_SECONDS).toBe(15);
  });

  it("maps pending_rewards error for unclaimed Care", async () => {
    const { careErrorMessage } = await import("./economyV2CareClient");
    expect(
      careErrorMessage({
        status: 409,
        code: "pending_rewards",
        message: "Claim pending Care rewards before starting a new cycle",
      }),
    ).toMatch(/награду/i);
  });

  it("start does not set sessionInProgress; scores null", () => {
    const started = applyV2CareStartToState(baseState(), {
      cycleId: "c15",
      allocation: {
        waterSeconds: 5,
        sunSeconds: 5,
        fertilizerSeconds: 5,
        totalAllocatedSeconds: 15,
      },
      completed: { water: false, sun: false, fertilizer: false },
      allCompleted: false,
      energySeconds: 15,
      scores: { water: null, sun: null, fertilizer: null },
    });
    expect(started.game.sessionInProgress).toBe(false);
    expect(started.game.v2Care?.scores?.water).toBeNull();
  });

  it("activity mirrors dedicated score; no client money math", () => {
    const started = applyV2CareStartToState(baseState(), {
      cycleId: "c15",
      allocation: {
        waterSeconds: 5,
        sunSeconds: 5,
        fertilizerSeconds: 5,
        totalAllocatedSeconds: 15,
      },
      completed: { water: false, sun: false, fertilizer: false },
      allCompleted: false,
      energySeconds: 15,
    });
    const after = applyV2CareActivityToState(started, activityResult());
    expect(after.game.water).toBe(true);
    expect(after.game.v2Care?.scores?.water).toBe(100);
    expect(after.game.pendingBaseReward).toBe(0);
    expect(v2CareActionsLeft(after.game.v2Care)).toBe(2);
  });

  it("third activity applies server pending; pendingStoredSessions=0", () => {
    const state = applyV2CareStartToState(baseState(), {
      cycleId: "c1",
      allocation: {
        waterSeconds: 5,
        sunSeconds: 5,
        fertilizerSeconds: 5,
        totalAllocatedSeconds: 15,
      },
      completed: { water: true, sun: true, fertilizer: false },
      allCompleted: false,
      energySeconds: 5,
    });
    const done = applyV2CareActivityToState(
      state,
      activityResult({
        activity: "fertilizer",
        spentSeconds: 5,
        energySeconds: 0,
        completed: { water: true, sun: true, fertilizer: true },
        allCompleted: true,
        sessionComplete: true,
        scores: { water: 100, sun: 100, fertilizer: 100 },
        cycleSkill: 1,
        baseReward: 32.88,
        bonusReward: 8.22,
        pendingBaseReward: 32.88,
        pendingBonusReward: 8.22,
        pendingStoredSessions: 0,
        totalCycleXp: 60,
        xpGained: 60,
        playerXp: 60,
      }),
    );
    expect(done.game.pendingBaseReward).toBe(32.88);
    expect(done.game.pendingBonusReward).toBe(8.22);
    expect(done.game.pendingStoredSessions).toBe(0);
    expect(done.game.sessionInProgress).toBe(false);
  });

  it("F5 restores dedicated scores via snapshot", () => {
    const restored = applyV2CareSnapshotToState(baseState(), {
      inProgress: true,
      cycleId: "f5",
      allocation: {
        waterSeconds: 6,
        sunSeconds: 5,
        fertilizerSeconds: 5,
        totalAllocatedSeconds: 16,
      },
      completed: { water: true, sun: false, fertilizer: false },
      allCompleted: false,
      scores: { water: 83, sun: null, fertilizer: null },
    });
    expect(restored.game.v2Care?.scores?.water).toBe(83);
    expect(restored.game.water).toBe(true);
  });

  it("finish clears snapshot", () => {
    const active = applyV2CareStartToState(baseState(), {
      cycleId: "fin",
      allocation: {
        waterSeconds: 5,
        sunSeconds: 5,
        fertilizerSeconds: 5,
        totalAllocatedSeconds: 15,
      },
      completed: { water: true, sun: true, fertilizer: true },
      allCompleted: true,
      energySeconds: 0.2,
    });
    const finished = applyV2CareFinishToState(active, 0.2);
    expect(finished.game.v2Care?.inProgress).toBe(false);
  });

  it("tutorial duration stays 10", async () => {
    const { TUTORIAL_ACTIVITY_DURATION_SEC } = await import("./tutorialFlow");
    expect(TUTORIAL_ACTIVITY_DURATION_SEC).toBe(10);
  });
});
