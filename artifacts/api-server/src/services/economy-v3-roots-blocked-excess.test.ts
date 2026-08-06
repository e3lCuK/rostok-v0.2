import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import { isExcessAvailable } from "./economy-v2-excess";
import { canAcceptV3OrdinaryRootUnit } from "./economy-v3-excess-gate";
import { settleEconomyV3Roots } from "./economy-v3-roots";

const NOW = Date.parse("2026-07-27T18:00:00.000Z");
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("roots at capacity → excess (no void discard)", () => {
  it("25/25/25 roots + empty reserves: 1 generated second → excess +1, ordinaryFull false", () => {
    expect(
      canAcceptV3OrdinaryRootUnit({
        rootWaterSeconds: 25,
        rootSunSeconds: 25,
        rootFertilizerSeconds: 25,
        reservesFull: { water: false, sun: false, fertilizer: false },
        transferredRoots: [],
        rootCapacitySeconds: 25,
      }),
    ).toBe(false);

    const r = settleEconomyV3Roots({
      rootWaterSeconds: 25,
      rootSunSeconds: 25,
      rootFertilizerSeconds: 25,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - T * 1000,
      generationFrozenAt: null,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 25,
      streakDays: 0,
      visitBonusSeconds: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      transferredRoots: [],
    });

    expect(r.ordinaryFull).toBe(false);
    expect(r.excessGenerated).toBeCloseTo(1, 8);
    expect(r.excessSeconds).toBeCloseTo(1, 8);
    expect(r.rootWaterSeconds).toBe(25);
    expect(r.rootSunSeconds).toBe(25);
    expect(r.rootFertilizerSeconds).toBe(25);
    expect(r.generatingExcess).toBe(true);
  });

  it("25/25/0 still accepts on fertilizer (not blocked)", () => {
    expect(
      canAcceptV3OrdinaryRootUnit({
        rootWaterSeconds: 25,
        rootSunSeconds: 25,
        rootFertilizerSeconds: 0,
        reservesFull: { water: false, sun: false, fertilizer: false },
        transferredRoots: [],
        rootCapacitySeconds: 25,
      }),
    ).toBe(true);
  });

  it("after excess accumulates to 5 with full roots, available — Metelka uses rootsFull cycle", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 25,
      rootSunSeconds: 25,
      rootFertilizerSeconds: 25,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - 5 * T * 1000,
      generationFrozenAt: null,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 25,
      streakDays: 0,
      visitBonusSeconds: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      transferredRoots: [],
    });
    expect(r.excessSeconds).toBeCloseTo(5, 5);
    expect(isExcessAvailable(r.excessSeconds)).toBe(true);
  });
});
