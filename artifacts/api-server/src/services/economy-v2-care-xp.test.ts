import { describe, expect, it } from "vitest";
import {
  computeEconomyV2ActivityXp,
  computeEconomyV2CycleXp,
  normalizeSkillScore,
  parseEconomyV2CareActivityResult,
  EconomyV2CareResultError,
} from "./economy-v2-care-xp";

describe("computeEconomyV2ActivityXp", () => {
  it("T=5 skill=100 → 20 XP", () => {
    expect(computeEconomyV2ActivityXp(5, 100)).toBe(20);
  });
  it("T=10 skill=100 → 40 XP", () => {
    expect(computeEconomyV2ActivityXp(10, 100)).toBe(40);
  });
  it("T=25 skill=100 → 100 XP", () => {
    expect(computeEconomyV2ActivityXp(25, 100)).toBe(100);
  });
  it("T=25 skill=50 → 50 XP", () => {
    expect(computeEconomyV2ActivityXp(25, 50)).toBe(50);
  });
  it("skill=0 → 0 XP", () => {
    expect(computeEconomyV2ActivityXp(25, 0)).toBe(0);
    expect(computeEconomyV2ActivityXp(10, 0)).toBe(0);
    expect(computeEconomyV2ActivityXp(5, 0)).toBe(0);
  });
  it("T=6 skill=83 → round(19.92)=20", () => {
    // 100 * 6/25 * 0.83 = 19.92
    expect(computeEconomyV2ActivityXp(6, 83)).toBe(20);
  });
  it("never negative", () => {
    expect(computeEconomyV2ActivityXp(5, -10)).toBe(0);
  });
});

describe("computeEconomyV2CycleXp", () => {
  it("sums only completed activities; max cycle 300 at T=25×3 skill=100", () => {
    const allocation = {
      waterSeconds: 25,
      sunSeconds: 25,
      fertilizerSeconds: 25,
    };
    expect(
      computeEconomyV2CycleXp(
        allocation,
        { water: 100, sun: 100, fertilizer: 100 },
        { water: true, sun: true, fertilizer: true },
      ),
    ).toBe(300);
    expect(
      computeEconomyV2CycleXp(
        allocation,
        { water: 100, sun: 100, fertilizer: 100 },
        { water: true, sun: false, fertilizer: false },
      ),
    ).toBe(100);
  });

  it("skill 0 on a completed trio → 1 XP participation (T=10 and T=5)", () => {
    expect(
      computeEconomyV2CycleXp(
        { waterSeconds: 10, sunSeconds: 10, fertilizerSeconds: 10 },
        { water: 0, sun: 0, fertilizer: 0 },
        { water: true, sun: true, fertilizer: true },
      ),
    ).toBe(1);
    expect(
      computeEconomyV2CycleXp(
        { waterSeconds: 5, sunSeconds: 5, fertilizerSeconds: 5 },
        { water: 0, sun: 0, fertilizer: 0 },
        { water: true, sun: true, fertilizer: true },
      ),
    ).toBe(1);
  });

  it("skill 0 on a partial cycle is still 0 XP", () => {
    expect(
      computeEconomyV2CycleXp(
        { waterSeconds: 10, sunSeconds: 10, fertilizerSeconds: 10 },
        { water: 0, sun: 0, fertilizer: 0 },
        { water: true, sun: false, fertilizer: false },
      ),
    ).toBe(0);
  });
});

describe("normalizeSkillScore / parseEconomyV2CareActivityResult", () => {
  it("rounds and clamps skillScore", () => {
    expect(normalizeSkillScore(83.4)).toBe(83);
    expect(normalizeSkillScore(83.6)).toBe(84);
    expect(normalizeSkillScore(-5)).toBe(0);
    expect(normalizeSkillScore(150)).toBe(100);
  });

  it("rejects non-finite skillScore", () => {
    expect(() => normalizeSkillScore(NaN)).toThrow(EconomyV2CareResultError);
    expect(() => normalizeSkillScore("40" as any)).toThrow(EconomyV2CareResultError);
  });

  it("defaults collected=1 when omitted", () => {
    expect(parseEconomyV2CareActivityResult({ skillScore: 80 })).toEqual({
      skillScore: 80,
      collected: 1,
      maximum: null,
    });
  });

  it("accepts collected alone as counter", () => {
    expect(
      parseEconomyV2CareActivityResult({ skillScore: 50, collected: 7 }),
    ).toEqual({ skillScore: 50, collected: 7, maximum: null });
  });

  it("validates collected/maximum against skillScore", () => {
    expect(
      parseEconomyV2CareActivityResult({
        skillScore: 50,
        collected: 5,
        maximum: 10,
      }),
    ).toMatchObject({ skillScore: 50, collected: 5, maximum: 10 });

    expect(() =>
      parseEconomyV2CareActivityResult({
        skillScore: 90,
        collected: 5,
        maximum: 10,
      }),
    ).toThrow(EconomyV2CareResultError);
  });

  it("rejects invalid result shapes", () => {
    expect(() => parseEconomyV2CareActivityResult(null)).toThrow(
      EconomyV2CareResultError,
    );
    expect(() =>
      parseEconomyV2CareActivityResult({ skillScore: 50, maximum: 10 }),
    ).toThrow(EconomyV2CareResultError);
    expect(() =>
      parseEconomyV2CareActivityResult({
        skillScore: 50,
        collected: 12,
        maximum: 10,
      }),
    ).toThrow(EconomyV2CareResultError);
  });
});
