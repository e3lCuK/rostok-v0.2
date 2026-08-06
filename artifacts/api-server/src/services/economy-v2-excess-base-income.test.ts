/**
 * Excess-period base income (Care 12% APR) vs ordinary Care split.
 */

import { describe, expect, it } from "vitest";
import { V2_BASE_APR, V2_SECONDS_PER_YEAR } from "./economy-v2-care-income";
import { computeEconomyV2CareIncome } from "./economy-v2-care-income";
import {
  computeBaseIncomeForElapsedMs,
  computeExcessElapsedMsShare,
  computeOrdinaryElapsedMsShare,
  V2_YEAR_DURATION_MS,
} from "./economy-v2-excess-income";
import { settleEconomyV2Roots } from "./economy-v2-roots";
import { V2_ENERGY_BANK_MAX } from "./economy-v2";

const K = 100_000;
const YEAR_MS = V2_YEAR_DURATION_MS;

describe("excess / ordinary elapsed split", () => {
  it("4. ordinary + excess = total elapsed", () => {
    const elapsedMs = 10_000;
    const excess = computeExcessElapsedMsShare({
      elapsedMs,
      generatedGameSeconds: 5,
      excessGenerated: 3,
    });
    const ordinary = computeOrdinaryElapsedMsShare({
      elapsedMs,
      excessElapsedMs: excess,
    });
    expect(ordinary + excess).toBeCloseTo(elapsedMs, 10);
    expect(ordinary / elapsedMs).toBeCloseTo(2 / 5, 10);
    expect(excess / elapsedMs).toBeCloseTo(3 / 5, 10);
  });

  it("partial overflow proportional (1 free of 4 generated)", () => {
    const elapsedMs = 8_000;
    const excess = computeExcessElapsedMsShare({
      elapsedMs,
      generatedGameSeconds: 4,
      excessGenerated: 3,
    });
    const ordinary = computeOrdinaryElapsedMsShare({
      elapsedMs,
      excessElapsedMs: excess,
    });
    expect(ordinary).toBeCloseTo(elapsedMs * 0.25, 8);
    expect(excess).toBeCloseTo(elapsedMs * 0.75, 8);
  });
});

describe("excess-base ledger math", () => {
  it("5. care-base + excess-base = continuous base for same interval", () => {
    const elapsedMs = 3_600_000; // 1h
    const excessMs = elapsedMs * 0.6;
    const ordinaryMs = elapsedMs * 0.4;
    const continuous = computeBaseIncomeForElapsedMs({
      capital: K,
      elapsedMs,
    });
    const carePart = computeBaseIncomeForElapsedMs({
      capital: K,
      elapsedMs: ordinaryMs,
    });
    const excessPart = computeBaseIncomeForElapsedMs({
      capital: K,
      elapsedMs: excessMs,
    });
    expect(carePart + excessPart).toBeCloseTo(continuous, 10);
    expect(continuous).toBeCloseTo(
      K * V2_BASE_APR * (elapsedMs / 1000 / V2_SECONDS_PER_YEAR),
      10,
    );
  });

  it("8. capital change does not rewrite past increment", () => {
    const first = computeBaseIncomeForElapsedMs({
      capital: 100_000,
      elapsedMs: 3_600_000,
    });
    const second = computeBaseIncomeForElapsedMs({
      capital: 200_000,
      elapsedMs: 3_600_000,
    });
    const ledger = first + second;
    expect(ledger).toBeCloseTo(first + second, 12);
    expect(second).toBeCloseTo(first * 2, 10);
  });

  it("uses Care base APR and year constant", () => {
    const ms = YEAR_MS;
    expect(
      computeBaseIncomeForElapsedMs({ capital: K, elapsedMs: ms }),
    ).toBeCloseTo(K * V2_BASE_APR, 8);
  });
});

describe("settleEconomyV2Roots attributes ordinary vs excess base time", () => {
  const now = 2_000_000_000_000;

  it("1. ordinary not full → excessElapsedGenerated=0, all ordinary", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: now - 60_000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      capital: K,
      nowMs: now,
    });
    expect(r.excessGenerated).toBe(0);
    expect(r.excessElapsedMsGenerated).toBe(0);
    expect(r.ordinaryElapsedMsGenerated).toBeCloseTo(r.elapsedSeconds * 1000, 6);
    expect(
      r.ordinaryElapsedMsGenerated + r.excessElapsedMsGenerated,
    ).toBeCloseTo(r.elapsedSeconds * 1000, 6);
  });

  it("2. storage full → all elapsed to excess", () => {
    const r = settleEconomyV2Roots({
      energySeconds: V2_ENERGY_BANK_MAX,
      energyAnchorAt: now - 60_000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 10,
      excessElapsedMs: 1000,
      capital: K,
      nowMs: now,
    });
    expect(r.excessGenerated).toBeGreaterThan(0);
    expect(r.excessElapsedMsGenerated).toBeCloseTo(60_000, 6);
    expect(r.ordinaryElapsedMsGenerated).toBeCloseTo(0, 6);
  });

  it("3. partial overflow splits elapsed", () => {
    // Bank nearly full: freeCapacity ~1s at high capital generation.
    const r = settleEconomyV2Roots({
      energySeconds: V2_ENERGY_BANK_MAX - 1,
      energyAnchorAt: now - 10_000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      capital: K,
      nowMs: now,
    });
    if (r.excessGenerated > 0 && r.generatedEnergy > 0) {
      expect(
        r.ordinaryElapsedMsGenerated + r.excessElapsedMsGenerated,
      ).toBeCloseTo(10_000, 5);
      expect(r.excessElapsedMsGenerated / 10_000).toBeCloseTo(
        r.excessGenerated / r.generatedEnergy,
        5,
      );
    }
  });

  it("7. second settle with same anchor window produces 0 (anchor advanced)", () => {
    const first = settleEconomyV2Roots({
      energySeconds: V2_ENERGY_BANK_MAX,
      energyAnchorAt: now - 5_000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      capital: K,
      nowMs: now,
    });
    const second = settleEconomyV2Roots({
      energySeconds: V2_ENERGY_BANK_MAX,
      energyAnchorAt: first.energyAnchorAt,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: first.excessSeconds,
      excessElapsedMs: first.excessElapsedMs,
      capital: K,
      nowMs: now,
    });
    expect(second.excessElapsedMsGenerated).toBe(0);
    expect(second.ordinaryElapsedMsGenerated).toBe(0);
    expect(second.excessElapsedMs).toBe(first.excessElapsedMs);
  });
});

describe("Care income excludes excess via ordinaryElapsedMs", () => {
  it("6. ordinary-only money; wall clock still drives freshness", () => {
    const now = 1_700_000_000_000;
    const wallHour = 3_600_000;
    const withSplit = computeEconomyV2CareIncome({
      capital: K,
      incomeAnchorAt: now - wallHour,
      nowMs: now,
      waterScore: 100,
      sunScore: 100,
      fertilizerScore: 100,
      freshness: 1,
      ordinaryIncomeElapsedMs: 0,
    });
    expect(withSplit.baseReward).toBe(0);
    expect(withSplit.bonusReward).toBe(0);

    const fullOrdinary = computeEconomyV2CareIncome({
      capital: K,
      incomeAnchorAt: now - wallHour,
      nowMs: now,
      waterScore: 100,
      sunScore: 100,
      fertilizerScore: 100,
      freshness: 1,
      ordinaryIncomeElapsedMs: wallHour,
    });
    const legacyWall = computeEconomyV2CareIncome({
      capital: K,
      incomeAnchorAt: now - wallHour,
      nowMs: now,
      waterScore: 100,
      sunScore: 100,
      fertilizerScore: 100,
      freshness: 1,
    });
    expect(fullOrdinary.baseReward).toBe(legacyWall.baseReward);
  });

  it("13. without ordinaryIncomeElapsedMs Care still uses wall-clock", () => {
    const now = 1_700_000_000_000;
    const r = computeEconomyV2CareIncome({
      capital: K,
      incomeAnchorAt: now - 3_600_000,
      nowMs: now,
      waterScore: 50,
      sunScore: 50,
      fertilizerScore: 50,
      freshness: 1,
    });
    expect(r.baseReward).toBeGreaterThan(0);
  });
});
