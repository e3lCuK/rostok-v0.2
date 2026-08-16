import { describe, expect, it } from "vitest";
import {
  applyTreeGrowthAward,
  coerceV3CareSkill,
  computeCareCoeffForPreset,
  computeCycleCareCoeff,
  computeEconomyV3TreeGrowth,
  computeLongCare,
  V3_LONG_CARE_MAX,
  V3_LONG_CARE_MIN,
  V3_TREE_GROWTH_T_MAX,
  V3_TREE_GROWTH_T_MIN,
} from "./economy-v3-tree-growth";

describe("computeCareCoeffForPreset (per-preset Metelka C(t))", () => {
  it("matches the 5–25 table", () => {
    expect(computeCareCoeffForPreset(5)).toBeCloseTo(1.2, 12);
    expect(computeCareCoeffForPreset(10)).toBeCloseTo(1.15, 12);
    expect(computeCareCoeffForPreset(15)).toBeCloseTo(1.1, 12);
    expect(computeCareCoeffForPreset(20)).toBeCloseTo(1.05, 12);
    expect(computeCareCoeffForPreset(25)).toBeCloseTo(1.0, 12);
  });

  it("does not use sum-T as if it were one preset", () => {
    // Sum T=75 must NOT become C(75)=0.50 — Care is mean of C(Ti).
    expect(computeCycleCareCoeff(25, 25, 25)).toBeCloseTo(1.0, 12);
    expect(computeCareCoeffForPreset(75)).toBeCloseTo(1.0, 12); // clamped to 25
  });
});

describe("computeLongCare", () => {
  it("starts at 1.00 and approaches 1.50", () => {
    expect(computeLongCare(0)).toBeCloseTo(V3_LONG_CARE_MIN, 12);
    expect(computeLongCare(0)).toBeCloseTo(1, 12);
    expect(computeLongCare(100)).toBeCloseTo(
      1 + 0.5 * (1 - Math.exp(-1)),
      12,
    );
    expect(computeLongCare(10_000)).toBeLessThanOrEqual(V3_LONG_CARE_MAX);
    expect(computeLongCare(10_000)).toBeGreaterThan(1.49);
  });
});

describe("computeEconomyV3TreeGrowth", () => {
  it("uses T = sum of three presets (min 15 / max 75)", () => {
    const min = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 5, skill: 1 },
      sun: { presetSeconds: 5, skill: 1 },
      fertilizer: { presetSeconds: 5, skill: 1 },
      longCareCycles: 0,
    });
    expect(min.T).toBe(V3_TREE_GROWTH_T_MIN);
    expect(min.skill).toBe(1);
    expect(min.care).toBeCloseTo(1.2, 12);
    expect(min.longCare).toBe(1);
    expect(min.growthMm).toBeCloseTo(15 * 1 * 1.2 * 1, 12);
    expect(min.awardedMm).toBe(Math.floor(min.growthMm));

    const max = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 25, skill: 1 },
      sun: { presetSeconds: 25, skill: 1 },
      fertilizer: { presetSeconds: 25, skill: 1 },
      longCareCycles: 0,
    });
    expect(max.T).toBe(V3_TREE_GROWTH_T_MAX);
    expect(max.care).toBeCloseTo(1.0, 12);
    expect(max.growthMm).toBeCloseTo(75 * 1 * 1 * 1, 12);
  });

  it("treats minigame percents 0–100 as skill 0–1", () => {
    const fromUnit = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 10, skill: 0.8 },
      sun: { presetSeconds: 10, skill: 0.8 },
      fertilizer: { presetSeconds: 10, skill: 0.8 },
      longCareCycles: 0,
    });
    const fromPct = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 10, skill: 80 },
      sun: { presetSeconds: 10, skill: 80 },
      fertilizer: { presetSeconds: 10, skill: 80 },
      longCareCycles: 0,
    });
    expect(coerceV3CareSkill(80)).toBeCloseTo(0.8, 12);
    expect(fromPct.skill).toBeCloseTo(fromUnit.skill, 12);
    expect(fromPct.awardedMm).toBe(fromUnit.awardedMm);
  });

  it("scales with average Skill", () => {
    const zero = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 10, skill: 0 },
      sun: { presetSeconds: 10, skill: 0 },
      fertilizer: { presetSeconds: 10, skill: 0 },
      longCareCycles: 0,
    });
    const half = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 10, skill: 0.5 },
      sun: { presetSeconds: 10, skill: 0.5 },
      fertilizer: { presetSeconds: 10, skill: 0.5 },
      longCareCycles: 0,
    });
    const full = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 10, skill: 1 },
      sun: { presetSeconds: 10, skill: 1 },
      fertilizer: { presetSeconds: 10, skill: 1 },
      longCareCycles: 0,
    });
    expect(zero.growthMm).toBe(0);
    expect(zero.awardedMm).toBe(1);
    expect(half.growthMm).toBeCloseTo(full.growthMm / 2, 10);
    expect(full.skill).toBe(1);
  });

  it("awards 1 mm when Skill is 0", () => {
    const r = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 5, skill: 0 },
      sun: { presetSeconds: 5, skill: 0 },
      fertilizer: { presetSeconds: 5, skill: 0 },
      longCareCycles: 0,
    });
    expect(r.skill).toBe(0);
    expect(r.growthMm).toBe(0);
    expect(r.awardedMm).toBe(1);
  });

  it("applies LongCare from N and ignores capital", () => {
    const base = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 10, skill: 1 },
      sun: { presetSeconds: 10, skill: 1 },
      fertilizer: { presetSeconds: 10, skill: 1 },
      longCareCycles: 0,
    });
    const veteran = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 10, skill: 1 },
      sun: { presetSeconds: 10, skill: 1 },
      fertilizer: { presetSeconds: 10, skill: 1 },
      longCareCycles: 500,
    });
    expect(veteran.longCare).toBeGreaterThan(base.longCare);
    expect(veteran.growthMm).toBeGreaterThan(base.growthMm);
    expect(veteran.longCare).toBeLessThanOrEqual(V3_LONG_CARE_MAX);
    // Formula has no capital argument — growth is action-driven only.
    expect(base.growthMm).toBeCloseTo(30 * 1 * 1.15 * 1, 12);
  });

  it("does not equal 1₽→1mm income floor", () => {
    const g = computeEconomyV3TreeGrowth({
      water: { presetSeconds: 5, skill: 0.5 },
      sun: { presetSeconds: 10, skill: 0.8 },
      fertilizer: { presetSeconds: 15, skill: 1 },
      longCareCycles: 0,
    });
    // Arbitrary income floor must not define mm.
    const fakeIncomeFloor = Math.floor(12.34);
    expect(g.awardedMm).not.toBe(fakeIncomeFloor);
    expect(g.growthMm).toBeCloseTo(
      30 * ((0.5 + 0.8 + 1) / 3) * ((1.2 + 1.15 + 1.1) / 3) * 1,
      10,
    );
  });
});

describe("applyTreeGrowthAward", () => {
  it("floors growth and carries fractional remainder", () => {
    const a = applyTreeGrowthAward({
      currentMm: 10,
      currentRemainder: 0.4,
      growthMm: 5.7,
    });
    expect(a.awardedMm).toBe(6); // 5 + (0.4+0.7→1.1 → +1)
    expect(a.treeGrowthMm).toBe(16);
    expect(a.treeGrowthRemainder).toBeCloseTo(0.1, 10);
  });
});
