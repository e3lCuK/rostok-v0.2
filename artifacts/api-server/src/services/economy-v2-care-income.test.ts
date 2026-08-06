import { describe, expect, it } from "vitest";
import {
  computeBonusRate,
  computeCycleSkill,
  computeEconomyV2CareIncome,
  computeFreshnessForReward,
  computeIncomeForOneGame,
  buildIncomeByPresetTable,
  roundMoneyToKopecks,
  t60SecondsForCapital,
  V2_BASE_APR,
  V2_BONUS_APR_MIN,
  V2_BONUS_APR_VARIABLE,
  V2_SECONDS_PER_YEAR,
} from "./economy-v2-care-income";

const NOW = 1_700_000_000_000;
const YEAR = V2_SECONDS_PER_YEAR;

describe("roundMoneyToKopecks", () => {
  it.each([
    [1.234, 1.23],
    [1.235, 1.24],
    [0.005, 0.01],
    [0.004, 0],
    [12.999, 13],
    [NaN, 0],
  ])("rounds %s → %s", (raw, expected) => {
    expect(roundMoneyToKopecks(raw)).toBe(expected);
  });
});

describe("computeCycleSkill", () => {
  it("Skill 0 / 0.5 / 1", () => {
    expect(computeCycleSkill(0, 0, 0)).toBe(0);
    expect(computeCycleSkill(50, 50, 50)).toBe(0.5);
    expect(computeCycleSkill(100, 100, 100)).toBe(1);
  });
});

describe("computeBonusRate", () => {
  it("Freshness min/max and Skill bounds → 1.5%–3%", () => {
    expect(computeBonusRate(0, 1)).toBeCloseTo(V2_BONUS_APR_MIN, 12);
    expect(computeBonusRate(1, 1)).toBeCloseTo(
      V2_BONUS_APR_MIN + V2_BONUS_APR_VARIABLE,
      12,
    );
    expect(computeBonusRate(1, 0.5)).toBeCloseTo(
      V2_BONUS_APR_MIN + V2_BONUS_APR_VARIABLE * 0.5,
      12,
    );
    expect(computeBonusRate(0.5, 1)).toBeCloseTo(
      V2_BONUS_APR_MIN + V2_BONUS_APR_VARIABLE * 0.5,
      12,
    );
  });
});

describe("t60SecondsForCapital / Freshness", () => {
  it("at K=100000, t60 = 60×720 = 43200", () => {
    expect(t60SecondsForCapital(100_000)).toBeCloseTo(43_200, 9);
  });

  it("capital <= 0 → Infinity t60, no decay", () => {
    expect(t60SecondsForCapital(0)).toBe(Number.POSITIVE_INFINITY);
    const f = computeFreshnessForReward({
      oldFreshness: 1,
      elapsedFinancialSeconds: 1_000_000,
      capital: 0,
    });
    expect(f.extraCycles).toBe(0);
    expect(f.freshnessForReward).toBe(1);
    expect(f.newFreshness).toBe(1); // +0.05 capped at 1
  });

  it("grace 3 cycles then decay 0.01 per extra", () => {
    // t60=43200 at 100k; 5 full cycles → floor(5)-3 = 2 extra → -0.02
    const elapsed = 5 * 43_200;
    const f = computeFreshnessForReward({
      oldFreshness: 1,
      elapsedFinancialSeconds: elapsed,
      capital: 100_000,
    });
    expect(f.extraCycles).toBe(2);
    expect(f.freshnessForReward).toBeCloseTo(0.98, 12);
    expect(f.newFreshness).toBeCloseTo(1.0, 12); // 0.98+0.05 capped
  });

  it("floors at 0.50", () => {
    const elapsed = 100 * 43_200; // many cycles
    const f = computeFreshnessForReward({
      oldFreshness: 0.52,
      elapsedFinancialSeconds: elapsed,
      capital: 100_000,
    });
    expect(f.freshnessForReward).toBe(0.5);
    expect(f.newFreshness).toBeCloseTo(0.55, 12);
  });
});

describe("computeEconomyV2CareIncome", () => {
  it("missing anchor → 0 income, initializes, recovers freshness", () => {
    const r = computeEconomyV2CareIncome({
      capital: 100_000,
      incomeAnchorAt: null,
      nowMs: NOW,
      waterScore: 100,
      sunScore: 100,
      fertilizerScore: 100,
      freshness: 0.9,
    });
    expect(r.didInitializeAnchor).toBe(true);
    expect(r.elapsedFinancialSeconds).toBe(0);
    expect(r.baseReward).toBe(0);
    expect(r.bonusReward).toBe(0);
    expect(r.freshnessForReward).toBe(0.9);
    expect(r.newFreshness).toBeCloseTo(0.95, 12);
  });

  it("base independent of Skill; bonus depends on Skill×Freshness", () => {
    // Within grace (3×t60) so Freshness stays 1.0
    const elapsed = 86_400;
    const yearFrac = elapsed / YEAR;
    const anchor = NOW - elapsed * 1000;
    const low = computeEconomyV2CareIncome({
      capital: 100_000,
      incomeAnchorAt: anchor,
      nowMs: NOW,
      waterScore: 0,
      sunScore: 0,
      fertilizerScore: 0,
      freshness: 1,
    });
    const high = computeEconomyV2CareIncome({
      capital: 100_000,
      incomeAnchorAt: anchor,
      nowMs: NOW,
      waterScore: 100,
      sunScore: 100,
      fertilizerScore: 100,
      freshness: 1,
    });
    const expectedBase = roundMoneyToKopecks(100_000 * V2_BASE_APR * yearFrac);
    expect(low.baseReward).toBe(expectedBase);
    expect(high.baseReward).toBe(expectedBase);
    expect(low.freshnessForReward).toBe(1);
    expect(high.freshnessForReward).toBe(1);
    expect(low.bonusReward).toBe(
      roundMoneyToKopecks(100_000 * V2_BONUS_APR_MIN * yearFrac),
    );
    expect(high.bonusReward).toBe(
      roundMoneyToKopecks(
        100_000 * (V2_BONUS_APR_MIN + V2_BONUS_APR_VARIABLE) * yearFrac,
      ),
    );
  });

  it("capital 0 → zero income, no NaN freshness", () => {
    const r = computeEconomyV2CareIncome({
      capital: 0,
      incomeAnchorAt: NOW - YEAR * 1000,
      nowMs: NOW,
      waterScore: 100,
      sunScore: 100,
      fertilizerScore: 100,
      freshness: 0.8,
    });
    expect(r.baseReward).toBe(0);
    expect(r.bonusReward).toBe(0);
    expect(Number.isFinite(r.newFreshness)).toBe(true);
  });

  it("deterministic — no random", () => {
    const input = {
      capital: 100_000,
      incomeAnchorAt: NOW - 86_400 * 1000,
      nowMs: NOW,
      waterScore: 80,
      sunScore: 70,
      fertilizerScore: 90,
      freshness: 0.95,
    };
    const a = computeEconomyV2CareIncome(input);
    const b = computeEconomyV2CareIncome(input);
    expect(a).toEqual(b);
  });

  it("partial day rounding to kopecks (independent expected)", () => {
    // elapsed = 1 day; capital 100000
    // base raw = 100000 * 0.12 * (86400/31536000) = 12000 * (86400/31536000) = 32.876712...
    const elapsed = 86_400;
    const r = computeEconomyV2CareIncome({
      capital: 100_000,
      incomeAnchorAt: NOW - elapsed * 1000,
      nowMs: NOW,
      waterScore: 100,
      sunScore: 100,
      fertilizerScore: 100,
      freshness: 1,
    });
    const yearFrac = elapsed / YEAR;
    const expectedBase = roundMoneyToKopecks(100_000 * V2_BASE_APR * yearFrac);
    const expectedBonus = roundMoneyToKopecks(
      100_000 * (V2_BONUS_APR_MIN + V2_BONUS_APR_VARIABLE) * yearFrac,
    );
    expect(r.baseReward).toBe(expectedBase);
    expect(r.bonusReward).toBe(expectedBonus);
    expect(r.baseReward).toBe(32.88);
    expect(r.bonusReward).toBe(8.22);
  });

  it("Skill 0.5 Freshness 0.5 → bonusRate 1.875% (within grace)", () => {
    const elapsed = 86_400;
    const r = computeEconomyV2CareIncome({
      capital: 100_000,
      incomeAnchorAt: NOW - elapsed * 1000,
      nowMs: NOW,
      waterScore: 50,
      sunScore: 50,
      fertilizerScore: 50,
      freshness: 0.5,
    });
    expect(r.cycleSkill).toBe(0.5);
    expect(r.freshnessForReward).toBe(0.5);
    expect(r.bonusRate).toBeCloseTo(0.015 + 0.015 * 0.5 * 0.5, 12);
    expect(r.bonusReward).toBe(
      roundMoneyToKopecks(100_000 * r.bonusRate * (elapsed / YEAR)),
    );
  });
});

describe("computeIncomeForOneGame / buildIncomeByPresetTable", () => {
  it("awards by preset seconds; longer preset → more income", () => {
    const five = computeIncomeForOneGame({
      capital: 100_000,
      presetSeconds: 5,
      skill: 1,
    });
    const twentyFive = computeIncomeForOneGame({
      capital: 100_000,
      presetSeconds: 25,
      skill: 1,
    });
    // At K=100k: 5 game-sec → 5×720 = 3600 financial sec → base≈1.37
    expect(five.elapsedFinancialSeconds).toBe(5 * 720);
    expect(five.total).toBeGreaterThan(0);
    expect(twentyFive.total).toBeGreaterThan(five.total);
    expect(twentyFive.elapsedFinancialSeconds).toBe(25 * 720);
  });

  it("catalog has all 21 presets 5…25 from server formulas", () => {
    const table = buildIncomeByPresetTable({ capital: 100_000 });
    expect(table).toHaveLength(21);
    expect(table[0]?.presetSeconds).toBe(5);
    expect(table[20]?.presetSeconds).toBe(25);
    expect(table.every((r) => r.income > 0)).toBe(true);
    expect(table[20]!.income).toBeGreaterThan(table[0]!.income);
  });
});
