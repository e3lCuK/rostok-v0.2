import { describe, expect, it } from "vitest";
import {
  computeVisitStreakOnLogin,
  parseClientVisitDate,
  shiftIsoDate,
} from "./economy-v3-visit-streak";

const DAY1 = Date.parse("2026-08-25T12:00:00.000Z");
const DAY2_UTC = Date.parse("2026-08-26T12:00:00.000Z");
const DAY2_BEFORE_UTC_MIDNIGHT = Date.parse("2026-08-25T22:00:00.000Z"); // 01:00 UTC+3 Aug 26

describe("parseClientVisitDate", () => {
  it("accepts UTC today and UTC tomorrow", () => {
    expect(parseClientVisitDate("2026-08-25", DAY1)).toBe("2026-08-25");
    expect(parseClientVisitDate("2026-08-26", DAY1)).toBe("2026-08-26");
  });

  it("rejects yesterday and far-future dates", () => {
    expect(parseClientVisitDate("2026-08-24", DAY1)).toBeNull();
    expect(parseClientVisitDate("2026-09-01", DAY1)).toBeNull();
    expect(parseClientVisitDate("nope", DAY1)).toBeNull();
  });
});

describe("computeVisitStreakOnLogin", () => {
  it("first visit ever → day 1", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY1,
      lastStreakDate: null,
      lastLoginDate: null,
      currentStreak: 0,
    });
    expect(r).toEqual({
      today: "2026-08-25",
      newStreak: 1,
      loginChanged: true,
      persist: true,
    });
  });

  it("same calendar day does not increment", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY1,
      lastStreakDate: "2026-08-25",
      lastLoginDate: "2026-08-25",
      currentStreak: 1,
    });
    expect(r.loginChanged).toBe(false);
    expect(r.newStreak).toBe(1);
    expect(r.persist).toBe(false);
  });

  it("next UTC day with streak 0 (never completed a session) → day 2, not 1", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY2_UTC,
      lastStreakDate: null,
      lastLoginDate: "2026-08-25",
      currentStreak: 0,
    });
    expect(r.loginChanged).toBe(true);
    expect(r.newStreak).toBe(2);
    expect(r.today).toBe("2026-08-26");
    expect(r.persist).toBe(true);
  });

  it("next UTC day with streak 1 → day 2", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY2_UTC,
      lastStreakDate: "2026-08-25",
      lastLoginDate: "2026-08-25",
      currentStreak: 1,
    });
    expect(r.newStreak).toBe(2);
    expect(r.loginChanged).toBe(true);
  });

  it("gap resets to day 1", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY2_UTC,
      lastStreakDate: "2026-08-20",
      lastLoginDate: "2026-08-20",
      currentStreak: 4,
    });
    expect(r.newStreak).toBe(1);
    expect(r.loginChanged).toBe(true);
  });

  it("UTC+3 after local midnight uses client visitDate as the next day", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY2_BEFORE_UTC_MIDNIGHT,
      clientVisitDate: "2026-08-26",
      lastStreakDate: null,
      lastLoginDate: "2026-08-25",
      currentStreak: 0,
    });
    expect(r.today).toBe("2026-08-26");
    expect(r.newStreak).toBe(2);
    expect(r.loginChanged).toBe(true);
  });

  it("recovers day 2 when last_login was already ticked today without last_streak", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY2_UTC,
      lastStreakDate: null,
      lastLoginDate: "2026-08-26",
      currentStreak: 0,
      totalLoginDays: 2,
    });
    expect(r.loginChanged).toBe(false);
    expect(r.persist).toBe(true);
    expect(r.newStreak).toBe(2);
  });

  it("does not recover on the true first login day", () => {
    const r = computeVisitStreakOnLogin({
      nowMs: DAY1,
      lastStreakDate: null,
      lastLoginDate: "2026-08-25",
      currentStreak: 0,
      totalLoginDays: 1,
    });
    expect(r.persist).toBe(false);
    expect(r.newStreak).toBe(1);
  });

  it("shiftIsoDate walks calendar days", () => {
    expect(shiftIsoDate("2026-08-25", 1)).toBe("2026-08-26");
    expect(shiftIsoDate("2026-08-01", -1)).toBe("2026-07-31");
  });
});
