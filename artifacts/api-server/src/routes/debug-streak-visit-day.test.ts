import { describe, expect, it } from "vitest";
import {
  buildV3EffectiveCapacityBreakdown,
  computeV3EffectivePresetSeconds,
} from "../services/economy-v3-effective-capacity";
import { nextDebugVisitStreakDays } from "./debug-streak";
import { parseDebugV3RootsBody } from "../services/economy-v3-roots-debug";

describe("debug add-streak-day visit SoT", () => {
  it("streak 0 (day 1) → next stores 2 (day 2), not 1", () => {
    expect(nextDebugVisitStreakDays(0)).toBe(2);
    expect(
      buildV3EffectiveCapacityBreakdown({
        basePresetSeconds: 20,
        streakDays: nextDebugVisitStreakDays(0),
      }),
    ).toMatchObject({
      currentVisitDay: 2,
      activeDailyBonusSeconds: 2,
      effectivePresetSeconds: 22,
    });
  });

  it("streak 1 (also day 1) → next stores 2", () => {
    expect(nextDebugVisitStreakDays(1)).toBe(2);
    expect(
      computeV3EffectivePresetSeconds({
        basePresetSeconds: 20,
        streakDays: 2,
      }),
    ).toBe(22);
  });

  it("days 1–5 and 6+ cap at effective 25", () => {
    const cases = [
      { streak: 0, day: 1, effective: 21 },
      { streak: 2, day: 2, effective: 22 },
      { streak: 3, day: 3, effective: 23 },
      { streak: 4, day: 4, effective: 24 },
      { streak: 5, day: 5, effective: 25 },
      { streak: 6, day: 6, effective: 25 },
    ];
    for (const c of cases) {
      const b = buildV3EffectiveCapacityBreakdown({
        basePresetSeconds: 20,
        streakDays: c.streak,
      });
      expect(b.currentVisitDay).toBe(c.day);
      expect(b.effectivePresetSeconds).toBe(c.effective);
    }
    expect(nextDebugVisitStreakDays(5)).toBe(6);
    expect(
      computeV3EffectivePresetSeconds({
        basePresetSeconds: 20,
        streakDays: nextDebugVisitStreakDays(5),
      }),
    ).toBe(25);
  });
});

describe("debug fillToCapacity uses effectivePresetSeconds", () => {
  it("parse fillToCapacity roots-only remains valid", () => {
    expect(
      parseDebugV3RootsBody({
        action: "fillToCapacity",
        roots: true,
        reserves: false,
      }),
    ).toEqual({
      action: "fillToCapacity",
      roots: true,
      reserves: false,
    });
  });
});
