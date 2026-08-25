import { describe, expect, it } from "vitest";
import {
  computeTutorialCompensation,
  reconcileMoneyAgainstTutorialRubleFloor,
  reconcileTutorialHandoffBalances,
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
    expect(r.growthMm).toBe(1);
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

describe("reconcileTutorialHandoffBalances", () => {
  it("prefers server 0.01₽ over a local 1₽ floor", () => {
    expect(
      reconcileTutorialHandoffBalances({
        serverBalance: 100_000.01,
        serverEarned: 0.01,
        localBalance: 100_001,
        localEarned: 1,
        demoMoney: 1,
      }),
    ).toEqual({ balance: 100_000.01, earned: 0.01 });
  });

  it("keeps local kopecks when the server has not granted yet", () => {
    expect(
      reconcileTutorialHandoffBalances({
        serverBalance: 100_000,
        serverEarned: 0,
        localBalance: 100_000.01,
        localEarned: 0.01,
        demoMoney: 0.01,
      }),
    ).toEqual({ balance: 100_000.01, earned: 0.01 });
  });
});

describe("reconcileMoneyAgainstTutorialRubleFloor", () => {
  it("snaps a stale 1₽ client floor down to server kopecks", () => {
    expect(reconcileMoneyAgainstTutorialRubleFloor(0.01, 1)).toBe(0.01);
  });

  it("keeps a real 1₽ grant when server agrees", () => {
    expect(reconcileMoneyAgainstTutorialRubleFloor(1, 1)).toBe(1);
  });

  it("does not hide a larger local Care credit", () => {
    expect(reconcileMoneyAgainstTutorialRubleFloor(0.01, 19.01)).toBe(19.01);
  });
});
