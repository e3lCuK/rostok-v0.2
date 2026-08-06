import { describe, expect, it } from "vitest";
import {
  createEconomyV2CareAllocation,
  V2_CARE_MIN_TOTAL_SECONDS,
} from "./economy-v2-care-allocation";

describe("createEconomyV2CareAllocation", () => {
  it.each([
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [4, 2, 1, 1],
    [5, 2, 2, 1],
    [14, 5, 5, 4],
    [15, 5, 5, 5],
    [16, 6, 5, 5],
    [17, 6, 6, 5],
    [18, 6, 6, 6],
    [30, 10, 10, 10],
    [59, 20, 20, 19],
    [60, 20, 20, 20],
  ] as const)(
    "total=%i → water=%i sun=%i fertilizer=%i",
    (total, water, sun, fertilizer) => {
      const a = createEconomyV2CareAllocation(total);
      expect(a.waterSeconds).toBe(water);
      expect(a.sunSeconds).toBe(sun);
      expect(a.fertilizerSeconds).toBe(fertilizer);
      expect(a.totalAllocatedSeconds).toBe(water + sun + fertilizer);
      expect(a.totalAllocatedSeconds).toBe(Math.floor(total));
    },
  );

  it("floors fractional totals", () => {
    expect(createEconomyV2CareAllocation(15.9)).toEqual({
      waterSeconds: 5,
      sunSeconds: 5,
      fertilizerSeconds: 5,
      totalAllocatedSeconds: 15,
    });
    expect(createEconomyV2CareAllocation(16.9)).toEqual({
      waterSeconds: 6,
      sunSeconds: 5,
      fertilizerSeconds: 5,
      totalAllocatedSeconds: 16,
    });
  });

  it("totalAllocated equals floor(total) for every start-eligible total 15–60", () => {
    for (let total = V2_CARE_MIN_TOTAL_SECONDS; total <= 60; total++) {
      const a = createEconomyV2CareAllocation(total);
      expect(a.totalAllocatedSeconds).toBe(total);
      expect(a.waterSeconds).toBeGreaterThanOrEqual(5);
      expect(a.sunSeconds).toBeGreaterThanOrEqual(5);
      expect(a.fertilizerSeconds).toBeGreaterThanOrEqual(5);
    }
  });

  it("below 15 cannot form a valid 5/5/5+ cycle", () => {
    for (const total of [0, 1, 4, 5, 14]) {
      const a = createEconomyV2CareAllocation(total);
      const ok =
        a.waterSeconds >= 5 && a.sunSeconds >= 5 && a.fertilizerSeconds >= 5;
      expect(ok).toBe(false);
    }
  });
});
