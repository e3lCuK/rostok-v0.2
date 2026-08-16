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
  areV3TutorialRootsEnergyReady,
  clearV3CareUiAfterTutorial,
  isV3TutorialLiveCareStep,
  isV3TutorialRootEnergyReady,
  isV3TutorialRootStep,
  mergeStagedTutorialPrepare,
  mergeTutorialRootsPreserveFill,
  nextV3TutorialFillKind,
  nextV3TutorialStepFromCompletedActivities,
  nextV3TutorialStepAfterRootTransfer,
  nextV3TutorialRootStep,
  resolveV3TutorialStepFromServer,
  shouldApplyResolvedV3TutorialStep,
  shouldClearStaleV3CareUiAfterTutorial,
  tutorialHighlightRoot,
  TUTORIAL_PLAN_ICON_COLORS,
  TUTORIAL_V3_ROOT_POP_MS,
  TUTORIAL_V3_ROOT_SECONDS,
  TUTORIAL_V3_WAIT_SECONDS,
  v3TutorialOverlayConfig,
  withTutorialRootSeconds,
} from "./tutorialFlow";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const flowSrc = readFileSync(join(here, "tutorialFlow.ts"), "utf8");
const apiSrc = readFileSync(join(here, "api.ts"), "utf8");
const timerSrc = readFileSync(
  join(here, "../components/v2/V3TutorialFillTimer.tsx"),
  "utf8",
);

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
  it("flask-bound root grants: T(K) cycle → next root 10s (no free-running 5s fill)", () => {
    expect(TUTORIAL_V3_ROOT_SECONDS).toBe(10);
    expect(pageSrc).toContain("V3TutorialFillTimer");
    expect(pageSrc).toContain("tutorialFillDeadlineMs");
    expect(pageSrc).toContain("!excessUiGrey");
    expect(pageSrc).toContain("grantTutorialRootFromFlask");
    expect(pageSrc).toContain("rearmTutorialWaitCycle");
    expect(pageSrc).toContain("startTutorialFastFill");
    expect(pageSrc).toContain("onFastFillClick");
    expect(pageSrc).toContain("tutorialFastFillUsed");
    expect(pageSrc).toContain('tutorialStep === "intro"');
    expect(pageSrc).toContain("persistTutorialFastFillUsed");
    expect(pageSrc).toContain("TUTORIAL_V3_FILL_MS");
    expect(timerSrc).toContain("v3-tutorial-fast-fill");
    expect(timerSrc).toContain("TUTORIAL_PLAN_ICON_COLORS.fastFill");
    expect(timerSrc).toContain('<line x1="12" y1="12" x2="12" y2="6.5"');
    expect(timerSrc).toContain('<line x1="12" y1="12" x2="17" y2="12"');
    expect(pageSrc).toContain("nextV3TutorialFillKind");
    expect(pageSrc).toContain("withTutorialRootSeconds");
    expect(pageSrc).toContain("mergeStagedTutorialPrepare");
    expect(pageSrc).toContain("prepareTutorialV3({ kind })");
    expect(pageSrc).toContain("TUTORIAL_V3_ROOT_POP_MS");
    // Must not auto-fill on a detached 5s sleep loop.
    expect(pageSrc).not.toContain("await sleepUntil(deadline)");
    expect(pageSrc).not.toContain("keepCapitalWait");
    expect(pageSrc).not.toContain("tutorialFillRepairNonce");
    expect(apiSrc).toContain("prepareTutorialV3:");
    expect(apiSrc).toContain("{ kind:");
    expect(flowSrc).toContain("nextV3TutorialFillKind");
    expect(flowSrc).toContain("withTutorialRootSeconds");
    expect(TUTORIAL_V3_ROOT_POP_MS).toBe(350);
    // After capital: T(K) wait (default 12:00 at 100k).
    expect(TUTORIAL_V3_WAIT_SECONDS).toBe(720);
    expect(flowSrc).toContain("tutorialWaitSecondsForCapital");
    expect(flowSrc).toContain("TUTORIAL_V3_WAIT_SECONDS");
    expect(pageSrc).toContain("tutorialWaitMsForCapital");
    expect(pageSrc).toContain("startTutorialWaitCountdown");
    // Pre-transfer flask must show T(0)=60:00, not idle.
    expect(pageSrc).toMatch(
      /capital-transfer[\s\S]*?tutorialWaitMsForCapital\(0\)/,
    );
    // On vault→chest transfer: re-arm full T(K) for the moved amount.
    expect(pageSrc).toContain("armTutorialWaitClock(Date.now(), transferredCapital)");
    expect(pageSrc).toContain("tutorialWaitStartedRef");
    expect(pageSrc).toContain("tutorialWaitStartedAtRef");
    expect(pageSrc).toContain("resolveTutorialGenerationAnchorAt");
    expect(pageSrc).toContain("handoffDeadlineAtMs");
    expect(pageSrc).toContain('setTutorialTimerKind("wait")');
    expect(pageSrc).toContain('tutorialTimerKind === "wait"');
    expect(pageSrc).toContain("tutorialEnergyBootstrap");
    expect(pageSrc).toContain("dropStaleTutorialWaitClock");
    expect(pageSrc).toContain("mergeTutorialRootsPreserveFill");
    expect(apiSrc).toContain("armTutorialV3Wait");
    expect(apiSrc).toContain("syncTutorialV3WaitEnergy");
    expect(pageSrc).toContain("armTutorialV3Wait");
    expect(pageSrc).toContain("syncTutorialV3WaitEnergy");

    const empty = sampleV3({
      roots: {
        water: {
          seconds: 0,
          fullSegments: 0,
          partialSegmentSeconds: 0,
          capacitySeconds: 25,
          fillFraction: 0,
          playableFromRoot: false,
          transferred: false,
          frozen: false,
        },
        sun: {
          seconds: 0,
          fullSegments: 0,
          partialSegmentSeconds: 0,
          capacitySeconds: 25,
          fillFraction: 0,
          playableFromRoot: false,
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
    });
    expect(nextV3TutorialFillKind(empty)).toBe("water");
    expect(areV3TutorialRootsEnergyReady(empty)).toBe(false);
    // Collect tip must wait for the last root's 10s preset — not after water alone.
    expect(pageSrc).toMatch(
      /areV3TutorialRootsEnergyReady[\s\S]*?setTutorialStep\(\(s\) =>[\s\S]*?v3-root-water/,
    );
    expect(pageSrc).not.toMatch(
      /await grantTutorialRootFromFlask\(fillKind\);\s*setTutorialStep\(\(s\) =>/,
    );

    const onlyWater = withTutorialRootSeconds(empty, "water", 10);
    expect(onlyWater.roots.water.seconds).toBe(10);
    expect(onlyWater.roots.water.fullSegments).toBe(2);
    expect(onlyWater.roots.sun.seconds).toBe(0);
    expect(onlyWater.roots.fertilizer.seconds).toBe(0);
    const merged = mergeStagedTutorialPrepare(
      onlyWater,
      "water",
      withTutorialRootSeconds(
        withTutorialRootSeconds(
          withTutorialRootSeconds(empty, "water", 10),
          "sun",
          10,
        ),
        "fertilizer",
        10,
      ),
    );
    // Even if server returns all three, staged merge keeps sun/fert local.
    expect(merged.roots.water.seconds).toBe(10);
    expect(merged.roots.sun.seconds).toBe(0);
    expect(merged.roots.fertilizer.seconds).toBe(0);

    // Stale 5s grant must not underrun local two-cell pop (infinite water loop).
    const staleServer = withTutorialRootSeconds(empty, "water", 5);
    const keepLocal = mergeStagedTutorialPrepare(
      onlyWater,
      "water",
      staleServer,
    );
    expect(keepLocal.roots.water.seconds).toBe(10);
    expect(nextV3TutorialFillKind(keepLocal)).toBe("sun");

    // Collect must not snap uncollected siblings from 10s → 5s.
    const localTrio = withTutorialRootSeconds(
      withTutorialRootSeconds(
        withTutorialRootSeconds(empty, "water", 10),
        "sun",
        10,
      ),
      "fertilizer",
      10,
    );
    const afterWaterCollect = mergeTutorialRootsPreserveFill(
      localTrio,
      sampleV3({
        roots: {
          water: {
            ...empty.roots.water,
            seconds: 0,
            fullSegments: 0,
            fillFraction: 0,
            playableFromRoot: false,
            transferred: true,
          },
          sun: {
            ...empty.roots.sun,
            seconds: 5,
            fullSegments: 1,
            fillFraction: 0.2,
            playableFromRoot: true,
          },
          fertilizer: {
            ...empty.roots.fertilizer,
            seconds: 5,
            fullSegments: 1,
            fillFraction: 0.2,
            playableFromRoot: true,
          },
        },
        reserves: {
          water: { seconds: 10, capacitySeconds: 20, playable: true },
          sun: { seconds: 0, capacitySeconds: 20, playable: false },
          fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
        },
        generation: {
          ...empty.generation,
          transferredRoots: ["water"],
          firstTransferredRoot: "water",
        },
      }),
    );
    expect(afterWaterCollect.roots.water.seconds).toBe(0);
    expect(afterWaterCollect.roots.sun.seconds).toBe(10);
    expect(afterWaterCollect.roots.fertilizer.seconds).toBe(10);
    expect(afterWaterCollect.reserves.water.seconds).toBe(10);

    // Third collect clears transferredRoots — must not resurrect last root fill.
    const afterAllCollected = mergeTutorialRootsPreserveFill(
      localTrio,
      sampleV3({
        roots: {
          water: {
            ...empty.roots.water,
            seconds: 0,
            fullSegments: 0,
            fillFraction: 0,
            playableFromRoot: false,
            transferred: false,
          },
          sun: {
            ...empty.roots.sun,
            seconds: 0,
            fullSegments: 0,
            fillFraction: 0,
            playableFromRoot: false,
            transferred: false,
          },
          fertilizer: {
            ...empty.roots.fertilizer,
            seconds: 0,
            fullSegments: 0,
            fillFraction: 0,
            playableFromRoot: false,
            transferred: false,
          },
        },
        reserves: {
          water: { seconds: 10, capacitySeconds: 20, playable: true },
          sun: { seconds: 10, capacitySeconds: 20, playable: true },
          fertilizer: { seconds: 10, capacitySeconds: 20, playable: true },
        },
        generation: {
          ...empty.generation,
          transferredRoots: [],
          firstTransferredRoot: null,
        },
      }),
    );
    expect(afterAllCollected.roots.water.seconds).toBe(0);
    expect(afterAllCollected.roots.sun.seconds).toBe(0);
    expect(afterAllCollected.roots.fertilizer.seconds).toBe(0);
    expect(afterAllCollected.reserves.fertilizer.seconds).toBe(10);
    expect(pageSrc).toContain("prepareTutorialV3({ all: true })");
    expect(pageSrc).toContain("mergeTutorialRootsPreserveFill");

    const waterOnly = sampleV3({
      roots: {
        ...empty.roots,
        water: {
          ...empty.roots.water,
          seconds: 10,
          fullSegments: 2,
          fillFraction: 0.4,
          playableFromRoot: true,
        },
      },
    });
    expect(isV3TutorialRootEnergyReady(waterOnly, "water")).toBe(true);
    expect(nextV3TutorialFillKind(waterOnly)).toBe("sun");
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: waterOnly,
      }),
    ).toBe("intro");
  });

  it("root order Water → Sun → Fertilizer → activities; activities free order", () => {
    expect(TUTORIAL_V3_ROOT_SECONDS).toBe(10);
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
            seconds: 10,
            fullSegments: 2,
            partialSegmentSeconds: 0,
            capacitySeconds: 25,
            fillFraction: 0.4,
            playableFromRoot: true,
            transferred: false,
            frozen: true,
          },
          fertilizer: {
            seconds: 10,
            fullSegments: 2,
            partialSegmentSeconds: 0,
            capacitySeconds: 25,
            fillFraction: 0.4,
            playableFromRoot: true,
            transferred: false,
            frozen: true,
          },
        },
        reserves: {
          water: { seconds: 10, capacitySeconds: 20, playable: true },
          sun: { seconds: 0, capacitySeconds: 20, playable: false },
          fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
        },
        careAvailability: {
          water: { reserveSeconds: 10, playable: true, maxPresetSeconds: 10 },
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
          water: { seconds: 10, capacitySeconds: 20, playable: true },
          sun: { seconds: 10, capacitySeconds: 20, playable: true },
          fertilizer: { seconds: 10, capacitySeconds: 20, playable: true },
        },
        careAvailability: {
          water: { reserveSeconds: 10, playable: true, maxPresetSeconds: 10 },
          sun: { reserveSeconds: 10, playable: true, maxPresetSeconds: 10 },
          fertilizer: {
            reserveSeconds: 10,
            playable: true,
            maxPresetSeconds: 10,
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

  it("intro wait card; then collect-roots card with energy icon", () => {
    expect(v3TutorialOverlayConfig("intro")).toEqual({
      icon: "wait",
      text: "Нажмите на\u00A0значок времени",
      hint: "Фиолетовые часы у\u00A0колбы ускорят формирование энергии в\u00A0обучении.",
      accent: TUTORIAL_PLAN_ICON_COLORS.fastFill,
    });
    expect(
      v3TutorialOverlayConfig("intro", { tutorialFastFillArmed: true }),
    ).toEqual({
      icon: "wait",
      text: "Дождитесь формирования энергии",
      hint: "Смотрите на\u00A0таймер у\u00A0корней.",
      accent: TUTORIAL_PLAN_ICON_COLORS.wait,
    });
    const collect = {
      icon: "energy",
      text: "Соберите энергию из\u00A0корней",
      hint: "Нажмите на\u00A0корневые ячейки по\u00A0очереди.",
      accent: TUTORIAL_PLAN_ICON_COLORS.energy,
    };
    expect(v3TutorialOverlayConfig("v3-root-water")).toEqual(collect);
    expect(v3TutorialOverlayConfig("v3-root-sun")).toEqual(collect);
    expect(v3TutorialOverlayConfig("v3-root-fertilizer")).toEqual(collect);
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
    ).toBe("Собирайте гранулы в\u00A0ряд.");
    expect(flowSrc).not.toContain("Нажмите на синий корень");
    expect(flowSrc).not.toContain("корня Воды");
    expect(pageSrc).toContain('cfg.icon === "wait"');
    expect(pageSrc).toContain('cfg.icon === "energy"');
    expect(pageSrc).toContain("<Clock");
    expect(pageSrc).toContain("<Zap");
    expect(pageSrc).toContain("TUTORIAL_PLAN_ICON_COLORS");
    expect(pageSrc).toContain("--tutorial-accent");
    expect(pageSrc).toContain("cfg.accent");
  });

  it("F5 re-resolve must not regress past intro (Care shovel → empty roots)", () => {
    expect(shouldApplyResolvedV3TutorialStep("complete", "intro")).toBe(false);
    expect(
      shouldApplyResolvedV3TutorialStep("v3-activities-intro", "intro"),
    ).toBe(false);
    expect(shouldApplyResolvedV3TutorialStep("v3-root-water", "intro")).toBe(
      false,
    );
    expect(shouldApplyResolvedV3TutorialStep("intro", "v3-root-water")).toBe(
      true,
    );
    expect(shouldApplyResolvedV3TutorialStep("intro", "intro")).toBe(false);
    expect(shouldApplyResolvedV3TutorialStep(null, "intro")).toBe(true);
    expect(pageSrc).toContain("shouldApplyResolvedV3TutorialStep");
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
    expect(pageSrc).toContain("void handleV3CareShovelClick()");
    expect(pageSrc).toMatch(
      /if\s*\(\s*useV3\s*\)\s*\{\s*\r?\n\s*void handleV3CareShovelClick\(\)/,
    );
    expect(pageSrc).toContain("acknowledgeV3CareCycleOnce");
  });

  it("clears stale post-tutorial Care checkmarks so activity seconds return", () => {
    const emptyReserves = {
      water: { seconds: 0, capacitySeconds: 20, playable: false },
      sun: { seconds: 0, capacitySeconds: 20, playable: false },
      fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
    };
    // Orphan ticks only — no live session/cycle status.
    const stale = sampleV3({
      reserves: emptyReserves,
      careCycle: {
        ...sampleV3().careCycle,
        status: null,
        readyToFinish: false,
        allCompleted: false,
        activities: {
          water: { completed: true, presetSeconds: 5, skill: 1 },
          sun: { completed: true, presetSeconds: 5, skill: 1 },
          fertilizer: { completed: true, presetSeconds: 5, skill: 1 },
        },
      },
    });
    expect(shouldClearStaleV3CareUiAfterTutorial(stale)).toBe(true);
    const cleared = clearV3CareUiAfterTutorial(stale);
    expect(cleared?.careCycle.activities.water.completed).toBe(false);
    expect(cleared?.careCycle.readyToFinish).toBe(false);
    expect(cleared?.careCycle.status).toBeNull();
    expect(shouldClearStaleV3CareUiAfterTutorial(cleared)).toBe(false);

    // Live: third activity pending ack (reserves spent) — must not wipe.
    const pendingAck = sampleV3({
      reserves: emptyReserves,
      careSession: {
        ...sampleV3().careSession,
        activity: "fertilizer",
        status: "completed",
        active: false,
        skill: 0.8,
      },
      careCycle: {
        ...sampleV3().careCycle,
        status: "ready",
        readyToFinish: false,
        allCompleted: true,
        activities: {
          water: { completed: true, presetSeconds: 5, skill: 1 },
          sun: { completed: true, presetSeconds: 5, skill: 1 },
          fertilizer: { completed: true, presetSeconds: 5, skill: 0.8 },
        },
      },
    });
    expect(shouldClearStaleV3CareUiAfterTutorial(pendingAck)).toBe(false);

    // Live: shovel-ready after ack — must not wipe.
    const shovelReady = sampleV3({
      reserves: emptyReserves,
      careCycle: {
        ...sampleV3().careCycle,
        status: "ready",
        readyToFinish: true,
        allCompleted: true,
        activities: {
          water: { completed: true, presetSeconds: 5, skill: 1 },
          sun: { completed: true, presetSeconds: 5, skill: 1 },
          fertilizer: { completed: true, presetSeconds: 5, skill: 1 },
        },
      },
    });
    expect(shouldClearStaleV3CareUiAfterTutorial(shovelReady)).toBe(false);

    const midCare = sampleV3({
      reserves: {
        water: { seconds: 0, capacitySeconds: 20, playable: false },
        sun: { seconds: 8, capacitySeconds: 20, playable: true },
        fertilizer: { seconds: 5, capacitySeconds: 20, playable: true },
      },
      careCycle: {
        ...sampleV3().careCycle,
        status: "in_progress",
        activities: {
          water: { completed: true, presetSeconds: 5, skill: 1 },
          sun: { completed: false, presetSeconds: null, skill: null },
          fertilizer: { completed: false, presetSeconds: null, skill: null },
        },
      },
    });
    // Still has reserves — do not wipe a live Care cycle.
    expect(shouldClearStaleV3CareUiAfterTutorial(midCare)).toBe(false);
  });
});
