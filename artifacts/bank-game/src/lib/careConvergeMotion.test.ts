import { describe, expect, it } from "vitest";
import { CARE_TO_SHOVEL_MS } from "./careActionsPhase";
import {
  CARE_CONVERGE_TRANSITION,
  CARE_DIVERGE_MS,
  careConvergeSlotForIndex,
  careShovelConvergeAnimate,
  careShovelConvergeInitial,
  careShovelConvergeTransition,
  careTrioConvergeAnimate,
  careTrioConvergeTransition,
  careTrioDivergeInitial,
  careTrioDivergeTransition,
} from "./careConvergeMotion";

describe("careConvergeMotion", () => {
  it("resting trio is identity", () => {
    expect(careTrioConvergeAnimate(false, "left", "x")).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
    });
  });

  it("merging uses a single end pose (no mid keyframes / stall)", () => {
    const left = careTrioConvergeAnimate(true, "left", "x");
    expect(typeof left.x).toBe("number");
    expect(left.x).toBeGreaterThan(0);
    expect(left.opacity).toBe(0);
    expect(Array.isArray(left.x)).toBe(false);
    const right = careTrioConvergeAnimate(true, "right", "x");
    expect(right.x).toBeLessThan(0);
    expect(CARE_CONVERGE_TRANSITION.times).toBeUndefined();
  });

  it("diverge starts from collapsed pose and tweens to rest", () => {
    const init = careTrioDivergeInitial("left", "x");
    const rest = careTrioConvergeAnimate(false, "left", "x");
    expect(init.x).toBeGreaterThan(0);
    expect(init.opacity).toBe(0);
    expect(rest).toEqual({ x: 0, y: 0, scale: 1, opacity: 1 });
    expect(careTrioDivergeTransition().x.duration).toBe(CARE_DIVERGE_MS / 1000);
  });

  it("opacity eases separately so the slide stays readable", () => {
    const t = careTrioConvergeTransition();
    expect(t.opacity.duration).toBe(CARE_TO_SHOVEL_MS / 1000);
    expect(t.x.duration).toBe(CARE_TO_SHOVEL_MS / 1000);
  });

  it("shovel fades out on diverge and in on converge", () => {
    expect(careShovelConvergeAnimate(false, true, true)).toEqual({
      opacity: 0,
      scale: 0.88,
    });
    expect(careShovelConvergeAnimate(true, false, true)).toEqual({
      opacity: 1,
      scale: 1,
    });
    expect(careShovelConvergeInitial(true)).toEqual({
      opacity: 0,
      scale: 0.9,
    });
    expect(careShovelConvergeTransition(false, true).duration).toBeGreaterThan(0);
  });

  it("slot mapping", () => {
    expect(careConvergeSlotForIndex(0)).toBe("left");
    expect(careConvergeSlotForIndex(1)).toBe("center");
    expect(careConvergeSlotForIndex(2)).toBe("right");
  });
});
