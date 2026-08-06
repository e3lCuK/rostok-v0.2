import { describe, expect, it } from "vitest";
import {
  activityResultFillPercent,
  isCareActivityCubeDone,
  mergeActivityFillPercent,
} from "./careActivityResultFill";
import {
  CARE_FILL_ANIMATION_MS,
  CARE_RESULT_HOLD_MS,
  CARE_TO_SHOVEL_MS,
  careCompletedToTransitionDelayMs,
  carePhaseShowsShovel,
  displayFillsForCompletedReveal,
  reduceCareActionsPhase,
  shouldStartCareTransition,
} from "./careActionsPhase";

/** Simulate GamePage gate: no converge until presented, then hold, then transition. */
function advanceAfterPresented(
  presented: boolean,
  holdElapsed: number,
  transitionElapsed = 0,
) {
  let phase = reduceCareActionsPhase("activities", { type: "all_done" });
  if (
    !shouldStartCareTransition({
      phase,
      allResultsPresented: presented,
    })
  ) {
    return phase;
  }
  if (holdElapsed < CARE_RESULT_HOLD_MS) return phase;
  phase = reduceCareActionsPhase(phase, { type: "start_transition" });
  if (transitionElapsed < CARE_TO_SHOVEL_MS) return phase;
  return reduceCareActionsPhase(phase, { type: "transition_finished" });
}

describe("Care third-activity → fill → «Уход» timing", () => {
  it("1. after third activity phase is activities_completed, not care_button", () => {
    const phase = reduceCareActionsPhase("activities", { type: "all_done" });
    expect(phase).toBe("activities_completed");
    expect(carePhaseShowsShovel(phase)).toBe(false);
  });

  it("2–3. trio fill heights match actual results (DOM contract via data)", () => {
    const fills = {
      water: activityResultFillPercent(40),
      sun: activityResultFillPercent(70),
      fertilizer: activityResultFillPercent(55),
    };
    expect(fills).toEqual({ water: 40, sun: 70, fertilizer: 55 });
    const dom = (["water", "sun", "fertilizer"] as const).map((key) => ({
      "data-care-activity": key,
      "data-care-fill": String(fills[key]),
    }));
    expect(dom).toHaveLength(3);
  });

  it("4. before third fill presented, shovel must not appear", () => {
    expect(advanceAfterPresented(false, 10_000)).toBe("activities_completed");
    expect(carePhaseShowsShovel(advanceAfterPresented(false, 10_000))).toBe(
      false,
    );
  });

  it("5. after presented + hold → care_transition", () => {
    expect(advanceAfterPresented(true, CARE_RESULT_HOLD_MS)).toBe(
      "care_transition",
    );
  });

  it("6. only after transition duration → care_button «Уход»", () => {
    expect(
      advanceAfterPresented(true, CARE_RESULT_HOLD_MS, CARE_TO_SHOVEL_MS - 1),
    ).toBe("care_transition");
    expect(
      advanceAfterPresented(true, CARE_RESULT_HOLD_MS, CARE_TO_SHOVEL_MS),
    ).toBe("care_button");
  });

  it("7. third activity non-zero result → non-zero fill target", () => {
    const fill = activityResultFillPercent(63);
    expect(fill).toBe(63);
    const reveal = displayFillsForCompletedReveal({
      targets: { water: 40, sun: 70, fertilizer: 63 },
      lastCompleted: "fertilizer",
    });
    expect(reveal.fertilizer).toBe(0);
    expect(reveal.water).toBe(40);
  });

  it("8. forceCompleted must not invent 100% or wipe real fill", () => {
    expect(
      isCareActivityCubeDone({ fillPercent: null, completedFlag: true }),
    ).toBe(true);
    expect(activityResultFillPercent(30)).toBe(30);
    expect(mergeActivityFillPercent(30, null)).toBe(30);
  });

  it("9. Tutorial uses the same presented→hold→transition chain", () => {
    expect(advanceAfterPresented(true, CARE_RESULT_HOLD_MS, CARE_TO_SHOVEL_MS)).toBe(
      "care_button",
    );
  });

  it("10. snapshot all_done does not skip presented gate", () => {
    let phase = reduceCareActionsPhase("activities", { type: "all_done" });
    phase = reduceCareActionsPhase(phase, { type: "all_done" });
    expect(phase).toBe("activities_completed");
    expect(
      shouldStartCareTransition({
        phase,
        allResultsPresented: false,
      }),
    ).toBe(false);
    expect(CARE_FILL_ANIMATION_MS).toBe(900);
  });

  it("F5 / reduced-motion still requires presented gate (hold only)", () => {
    expect(
      careCompletedToTransitionDelayMs({ skipFillAnimation: true }),
    ).toBe(CARE_RESULT_HOLD_MS);
    expect(
      careCompletedToTransitionDelayMs({ reducedMotion: true }),
    ).toBe(CARE_RESULT_HOLD_MS);
    // Without presented, even long wait stays on completed
    expect(advanceAfterPresented(false, CARE_RESULT_HOLD_MS * 5)).toBe(
      "activities_completed",
    );
  });
});
