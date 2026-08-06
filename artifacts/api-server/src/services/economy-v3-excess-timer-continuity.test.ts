/**
 * Excess-generation path must advance generationProgress so nextWholeSecondAt
 * stays an absolute deadline (no 11:57→11:54→11:57 poll reset).
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

describe("excess generation cycle clock continuity", () => {
  it("polling every 5s does not slide nextWholeSecondAt forward", () => {
    let progress = 0;
    let anchor = NOW;
    let excess = 0;
    let excessElapsed = 0;
    let deadline: number | null = null;

    for (let i = 0; i < 6; i++) {
      const t = NOW + i * 5000;
      const settled = settleEconomyV3Roots(
        excessBase({
          generationProgress: progress,
          generationAnchorAt: anchor,
          nowMs: t,
          excessSeconds: excess,
          excessElapsedMs: excessElapsed,
        }),
      );
      expect(settled.ordinaryFull).toBe(true);
      if (i > 0) {
        expect(settled.excessGenerated).toBeGreaterThan(0);
        expect(settled.generatingExcess).toBe(true);
      }
      progress = settled.generationProgress;
      anchor = settled.generationAnchorAt;
      excess = settled.excessSeconds;
      excessElapsed = settled.excessElapsedMs;

      const pub = pubFromSettle(settled, t);
      expect(pub.generation.nextWholeSecondAt).not.toBeNull();
      const nextAt = Date.parse(pub.generation.nextWholeSecondAt!);
      if (deadline == null) {
        deadline = nextAt;
      } else {
        // Absolute deadline stays within 1s of the first poll (no +5s slide).
        expect(Math.abs(nextAt - deadline)).toBeLessThan(1000);
      }

      const rem = pub.generation.secondsUntilNextWholeSecond!;
      expect(rem).toBeLessThanOrEqual(T);
      expect(rem).toBeGreaterThan(T - 40); // ~30s elapsed across 6 polls
    }

    expect(excess).toBeGreaterThan(0);
  });

  it("long absence credits wholes and keeps fractional remainder (not fresh 12:00)", () => {
    const elapsedSec = T + 20; // one full unit + 20s
    const settled = settleEconomyV3Roots(
      excessBase({
        generationProgress: 0,
        generationAnchorAt: NOW - elapsedSec * 1000,
        nowMs: NOW,
      }),
    );
    expect(settled.excessGenerated).toBeCloseTo(1 + 20 / T, 5);
    expect(settled.generationProgress).toBeCloseTo(20 / T, 5);
    expect(settled.wholeSeconds).toBe(1);

    const pub = pubFromSettle(settled, NOW);
    const rem = pub.generation.secondsUntilNextWholeSecond!;
    // Remaining ≈ T - 20, not a full T restart.
    expect(rem).toBeCloseTo(T - 20, 5);
    expect(rem).toBeLessThan(T - 5);
  });

  it("repeated identical now is idempotent for progress + deadline", () => {
    const first = settleEconomyV3Roots(
      excessBase({
        generationAnchorAt: NOW - 30_000,
        nowMs: NOW,
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
    expect(second.generationProgress).toBe(first.generationProgress);
    const a = pubFromSettle(first, NOW).generation.nextWholeSecondAt;
    const b = pubFromSettle(second, NOW).generation.nextWholeSecondAt;
    expect(a).toBe(b);
  });
});
