/**
 * Tutorial v3: all roots first, then all activities.
 * Activity icons stay grey until all three reserves are ready.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  isV3ActivityButtonVisuallyLocked,
  resolveV3ActivityCard,
  shouldThemeV3ActivityButton,
} from "./v3ActivityCards";
import {
  areV3TutorialAllReservesReady,
  isV3TutorialActivitiesInteractionLocked,
  nextV3TutorialStepFromCompletedActivities,
  nextV3TutorialStepAfterRootTransfer,
  resolveV3TutorialStepFromServer,
  v3TutorialOverlayConfig,
} from "./tutorialFlow";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");

function sampleV3(
  overrides: Record<string, unknown> = {},
): EconomyV3RootsState {
  const raw = {
    enabled: true,
    dailyCapSeconds: 20,
    dayKey: "2026-07-25",
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

function transferredRoot(
  kind: "water" | "sun" | "fertilizer",
  list: Array<"water" | "sun" | "fertilizer">,
): Record<string, unknown> {
  const base = sampleV3();
  const reserves = { ...base.reserves };
  const availability = { ...base.careAvailability };
  const roots = { ...base.roots };
  for (const k of list) {
    reserves[k] = { seconds: 5, capacitySeconds: 20, playable: true };
    availability[k] = {
      reserveSeconds: 5,
      playable: true,
      maxPresetSeconds: 5,
    };
    roots[k] = {
      ...base.roots[k],
      seconds: 0,
      fullSegments: 0,
      fillFraction: 0,
      playableFromRoot: false,
      transferred: true,
      frozen: true,
    };
  }
  return {
    reserves,
    careAvailability: availability,
    roots,
    generation: {
      ...base.generation,
      firstTransferredRoot: list[0] ?? kind,
      transferredRoots: list,
      frozenAt: "t",
      insuranceDeadlineAt: "t2",
    },
  };
}

describe("tutorial v3: all roots then all activities", () => {
  it("1. requires three roots in a row; Care activities free order after that", () => {
    expect(nextV3TutorialStepAfterRootTransfer("water")).toBe("v3-root-sun");
    expect(nextV3TutorialStepAfterRootTransfer("sun")).toBe(
      "v3-root-fertilizer",
    );
    expect(nextV3TutorialStepAfterRootTransfer("fertilizer")).toBe(
      "v3-activities-intro",
    );
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: true,
        sun: false,
        fertilizer: false,
      }),
    ).toBe("v3-activities-intro");
    expect(
      nextV3TutorialStepFromCompletedActivities({
        water: false,
        sun: true,
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

  it("2–3. activities stay locked after 1st and 2nd transfer", () => {
    const afterWater = sampleV3(transferredRoot("water", ["water"]));
    expect(areV3TutorialAllReservesReady(afterWater)).toBe(false);
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterWater,
      }),
    ).toBe("v3-root-sun");
    expect(isV3TutorialActivitiesInteractionLocked("v3-root-sun", false)).toBe(
      true,
    );
    expect(
      shouldThemeV3ActivityButton(resolveV3ActivityCard("water", afterWater)),
    ).toBe(true); // reserve exists…
    // Same as live rootsCollectionLocked: bright --ac, clicks gated separately
    expect(
      isV3ActivityButtonVisuallyLocked(
        resolveV3ActivityCard("water", afterWater),
        true,
      ),
    ).toBe(false);

    const afterSun = sampleV3(transferredRoot("sun", ["water", "sun"]));
    expect(areV3TutorialAllReservesReady(afterSun)).toBe(false);
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterSun,
      }),
    ).toBe("v3-root-fertilizer");
    expect(
      isV3TutorialActivitiesInteractionLocked("v3-root-fertilizer", false),
    ).toBe(true);
  });

  it("4–5. after third transfer all three activities unlock together", () => {
    const afterAll = sampleV3(
      transferredRoot("fertilizer", ["water", "sun", "fertilizer"]),
    );
    expect(areV3TutorialAllReservesReady(afterAll)).toBe(true);
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterAll,
      }),
    ).toBe("v3-activities-intro");
    expect(
      isV3TutorialActivitiesInteractionLocked("v3-activities-intro", false),
    ).toBe(false);

    for (const kind of ["water", "sun", "fertilizer"] as const) {
      const card = resolveV3ActivityCard(kind, afterAll);
      expect(card.playable).toBe(true);
      expect(shouldThemeV3ActivityButton(card)).toBe(true);
      expect(isV3ActivityButtonVisuallyLocked(card, false)).toBe(false);
    }
  });

  it("6. F5 recovery stays on roots until all three, then activities", () => {
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: sampleV3(transferredRoot("water", ["water"])),
      }),
    ).toBe("v3-root-sun");

    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: sampleV3(
          transferredRoot("fertilizer", ["water", "sun", "fertilizer"]),
        ),
      }),
    ).toBe("v3-activities-intro");

    const afterWaterActivity = sampleV3({
      ...transferredRoot("fertilizer", ["water", "sun", "fertilizer"]),
      reserves: {
        water: { seconds: 0, capacitySeconds: 20, playable: false },
        sun: { seconds: 5, capacitySeconds: 20, playable: true },
        fertilizer: { seconds: 5, capacitySeconds: 20, playable: true },
      },
      careAvailability: {
        water: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
        sun: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
        fertilizer: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
      },
      careCycle: {
        ...sampleV3().careCycle,
        activities: {
          water: { completed: true, presetSeconds: 5, skill: 0.7 },
          sun: { completed: false, presetSeconds: null, skill: null },
          fertilizer: { completed: false, presetSeconds: null, skill: null },
        },
      },
    });
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterWaterActivity,
      }),
    ).toBe("v3-activities-intro");

    const afterSunOnly = sampleV3({
      ...transferredRoot("fertilizer", ["water", "sun", "fertilizer"]),
      reserves: {
        water: { seconds: 5, capacitySeconds: 20, playable: true },
        sun: { seconds: 0, capacitySeconds: 20, playable: false },
        fertilizer: { seconds: 5, capacitySeconds: 20, playable: true },
      },
      careAvailability: {
        water: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
        sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
        fertilizer: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
      },
      careCycle: {
        ...sampleV3().careCycle,
        startedAt: "2026-07-25T12:00:00.000Z",
        status: "in_progress",
        activities: {
          water: { completed: false, presetSeconds: null, skill: null },
          sun: { completed: true, presetSeconds: 5, skill: 0.7 },
          fertilizer: { completed: false, presetSeconds: null, skill: null },
        },
      },
    });
    expect(
      resolveV3TutorialStepFromServer({
        tutorialDone: false,
        v3Roots: afterSunOnly,
      }),
    ).toBe("v3-activities-intro");
  });

  it("activity-phase overlay remains; root-phase has collect-energy card", () => {
    expect(v3TutorialOverlayConfig("v3-root-water")).toEqual({
      icon: "energy",
      text: "Соберите энергию из\u00A0корней",
      hint: "Нажмите на\u00A0корневые ячейки по\u00A0очереди.",
      accent: "#c9920a",
    });
    expect(
      v3TutorialOverlayConfig("v3-activities-intro", {
        recommendedActivity: "water",
      }),
    ).toEqual({
      icon: "water",
      text: "Пройдите активность",
      hint: "Ловите капли воды.",
      accent: "#2b7fff",
    });
    expect(
      v3TutorialOverlayConfig("v3-activities-intro", {
        recommendedActivity: "sun",
      }),
    ).toEqual({
      icon: "sun",
      text: "Пройдите активность",
      hint: "Собирайте солнечные лучи.",
      accent: "#ffc107",
    });
    expect(
      v3TutorialOverlayConfig("v3-activities-intro", {
        recommendedActivity: "fertilizer",
      }),
    ).toEqual({
      icon: "fertilizer",
      text: "Пройдите активность",
      hint: "Собирайте гранулы в\u00A0ряд.",
      accent: "#f0a020",
    });
    expect(pageSrc).toContain(
      "after roots, all playable activities stay clickable",
    );
    expect(pageSrc).toContain("pulse is recommendation only");
  });
});

