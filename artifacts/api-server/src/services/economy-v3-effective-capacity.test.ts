import { describe, expect, it } from "vitest";
import {
  buildV3EffectiveCapacityBreakdown,
  computeV3EffectivePresetSeconds,
  computeV3VisitBonusSeconds,
  normalizeV3StorageToEffectiveCapacity,
  resolveV3CurrentVisitDay,
  v3SharedPoolRootCap,
  v3SharedPoolRootFreeRoom,
} from "./economy-v3-effective-capacity";
import { settleEconomyV3Roots } from "./economy-v3-roots";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import { canAcceptV3OrdinaryRootUnit } from "./economy-v3-excess-gate";
import { computeV3RootsFull } from "./economy-v3-metelka-cycle";

const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;
const NOW = Date.parse("2026-07-27T20:00:00.000Z");

describe("economy-v3 effective capacity — visit day bonus SoT", () => {
  it("1. day 1: base 20 → bonus 1 → effective 21", () => {
    const breakdown = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 1,
    });
    expect(breakdown.currentVisitDay).toBe(1);
    expect(breakdown.basePresetSeconds).toBe(20);
    expect(breakdown.activeDailyBonusSeconds).toBe(1);
    expect(breakdown.effectivePresetSeconds).toBe(21);
    expect(
      computeV3EffectivePresetSeconds({
        basePresetSeconds: 20,
        streakDays: 1,
      }),
    ).toBe(21);
  });

  it("2. day 2 → bonus 2 → effective 22", () => {
    const b = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 2,
    });
    expect(b.currentVisitDay).toBe(2);
    expect(b.activeDailyBonusSeconds).toBe(2);
    expect(b.effectivePresetSeconds).toBe(22);
  });

  it("3. day 3 → bonus 3 → effective 23", () => {
    const b = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 3,
    });
    expect(b.currentVisitDay).toBe(3);
    expect(b.activeDailyBonusSeconds).toBe(3);
    expect(b.effectivePresetSeconds).toBe(23);
  });

  it("4. day 4 → bonus 4 → effective 24", () => {
    const b = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 4,
    });
    expect(b.currentVisitDay).toBe(4);
    expect(b.activeDailyBonusSeconds).toBe(4);
    expect(b.effectivePresetSeconds).toBe(24);
  });

  it("5. day 5 → bonus 5 → effective 25", () => {
    const b = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 5,
    });
    expect(b.currentVisitDay).toBe(5);
    expect(b.activeDailyBonusSeconds).toBe(5);
    expect(b.effectivePresetSeconds).toBe(25);
  });

  it("6. first day must not give bonus=0", () => {
    expect(computeV3VisitBonusSeconds(0)).toBe(1);
    expect(computeV3VisitBonusSeconds(1)).toBe(1);
    expect(
      buildV3EffectiveCapacityBreakdown({
        basePresetSeconds: 20,
        streakDays: 0,
      }).activeDailyBonusSeconds,
    ).not.toBe(0);
  });

  it("7. zero-based streak_days=0 → visit day 1 → bonus 1", () => {
    expect(resolveV3CurrentVisitDay(0)).toBe(1);
    expect(computeV3VisitBonusSeconds(0)).toBe(1);
    const b = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 0,
    });
    expect(b.currentVisitDay).toBe(1);
    expect(b.activeDailyBonusSeconds).toBe(1);
    expect(b.effectivePresetSeconds).toBe(21);
  });

  it("8. one-based streak_days=1 → bonus 1 (not 2)", () => {
    expect(resolveV3CurrentVisitDay(1)).toBe(1);
    expect(computeV3VisitBonusSeconds(1)).toBe(1);
    const b = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 1,
    });
    expect(b.currentVisitDay).toBe(1);
    expect(b.activeDailyBonusSeconds).toBe(1);
    expect(b.effectivePresetSeconds).toBe(21);
  });

  it("9. roots 20/20/20 at cap 21 are not full", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 20,
      rootSunSeconds: 20,
      rootFertilizerSeconds: 20,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW,
      generationFrozenAt: null,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      streakDays: 0,
      excessSeconds: 5,
      excessElapsedMs: 0,
      transferredRoots: [],
    });
    expect(r.effectivePresetSeconds).toBe(21);
    expect(r.rootWaterSeconds).toBe(20);
    expect(r.rootSunSeconds).toBe(20);
    expect(r.rootFertilizerSeconds).toBe(20);
    expect(
      computeV3RootsFull({
        rootWaterSeconds: r.rootWaterSeconds,
        rootSunSeconds: r.rootSunSeconds,
        rootFertilizerSeconds: r.rootFertilizerSeconds,
        capacitySeconds: r.effectivePresetSeconds,
      }),
    ).toBe(false);
    expect(
      canAcceptV3OrdinaryRootUnit({
        rootWaterSeconds: r.rootWaterSeconds,
        rootSunSeconds: r.rootSunSeconds,
        rootFertilizerSeconds: r.rootFertilizerSeconds,
        reservesFull: r.reservesFull,
        transferredRoots: [],
        rootCapacitySeconds: r.effectivePresetSeconds,
      }),
    ).toBe(true);
    expect(r.generatingExcess).toBe(false);
    expect(r.excessSeconds).toBe(5);
  });

  it("10. next generated second fills a root to 21, not excess", () => {
    const beforeExcess = 5;
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 20,
      rootSunSeconds: 20,
      rootFertilizerSeconds: 20,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - 1 * T * 1000,
      generationFrozenAt: null,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      streakDays: 0,
      excessSeconds: beforeExcess,
      excessElapsedMs: 0,
      transferredRoots: [],
    });
    expect(r.effectivePresetSeconds).toBe(21);
    const rootTotal =
      r.rootWaterSeconds + r.rootSunSeconds + r.rootFertilizerSeconds;
    expect(rootTotal).toBe(61); // 20+20+20 + 1
    expect(
      [r.rootWaterSeconds, r.rootSunSeconds, r.rootFertilizerSeconds].some(
        (s) => s === 21,
      ),
    ).toBe(true);
    expect(r.excessSeconds).toBe(beforeExcess);
  });

  it("11. after roots 21/21/21 next second goes to excess", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 21,
      rootSunSeconds: 21,
      rootFertilizerSeconds: 21,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - 1 * T * 1000,
      generationFrozenAt: null,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      streakDays: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      transferredRoots: [],
    });
    expect(r.effectivePresetSeconds).toBe(21);
    expect(r.rootWaterSeconds).toBe(21);
    expect(r.rootSunSeconds).toBe(21);
    expect(r.rootFertilizerSeconds).toBe(21);
    expect(r.excessSeconds).toBeCloseTo(1, 5);
    expect(r.generatingExcess).toBe(true);
  });

  it("12. public breakdown shape for day 1 (API fields)", () => {
    const b = buildV3EffectiveCapacityBreakdown({
      basePresetSeconds: 20,
      streakDays: 0,
    });
    expect(b).toEqual({
      basePresetSeconds: 20,
      currentVisitDay: 1,
      activeDailyBonusSeconds: 1,
      effectivePresetSeconds: 21,
    });
  });

  it("13. day 5+ caps bonus at 5; explicit visitBonusSeconds override works", () => {
    expect(
      buildV3EffectiveCapacityBreakdown({
        basePresetSeconds: 20,
        streakDays: 7,
      }).activeDailyBonusSeconds,
    ).toBe(5);
    expect(
      buildV3EffectiveCapacityBreakdown({
        basePresetSeconds: 20,
        streakDays: 0,
        visitBonusSeconds: 0,
      }).effectivePresetSeconds,
    ).toBe(20);
  });

  it("normalize storage does not invent overflow under new cap", () => {
    const n = normalizeV3StorageToEffectiveCapacity({
      rootWaterSeconds: 20,
      rootSunSeconds: 20,
      rootFertilizerSeconds: 20,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      effectivePresetSeconds: 21,
    });
    expect(n.overflowSeconds).toBe(0);
    expect(n.rootWaterSeconds).toBe(20);
  });

  it("normalize trims root when root+reserve exceeds shared pool", () => {
    const n = normalizeV3StorageToEffectiveCapacity({
      rootWaterSeconds: 21,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 21,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      effectivePresetSeconds: 21,
    });
    expect(n.reserveWaterSeconds).toBe(21);
    expect(n.rootWaterSeconds).toBe(0);
    expect(n.overflowSeconds).toBe(21);
  });

  it("shared pool free room shrinks with reserve fill", () => {
    expect(
      v3SharedPoolRootFreeRoom({
        rootSeconds: 0,
        reserveSeconds: 21,
        capacitySeconds: 21,
      }),
    ).toBe(0);
    expect(
      v3SharedPoolRootCap({
        reserveSeconds: 10,
        capacitySeconds: 21,
      }),
    ).toBe(11);
  });

  it("transfer path uses SoT effective 21 (caller passes capacity)", () => {
    const effective = computeV3EffectivePresetSeconds({
      basePresetSeconds: 20,
      streakDays: 0,
    });
    expect(effective).toBe(21);
  });
});
