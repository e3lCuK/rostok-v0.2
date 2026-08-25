import { describe, expect, it } from "vitest";
import {
  activityFillPercentFromV3Skill,
  activityResultFillPercent,
  resolveActivitySkillFillPercent,
  allActivityFillsPresent,
  careShovelFillPercent,
  hasActivityResultFill,
  isCareActivityCubeDone,
  mergeActivityFillPercent,
  resolveCareShovelFillPercent,
} from "./careActivityResultFill";
import {
  CARE_FILL_ANIMATION_MS,
  CARE_RESULT_HOLD_MS,
  CARE_TO_SHOVEL_MS,
  careCompletedToTransitionDelayMs,
  reduceCareActionsPhase,
} from "./careActionsPhase";

describe("careActivityResultFill — итоговое заполнение кубиков", () => {
  it("1. Water fill from actual result", () => {
    expect(activityResultFillPercent(30)).toBe(30);
    expect(
      isCareActivityCubeDone({ fillPercent: 30, completedFlag: true }),
    ).toBe(true);
  });

  it("2. Sun fill from actual result", () => {
    expect(activityResultFillPercent(70)).toBe(70);
    expect(hasActivityResultFill(70)).toBe(true);
  });

  it("3. Fertilizer / leaf fill from actual result", () => {
    expect(activityResultFillPercent(100)).toBe(100);
    expect(
      isCareActivityCubeDone({ fillPercent: 100, completedFlag: false }),
    ).toBe(true);
  });

  it("4. percent comes from skill result (no alternate formula)", () => {
    expect(activityResultFillPercent(42)).toBe(42);
    expect(activityResultFillPercent(0)).toBe(0);
    expect(activityResultFillPercent(100)).toBe(100);
  });

  it("4b. completed button fill prefers local %, else cycle skill (0 is valid)", () => {
    expect(
      resolveActivitySkillFillPercent({ localPct: 72, cycleSkill: 0.1 }),
    ).toBe(72);
    expect(
      resolveActivitySkillFillPercent({ localPct: 0, cycleSkill: 0.9 }),
    ).toBe(0);
    expect(
      resolveActivitySkillFillPercent({ localPct: null, cycleSkill: 0.4 }),
    ).toBe(40);
    expect(
      resolveActivitySkillFillPercent({ localPct: null, cycleSkill: 0 }),
    ).toBe(0);
    expect(
      resolveActivitySkillFillPercent({ localPct: null, cycleSkill: null }),
    ).toBeNull();
  });

  it("5. completed cube stays non-empty; null next does not clear fill", () => {
    expect(mergeActivityFillPercent(65, null)).toBe(65);
    expect(mergeActivityFillPercent(65, undefined)).toBe(65);
    expect(hasActivityResultFill(65)).toBe(true);
    expect(hasActivityResultFill(null)).toBe(false);
  });

  it("6. after three activities all fills present", () => {
    expect(
      allActivityFillsPresent({
        water: 40,
        sun: 80,
        fertilizer: 55,
      }),
    ).toBe(true);
  });

  it("7. one transition to «Уход» after fill + hold", () => {
    expect(careCompletedToTransitionDelayMs()).toBe(
      CARE_FILL_ANIMATION_MS + CARE_RESULT_HOLD_MS,
    );
    expect(CARE_RESULT_HOLD_MS).toBeGreaterThanOrEqual(250);
    expect(CARE_RESULT_HOLD_MS).toBeLessThanOrEqual(350);
    const path = [
      { type: "all_done" as const },
      { type: "start_transition" as const },
      { type: "start_transition" as const },
      { type: "transition_finished" as const },
    ].reduce(
      (p, e) => reduceCareActionsPhase(p, e),
      "activities" as const,
    );
    expect(path).toBe("care_button");
    expect(CARE_TO_SHOVEL_MS).toBeLessThanOrEqual(450);
  });

  it("8. snapshot/rerender merge does not reset fill", () => {
    expect(mergeActivityFillPercent(90, null)).toBe(90);
    expect(mergeActivityFillPercent(90, 90)).toBe(90);
  });

  it("9. Tutorial and main game share the same fill mapping", () => {
    // Same helper used for both paths — skillScore → percent.
    const tutorial = activityResultFillPercent(83);
    const main = activityResultFillPercent(83);
    expect(tutorial).toBe(main);
    expect(tutorial).toBe(83);
  });

  it("9b. «Уход» shovel fill = mean of three activity results (live + tutorial)", () => {
    expect(careShovelFillPercent(30, 60, 90)).toBe(60);
    expect(careShovelFillPercent(100, 100, 100)).toBe(100);
    expect(careShovelFillPercent(null, null, null)).toBe(0);
    expect(careShovelFillPercent(50, null, 50)).toBe(33);
  });

  it("9c. shovel fill hydrates from cycle skills / average when local fills missing", () => {
    expect(activityFillPercentFromV3Skill(0.7)).toBe(70);
    expect(
      resolveCareShovelFillPercent({
        waterPct: null,
        sunPct: null,
        fertilizerPct: null,
        cycleActivities: {
          water: { skill: 0.3 },
          sun: { skill: 0.6 },
          fertilizer: { skill: 0.9 },
        },
      }),
    ).toBe(60);
    expect(
      resolveCareShovelFillPercent({
        waterPct: null,
        sunPct: null,
        fertilizerPct: null,
        averageSkill: 0.55,
      }),
    ).toBe(55);
  });

  it("10. no ghost remount in phase machine (unidirectional only)", () => {
    const mid = reduceCareActionsPhase("activities_completed", {
      type: "start_transition",
    });
    expect(mid).toBe("care_transition");
    expect(
      reduceCareActionsPhase(mid, {
        type: "activity_progress",
        completed: { water: false, sun: false, fertilizer: false },
      }),
    ).toBe("care_transition");
  });
});
