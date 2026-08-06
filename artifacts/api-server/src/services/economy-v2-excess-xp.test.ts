import { describe, expect, it } from "vitest";
import { computeExcessCleaningXp } from "./economy-v2-excess-xp";

describe("computeExcessCleaningXp", () => {
  it("1. T=5 Skill=1 → max 6 raw 6 awarded 6", () => {
    const r = computeExcessCleaningXp({ presetSeconds: 5, skill: 1 });
    expect(r.maxXp).toBe(6);
    expect(r.rawXp).toBe(6);
    expect(r.awardedXp).toBe(6);
  });

  it("2. T=10 Skill=0.5 → raw 6", () => {
    const r = computeExcessCleaningXp({ presetSeconds: 10, skill: 0.5 });
    expect(r.maxXp).toBe(12);
    expect(r.rawXp).toBe(6);
    expect(r.awardedXp).toBe(6);
  });

  it("3. T=15 Skill=0.5 → raw 9", () => {
    const r = computeExcessCleaningXp({ presetSeconds: 15, skill: 0.5 });
    expect(r.maxXp).toBe(18);
    expect(r.rawXp).toBe(9);
    expect(r.awardedXp).toBe(9);
  });

  it("4. T=25 Skill=1 → raw 30", () => {
    const r = computeExcessCleaningXp({ presetSeconds: 25, skill: 1 });
    expect(r.maxXp).toBe(30);
    expect(r.rawXp).toBe(30);
    expect(r.awardedXp).toBe(30);
  });

  it("5. Skill=0 → XP 0", () => {
    const r = computeExcessCleaningXp({ presetSeconds: 25, skill: 0 });
    expect(r.rawXp).toBe(0);
    expect(r.awardedXp).toBe(0);
  });

  it("6–7. skill clamp", () => {
    expect(computeExcessCleaningXp({ presetSeconds: 10, skill: -1 }).rawXp).toBe(
      0,
    );
    expect(computeExcessCleaningXp({ presetSeconds: 10, skill: 2 }).rawXp).toBe(
      12,
    );
  });

  it("8. preset clamp 5…25", () => {
    expect(computeExcessCleaningXp({ presetSeconds: 1, skill: 1 }).maxXp).toBe(6);
    expect(computeExcessCleaningXp({ presetSeconds: 100, skill: 1 }).maxXp).toBe(
      30,
    );
  });

  it("rounds final product like Care (Math.round)", () => {
    // 30*7/25 * 0.5 = 4.2 → 4
    const r = computeExcessCleaningXp({ presetSeconds: 7, skill: 0.5 });
    expect(r.rawXp).toBeCloseTo(4.2, 10);
    expect(r.awardedXp).toBe(4);
  });
});
