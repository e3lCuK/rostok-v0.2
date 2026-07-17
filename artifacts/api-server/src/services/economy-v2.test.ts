import { describe, expect, it } from "vitest";
import {
  isActivityDurationPreset,
  energyToActivityDuration,
  normalizeFreshnessCoefficient,
  applyFreshnessToEnergy,
  calculateMaxXpForDuration,
  normalizePerformanceCoefficient,
  calculateEarnedXp,
  calculateEconomyV2,
  calculateEconomyV2Activity,
  calculateEconomyV2ActivityCompletion,
} from "./economy-v2";

describe("isActivityDurationPreset", () => {
  it.each([
    [4, false],
    [5, true],
    [14, true],
    [25, true],
    [26, false],
    [5.5, false],
    [NaN, false],
    [Infinity, false],
  ] as const)("%s → %s", (value, expected) => {
    expect(isActivityDurationPreset(value)).toBe(expected);
  });
});

describe("energyToActivityDuration", () => {
  it.each([
    [-Infinity, 5],
    [NaN, 5],
    [-1, 5],
    [0, 5],
    [4.99, 5],
    [5, 5],
    [14.99, 14],
    [25, 25],
    [30, 25],
    [Infinity, 5],
  ] as const)("%s → %s", (usableEnergy, expected) => {
    expect(energyToActivityDuration(usableEnergy)).toBe(expected);
  });
});

describe("normalizeFreshnessCoefficient", () => {
  it.each([
    [-Infinity, 0],
    [NaN, 0],
    [-1, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [2, 1],
    [Infinity, 0],
  ] as const)("%s → %s", (value, expected) => {
    expect(normalizeFreshnessCoefficient(value)).toBe(expected);
  });
});

describe("applyFreshnessToEnergy", () => {
  it.each([
    [20, 0.5, 10],
    [20, 2, 20],
    [20, -1, 0],
    [20, NaN, 0],
    [-20, 1, 0],
    [NaN, 1, 0],
    [Infinity, 1, 0],
  ] as const)(
    "%s, %s → %s",
    (rawEnergy, freshnessCoefficient, expected) => {
      expect(
        applyFreshnessToEnergy(rawEnergy, freshnessCoefficient),
      ).toBe(expected);
    },
  );
});

describe("calculateMaxXpForDuration", () => {
  it.each([
    [5, 20],
    [6, 24],
    [14, 56],
    [15, 60],
    [24, 96],
    [25, 100],
  ] as const)("%s → %s", (duration, expected) => {
    expect(calculateMaxXpForDuration(duration)).toBe(expected);
  });

  it("returns exactly 56 for duration 14", () => {
    expect(calculateMaxXpForDuration(14)).toBe(56);
  });
});

describe("normalizePerformanceCoefficient", () => {
  it.each([
    [-Infinity, 0],
    [NaN, 0],
    [-1, 0],
    [0, 0],
    [0.5, 0.5],
    [0.999, 0.999],
    [1, 1],
    [2, 1],
    [Infinity, 0],
  ] as const)("%s → %s", (value, expected) => {
    expect(normalizePerformanceCoefficient(value)).toBe(expected);
  });
});

describe("calculateEarnedXp", () => {
  it.each([
    [5, -1, 0],
    [5, 0.5, 10],
    [14, 1, 56],
    [14, 0.5, 28],
    [14, 0.999, 55],
    [15, 0.333, 19],
    [25, 0.999, 99],
    [25, 1, 100],
    [25, 2, 100],
    [25, NaN, 0],
    [25, Infinity, 0],
  ] as const)(
    "duration %s, performance %s → %s",
    (duration, performanceCoefficient, expected) => {
      expect(calculateEarnedXp(duration, performanceCoefficient)).toBe(
        expected,
      );
    },
  );
});

describe("calculateEconomyV2", () => {
  it("uses default freshness when omitted", () => {
    const result = calculateEconomyV2({
      capital: 1000,
      elapsedSeconds: 28800,
    });

    expect(result.rawEnergy).toBeCloseTo(28.1838293126);
    expect(result.freshnessCoefficient).toBe(1);
    expect(result.usableEnergy).toBeCloseTo(28.1838293126);
  });

  it("applies freshnessCoefficient 0.5", () => {
    const result = calculateEconomyV2({
      capital: 1000,
      elapsedSeconds: 28800,
      freshnessCoefficient: 0.5,
    });

    expect(result.rawEnergy).toBeCloseTo(28.1838293126);
    expect(result.freshnessCoefficient).toBe(0.5);
    expect(result.usableEnergy).toBeCloseTo(14.0919146563);
  });

  it("clamps freshnessCoefficient above 1", () => {
    const result = calculateEconomyV2({
      capital: 1000,
      elapsedSeconds: 28800,
      freshnessCoefficient: 2,
    });

    expect(result.freshnessCoefficient).toBe(1);
    expect(result.usableEnergy).toBeCloseTo(result.rawEnergy);
  });

  it("treats NaN freshness as 0", () => {
    const result = calculateEconomyV2({
      capital: 1000,
      elapsedSeconds: 28800,
      freshnessCoefficient: NaN,
    });

    expect(result.freshnessCoefficient).toBe(0);
    expect(result.usableEnergy).toBe(0);
  });

  it.each([
    [{ capital: -1000, elapsedSeconds: 28800 }, 0],
    [{ capital: NaN, elapsedSeconds: 28800 }, 0],
    [{ capital: Infinity, elapsedSeconds: 28800 }, 0],
    [{ capital: 1000, elapsedSeconds: -1 }, 0],
    [{ capital: 1000, elapsedSeconds: NaN }, 0],
    [{ capital: 1000, elapsedSeconds: Infinity }, 0],
  ] as const)(
    "returns rawEnergy 0 for invalid capital/elapsed %#",
    (input, expected) => {
      expect(calculateEconomyV2(input).rawEnergy).toBe(expected);
    },
  );
});

describe("calculateEconomyV2Activity", () => {
  it("maps zero energy to minimum duration", () => {
    const result = calculateEconomyV2Activity({
      capital: 0,
      elapsedSeconds: 28800,
    });

    expect(result.usableEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("maps half regen time to duration 14", () => {
    const result = calculateEconomyV2Activity({
      capital: 1000,
      elapsedSeconds: 14400,
    });

    expect(result.usableEnergy).toBeCloseTo(14.0919146563);
    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
  });

  it("maps full regen to maximum duration", () => {
    const result = calculateEconomyV2Activity({
      capital: 1000,
      elapsedSeconds: 28800,
    });

    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
  });

  it("applies freshness 0.5 to activity duration", () => {
    const result = calculateEconomyV2Activity({
      capital: 1000,
      elapsedSeconds: 28800,
      freshnessCoefficient: 0.5,
    });

    expect(result.usableEnergy).toBeCloseTo(14.0919146563);
    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
  });
});

describe("calculateEconomyV2ActivityCompletion", () => {
  it("earns half XP at full duration with performance 0.5", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: 1000,
      elapsedSeconds: 28800,
      performanceCoefficient: 0.5,
    });

    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
    expect(result.earnedXp).toBe(50);
  });

  it("earns half XP at duration 14 with performance 0.5", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: 1000,
      elapsedSeconds: 14400,
      performanceCoefficient: 0.5,
    });

    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
    expect(result.earnedXp).toBe(28);
  });

  it("earns full XP for duration 14 with freshness 0.5 and performance 1", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: 1000,
      elapsedSeconds: 28800,
      freshnessCoefficient: 0.5,
      performanceCoefficient: 1,
    });

    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
    expect(result.earnedXp).toBe(56);
  });

  it("earns 0 XP for NaN performance", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: 1000,
      elapsedSeconds: 28800,
      performanceCoefficient: NaN,
    });

    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
    expect(result.earnedXp).toBe(0);
  });

  it("clamps performance above 1 to full XP", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: 1000,
      elapsedSeconds: 28800,
      performanceCoefficient: 2,
    });

    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
    expect(result.earnedXp).toBe(100);
  });

  it("earns 0 XP for negative performance", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: 1000,
      elapsedSeconds: 28800,
      performanceCoefficient: -1,
    });

    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
    expect(result.earnedXp).toBe(0);
  });
});
