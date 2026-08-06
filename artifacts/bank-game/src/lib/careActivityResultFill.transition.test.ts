import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityResultFillPercent,
  isCareActivityCubeDone,
  revealFillHeightsStep,
  scheduleFillHeightReveal,
  targetsToDisplayFills,
  zeroDisplayFills,
} from "./careActivityResultFill";
import {
  CARE_FILL_ANIMATION_MS,
  careCompletedToTransitionDelayMs,
  carePhaseShowsShovel,
  reduceCareActionsPhase,
} from "./careActionsPhase";

describe("Care fill CSS transition 0% → target%", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        return setTimeout(() => cb(performance.now()), 0) as unknown as number;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("initial rendered fill = 0%", () => {
    const targets = { water: 40, sun: 70, fertilizer: 55 };
    expect(revealFillHeightsStep("initial", targets)).toEqual(
      zeroDisplayFills(),
    );
  });

  it("after next frame = target%", () => {
    const targets = { water: 40, sun: 70, fertilizer: 55 };
    expect(revealFillHeightsStep("after_frame", targets)).toEqual(
      targetsToDisplayFills(targets),
    );
  });

  it("scheduleFillHeightReveal applies targets on second frame (same logical node)", () => {
    const heights: { current: ReturnType<typeof zeroDisplayFills> } = {
      current: zeroDisplayFills(),
    };
    const targets = { water: 30, sun: 0, fertilizer: 100 };
    // First paint: zeros (DOM node already present at 0%)
    expect(heights.current.water).toBe(0);
    const cancel = scheduleFillHeightReveal(() => {
      heights.current = targetsToDisplayFills(targets);
    });
    // Before frames: still 0
    expect(heights.current.fertilizer).toBe(0);
    vi.runAllTimers();
    expect(heights.current).toEqual({ water: 30, sun: 0, fertilizer: 100 });
    cancel();
  });

  it("transition delay still blocks «Уход» until fill duration", () => {
    let phase = reduceCareActionsPhase("activities", { type: "all_done" });
    expect(phase).toBe("activities_completed");
    expect(carePhaseShowsShovel(phase)).toBe(false);
    expect(careCompletedToTransitionDelayMs()).toBeGreaterThanOrEqual(
      CARE_FILL_ANIMATION_MS,
    );
  });

  it("forceCompleted / completion flag does not invent 100% fill", () => {
    expect(
      isCareActivityCubeDone({ fillPercent: null, completedFlag: true }),
    ).toBe(true);
    expect(activityResultFillPercent(0)).toBe(0);
    expect(activityResultFillPercent(47)).toBe(47);
    expect(revealFillHeightsStep("after_frame", {
      water: 47,
      sun: null,
      fertilizer: null,
    }).water).toBe(47);
  });

  it("CSS contract: height changes from 0 to target (not mount-at-target)", () => {
    const first = revealFillHeightsStep("initial", {
      water: 80,
      sun: 80,
      fertilizer: 80,
    });
    const second = revealFillHeightsStep("after_frame", {
      water: 80,
      sun: 80,
      fertilizer: 80,
    });
    expect(first.water).toBe(0);
    expect(second.water).toBe(80);
    expect(first.water).not.toBe(second.water);
  });
});
