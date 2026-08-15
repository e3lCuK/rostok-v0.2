import { describe, expect, it } from "vitest";
import {
  computeAverageIncomePercent,
  incomeSessionEffectivePercent,
} from "./incomeHistoryAvgPercent";

describe("computeAverageIncomePercent", () => {
  it("weights by amount, not by operation count", () => {
    const sessions = [
      { base: 0.01, total: 0.01 }, // 12%
      { base: 17.25, total: 19.56 }, // ~13.61%
    ];
    expect(incomeSessionEffectivePercent(sessions[0])).toBeCloseTo(12, 5);
    expect(incomeSessionEffectivePercent(sessions[1])).toBeCloseTo(13.605, 2);

    // Count-average would be ~12.80; amount-weighted ≈ 13.61
    const avg = computeAverageIncomePercent(sessions);
    expect(avg).toBeGreaterThan(13.5);
    expect(avg).toBeCloseTo(
      (12 * 0.01 + incomeSessionEffectivePercent(sessions[1]) * 19.56) /
        (0.01 + 19.56),
      5,
    );
  });

  it("returns 0 for empty history", () => {
    expect(computeAverageIncomePercent([])).toBe(0);
  });
});
