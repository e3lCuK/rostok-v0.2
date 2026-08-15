import { describe, expect, it } from "vitest";
import {
  isActivityDurationPreset,
  energyToActivityDuration,
  normalizeFreshnessCoefficient,
  applyFreshnessToEnergy,
  calculateMaxXpForDuration,
  normalizePerformanceCoefficient,
  calculateEarnedXp,
  capitalMultiplier,
  generateEnergyFromElapsed,
  calculateEconomyV2,
  calculateEconomyV2Activity,
  calculateEconomyV2ActivityCompletion,
  V2_REFERENCE_CAPITAL,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
  V2_ENERGY_BANK_MAX,
} from "./economy-v2";
import {
  countReadySections,
  settleEconomyV2Roots,
} from "./economy-v2-roots";

const REF = V2_REFERENCE_CAPITAL;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE; // 720

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

describe("capitalMultiplier / generateEnergyFromElapsed", () => {
  it("reference capital has multiplier 1", () => {
    expect(capitalMultiplier(REF)).toBeCloseTo(1, 10);
  });

  it("K=0 has multiplier 0.2 (60 min vs 12 min reference)", () => {
    expect(capitalMultiplier(0)).toBeCloseTo(0.2, 10);
  });

  it("100 000 ₽ + 720 s → +1 energy", () => {
    expect(generateEnergyFromElapsed(REF, T)).toBeCloseTo(1, 10);
  });

  it("100 000 ₽ + 3600 s → +5 energy", () => {
    expect(generateEnergyFromElapsed(REF, 60 * 60)).toBeCloseTo(5, 10);
  });

  it("100 000 ₽ + 43 200 s → +60 energy", () => {
    expect(generateEnergyFromElapsed(REF, 12 * 60 * 60)).toBeCloseTo(60, 10);
  });

  it("K=0 + 3600 s → +1 energy", () => {
    expect(generateEnergyFromElapsed(0, 3600)).toBeCloseTo(1, 10);
  });

  it("capital below reference is slower", () => {
    const low = generateEnergyFromElapsed(50_000, T);
    const ref = generateEnergyFromElapsed(REF, T);
    expect(low).toBeLessThan(ref);
    // T(50k)/T(100k) = 5 / (1+4·0.5^0.15); energy over 720 = 720/T
    const expected =
      T /
      (3600 / (1 + 4 * Math.pow(0.5, 0.15)));
    expect(low).toBeCloseTo(expected, 10);
  });

  it("capital above reference is faster", () => {
    const high = generateEnergyFromElapsed(200_000, T);
    const ref = generateEnergyFromElapsed(REF, T);
    expect(high).toBeGreaterThan(ref);
    const expected =
      T /
      (3600 / (1 + 4 * Math.pow(2, 0.15)));
    expect(high).toBeCloseTo(expected, 10);
  });

  it("negative / NaN / Infinity capital → 0", () => {
    expect(generateEnergyFromElapsed(-1000, T)).toBe(0);
    expect(generateEnergyFromElapsed(NaN, T)).toBe(0);
    expect(generateEnergyFromElapsed(Infinity, T)).toBe(0);
  });

  it("negative / NaN / Infinity elapsed → 0", () => {
    expect(generateEnergyFromElapsed(REF, -1)).toBe(0);
    expect(generateEnergyFromElapsed(REF, NaN)).toBe(0);
    expect(generateEnergyFromElapsed(REF, Infinity)).toBe(0);
  });
});

describe("calculateEconomyV2", () => {
  it("uses default freshness when omitted", () => {
    const result = calculateEconomyV2({
      capital: REF,
      elapsedSeconds: T,
    });

    expect(result.rawEnergy).toBeCloseTo(1, 10);
    expect(result.freshnessCoefficient).toBe(1);
    expect(result.usableEnergy).toBeCloseTo(1, 10);
  });

  it("applies freshnessCoefficient 0.5", () => {
    const result = calculateEconomyV2({
      capital: REF,
      elapsedSeconds: T,
      freshnessCoefficient: 0.5,
    });

    expect(result.rawEnergy).toBeCloseTo(1, 10);
    expect(result.freshnessCoefficient).toBe(0.5);
    expect(result.usableEnergy).toBeCloseTo(0.5, 10);
  });

  it("clamps freshnessCoefficient above 1", () => {
    const result = calculateEconomyV2({
      capital: REF,
      elapsedSeconds: T,
      freshnessCoefficient: 2,
    });

    expect(result.freshnessCoefficient).toBe(1);
    expect(result.usableEnergy).toBeCloseTo(result.rawEnergy);
  });

  it("treats NaN freshness as 0", () => {
    const result = calculateEconomyV2({
      capital: REF,
      elapsedSeconds: T,
      freshnessCoefficient: NaN,
    });

    expect(result.freshnessCoefficient).toBe(0);
    expect(result.usableEnergy).toBe(0);
  });

  it.each([
    [{ capital: -1000, elapsedSeconds: T }, 0],
    [{ capital: NaN, elapsedSeconds: T }, 0],
    [{ capital: Infinity, elapsedSeconds: T }, 0],
    [{ capital: REF, elapsedSeconds: -1 }, 0],
    [{ capital: REF, elapsedSeconds: NaN }, 0],
    [{ capital: REF, elapsedSeconds: Infinity }, 0],
  ] as const)(
    "returns rawEnergy 0 for invalid capital/elapsed %#",
    (input, expected) => {
      expect(calculateEconomyV2(input).rawEnergy).toBe(expected);
    },
  );
});

describe("calculateEconomyV2Activity", () => {
  it("maps K=0 energy (slow 60-min cycle) to minimum duration", () => {
    const result = calculateEconomyV2Activity({
      capital: 0,
      elapsedSeconds: T,
    });

    expect(result.usableEnergy).toBeCloseTo(0.2, 10);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("maps 14 reference-minutes to duration 14", () => {
    const result = calculateEconomyV2Activity({
      capital: REF,
      elapsedSeconds: 14 * T,
    });

    expect(result.usableEnergy).toBeCloseTo(14, 10);
    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
  });

  it("maps full bank time to maximum duration", () => {
    const result = calculateEconomyV2Activity({
      capital: REF,
      elapsedSeconds: V2_ENERGY_BANK_MAX * T,
    });

    expect(result.usableEnergy).toBeCloseTo(60, 10);
    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
  });

  it("applies freshness 0.5 to activity duration", () => {
    const result = calculateEconomyV2Activity({
      capital: REF,
      elapsedSeconds: 14 * T,
      freshnessCoefficient: 0.5,
    });

    expect(result.usableEnergy).toBeCloseTo(7, 10);
    expect(result.activityDuration).toBe(7);
    expect(result.maxXp).toBe(28);
  });
});

describe("calculateEconomyV2ActivityCompletion", () => {
  it("earns half XP at full duration with performance 0.5", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: REF,
      elapsedSeconds: V2_ENERGY_BANK_MAX * T,
      performanceCoefficient: 0.5,
    });

    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
    expect(result.earnedXp).toBe(50);
  });

  it("earns half XP at duration 14 with performance 0.5", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: REF,
      elapsedSeconds: 14 * T,
      performanceCoefficient: 0.5,
    });

    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
    expect(result.earnedXp).toBe(28);
  });

  it("earns 0 XP for NaN performance", () => {
    const result = calculateEconomyV2ActivityCompletion({
      capital: REF,
      elapsedSeconds: V2_ENERGY_BANK_MAX * T,
      performanceCoefficient: NaN,
    });

    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
    expect(result.earnedXp).toBe(0);
  });
});

describe("settleEconomyV2Roots (via energy settle migration)", () => {
  const now = 1_700_000_000_000;

  it("100 000 ₽ + 12 minutes = 1 ready section; bank unchanged", () => {
    const result = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: now - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(countReadySections(result.rootReadyMask)).toBe(1);
    expect(result.generatedEnergy).toBeCloseTo(1, 10);
    expect(result.energySeconds).toBe(0);
    expect(result.energyAnchorAt).toBe(now);
  });

  it("100 000 ₽ + 60 minutes = 5 ready sections", () => {
    const result = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: now - 60 * 60 * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(countReadySections(result.rootReadyMask)).toBe(5);
  });

  it("100 000 ₽ + 12 hours = 60 ready (roots cap)", () => {
    const result = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: now - 12 * 60 * 60 * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(countReadySections(result.rootReadyMask)).toBe(60);
    expect(result.generatedEnergy).toBeCloseTo(60, 10);
  });

  it("collected bank is never increased by settle", () => {
    const result = settleEconomyV2Roots({
      energySeconds: 50,
      energyAnchorAt: now - 10 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(result.generatedEnergy).toBeCloseTo(10, 10);
    expect(result.energySeconds).toBe(50);
    expect(countReadySections(result.rootReadyMask)).toBe(10);
  });

  it("lower capital matures roots slower", () => {
    const low = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: now - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: 50_000,
      nowMs: now,
    });
    const ref = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: now - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(low.generatedEnergy).toBeLessThan(ref.generatedEnergy);
  });

  it("capital 0 → slow generation (720s → 0.2 energy)", () => {
    const result = settleEconomyV2Roots({
      energySeconds: 3,
      energyAnchorAt: now - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: 0,
      nowMs: now,
    });
    expect(result.energySeconds).toBe(3);
    expect(result.generatedEnergy).toBeCloseTo(0.2, 10);
  });

  it("missing anchor → no backfill, anchor set to now", () => {
    const result = settleEconomyV2Roots({
      energySeconds: 4,
      energyAnchorAt: null,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(result.energySeconds).toBe(4);
    expect(result.generatedEnergy).toBe(0);
    expect(result.elapsedSeconds).toBe(0);
    expect(result.energyAnchorAt).toBe(now);
  });

  it("preserves fractional root progress across settles", () => {
    const first = settleEconomyV2Roots({
      energySeconds: 10.4,
      energyAnchorAt: now - 504 * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(countReadySections(first.rootReadyMask)).toBe(0);
    expect(first.rootGenerationProgress).toBeCloseTo(0.7, 10);
    expect(first.energySeconds).toBe(10.4);

    const later = now + 216 * 1000; // +0.3 energy
    const second = settleEconomyV2Roots({
      energySeconds: first.energySeconds,
      energyAnchorAt: first.energyAnchorAt,
      rootReadyMask: first.rootReadyMask,
      rootGenerationProgress: first.rootGenerationProgress,
      capital: REF,
      nowMs: later,
    });
    expect(countReadySections(second.rootReadyMask)).toBe(1);
    expect(second.rootGenerationProgress).toBeCloseTo(0, 10);
  });

  it("roots full still advances anchor", () => {
    let mask = 0n;
    for (let i = 0; i < 60; i++) mask |= 1n << BigInt(i);
    const result = settleEconomyV2Roots({
      energySeconds: 12,
      energyAnchorAt: now - T * 1000,
      rootReadyMask: mask,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: now,
    });
    expect(result.energySeconds).toBe(12);
    expect(result.energyAnchorAt).toBe(now);
    expect(result.rootGenerationProgress).toBe(0);
  });
});
