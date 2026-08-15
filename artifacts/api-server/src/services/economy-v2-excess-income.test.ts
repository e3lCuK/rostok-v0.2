import { describe, expect, it } from "vitest";
import {
  computeExcessElapsedMsShare,
  computeExcessCleaningIncome,
  computeExcessGrossIncome,
  computeExcessPaidIncome,
  computeExcessPaymentFactor,
  financialCycleDurationMsForCapital,
  splitMetelkaPaidFinancialCycles,
  V2_YEAR_DURATION_MS,
} from "./economy-v2-excess-income";
import { V2_SECONDS_PER_YEAR } from "./economy-v2-care-income";
import { V2_REFERENCE_CAPITAL } from "./economy-v2";

const REF_CYCLE_MS = financialCycleDurationMsForCapital(V2_REFERENCE_CAPITAL);

describe("computeExcessElapsedMsShare", () => {
  it("1. full ordinary storage → all elapsed to t_excess", () => {
    expect(
      computeExcessElapsedMsShare({
        elapsedMs: 10_000,
        generatedGameSeconds: 5,
        excessGenerated: 5,
      }),
    ).toBe(10_000);
  });

  it("2. partial overflow → proportional share", () => {
    expect(
      computeExcessElapsedMsShare({
        elapsedMs: 10_000,
        generatedGameSeconds: 5,
        excessGenerated: 3,
      }),
    ).toBeCloseTo(6000, 10);
  });

  it("zero excess → 0", () => {
    expect(
      computeExcessElapsedMsShare({
        elapsedMs: 10_000,
        generatedGameSeconds: 5,
        excessGenerated: 0,
      }),
    ).toBe(0);
  });
});

describe("computeExcessPaymentFactor", () => {
  it("8. Skill 0 → 0.5", () => {
    expect(computeExcessPaymentFactor(0)).toBe(0.5);
  });
  it("9. Skill 0.5 → 0.75", () => {
    expect(computeExcessPaymentFactor(0.5)).toBe(0.75);
  });
  it("10. Skill 1 → 1", () => {
    expect(computeExcessPaymentFactor(1)).toBe(1);
  });
});

describe("gross / paid formulas", () => {
  it("11. Gross = K × (t/Y) × r", () => {
    const capital = 100_000;
    const excessElapsedMs = V2_YEAR_DURATION_MS / 2; // half year
    const annualRate = 0.01;
    const gross = computeExcessGrossIncome({
      capital,
      excessElapsedMs,
      annualRate,
    });
    expect(gross).toBeCloseTo(500, 10);
    expect(V2_YEAR_DURATION_MS).toBe(V2_SECONDS_PER_YEAR * 1000);
  });

  it("12. Paid = gross × factor", () => {
    const { paymentFactor, paidIncome } = computeExcessPaidIncome({
      grossIncome: 100,
      skill: 0.5,
    });
    expect(paymentFactor).toBe(0.75);
    expect(paidIncome).toBeCloseTo(75, 10);
  });
});

describe("computeExcessCleaningIncome", () => {
  it("17. legacy excess without elapsed → unavailable", () => {
    const r = computeExcessCleaningIncome({
      capital: 50_000,
      sourceElapsedMs: 0,
      sourceSeconds: 12,
      annualRate: 0.014,
      skill: 1,
    });
    expect(r.available).toBe(false);
    expect(r.reason).toBe("missing_excess_elapsed_history");
    expect(r.paidIncome).toBe(0);
  });

  it("ok path stores raw paid", () => {
    const r = computeExcessCleaningIncome({
      capital: 100_000,
      sourceElapsedMs: V2_YEAR_DURATION_MS,
      sourceSeconds: 10,
      annualRate: 0.01,
      skill: 0,
    });
    expect(r.available).toBe(true);
    expect(r.grossIncome).toBeCloseTo(1000, 8);
    expect(r.paymentFactor).toBe(0.5);
    expect(r.paidIncome).toBeCloseTo(500, 8);
  });
});

describe("splitMetelkaPaidFinancialCycles", () => {
  it("reference capital cycle is 720s", () => {
    expect(REF_CYCLE_MS).toBe(720_000);
  });

  it("peels incomplete financial-cycle tail from the paid snapshot", () => {
    const elapsed = 2 * REF_CYCLE_MS + 90_000; // 2 full + 1.5 min
    const split = splitMetelkaPaidFinancialCycles({
      excessElapsedMs: elapsed,
      excessSeconds: 2.5,
      excessBaseIncome: 10,
      capital: V2_REFERENCE_CAPITAL,
    });
    expect(split.completeCycles).toBe(2);
    expect(split.paidElapsedMs).toBe(2 * REF_CYCLE_MS);
    expect(split.paidSeconds).toBe(2);
    expect(split.remainderElapsedMs).toBe(90_000);
    expect(split.remainderSeconds).toBeCloseTo(0.5, 10);
    expect(split.paidBaseIncome + split.remainderBaseIncome).toBeCloseTo(10, 10);
    expect(split.paidBaseIncome).toBeCloseTo(10 * ((2 * REF_CYCLE_MS) / elapsed), 10);
  });

  it("under one cycle → nothing paid; full remainder kept", () => {
    const split = splitMetelkaPaidFinancialCycles({
      excessElapsedMs: 45_000,
      excessSeconds: 10,
      excessBaseIncome: 3,
      capital: V2_REFERENCE_CAPITAL,
    });
    expect(split.completeCycles).toBe(0);
    expect(split.paidElapsedMs).toBe(0);
    expect(split.paidSeconds).toBe(0);
    expect(split.paidBaseIncome).toBe(0);
    expect(split.remainderElapsedMs).toBe(45_000);
    expect(split.remainderSeconds).toBe(10);
    expect(split.remainderBaseIncome).toBe(3);
  });

  it("exact cycle boundary pays all", () => {
    const split = splitMetelkaPaidFinancialCycles({
      excessElapsedMs: 5 * REF_CYCLE_MS,
      excessSeconds: 5,
      excessBaseIncome: 1.25,
      capital: V2_REFERENCE_CAPITAL,
    });
    expect(split.completeCycles).toBe(5);
    expect(split.paidElapsedMs).toBe(5 * REF_CYCLE_MS);
    expect(split.paidSeconds).toBe(5);
    expect(split.remainderElapsedMs).toBe(0);
    expect(split.remainderSeconds).toBe(0);
  });
});
