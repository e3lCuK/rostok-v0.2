import { describe, expect, it } from "vitest";
import {
  computeTutorialCompensation,
  TUTORIAL_COMPENSATION_ELAPSED_MAX_MS,
  TUTORIAL_COMPENSATION_FALLBACK_RUB,
} from "./economy-v3-tutorial-compensation";
import {
  V2_BASE_APR,
  V2_SECONDS_PER_YEAR,
  roundMoneyToKopecks,
} from "./economy-v2-care-income";

describe("computeTutorialCompensation", () => {
  const NOW = 1_700_000_000_000;

  it("awards capital × 12% × elapsed/year (kopecks)", () => {
    const startedAtMs = NOW - 10 * 60 * 1000; // 10 minutes
    const endedAtMs = NOW;
    const capital = 100_000;
    const r = computeTutorialCompensation({
      capital,
      startedAtMs,
      endedAtMs,
      nowMs: NOW,
    });
    const expected = roundMoneyToKopecks(
      capital * V2_BASE_APR * ((10 * 60) / V2_SECONDS_PER_YEAR),
    );
    expect(r.usedFallback).toBe(false);
    expect(r.amountRub).toBe(expected);
    expect(r.growthMm).toBe(Math.max(1, Math.floor(expected)));
    expect(r.elapsedMs).toBe(10 * 60 * 1000);
  });

  it("falls back to +1₽ when timestamps missing", () => {
    const r = computeTutorialCompensation({
      capital: 100_000,
      startedAtMs: null,
      endedAtMs: null,
      nowMs: NOW,
    });
    expect(r.usedFallback).toBe(true);
    expect(r.amountRub).toBe(TUTORIAL_COMPENSATION_FALLBACK_RUB);
    expect(r.growthMm).toBe(1);
  });

  it("clamps elapsed to max window", () => {
    const r = computeTutorialCompensation({
      capital: 100_000,
      startedAtMs: NOW - TUTORIAL_COMPENSATION_ELAPSED_MAX_MS * 3,
      endedAtMs: NOW,
      nowMs: NOW,
    });
    expect(r.elapsedMs).toBe(TUTORIAL_COMPENSATION_ELAPSED_MAX_MS);
    expect(r.usedFallback).toBe(false);
  });
});
