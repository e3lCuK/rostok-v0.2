/**
 * Visit-day streak on authenticated game-state load.
 *
 * Economy v3 does not complete the legacy Care session, so last_streak_date
 * was never ticked on a new calendar day. Opening the game is the visit.
 */
import {
  nextVisitStreakDays,
  resolveV3CurrentVisitDay,
} from "./economy-v3-effective-capacity";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map((part) => parseInt(part, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function utcCalendarDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Client local YYYY-MM-DD. Allow UTC today or UTC tomorrow so UTC+ offsets
 * after local midnight still count as the next visit day. Reject other dates
 * so a client cannot jump the calendar backward or far forward.
 */
export function parseClientVisitDate(raw: unknown, nowMs: number): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const utcToday = utcCalendarDate(nowMs);
  const utcTomorrow = shiftIsoDate(utcToday, 1);
  if (value === utcToday || value === utcTomorrow) return value;
  return null;
}

export type VisitStreakLoginUpdate = {
  today: string;
  newStreak: number;
  /** last_login_date is not already `today` — persist login + streak. */
  loginChanged: boolean;
  /** Persist streak even when login was already ticked today (v3 recovery). */
  persist: boolean;
};

export function computeVisitStreakOnLogin(input: {
  nowMs: number;
  clientVisitDate?: unknown;
  lastStreakDate: string | null;
  lastLoginDate: string | null;
  currentStreak: unknown;
  totalLoginDays?: unknown;
}): VisitStreakLoginUpdate {
  const today =
    parseClientVisitDate(input.clientVisitDate, input.nowMs) ??
    utcCalendarDate(input.nowMs);
  const yesterday = shiftIsoDate(today, -1);
  const loginChanged = input.lastLoginDate !== today;
  const totalLoginDays = floorNonNegInt(input.totalLoginDays);
  // Old GET ticked last_login_date without last_streak_date. After that the
  // previous calendar day is gone — recover consecutive visit from login count.
  const recoveredFromLoginOnly =
    !input.lastStreakDate &&
    input.lastLoginDate === today &&
    totalLoginDays >= 2;

  let lastVisit = input.lastStreakDate || input.lastLoginDate || null;
  if (recoveredFromLoginOnly) {
    lastVisit = yesterday;
  }

  let newStreak: number;
  if (!lastVisit) {
    newStreak = Math.max(1, resolveV3CurrentVisitDay(input.currentStreak));
  } else if (lastVisit === today) {
    newStreak = Math.max(1, resolveV3CurrentVisitDay(input.currentStreak));
  } else if (lastVisit === yesterday) {
    newStreak = nextVisitStreakDays(input.currentStreak);
  } else {
    newStreak = 1;
  }

  return {
    today,
    newStreak,
    loginChanged,
    persist: loginChanged || recoveredFromLoginOnly,
  };
}

function floorNonNegInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
