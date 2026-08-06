import { describe, expect, it } from "vitest";
import {
  computeBaseIncomeForElapsedMs,
  computeExcessGrossIncome,
  computeExcessPaidIncome,
  V2_YEAR_DURATION_MS,
} from "./economy-v2-excess-income";
import { V2_BASE_APR } from "./economy-v2-care-income";
import {
  computeMetelkaEarnedBonusFromClearedWebs,
  computeMetelkaFinishPendingAward,
} from "./economy-v2-excess-metelka-pending";
import { splitMetelkaBonusAmongWhiteWebs } from "./economy-v2-excess-metelka-payout";
import { roundMoneyToKopecks } from "./economy-v2-care-income";
import {
  excessBonusRate,
  excessCycleFromSeconds,
  excessPresetSeconds,
} from "./economy-v2-excess";
import { computeExcessWebCount } from "./economy-v2-excess-webs";
import { computeExcessCleaningXp } from "./economy-v2-excess-xp";

describe("computeMetelkaEarnedBonusFromClearedWebs (legacy shares)", () => {
  it("partial webs sum only their shares", () => {
    const fullBonus = 1.05;
    const n = 5;
    const shares = splitMetelkaBonusAmongWhiteWebs(fullBonus, n);
    const earned = computeMetelkaEarnedBonusFromClearedWebs({
      fullBonus,
      whiteWebCount: n,
      clearedWebIds: ["web-0", "web-2", "web-4"],
    });
    const expected = roundMoneyToKopecks(
      (shares[0] ?? 0) + (shares[2] ?? 0) + (shares[4] ?? 0),
    );
    expect(earned).toBe(expected);
  });
});

describe("computeMetelkaFinishPendingAward — APR model", () => {
  const capital = 100_000;
  /** ~just reached T=25: n≈61.5 → excessSeconds≈3690 */
  const justReached25Seconds = 3690;
  const justReached25ElapsedMs = 30 * 24 * 60 * 60 * 1000; // 30 days wall
  /** Two more months after T=25 */
  const longAbsenceSeconds = 3690 + 10_000;
  const longAbsenceElapsedMs = justReached25ElapsedMs + 60 * 24 * 60 * 60 * 1000;

  it("zero cleared: full base, 50% D_excess, 0 XP", () => {
    const rate = excessBonusRate(excessCycleFromSeconds(60));
    const elapsedMs = 3_600_000; // 1 hour
    const award = computeMetelkaFinishPendingAward({
      capital,
      sourceSeconds: 60,
      sourceElapsedMs: elapsedMs,
      annualRate: rate,
      presetSeconds: excessPresetSeconds(excessCycleFromSeconds(60)),
      whiteWebCount: 12,
      clearedWebIds: [],
    });
    const expectedBase = roundMoneyToKopecks(
      computeBaseIncomeForElapsedMs({
        capital,
        elapsedMs,
        annualRate: V2_BASE_APR,
      }),
    );
    const gross = computeExcessGrossIncome({
      capital,
      excessElapsedMs: elapsedMs,
      annualRate: rate,
    });
    const { paidIncome, paymentFactor } = computeExcessPaidIncome({
      grossIncome: gross,
      skill: 0,
    });
    expect(paymentFactor).toBe(0.5);
    expect(award.earnedBase).toBe(expectedBase);
    expect(award.earnedBonus).toBe(roundMoneyToKopecks(paidIncome));
    expect(award.earnedXp).toBe(0);
    expect(award.earnedBase).toBeGreaterThan(0);
    expect(award.earnedBonus).toBeGreaterThan(0);
  });

  it("all cleared: full base + 100% D_excess + max XP(T)", () => {
    const rate = excessBonusRate(excessCycleFromSeconds(60));
    const elapsedMs = 3_600_000;
    const T = excessPresetSeconds(excessCycleFromSeconds(60));
    const webs = computeExcessWebCount(T);
    const award = computeMetelkaFinishPendingAward({
      capital,
      sourceSeconds: 60,
      sourceElapsedMs: elapsedMs,
      annualRate: rate,
      presetSeconds: T,
      whiteWebCount: webs,
      clearedWebIds: Array.from({ length: webs }, (_, i) => `web-${i}`),
    });
    const gross = computeExcessGrossIncome({
      capital,
      excessElapsedMs: elapsedMs,
      annualRate: rate,
    });
    expect(award.paymentFactor).toBe(1);
    expect(award.earnedBonus).toBe(roundMoneyToKopecks(gross));
    expect(award.earnedXp).toBe(
      computeExcessCleaningXp({ presetSeconds: T, skill: 1 }).awardedXp,
    );
  });

  it("synthetic ledger (seconds without elapsed) → no money, XP still from skill", () => {
    const award = computeMetelkaFinishPendingAward({
      capital,
      sourceSeconds: 25,
      sourceElapsedMs: 0,
      annualRate: 0.015,
      presetSeconds: 5,
      whiteWebCount: 12,
      clearedWebIds: Array.from({ length: 12 }, (_, i) => `web-${i}`),
    });
    expect(award.earnedBase).toBe(0);
    expect(award.earnedBonus).toBe(0);
    expect(award.totalMoney).toBe(0);
    expect(award.earnedXp).toBeGreaterThan(0);
  });

  it("tutorial zeros awards", () => {
    const award = computeMetelkaFinishPendingAward({
      capital,
      sourceSeconds: 60,
      sourceElapsedMs: 3_600_000,
      annualRate: 0.014,
      presetSeconds: 6,
      whiteWebCount: 14,
      clearedWebIds: Array.from({ length: 14 }, (_, i) => `web-${i}`),
      tutorialActive: true,
    });
    expect(award.earnedBase).toBe(0);
    expect(award.earnedBonus).toBe(0);
    expect(award.earnedXp).toBe(0);
  });

  it("scenario D: same T=25 and webs, longer t_excess → more money", () => {
    const nJust = excessCycleFromSeconds(justReached25Seconds);
    const nLong = excessCycleFromSeconds(longAbsenceSeconds);
    const TJust = excessPresetSeconds(nJust);
    const TLong = excessPresetSeconds(nLong);
    expect(TJust).toBe(25);
    expect(TLong).toBe(25);
    expect(computeExcessWebCount(TJust)).toBe(60);
    expect(computeExcessWebCount(TLong)).toBe(60);

    const rateJust = excessBonusRate(nJust);
    const rateLong = excessBonusRate(nLong);
    expect(rateLong).toBeLessThan(rateJust);
    expect(rateLong).toBeGreaterThanOrEqual(0.005);

    const webs = 60;
    const allWebs = Array.from({ length: webs }, (_, i) => `web-${i}`);
    const a = computeMetelkaFinishPendingAward({
      capital,
      sourceSeconds: justReached25Seconds,
      sourceElapsedMs: justReached25ElapsedMs,
      annualRate: rateJust,
      presetSeconds: TJust,
      whiteWebCount: webs,
      clearedWebIds: allWebs,
    });
    const b = computeMetelkaFinishPendingAward({
      capital,
      sourceSeconds: longAbsenceSeconds,
      sourceElapsedMs: longAbsenceElapsedMs,
      annualRate: rateLong,
      presetSeconds: TLong,
      whiteWebCount: webs,
      clearedWebIds: allWebs,
    });

    expect(a.earnedXp).toBe(30);
    expect(b.earnedXp).toBe(30);
    expect(b.earnedBase).toBeGreaterThan(a.earnedBase);
    expect(b.earnedBonus).toBeGreaterThan(a.earnedBonus);
    expect(b.totalMoney).toBeGreaterThan(a.totalMoney);

    // Sanity: D_excess uses full wall-clock, not T=25 alone.
    const shortGross = capital * (justReached25ElapsedMs / V2_YEAR_DURATION_MS) * rateJust;
    const longGross = capital * (longAbsenceElapsedMs / V2_YEAR_DURATION_MS) * rateLong;
    expect(longGross).toBeGreaterThan(shortGross);
  });
});

describe("debug 25 ledger → T≈5 (formula, not clamp bug)", () => {
  it("excessSeconds=25 → n=25/60 → T=5; T=6 needs ~25.4+", () => {
    expect(excessPresetSeconds(excessCycleFromSeconds(25))).toBe(5);
    expect(excessPresetSeconds(excessCycleFromSeconds(25.4))).toBe(6);
    expect(excessPresetSeconds(excessCycleFromSeconds(60))).toBe(6);
    expect(computeExcessWebCount(5)).toBe(12);
    expect(computeExcessWebCount(25)).toBe(60);
  });
});
