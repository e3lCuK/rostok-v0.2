import { describe, expect, it } from "vitest";
import {
  getStreakBonusSeconds,
  getVisitRewardCalendarState,
  localCalendarDateISO,
  resolveCurrentVisitDay,
} from "./engine";

describe("visit day SoT — calendar ↔ Economy v3", () => {
  it("resolveCurrentVisitDay matches backend 0→1, 1→1, N→N", () => {
    expect(resolveCurrentVisitDay(0)).toBe(1);
    expect(resolveCurrentVisitDay(1)).toBe(1);
    expect(resolveCurrentVisitDay(2)).toBe(2);
    expect(resolveCurrentVisitDay(3)).toBe(3);
    expect(resolveCurrentVisitDay(5)).toBe(5);
    expect(resolveCurrentVisitDay(6)).toBe(6);
  });

  it("getStreakBonusSeconds follows visit day (not raw streak+1 index)", () => {
    expect(getStreakBonusSeconds(0)).toBe(1);
    expect(getStreakBonusSeconds(1)).toBe(1);
    expect(getStreakBonusSeconds(2)).toBe(2);
    expect(getStreakBonusSeconds(3)).toBe(3);
    expect(getStreakBonusSeconds(5)).toBe(5);
    expect(getStreakBonusSeconds(6)).toBe(5);
  });

  it.each([
    { day: 1, activeLabel: "День 1", capacity: 21 },
    { day: 2, activeLabel: "День 2", capacity: 22 },
    { day: 3, activeLabel: "День 3", capacity: 23 },
    { day: 4, activeLabel: "День 4", capacity: 24 },
    { day: 5, activeLabel: "День 5", capacity: 25 },
  ])(
    "$activeLabel → calendar active + capacity $capacity",
    ({ day, activeLabel, capacity }) => {
      const cal = getVisitRewardCalendarState(day);
      expect(cal.visitDay).toBe(day);
      expect(cal.allMaxed).toBe(false);
      expect(cal.activeIndex).toBe(day - 1);
      expect(`День ${cal.activeIndex + 1}`).toBe(activeLabel);
      expect(20 + getStreakBonusSeconds(day)).toBe(capacity);
    },
  );

  it("day 6+ marks all five cards done (bonus still capped at +5)", () => {
    const cal = getVisitRewardCalendarState(6);
    expect(cal.allMaxed).toBe(true);
    expect(getStreakBonusSeconds(6)).toBe(5);
    expect(20 + 5).toBe(25);
  });

  it("streakDays=2 must NOT star Day 3 (legacy off-by-one)", () => {
    const visitDay = resolveCurrentVisitDay(2);
    expect(visitDay).toBe(2);
    const cal = getVisitRewardCalendarState(visitDay);
    expect(cal.activeIndex).toBe(1); // День 2
    expect(cal.activeIndex).not.toBe(2); // was wrongly День 3
    expect(20 + getStreakBonusSeconds(2)).toBe(22);
  });

  it("calendar and bonus stay aligned for streak 0 and 1 (both day 1)", () => {
    for (const streak of [0, 1]) {
      const day = resolveCurrentVisitDay(streak);
      const cal = getVisitRewardCalendarState(day);
      expect(day).toBe(1);
      expect(cal.activeIndex).toBe(0);
      expect(getStreakBonusSeconds(streak)).toBe(1);
    }
  });

  it("localCalendarDateISO uses the local calendar, not UTC", () => {
    expect(localCalendarDateISO(new Date(2026, 7, 25, 1, 0, 0))).toBe(
      "2026-08-25",
    );
  });
});
