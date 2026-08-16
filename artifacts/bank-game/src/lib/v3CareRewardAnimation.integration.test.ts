/**
 * After Care shovel claim, the existing handleGoToRewards queue must run
 * (XP → tree growth → apples → income). Guards against the regression where
 * acknowledge exited UI immediately and skipped animations.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveV3CareShovelAction,
  sessionScoresFromV3Claim,
  shouldAcknowledgeV3CareCycle,
  shouldShowV3RewardPreview,
} from "./v3CareClient";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import type { EconomyV3RootsState } from "./api";
import { shouldExitPostCareUi } from "./careSessionActionsUi";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");

function finishedUnclaimed(): EconomyV3RootsState {
  const snap = normalizeEconomyV3RootsSnapshot({
    enabled: true,
    dailyCapSeconds: 20,
    dayKey: "2026-07-25",
    roots: {
      water: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
        transferred: true,
        frozen: false,
      },
      sun: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
        transferred: true,
        frozen: false,
      },
      fertilizer: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
        transferred: true,
        frozen: false,
      },
    },
    reserves: {
      water: { seconds: 0, capacitySeconds: 20, playable: false },
      sun: { seconds: 0, capacitySeconds: 20, playable: false },
      fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
    },
    careAvailability: {
      water: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      fertilizer: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
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
      startedAt: "t0",
      completedAt: "t1",
      finishedAt: "t2",
      status: "finished",
      allCompleted: true,
      readyToFinish: false,
      totalPresetSeconds: 15,
      averageSkill: 0.7,
      activities: {
        water: { completed: true, presetSeconds: 5, skill: 0.7 },
        sun: { completed: true, presetSeconds: 5, skill: 0.7 },
        fertilizer: { completed: true, presetSeconds: 5, skill: 0.7 },
      },
      rewardPreview: {
        available: true,
        xp: 45,
        apples: 0,
        treeGrowth: 3,
        income: { base: 2, bonus: 1, total: 3 },
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
      anchorAt: null,
      progress: 0,
      frozenAt: null,
      insuranceDeadlineAt: null,
      firstTransferredRoot: null,
      transferredRoots: ["water", "sun", "fertilizer"],
      secondsUntilNextWholeSecond: null,
      accumulating: false,
    },
    excessGate: {
      ordinaryFull: false,
      rootsFull: false,
      reservesFull: { water: false, sun: false, fertilizer: false },
      generatingExcess: false,
    },
  });
  if (!snap) throw new Error("snap");
  return snap;
}

describe("v3 Care final reward animation queue", () => {
  it("1–2. shovel claim path wires finish→claim→ack→handleGoToRewards (no ack gate)", () => {
    expect(resolveV3CareShovelAction(finishedUnclaimed())).toBe("claim-cycle");
    expect(shouldShowV3RewardPreview(finishedUnclaimed())).toBe(true);
    expect(pageSrc).toContain("await claimV3CareCycleOnce()");
    expect(pageSrc).toContain(
      "await acknowledgeV3CareCycleOnce({ skipUiExit: true })",
    );
    expect(pageSrc).toContain("handleGoToRewards(scoresForQueue)");
    // Rewards must not be gated on acknowledge success.
    expect(pageSrc).not.toContain("if (!acked)");
    expect(pageSrc).toContain("Existing project sequence:");
    // Ack settles before the queue so pending income remains for the capital coin.
    const claimFn = pageSrc.match(
      /async function claimV3CareCycleOnce\([\s\S]*?\n  async function handleV3CareShovelClick/,
    )?.[0] ?? "";
    const ackIdx = claimFn.indexOf(
      "await acknowledgeV3CareCycleOnce({ skipUiExit: true })",
    );
    const rewardsIdx = claimFn.indexOf("handleGoToRewards(scoresForQueue)");
    expect(ackIdx).toBeGreaterThan(-1);
    expect(rewardsIdx).toBeGreaterThan(ackIdx);
  });

  it("3–6. reward queue still contains XP / growth / apples / income steps", () => {
    const claimFn = pageSrc.match(
      /async function claimV3CareCycleOnce\([\s\S]*?\n  async function handleV3CareShovelClick/,
    )?.[0] ?? "";
    expect(claimFn).toContain("handleGoToRewards(scoresForQueue)");
    expect(claimFn).toContain("pendingXpRef.current = {");
    // Tutorial branch uses dedicated demo beat — not the regular spectacle queue.
    expect(claimFn).toContain("if (!tutorialDone)");
    expect(claimFn).toContain("Tutorial Care claim");
    expect(claimFn).toContain("handleTutorialCareRewards(scoresForQueue");
    expect(claimFn).not.toMatch(/setShowXpPopup\(true\)[\s\S]*?await acknowledgeV3CareCycleOnce\(\)/);

    expect(pageSrc).toContain("setShowXpPopup(true)");
    expect(pageSrc).toContain("setShowGrowthAnim(true)");
    expect(pageSrc).toContain("setShowMmPopup(true)");
    expect(pageSrc).toContain("setMmPopupAmount");
    expect(pageSrc).toContain("growth-mm-accrual");
    expect(pageSrc).toContain("setShowApples(true)");
    expect(pageSrc).toContain("claimApplesAndIncome");
    expect(pageSrc).toContain("animateGrowth(");
    expect(pageSrc).toContain("if (!tutorialDone) return;");
    // Live claim must not apply treeGrowthMM before the growth-timer spectacle.
    const claimFnGrowth = pageSrc.match(
      /async function claimV3CareCycleOnce\([\s\S]*?\n  async function handleV3CareShovelClick/,
    )?.[0] ?? "";
    expect(claimFnGrowth).toContain("Defer treeGrowthMM");
    expect(claimFnGrowth).not.toMatch(
      /pendingBaseReward: claimed\.pendingBonusReward,\s*treeGrowthMM:/,
    );
  });

  it("7–8. claim maps scores once; careClicked freezes shovel", () => {
    expect(
      sessionScoresFromV3Claim({
        xp: 45,
        treeGrowth: 3,
        income: { base: 2, bonus: 1, total: 3 },
      }),
    ).toEqual({
      water: 0,
      sun: 0,
      fert: 0,
      xp: 45,
      base: 2,
      bonus: 1,
      mm: 3,
    });
    // mm from server treeGrowth only — never 1₽→1мм from income / pending.
    expect(
      sessionScoresFromV3Claim({
        xp: 45,
        treeGrowth: 0,
        income: { base: 2.4, bonus: 0.7, total: 3.1 },
        pendingBaseReward: 2.4,
        pendingBonusReward: 0.7,
      }),
    ).toMatchObject({ mm: 0, xp: 45, base: 2.4, bonus: 0.7 });
    expect(
      sessionScoresFromV3Claim({
        xp: 45,
        treeGrowth: 26,
        income: { base: 10, bonus: 9, total: 19 },
        pendingBaseReward: 20,
        pendingBonusReward: 18,
      }),
    ).toMatchObject({ mm: 26 });
    expect(pageSrc).toContain("setCareClicked(true)");
    expect(pageSrc).toMatch(
      /if \(\(!tutorialDone && !liveTutorial\) \|\| careClicked\) return/,
    );
    expect(pageSrc).toContain("v3ClaimCycleInFlightRef");
    expect(pageSrc).toContain("claimed.treeGrowthMm");
    expect(pageSrc).toContain("scoresForQueue");
    expect(pageSrc).toContain("deferTreeGrowthUntilSpectacleRef");
  });

  it("10. claimAll / coin never writes treeGrowthMM; mm only after growth timer", () => {
    const claimAll =
      pageSrc.match(
        /async function handleClaimAll\(applesCollected = 0\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(claimAll).toContain("Money + apples only");
    expect(claimAll).not.toMatch(/treeGrowthMM:/);
    expect(claimAll).not.toMatch(/result\.treeGrowthMM/);
    const goToRewards =
      pageSrc.match(
        /function handleGoToRewards\([\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(goToRewards).toContain("after growth timer: apply мм");
    expect(goToRewards).toContain("treeGrowthMM: toMM");
    expect(goToRewards).toMatch(
      /setShowMmPopup\(true\)[\s\S]*?setShowApples\(true\)/,
    );
  });

  it("9–10. post-care exits only after rewards claimed (showRewards + pending 0)", () => {
    expect(
      shouldExitPostCareUi({
        tutorialDone: true,
        pendingBase: 3,
        pendingBonus: 0,
        showCompletionStage: true,
        showActivityGhost: true,
        showCareButton: true,
        showRewards: true,
      }),
    ).toBe(false);
    expect(
      shouldExitPostCareUi({
        tutorialDone: true,
        pendingBase: 0,
        pendingBonus: 0,
        showCompletionStage: true,
        showActivityGhost: true,
        showCareButton: true,
        showRewards: true,
      }),
    ).toBe(true);
    expect(
      shouldExitPostCareUi({
        tutorialDone: true,
        pendingBase: 0,
        pendingBonus: 0,
        showCompletionStage: true,
        showActivityGhost: true,
        showCareButton: true,
        showRewards: true,
        showIncomePopup: true,
      }),
    ).toBe(false);
    expect(pageSrc).toContain("showIncomePopup");
    expect(pageSrc).toContain("incomeUiHold");
    expect(pageSrc).toContain("showIncomePopup: showIncomePopup || incomeUiHold");
    // skipUiExit must not wipe chrome before the queue
    expect(pageSrc).toContain("Keep sessionScores / fills for handleGoToRewards");
    expect(shouldAcknowledgeV3CareCycle(finishedUnclaimed())).toBe(false);
  });

  it("handleGoToRewards accepts scoresOverride for async v3 claim", () => {
    expect(pageSrc).toContain("scoresOverride");
    expect(pageSrc).toContain(
      "const scores = scoresOverride ?? sessionScores",
    );
  });
});
