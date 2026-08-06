import { describe, expect, it } from "vitest";
import { computeStreakUpdate } from "./economy-v2-care-rewards";

describe("computeStreakUpdate", () => {
  it("increments on consecutive UTC day", () => {
    const now = Date.parse("2024-01-02T12:00:00.000Z");
    const r = computeStreakUpdate({
      nowMs: now,
      lastStreakDate: "2024-01-01",
      currentStreak: 2,
    });
    expect(r.newStreak).toBe(3);
    expect(r.todayUTC).toBe("2024-01-02");
  });

  it("resets after a gap", () => {
    const now = Date.parse("2024-01-05T12:00:00.000Z");
    const r = computeStreakUpdate({
      nowMs: now,
      lastStreakDate: "2024-01-01",
      currentStreak: 4,
    });
    expect(r.newStreak).toBe(1);
  });
});
