import { describe, expect, it } from "vitest";
import {
  computeTutorialCompensation,
  TUTORIAL_COMPENSATION_APR,
  TUTORIAL_COMPENSATION_FALLBACK_RUB,
  TUTORIAL_COMPENSATION_SECONDS_PER_YEAR,
} from "./tutorialCompensation";

describe("computeTutorialCompensation (client)", () => {
  const NOW = 1_700_000_000_000;

  it("matches capital × 12% × elapsed/year", () => {
    const capital = 100_000;
    const elapsedSec = 600;
    const r = computeTutorialCompensation({
      capital,
      startedAtMs: NOW - elapsedSec * 1000,
      endedAtMs: NOW,
      nowMs: NOW,
    });
    const expected =
      Math.round(
        (capital *
          TUTORIAL_COMPENSATION_APR *
          (elapsedSec / TUTORIAL_COMPENSATION_SECONDS_PER_YEAR) +
          Number.EPSILON) *
          100,
      ) / 100;
    expect(r.usedFallback).toBe(false);
    expect(r.amountRub).toBe(expected);
  });

  it("falls back without timestamps", () => {
    expect(
      computeTutorialCompensation({
        capital: 100_000,
        startedAtMs: null,
        endedAtMs: null,
        nowMs: NOW,
      }).amountRub,
    ).toBe(TUTORIAL_COMPENSATION_FALLBACK_RUB);
  });
});
