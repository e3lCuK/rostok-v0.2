import { describe, expect, it } from "vitest";
import {
  CARE_FILL_ANIMATION_MS,
  CARE_RESULT_HOLD_MS,
  CARE_TO_SHOVEL_MS,
  careCompletedToTransitionDelayMs,
  carePhaseAtLeast,
  carePhaseIsConverging,
  carePhaseKeepsSessionBranch,
  carePhaseShowsShovel,
  initialCareActionsPhase,
  reduceCareActionsPhase,
  type CareActionsPhase,
} from "./careActionsPhase";

function advance(
  start: CareActionsPhase,
  events: Parameters<typeof reduceCareActionsPhase>[1][],
): CareActionsPhase {
  return events.reduce((p, e) => reduceCareActionsPhase(p, e), start);
}

describe("careActionsPhase — unidirectional Care → «Уход»", () => {
  it("1. after first completed activity, phase stays activities (card remains)", () => {
    const next = reduceCareActionsPhase("activities", {
      type: "activity_progress",
      completed: { water: true, sun: false, fertilizer: false },
    });
    expect(next).toBe("activities");
    expect(carePhaseShowsShovel(next)).toBe(false);
  });

  it("2. after second, still activities — no shovel yet", () => {
    const next = reduceCareActionsPhase("activities", {
      type: "activity_progress",
      completed: { water: true, sun: true, fertilizer: false },
    });
    expect(next).toBe("activities");
  });

  it("3. after third → activities_completed (trio completed-state)", () => {
    const next = reduceCareActionsPhase("activities", {
      type: "activity_progress",
      completed: { water: true, sun: true, fertilizer: true },
    });
    expect(next).toBe("activities_completed");
    expect(carePhaseKeepsSessionBranch(next)).toBe(true);
    expect(carePhaseShowsShovel(next)).toBe(false);
  });

  it("4. transition to «Уход» starts only once per cycle", () => {
    const path = advance("activities", [
      { type: "all_done" },
      { type: "start_transition" },
      { type: "start_transition" }, // duplicate ignored
      { type: "transition_finished" },
      { type: "start_transition" }, // cannot go back
      { type: "all_done" },
    ]);
    expect(path).toBe("care_button");
    expect(careCompletedToTransitionDelayMs()).toBe(
      CARE_FILL_ANIMATION_MS + CARE_RESULT_HOLD_MS,
    );
    expect(CARE_RESULT_HOLD_MS).toBeGreaterThanOrEqual(400);
    expect(CARE_RESULT_HOLD_MS).toBeLessThanOrEqual(600);
    expect(CARE_TO_SHOVEL_MS).toBeGreaterThanOrEqual(700);
    expect(CARE_TO_SHOVEL_MS).toBeLessThanOrEqual(1000);
  });

  it("5. cards cannot return to activities after transition begins", () => {
    const mid = advance("activities", [
      { type: "all_done" },
      { type: "start_transition" },
    ]);
    expect(carePhaseIsConverging(mid)).toBe(true);
    expect(
      reduceCareActionsPhase(mid, {
        type: "activity_progress",
        completed: { water: false, sun: false, fertilizer: false },
      }),
    ).toBe("care_transition");
    expect(
      reduceCareActionsPhase(mid, {
        type: "activity_progress",
        completed: { water: true, sun: true, fertilizer: true },
      }),
    ).toBe("care_transition");
  });

  it("6. snapshot/rerender all_done after completed does not regress phase", () => {
    const completed = reduceCareActionsPhase("activities_completed", {
      type: "all_done",
    });
    expect(completed).toBe("activities_completed");
    const onButton = reduceCareActionsPhase("care_button", {
      type: "activity_progress",
      completed: { water: true, sun: true, fertilizer: true },
    });
    expect(onButton).toBe("care_button");
    expect(carePhaseAtLeast(onButton, "activities_completed")).toBe(true);
  });

  it("7. Tutorial uses the same all_done → transition → shovel path", () => {
    const tutorial = advance("activities", [
      { type: "all_done" },
      { type: "start_transition" },
      { type: "transition_finished" },
    ]);
    expect(tutorial).toBe("care_button");
  });

  it("8. F5 allCompleted → activities_completed (filled trio), not instant shovel", () => {
    expect(
      initialCareActionsPhase({
        hasUnclaimedPending: false,
        midCare: false,
        allCompleted: true,
      }),
    ).toBe("activities_completed");
    expect(
      reduceCareActionsPhase("activities", { type: "restore_shovel" }),
    ).toBe("care_button");
  });

  it("9. Metelka blocked while phase past activities (awaiting «Уход»)", () => {
    expect(carePhaseKeepsSessionBranch("activities")).toBe(false);
    expect(carePhaseKeepsSessionBranch("activities_completed")).toBe(true);
    expect(carePhaseKeepsSessionBranch("care_transition")).toBe(true);
    expect(carePhaseKeepsSessionBranch("care_button")).toBe(true);
  });
});
