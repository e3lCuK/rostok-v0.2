import { describe, expect, it } from "vitest";
import { computeExcessCleaningSkill } from "./economy-v2-excess-skill";

describe("computeExcessCleaningSkill", () => {
  it("1. 0/N = 0", () => {
    expect(computeExcessCleaningSkill(0, 12)).toBe(0);
  });

  it("2. N/2N = 0.5", () => {
    expect(computeExcessCleaningSkill(6, 12)).toBe(0.5);
  });

  it("3. N/N = 1", () => {
    expect(computeExcessCleaningSkill(12, 12)).toBe(1);
  });

  it("4. clamps to 0…1", () => {
    expect(computeExcessCleaningSkill(-3, 12)).toBe(0);
    expect(computeExcessCleaningSkill(20, 12)).toBe(1);
    expect(computeExcessCleaningSkill(5, 0)).toBe(0);
    expect(computeExcessCleaningSkill(Number.NaN, 12)).toBe(0);
  });
});
