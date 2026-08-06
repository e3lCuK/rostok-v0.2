/**
 * Stage 8E: Tutorial uses exclusive v3 cycle when enabled.
 * Sequence: collect all three roots → then three Care activities.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  isV3TutorialLiveCareStep,
  isV3TutorialRootStep,
  nextV3TutorialStepFromCompletedActivities,
  nextV3TutorialStepAfterRootTransfer,
  nextV3TutorialRootStep,
  resolveV3TutorialStepFromServer,
  tutorialHighlightRoot,
  TUTORIAL_V3_ROOT_SECONDS,
  v3TutorialOverlayConfig,
} from "./tutorialFlow";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const flowSrc = readFileSync(join(here, "tutorialFlow.ts"), "utf8");
const apiSrc = readFileSync(join(here, "api.ts"), "utf8");

function sampleV3(
  overrides: Record<string, unknown> = {},
): EconomyV3RootsState {
  const raw = {
    enabled: true,
    dailyCapSeconds: 20,
    dayKey: "2026-07-23",
    roots: {
      water: {
        seconds: 5,
        fullSegments: 1,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0.2,
        playableFromRoot: true,
        transferred: false,
        frozen: false,
      },
      sun: {
        seconds: 5,
        fullSegments: 1,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0.2,
        playableFromRoot: true,
        transferred: false,
        frozen: false,
      },
      fertilizer: {
        seconds: 5,
        fullSegments: 1,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0.2,
        playableFromRoot: true,
        transferred: false,
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
      startedAt: null,
      completedAt: null,
      finishedAt: null,
      status: null,
      allCompleted: false,
      readyToFinish: false,
      totalPresetSeconds: null,
      averageSkill: null,
      activities: {
        water: { completed: false, presetSeconds: null, skill: null },
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
      anchorAt: null,
      progress: 0,
      frozenAt: null,
      insuranceDeadlineAt: null,
      firstTransferredRoot: null,
      transferredRoots: [],
      secondsUntilNextWholeSecond: null,
      accumulating: false,
    },
    excessGate: {
      ordinaryFull: false,
      rootsFull: false,
      reservesFull: { water: false, sun: false, fertilizer: false },
      generatingExcess: false,
    },
    ...overrides,
  };
  const snap = normalizeEconomyV3RootsSnapshot(raw);
  if (!snap) throw new Error("bad sample");
  return snap;
}

describe("Economy v3 Tutorial flow (8E)", () => {
  it("root order Water → Sun → Fertilizer → activities; activities free order", () => {
    expect(TUTORIAL_V3_ROOT_SECONDS).toBe(5);
    expect(nextV3TutorialStepAfterRootTransfer("water")).toBe("v3-root-sun");
    expect(nextV3TutorialStepAfterRootTransfer("sun")).toBe(
      "v3-root-fertilizer",
    );
    expect(nextV3TutorialStepAfterRootTransfer("fertilizer")).toBe(
      "v3-activities-intro",
    );
    expect(nextV3TutorialRootStep("water")).toBe("v3-root-sun");
    // Care activities: step from completed set, not W→S→F chain.
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: false,
        sun: true,
        fertilizer: false,
      }),
    ).toBe("v3-activities-intro");
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: true,
        sun: true,
        fertilizer: false,
      }),
    ).toBe("v3-activities-intro");
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: true,
        sun: true,
        fertilizer: true,
      }),
    ).toBe("complete");
    expect(tutorialHighlightRoot("v3-root-water")).toBe("water");
    expect(isV3TutorialRootStep("v3-root-sun")).toBe(true);
    expect(isV3TutorialLiveCareStep("water")).toBe(true);
  });

  it("F5 recovery: after first transfer → sun root step (not water activity)", () => {
    const step = resolveV3TutorialStepFromServer({
      tutorialDone: false,
      v3Roots: sampleV3({
        roots: {
          water: {
            seconds: 0,
            fullSegments: 0,
            partialSegmentSeconds: 0,
            capacitySeconds: 25,
            fillFraction: 0,
            playableFromRoot: false,
            transferred: true,
            frozen: true,
          },
          sun: {
            seconds: 5,
            fullSegments: 1,
            partialSegmentSeconds: 0,
            capacitySeconds: 25,
            fillFraction: 0.2,
            playableFromRoot: true,
            transferred: false,
            frozen: true,
          },
          fertilizer: {
            seconds: 5,
            fullSegments: 1,
            partialSegmentSeconds: 0,
            capacitySeconds: 25,
            fillFraction: 0.2,
            playableFromRoot: true,
            transferred: false,
            frozen: true,
          },
        },
        reserves: {
          water: { seconds: 5, capacitySeconds: 20, playable: true },
          sun: { seconds: 0, capacitySeconds: 20, playable: false },
          fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
        },
        careAvailability: {
          water: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
          sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
          fertilizer: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
        },
        generation: {
          anchorAt: null,
          progress: 0,
          frozenAt: "t",
          insuranceDeadlineAt: "t2",
          firstTransferredRoot: "water",
          transferredRoots: ["water"],
          secondsUntilNextWholeSecond: null,
          accumulating: false,
        },
      }),
    });
    expect(step).toBe("v3-root-sun");
  });

  it("F5 recovery: all reserves ready → activities intro", () => {
    const step = resolveV3TutorialStepFromServer({
      tutorialDone: false,
      v3Roots: sampleV3({
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
          water: { seconds: 5, capacitySeconds: 20, playable: true },
          sun: { seconds: 5, capacitySeconds: 20, playable: true },
          fertilizer: { seconds: 5, capacitySeconds: 20, playable: true },
        },
        careAvailability: {
          water: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
          sun: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
          fertilizer: {
            reserveSeconds: 5,
            playable: true,
            maxPresetSeconds: 5,
          },
        },
        generation: {
          anchorAt: null,
          progress: 0,
          frozenAt: null,
          insuranceDeadlineAt: null,
          firstTransferredRoot: "water",
          transferredRoots: ["water", "sun", "fertilizer"],
          secondsUntilNextWholeSecond: null,
          accumulating: false,
        },
      }),
    });
    expect(step).toBe("v3-activities-intro");
  });

  it("root steps have no overlay card — pulse-only teaching", () => {
    expect(v3TutorialOverlayConfig("intro")).toBeNull();
    expect(v3TutorialOverlayConfig("v3-root-water")).toBeNull();
    expect(v3TutorialOverlayConfig("v3-root-sun")).toBeNull();
    expect(v3TutorialOverlayConfig("v3-root-fertilizer")).toBeNull();
    expect(
      v3TutorialOverlayConfig("v3-activities-intro", {
        recommendedActivity: "water",
      })?.text,
    ).toBe("Пройдите активность");
    expect(
      v3TutorialOverlayConfig("v3-activities-intro", {
        recommendedActivity: "sun",
      })?.icon,
    ).toBe("sun");
    expect(
      v3TutorialOverlayConfig("v3-activities-intro", {
        recommendedActivity: "fertilizer",
      })?.hint,
    ).toBe("Собирайте гранулы в ряд.");
    expect(flowSrc).not.toContain("Нажмите на синий корень");
    expect(flowSrc).not.toContain("корня Воды");
    expect(flowSrc).not.toContain("Соберите энергию");
  });

  it("GamePage: v3 tutorial uses prepare + v3 care; no session endpoints", () => {
    expect(apiSrc).toContain("prepareTutorialV3");
    expect(apiSrc).toContain("/game/tutorial/v3/prepare");
    expect(pageSrc).toContain("prepareTutorialV3");
    expect(pageSrc).toContain("resolveV3TutorialStepFromServer");
    expect(pageSrc).toContain("tutorialHighlightRoot");
    expect(pageSrc).toContain("isV3TutorialLiveCareStep");
    expect(pageSrc).toContain("nextV3TutorialStepFromCompletedActivities");
    expect(pageSrc).toContain("getV3CareActivitiesCompleted");
    expect(pageSrc).toMatch(
      /handleStartV3CareActivity[\s\S]*?isV3TutorialLiveCareStep/,
    );
    // Legacy path still uses sun-intro; v3 uses completed-set step.
    expect(pageSrc).toContain("setTutorialStep(\"sun-intro\")");
    expect(flowSrc).toContain("v3-root-water");
    expect(flowSrc).toContain("getV3CareActivitiesCompleted");
  });

  it("GamePage: shovel during v3 tutorial uses v3 cycle, not legacy finish", () => {
    expect(pageSrc).toMatch(
      /tutorialStep === \"complete\" &&\s*useV3[\s\S]*?handleV3CareShovelClick/,
    );
    expect(pageSrc).toContain("acknowledgeV3CareCycleOnce");
  });
});
