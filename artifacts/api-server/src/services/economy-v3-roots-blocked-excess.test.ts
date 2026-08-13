import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import { isExcessAvailable } from "./economy-v2-excess";
import {
  canAcceptV3OrdinaryRootUnit,
  shouldRouteV3GeneratedToExcess,
} from "./economy-v3-excess-gate";
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

  it("all transferred + partial reserves: pause — no excess financial mint", () => {
    expect(
      shouldRouteV3GeneratedToExcess({
        ordinaryFull: false,
        ordinaryAcceptBlocked: true,
        allRootsTransferred: true,
      }),
    ).toBe(false);

    const r = settleEconomyV3Roots({
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      generationProgress: 0.4,
      generationRrCursor: 0,
      generationAnchorAt: NOW - T * 1000,
      generationFrozenAt: NOW - 60_000,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 10,
      reserveSunSeconds: 10,
      reserveFertilizerSeconds: 10,
      dailyCapSeconds: 25,
      streakDays: 0,
      visitBonusSeconds: 0,
      excessSeconds: 2,
      excessElapsedMs: 50_000,
      transferredRoots: ["water", "sun", "fertilizer"],
    });

    expect(r.ordinaryFull).toBe(false);
    expect(r.generated).toBe(false);
    expect(r.excessGenerated).toBe(0);
    expect(r.excessSeconds).toBe(2);
    expect(r.excessElapsedMs).toBe(50_000);
    expect(r.excessElapsedMsGenerated).toBe(0);
    expect(r.generatingExcess).toBe(false);
    expect(r.generationProgress).toBe(0.4);
  });

  it("all transferred + all reserves full: still mints excess", () => {
    expect(
      shouldRouteV3GeneratedToExcess({
        ordinaryFull: true,
        ordinaryAcceptBlocked: true,
        allRootsTransferred: true,
      }),
    ).toBe(true);

    const r = settleEconomyV3Roots({
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - T * 1000,
      generationFrozenAt: NOW - 60_000,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 25,
      reserveSunSeconds: 25,
      reserveFertilizerSeconds: 25,
      dailyCapSeconds: 25,
      streakDays: 0,
      visitBonusSeconds: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      transferredRoots: ["water", "sun", "fertilizer"],
    });

    expect(r.ordinaryFull).toBe(true);
    expect(r.excessGenerated).toBeCloseTo(1, 8);
    expect(r.generatingExcess).toBe(true);
  });

  it("water on button + sun/fert at root cap: excess continues (buttons count)", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 0,
      rootSunSeconds: 21,
      rootFertilizerSeconds: 21,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - T * 1000,
      generationFrozenAt: NOW,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 21,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      streakDays: 1,
      excessSeconds: 5,
      excessElapsedMs: 9000,
      transferredRoots: ["water"],
    });

    expect(r.effectivePresetSeconds).toBe(21);
    expect(r.excessGenerated).toBeCloseTo(1, 5);
    expect(r.excessElapsedMs).toBeGreaterThan(9000);
    expect(r.generatingExcess).toBe(true);
    expect(r.rootSunSeconds).toBe(21);
    expect(r.rootFertilizerSeconds).toBe(21);
  });

  it("water on button + only sun full: fills fertilizer, financial still until fert catches up", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 0,
      rootSunSeconds: 21,
      rootFertilizerSeconds: 0,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - T * 1000,
      generationFrozenAt: NOW,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 21,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      streakDays: 1,
      excessSeconds: 5,
      excessElapsedMs: 9000,
      transferredRoots: ["water"],
    });

    expect(r.excessGenerated).toBe(0);
    expect(r.excessElapsedMs).toBe(9000);
    expect(r.generatingExcess).toBe(false);
    expect(r.rootFertilizerSeconds).toBe(1);
  });
});
