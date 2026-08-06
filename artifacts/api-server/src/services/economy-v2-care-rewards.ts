/**
 * Care streak helpers (non-money).
 *
 * Ordinary Care money lives in economy-v2-care-income.ts.
 * This module must NOT compute missed/stored/random bonus rates.
 */

export type StreakUpdate = {
  newStreak: number;
  todayUTC: string;
};

export function computeStreakUpdate(input: {
  nowMs: number;
  lastStreakDate: string | null;
  currentStreak: number;
}): StreakUpdate {
  const todayUTC = new Date(input.nowMs).toISOString().slice(0, 10);
  const yesterdayUTC = new Date(input.nowMs - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const lastStreakDate = input.lastStreakDate;
  const currentStreak = input.currentStreak || 0;
  let newStreak: number;
  if (!lastStreakDate) {
    newStreak = 1;
  } else if (lastStreakDate === todayUTC) {
    newStreak = currentStreak;
  } else if (lastStreakDate === yesterdayUTC) {
    newStreak = currentStreak + 1;
  } else {
    newStreak = 1;
  }
  return { newStreak, todayUTC };
}
