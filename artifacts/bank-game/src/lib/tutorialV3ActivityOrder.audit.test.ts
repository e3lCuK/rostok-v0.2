/**
 * Economy v3 tutorial Care activities — free order (product A).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import { canStartV3CareActivity } from "./v3CareClient";
import {
  getV3CareActivitiesCompleted,
  nextV3TutorialStepFromCompletedActivities,
  resolveV3TutorialStepFromServer,
  tutorialRecommendedV3Activity,
  type TutorialStep,
} from "./tutorialFlow";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const flowSrc = readFileSync(join(here, "tutorialFlow.ts"), "utf8");

type Kind = "water" | "sun" | "fertilizer";

function sampleV3(
  overrides: Record<string, unknown> = {},
): EconomyV3RootsState {
  const raw = {
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
        frozen: true,
      },
      sun: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
        transferred: true,
        frozen: true,
      },
      fertilizer: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
        transferred: true,
        frozen: true,
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
      fertilizer: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
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
      // Post-trio: freeze markers cleared after the 3rd transfer.
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

function afterCompleted(done: Kind[]): EconomyV3RootsState {
  const base = sampleV3();
  const reserves = { ...base.reserves };
  const avail = { ...base.careAvailability };
  const activities = {
    water: { ...base.careCycle.activities.water },
    sun: { ...base.careCycle.activities.sun },
    fertilizer: { ...base.careCycle.activities.fertilizer },
  };
  for (const k of done) {
    reserves[k] = { seconds: 0, capacitySeconds: 20, playable: false };
    avail[k] = {
      reserveSeconds: 0,
      playable: false,
      maxPresetSeconds: 0,
    };
    activities[k] = {
      completed: true,
      presetSeconds: 5,
      skill: 0.7,
    };
  }
  return sampleV3({
    reserves,
    careAvailability: avail,
    careCycle: {
      ...base.careCycle,
      startedAt: "2026-07-25T12:00:00.000Z",
      status: done.length === 3 ? "ready" : "in_progress",
      allCompleted: done.length === 3,
      readyToFinish: done.length === 3,
      activities,
    },
  });
}

/**
 * Mirror of GamePage v3 CareActionsRow click gating after free-order fix:
 * playable + canStart ⇒ handler attached (pulse never strips onClick).
 */
function tutorialActivityHasClickHandler(input: {
  tutorialDone: boolean;
  tutorialStep: TutorialStep;
  useV3: boolean;
  btnKey: Kind;
  v3CanStart: boolean;
}): boolean {
  const { tutorialDone, useV3, v3CanStart } = input;
  if (tutorialDone) return v3CanStart;
  if (useV3) return v3CanStart;
  return false;
}

function activityRowMounted(tutorialStep: TutorialStep): boolean {
  return tutorialStep !== "complete";
}

function remainingPlayable(snap: EconomyV3RootsState): Kind[] {
  return (["water", "sun", "fertilizer"] as const).filter((k) =>
    canStartV3CareActivity({ activity: k, v3Roots: snap, busy: false }),
  );
}

describe("v3 tutorial activity free order", () => {
  it("step comes from completed set, not last activity kind", () => {
    expect(flowSrc).toContain("getV3CareActivitiesCompleted");
    expect(flowSrc).toContain("nextV3TutorialStepFromCompletedActivities");
    expect(flowSrc).not.toMatch(
      /if \(kind === "water"\) return "sun-intro"/,
    );
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: false,
        sun: true,
        fertilizer: false,
      }),
    ).toBe("v3-activities-intro");
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: false,
        sun: false,
        fertilizer: true,
      }),
    ).toBe("v3-activities-intro");
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: true,
        sun: true,
        fertilizer: true,
      }),
    ).toBe("complete");
  });

  it("GamePage: v3 onClick is canStart-gated; pulse is recommendation only", () => {
    expect(pageSrc).toContain("pulse is recommendation only");
    expect(pageSrc).toContain("tutorialRecommendedV3Activity");
    expect(pageSrc).toContain("nextV3TutorialStepFromCompletedActivities");
    // v3 path must not strip onClick via isPulsing-only branch.
    expect(pageSrc).not.toMatch(
      /useV3[\s\S]{0,200}isTutorialPhase\s*\?\s*isPulsing\s*\?[\s\S]*?:\s*undefined/,
    );
  });

  it("after Sun: Water and Fertilizer stay startable and click-handled", () => {
    const snap = afterCompleted(["sun"]);
    const step = resolveV3TutorialStepFromServer({
      tutorialDone: false,
      v3Roots: snap,
    });
    expect(step).toBe("v3-activities-intro");
    expect(remainingPlayable(snap).sort()).toEqual(["fertilizer", "water"]);
    for (const btn of ["water", "fertilizer"] as const) {
      const canStart = canStartV3CareActivity({
        activity: btn,
        v3Roots: snap,
        busy: false,
      });
      expect(canStart).toBe(true);
      expect(
        tutorialActivityHasClickHandler({
          tutorialDone: false,
          tutorialStep: step,
          useV3: true,
          btnKey: btn,
          v3CanStart: canStart,
        }),
      ).toBe(true);
    }
  });

  it("after Fertilizer: Water and Sun stay clickable; not complete", () => {
    const snap = afterCompleted(["fertilizer"]);
    const step = resolveV3TutorialStepFromServer({
      tutorialDone: false,
      v3Roots: snap,
    });
    expect(step).toBe("v3-activities-intro");
    expect(activityRowMounted(step)).toBe(true);
    expect(remainingPlayable(snap).sort()).toEqual(["sun", "water"]);
    for (const btn of ["water", "sun"] as const) {
      expect(
        tutorialActivityHasClickHandler({
          tutorialDone: false,
          tutorialStep: step,
          useV3: true,
          btnKey: btn,
          v3CanStart: true,
        }),
      ).toBe(true);
    }
  });

  it("complete only when all three activities completed", () => {
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterCompleted(["sun", "fertilizer"]),
      }),
    ).toBe("v3-activities-intro");
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterCompleted(["fertilizer"]),
      }),
    ).toBe("v3-activities-intro");
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterCompleted(["water", "sun", "fertilizer"]),
      }),
    ).toBe("complete");
  });

  it("all six orders reach complete without stuck / dead clicks", () => {
    const orders: Kind[][] = [
      ["water", "sun", "fertilizer"],
      ["water", "fertilizer", "sun"],
      ["sun", "water", "fertilizer"],
      ["sun", "fertilizer", "water"],
      ["fertilizer", "water", "sun"],
      ["fertilizer", "sun", "water"],
    ];

    for (const order of orders) {
      let done: Kind[] = [];
      for (let i = 0; i < order.length; i++) {
        done = [...done, order[i]!];
        const snap = afterCompleted(done);
        const completed = getV3CareActivitiesCompleted(snap);
        const liveStep = nextV3TutorialStepFromCompletedActivities(completed);
        const resolveStep = resolveV3TutorialStepFromServer({
          tutorialDone: false,
          v3Roots: snap,
        });
        expect(liveStep, `${order.join("→")} live after ${done.join("+")}`).toBe(
          resolveStep,
        );

        if (done.length < 3) {
          expect(liveStep).toBe("v3-activities-intro");
          expect(activityRowMounted(liveStep)).toBe(true);
          const remaining = remainingPlayable(snap);
          expect(remaining.length).toBe(3 - done.length);
          for (const btn of remaining) {
            expect(
              tutorialActivityHasClickHandler({
                tutorialDone: false,
                tutorialStep: liveStep,
                useV3: true,
                btnKey: btn,
                v3CanStart: true,
              }),
              `${order.join("→")}: ${btn} dead click after ${done.join("+")}`,
            ).toBe(true);
          }
          // Pulse recommendation is among remaining, never a completed one.
          const recommend = tutorialRecommendedV3Activity(completed);
          expect(recommend).not.toBeNull();
          expect(done).not.toContain(recommend);
        } else {
          expect(liveStep).toBe("complete");
        }
      }
    }
  });

  it("F5 recovery works for any partial completion order", () => {
    const partials: Kind[][] = [
      ["sun"],
      ["fertilizer"],
      ["water", "fertilizer"],
      ["sun", "fertilizer"],
      ["water", "sun"],
    ];
    for (const done of partials) {
      const snap = afterCompleted(done);
      expect(
        resolveV3TutorialStepFromServer({
          tutorialDone: false,
          v3Roots: snap,
        }),
        `F5 after ${done.join("+")}`,
      ).toBe("v3-activities-intro");
      expect(remainingPlayable(snap).length).toBe(3 - done.length);
    }
  });

  it("at v3-activities-intro all three can start", () => {
    const snap = sampleV3();
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: snap,
      }),
    ).toBe("v3-activities-intro");
    for (const btn of ["water", "sun", "fertilizer"] as const) {
      expect(
        canStartV3CareActivity({
          activity: btn,
          v3Roots: snap,
          busy: false,
        }),
      ).toBe(true);
      expect(
        tutorialActivityHasClickHandler({
          tutorialDone: false,
          tutorialStep: "v3-activities-intro",
          useV3: true,
          btnKey: btn,
          v3CanStart: true,
        }),
      ).toBe(true);
    }
  });
});
