import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNDERGROUND_ROOTS_WIPE_MS } from "./undergroundRootsWipe";
import {
  SPROUT_PLANT_AFTER_ROOTS_MS,
  SPROUT_PLANT_AFTER_TREE_MS,
  SPROUT_PLANT_RISE_HIDDEN,
  SPROUT_PLANT_RISE_MS,
  SPROUT_PLANT_RISE_TRANSITION,
  SPROUT_PLANT_RISE_VISIBLE,
  sproutPlantHintStartMs,
  sproutPlantRiseAnimate,
  sproutPlantRootsStartMs,
} from "./sproutPlantRise";

const here = __dirname;
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");

describe("sproutPlantRise", () => {
  it("uses a ~0.7s ease-out so the trunk leads the crown", () => {
    expect(SPROUT_PLANT_RISE_MS).toBe(720);
    expect(SPROUT_PLANT_RISE_TRANSITION.duration).toBe(0.72);
  });

  it("hides from the bottom (inset bottom 100%) and buries slightly", () => {
    expect(SPROUT_PLANT_RISE_HIDDEN).toEqual({
      clipPath: "inset(0% 0% 100% 0%)",
      y: 18,
    });
    expect(SPROUT_PLANT_RISE_VISIBLE).toEqual({
      clipPath: "inset(0% 0% 0% 0%)",
      y: 0,
    });
  });

  it("clears clip-path after the rise so later tree motion is not cropped", () => {
    expect(sproutPlantRiseAnimate(true)).toEqual(SPROUT_PLANT_RISE_VISIBLE);
    expect(sproutPlantRiseAnimate(false)).toEqual({
      clipPath: "none",
      y: 0,
    });
  });

  it("waits after the tree, then after the roots wipe, before the next hint", () => {
    expect(SPROUT_PLANT_AFTER_TREE_MS).toBeGreaterThanOrEqual(2000);
    expect(SPROUT_PLANT_AFTER_ROOTS_MS).toBeGreaterThanOrEqual(1000);
    expect(sproutPlantRootsStartMs()).toBe(
      SPROUT_PLANT_RISE_MS + SPROUT_PLANT_AFTER_TREE_MS,
    );
    expect(sproutPlantHintStartMs()).toBe(
      sproutPlantRootsStartMs() +
        UNDERGROUND_ROOTS_WIPE_MS +
        SPROUT_PLANT_AFTER_ROOTS_MS,
    );
    expect(sproutPlantHintStartMs()).toBeGreaterThan(sproutPlantRootsStartMs());
  });

  it("GamePage plays the rise only on the plant beat", () => {
    expect(pageSrc).toContain("sproutPlantRiseAnimate");
    expect(pageSrc).toContain("SPROUT_PLANT_RISE_HIDDEN");
    expect(pageSrc).toContain("setSproutRising(true)");
    expect(pageSrc).toContain("data-sprout-rising");
    expect(pageSrc).toContain("tree-sprout-rise");
    expect(pageSrc).toContain("sproutPlantRootsStartMs()");
    expect(pageSrc).toContain("sproutPlantHintStartMs()");
    expect(pageSrc).toContain(
      'tutorialStep === "plant-sprout" && sproutPlanted',
    );
    expect(pageSrc).toContain("plantRevealHoldRef");
    expect(pageSrc).toContain("if (plantRevealHoldRef.current) return");
    expect(cssSrc).toContain(".tree-sprout-rise");
  });
});
