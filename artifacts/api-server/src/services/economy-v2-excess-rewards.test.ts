import { describe, expect, it } from "vitest";
import {
  computeExcessGuaranteedIncome,
  computeExcessRegularSkill,
  computeExcessV2BonusPaid,
  computeRegularWebBonusDelta,
  computeRegularWebXpDelta,
  computeSpecialWebIncomeDelta,
  computeV2WhiteWebRewardShares,
  countRegularClearedWebs,
  EXCESS_BASE_INCOME_WEB_ID,
  EXCESS_SPECIAL_WEB_ID,
  isBaseIncomeWebId,
  isExcessSpecialWebId,
} from "./economy-v2-excess-rewards";
import { computeExcessCleaningXp } from "./economy-v2-excess-xp";
import { roundMoneyToKopecks } from "./economy-v2-excess-income";

describe("economy-v2-excess-rewards", () => {
  it("special id is excluded from Skill / regular count", () => {
    expect(isExcessSpecialWebId(EXCESS_SPECIAL_WEB_ID)).toBe(true);
    expect(isBaseIncomeWebId(EXCESS_BASE_INCOME_WEB_ID)).toBe(true);
    expect(isExcessSpecialWebId(EXCESS_BASE_INCOME_WEB_ID)).toBe(true);
    expect(
      countRegularClearedWebs(
        ["web-0", "web-1", EXCESS_SPECIAL_WEB_ID, EXCESS_BASE_INCOME_WEB_ID],
        12,
      ),
    ).toBe(2);
    expect(computeExcessRegularSkill(9, 12)).toBeCloseTo(0.75, 10);
  });

  it("v2 bonus = gross × Skill", () => {
    expect(computeExcessV2BonusPaid(10, 0)).toBe(0);
    expect(computeExcessV2BonusPaid(10, 0.5)).toBe(5);
    expect(computeExcessV2BonusPaid(10, 1)).toBe(10);
  });

  it("guaranteed + bonus pool = gross; progressive bonus matches Skill share", () => {
    const gross = 10;
    expect(computeExcessGuaranteedIncome(gross)).toBe(5);
    const n = 12;
    let bonusPaid = 0;
    for (let k = 1; k <= 9; k++) {
      const step = computeRegularWebBonusDelta({
        bonusPool: 5,
        webCount: n,
        regularClearedAfter: k,
        bonusPaidBefore: bonusPaid,
      });
      bonusPaid = step.bonusPaidAfter;
    }
    expect(bonusPaid).toBeCloseTo(roundMoneyToKopecks(5 * (9 / 12)), 6);
    const special = computeSpecialWebIncomeDelta({
      guaranteed: 5,
      specialAlreadyPaid: false,
    });
    const total = roundMoneyToKopecks(special + bonusPaid);
    // paid ≡ gross × (0.5 + 0.5 × Skill)
    expect(total).toBeCloseTo(roundMoneyToKopecks(10 * (0.5 + 0.5 * 0.75)), 6);
  });

  it("progressive XP equals round(XP_max × Skill)", () => {
    const preset = 25;
    const n = 12;
    let awarded = 0;
    for (let k = 1; k <= 9; k++) {
      const step = computeRegularWebXpDelta({
        presetSeconds: preset,
        webCount: n,
        regularClearedAfter: k,
        xpAwardedBefore: awarded,
      });
      awarded = step.xpAwardedAfter;
    }
    const expected = computeExcessCleaningXp({
      presetSeconds: preset,
      skill: 9 / 12,
    }).awardedXp;
    expect(awarded).toBe(expected);
  });
});

describe("computeV2WhiteWebRewardShares", () => {
  it("first clear of N=12 (maxXp=6): raw 0.5 → awarded 1, bonus/xp raw = gross/N and maxXp/N", () => {
    const shares = computeV2WhiteWebRewardShares({
      gross: 24,
      maxXp: 6,
      whiteWebCount: 12,
      clearedWhiteAfter: 1,
      xpAwardedBefore: 0,
    });
    expect(shares.bonusRawPerWeb).toBeCloseTo(2, 10);
    expect(shares.xpRawPerWeb).toBeCloseTo(0.5, 10);
    expect(shares.bonusRawDelta).toBe(shares.bonusRawPerWeb);
    expect(shares.xpRawDelta).toBe(shares.xpRawPerWeb);
    expect(shares.cumulativeBonusRaw).toBeCloseTo(2, 10);
    expect(shares.cumulativeXpRaw).toBeCloseTo(0.5, 10);
    expect(shares.xpAwardedAfter).toBe(1); // round(0.5) === 1
    expect(shares.xpIntegerDelta).toBe(1);
  });

  it("integer XP delta never re-applies already-awarded XP on subsequent clears", () => {
    const gross = 24;
    const maxXp = 6;
    const n = 12;
    let awarded = 0;
    let totalDelta = 0;
    for (let k = 1; k <= n; k++) {
      const step = computeV2WhiteWebRewardShares({
        gross,
        maxXp,
        whiteWebCount: n,
        clearedWhiteAfter: k,
        xpAwardedBefore: awarded,
      });
      totalDelta += step.xpIntegerDelta;
      awarded = step.xpAwardedAfter;
    }
    expect(awarded).toBe(maxXp); // Skill=1 → round(6×1)=6
    expect(totalDelta).toBe(maxXp);
  });

  it("cumulative raw shares grow linearly and equal gross/maxXp at full clear", () => {
    const gross = 24;
    const maxXp = 6;
    const n = 12;
    const half = computeV2WhiteWebRewardShares({
      gross,
      maxXp,
      whiteWebCount: n,
      clearedWhiteAfter: 6,
      xpAwardedBefore: 0,
    });
    expect(half.cumulativeBonusRaw).toBeCloseTo(gross * 0.5, 10);
    expect(half.cumulativeXpRaw).toBeCloseTo(maxXp * 0.5, 10);

    const full = computeV2WhiteWebRewardShares({
      gross,
      maxXp,
      whiteWebCount: n,
      clearedWhiteAfter: n,
      xpAwardedBefore: half.xpAwardedAfter,
    });
    expect(full.cumulativeBonusRaw).toBeCloseTo(gross, 10);
    expect(full.cumulativeXpRaw).toBeCloseTo(maxXp, 10);
  });

  it("zero web count is a safe no-op", () => {
    const shares = computeV2WhiteWebRewardShares({
      gross: 10,
      maxXp: 6,
      whiteWebCount: 0,
      clearedWhiteAfter: 0,
      xpAwardedBefore: 3,
    });
    expect(shares).toEqual({
      bonusRawPerWeb: 0,
      xpRawPerWeb: 0,
      bonusRawDelta: 0,
      xpRawDelta: 0,
      cumulativeBonusRaw: 0,
      cumulativeXpRaw: 0,
      xpIntegerDelta: 0,
      xpAwardedAfter: 3,
    });
  });
});
