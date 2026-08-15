import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import { settleEconomyV3Roots } from "./economy-v3-roots";

const NOW = Date.parse("2026-08-14T15:00:00.000Z");
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("tutorial must not mint excess financial time", () => {
  it("suppressExcessMinting: full roots fill path does not grow excessElapsedMs", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 25,
      rootSunSeconds: 25,
      rootFertilizerSeconds: 25,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - 30 * T * 1000,
      generationFrozenAt: null,
      dayKey: "2026-08-14",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      suppressExcessMinting: true,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 25,
      streakDays: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      transferredRoots: [],
    });
    expect(r.excessGenerated).toBe(0);
    expect(r.excessElapsedMs).toBe(0);
    expect(r.excessElapsedMsGenerated).toBe(0);
    expect(r.generatingExcess).toBe(false);
    // With suppress, elapsed energy must not enter the excess ledger
    // (ordinary roots may still settle — that is separate from Metelka finance).
  });

  it("tutorialActive: still pauses all generation including excess", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 25,
      rootSunSeconds: 25,
      rootFertilizerSeconds: 25,
      generationProgress: 0.3,
      generationRrCursor: 0,
      generationAnchorAt: NOW - 60_000,
      generationFrozenAt: null,
      dayKey: "2026-08-14",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: true,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 25,
      streakDays: 0,
      excessSeconds: 2,
      excessElapsedMs: 9_000,
      transferredRoots: [],
    });
    expect(r.excessSeconds).toBe(2);
    expect(r.excessElapsedMs).toBe(9_000);
    expect(r.excessGenerated).toBe(0);
    expect(r.generatingExcess).toBe(false);
    expect(r.generationProgress).toBe(0.3);
  });
});
