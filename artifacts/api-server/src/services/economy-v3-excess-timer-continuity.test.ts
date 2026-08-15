/**
 * Excess minting must NOT advance gold ~12:00 generationProgress.
 * Grey flask uses financial elapsed; gold resumes from a frozen/reset save.
 */
import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import {
  buildEconomyV3RootsPublicState,
  settleEconomyV3Roots,
} from "./economy-v3-roots";

const NOW = 1_700_000_000_000;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;
const CAP = 25;

function excessBase(overrides: Record<string, unknown> = {}) {
  return {
    rootWaterSeconds: 0,
    rootSunSeconds: 0,
    rootFertilizerSeconds: 0,
    generationProgress: 0,
    generationRrCursor: 0,
    generationAnchorAt: NOW,
    generationFrozenAt: null,
    dayKey: "2026-07-29",
    capital: 100_000,
    nowMs: NOW,
    tutorialActive: false,
    reserveWaterSeconds: CAP,
    reserveSunSeconds: CAP,
    reserveFertilizerSeconds: CAP,
    dailyCapSeconds: CAP,
    streakDays: 0,
    visitBonusSeconds: 0,
    excessSeconds: 0,
    excessElapsedMs: 0,
    transferredRoots: [] as const,
    ...overrides,
  };
}

function pubFromSettle(
  settled: ReturnType<typeof settleEconomyV3Roots>,
  nowMs: number,
) {
  return buildEconomyV3RootsPublicState(
    {
      v3_root_water_seconds: settled.rootWaterSeconds,
      v3_root_sun_seconds: settled.rootSunSeconds,
      v3_root_fertilizer_seconds: settled.rootFertilizerSeconds,
      v3_reserve_water_seconds: settled.reserveWaterSeconds,
      v3_reserve_sun_seconds: settled.reserveSunSeconds,
      v3_reserve_fertilizer_seconds: settled.reserveFertilizerSeconds,
      v3_generation_progress: settled.generationProgress,
      v3_generation_anchor_at: new Date(settled.generationAnchorAt).toISOString(),
      v3_generation_rr_cursor: settled.generationRrCursor,
      tutorial_done: true,
    },
    {
      capital: 100_000,
      nowMs,
      generatingExcess: settled.generatingExcess,
      excessAvailable: settled.excessSeconds >= 5,
    },
  );
}

describe("excess generation vs gold cycle progress", () => {
  it("capacity excess keeps generationProgress at 0 across polls (fresh gold later)", () => {
    let anchor = NOW;
    let excess = 0;
    let excessElapsed = 0;

    for (let i = 0; i < 6; i++) {
      const t = NOW + i * 5000;
      const settled = settleEconomyV3Roots(
        excessBase({
          generationProgress: 0.35,
          generationAnchorAt: anchor,
          nowMs: t,
          excessSeconds: excess,
          excessElapsedMs: excessElapsed,
        }),
      );
      expect(settled.ordinaryFull).toBe(true);
      expect(settled.generatingExcess).toBe(true);
      // Capacity excess wipes mid-cycle save so post-Care gold starts at 12:00.
      expect(settled.generationProgress).toBe(0);
      if (i > 0) {
        expect(settled.excessGenerated).toBeGreaterThan(0);
      }
      anchor = settled.generationAnchorAt;
      excess = settled.excessSeconds;
      excessElapsed = settled.excessElapsedMs;

      const pub = pubFromSettle(settled, t);
      const rem = pub.generation.secondsUntilNextWholeSecond!;
      expect(rem).toBeCloseTo(T, 5);
    }

    expect(excess).toBeGreaterThan(0);
  });

  it("care-hold-only freezes prior ordinary progress (partial-fill save)", () => {
    const prior = 0.4;
    const settled = settleEconomyV3Roots(
      excessBase({
        rootWaterSeconds: 0,
        rootSunSeconds: 0,
        rootFertilizerSeconds: 0,
        reserveWaterSeconds: 5,
        reserveSunSeconds: 5,
        reserveFertilizerSeconds: 5,
        generationProgress: prior,
        generationAnchorAt: NOW - T * 1000,
        nowMs: NOW,
        transferredRoots: ["water", "sun", "fertilizer"],
        careCycleHoldingExcess: true,
        excessSeconds: 3,
        excessElapsedMs: 20_000,
      }),
    );
    expect(settled.generatingExcess).toBe(true);
    expect(settled.excessGenerated).toBeGreaterThan(0);
    expect(settled.generationProgress).toBe(prior);
  });

  it("long capacity excess still credits ledger but does not leave fractional gold save", () => {
    const elapsedSec = T + 20;
    const settled = settleEconomyV3Roots(
      excessBase({
        generationProgress: 0.2,
        generationAnchorAt: NOW - elapsedSec * 1000,
        nowMs: NOW,
      }),
    );
    expect(settled.excessGenerated).toBeCloseTo(1 + 20 / T, 5);
    expect(settled.generationProgress).toBe(0);
    expect(settled.wholeSeconds).toBe(0);

    const pub = pubFromSettle(settled, NOW);
    const rem = pub.generation.secondsUntilNextWholeSecond!;
    expect(rem).toBeCloseTo(T, 5);
  });

  it("repeated identical now is idempotent for progress + excess", () => {
    const first = settleEconomyV3Roots(
      excessBase({
        generationAnchorAt: NOW - 30_000,
        nowMs: NOW,
        generationProgress: 0.1,
      }),
    );
    const second = settleEconomyV3Roots(
      excessBase({
        generationProgress: first.generationProgress,
        generationAnchorAt: first.generationAnchorAt,
        nowMs: NOW,
        excessSeconds: first.excessSeconds,
        excessElapsedMs: first.excessElapsedMs,
      }),
    );
    expect(second.excessGenerated).toBe(0);
    expect(second.generationProgress).toBe(0);
    expect(first.generationProgress).toBe(0);
  });
});
