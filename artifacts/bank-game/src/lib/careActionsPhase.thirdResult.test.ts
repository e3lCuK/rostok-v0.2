import { describe, expect, it } from "vitest";
import {
  CARE_FILL_ANIMATION_MS,
  CARE_RESULT_HOLD_MS,
  CARE_TO_SHOVEL_MS,
  areDisplayFillsAtTargets,
  displayFillsForCompletedReveal,
  reduceCareActionsPhase,
  shouldStartCareTransition,
  carePhaseShowsShovel,
} from "./careActionsPhase";

describe("third activity result must show before «Уход»", () => {
  it("1. after third minigame all_done → activities_completed, not care_button", () => {
    const phase = reduceCareActionsPhase("activities", { type: "all_done" });
    expect(phase).toBe("activities_completed");
    expect(carePhaseShowsShovel(phase)).toBe(false);
  });

  it("2. «Уход» absent until transition_finished", () => {
    let p = reduceCareActionsPhase("activities", { type: "all_done" });
    expect(carePhaseShowsShovel(p)).toBe(false);
    p = reduceCareActionsPhase(p, { type: "start_transition" });
    expect(carePhaseShowsShovel(p)).toBe(false);
    p = reduceCareActionsPhase(p, { type: "transition_finished" });
    expect(carePhaseShowsShovel(p)).toBe(true);
  });

  it("3. last cube forced to 0% then target for CSS transition", () => {
    const targets = { water: 40, sun: 70, fertilizer: 55 };
    const initial = displayFillsForCompletedReveal({
      targets,
      lastCompleted: "fertilizer",
    });
    expect(initial).toEqual({ water: 40, sun: 70, fertilizer: 0 });
    expect(initial.fertilizer).not.toBe(55);
  });

  it("4. care_transition blocked until allResultsPresented", () => {
    expect(
      shouldStartCareTransition({
        phase: "activities_completed",
        allResultsPresented: false,
      }),
    ).toBe(false);
    expect(
      shouldStartCareTransition({
        phase: "activities_completed",
        allResultsPresented: true,
      }),
    ).toBe(true);
  });

  it("5. after presented, all three at targets", () => {
    const targets = { water: 40, sun: 70, fertilizer: 55 };
    const display = { water: 40, sun: 70, fertilizer: 55 };
    expect(areDisplayFillsAtTargets(display, targets)).toBe(true);
  });

  it("6. converge only from activities_completed via start_transition", () => {
    const p = reduceCareActionsPhase("activities_completed", {
      type: "start_transition",
    });
    expect(p).toBe("care_transition");
  });

  it("7. «Уход» only after care_transition finishes", () => {
    const p = reduceCareActionsPhase("care_transition", {
      type: "transition_finished",
    });
    expect(p).toBe("care_button");
    expect(CARE_TO_SHOVEL_MS).toBeGreaterThan(0);
  });

  it("8. all_done never jumps to care_button (no direct third→Уход)", () => {
    expect(reduceCareActionsPhase("activities", { type: "all_done" })).not.toBe(
      "care_button",
    );
    // Even repeated all_done / snapshot stays on completed
    expect(
      reduceCareActionsPhase("activities_completed", { type: "all_done" }),
    ).toBe("activities_completed");
  });

  it("9. Tutorial and main share all_done → completed (same order)", () => {
    const tutorial = reduceCareActionsPhase("activities", { type: "all_done" });
    const main = reduceCareActionsPhase("activities", { type: "all_done" });
    expect(tutorial).toBe(main);
    expect(tutorial).toBe("activities_completed");
  });

  it("10. snapshot all_done does not skip to shovel or clear third stage", () => {
    let p = reduceCareActionsPhase("activities", { type: "all_done" });
    p = reduceCareActionsPhase(p, { type: "all_done" });
    expect(p).toBe("activities_completed");
    expect(
      shouldStartCareTransition({
        phase: p,
        allResultsPresented: false,
      }),
    ).toBe(false);
    expect(CARE_FILL_ANIMATION_MS).toBe(900);
    expect(CARE_RESULT_HOLD_MS).toBe(300);
  });
});
