// ============================================================
//  SINGLE SOURCE OF TRUTH — all calculations live here
//  UI must NOT compute anything; call these functions instead
// ============================================================

export const APP_VERSION = "beta v0.2";
export const APP_NAME = "Банк";

// ---- Constants ----
export const SESSION_COOLDOWN_MS = 8 * 60 * 60 * 1000;
export const SESSIONS_PER_DAY = 3; // 1 session per 8 hours → 3 sessions/day

// Starting capital
export const CAPITAL_OPTIONS = [100_000] as const;
export type CapitalOption = (typeof CAPITAL_OPTIONS)[number];
export const DEFAULT_CAPITAL = 100_000;

// ---- Canonical user state shape ----
export interface UserState {
  balances: {
    balance: number;
    earned: number;
    totalDaysEarned: number;
    startDate: number;
  };
  game: {
    lastSessionTime: number | null;
    sessionInProgress: boolean;
    water: boolean;
    sun: boolean;
    fertilizer: boolean;
    streakDays: number;
    missedSessions: number;
    pendingBaseReward: number;
    pendingBonusReward: number;
    pendingStoredSessions: number;
    treeGrowthMM: number;
    treeGrowthRemainder: number;
    playerXP: number;
    playerLevel: number;
    xpHistory: XpHistoryEntry[];
    totalApples: number;
    purchasedItems: string[];
    tutorialDone: boolean;
  };
  history: {
    date: string;
    amount: number;
    type: "base" | "bonus";
  }[];
}

export interface XpHistoryEntry {
  date: string;   // "YYYY-MM-DD"
  n: number;      // session number within day (1, 2, 3…)
  pct: number;    // average skill percent 0–100
  xp: number;     // XP gained
}

// ---- Capital part based on total balance ----
export function getCapitalPart(totalBalance: number): number {
  if (totalBalance >= 2_000_000) return 0.20;
  if (totalBalance >= 200_000) return 0.18;
  return 0.16;
}

// ---- SINGLE reward calculation formula — used everywhere ----
// daily  = balance * rate / 365
// session = daily / SESSIONS_PER_DAY
export interface SessionRewards {
  dailyBase: number;
  dailyBonus: number;
  basePerSession: number;
  bonusPerSession: number;
}

export function calculateRewards(balance: number, bonusPercent: number): SessionRewards {
  const dailyBase = balance * 0.12 / 365;
  const dailyBonus = balance * bonusPercent / 365;
  const basePerSession = dailyBase / SESSIONS_PER_DAY;
  const bonusPerSession = dailyBonus / SESSIONS_PER_DAY;
  return { dailyBase, dailyBonus, basePerSession, bonusPerSession };
}

// ---- Tree progression ----
// Visual progress: clamped 0–1, used only for rendering
export function getTreeProgressFromMM(mm: number): number {
  return Math.min(mm / 10000, 1);
}

// Stage based on accumulated mm — same thresholds as before but in mm units
// (0%, 5%, 20%, 50%, 85%) × 10 000 mm
export function getTreeStage(mm: number): 0 | 1 | 2 | 3 | 4 {
  if (mm < 50)  return 0;
  if (mm < 200) return 1;
  if (mm < 500) return 2;
  if (mm < 850) return 3;
  return 4;
}

export const TREE_STAGE_NAMES = ["Росток", "Саженец", "Деревце", "Молодое дерево", "Могучее дерево"];

// ---- Computed missed sessions (mirrors GamePage formula) ----
export function computeMissedSessions(game: UserState["game"], startDate: number, now: number): number {
  if (game.sessionInProgress) return game.missedSessions ?? 0;
  const referenceTime = game.lastSessionTime ?? startDate;
  const elapsed = now - referenceTime;
  const additional = Math.max(0, Math.floor(elapsed / SESSION_COOLDOWN_MS) - 1);
  return (game.missedSessions ?? 0) + additional;
}

// ---- Streak bonus seconds (day 1=+1s … day 5=+5s, capped — resets on miss) ----
export function getStreakBonusSeconds(streakDays: number): number {
  if (streakDays <= 0) return 1;
  return Math.min(streakDays, 5);
}

// ---- Session helpers ----
export function isSessionLocked(lastSessionTime: number | null, now: number): boolean {
  if (!lastSessionTime) return false;
  return now - lastSessionTime < SESSION_COOLDOWN_MS;
}

export function getNextSessionTime(lastSessionTime: number | null): number | null {
  if (!lastSessionTime) return null;
  return lastSessionTime + SESSION_COOLDOWN_MS;
}

export function getSessionActionsLeft(game: UserState["game"]): number {
  if (!game.sessionInProgress) return 0;
  let n = 0;
  if (!game.water) n++;
  if (!game.sun) n++;
  if (!game.fertilizer) n++;
  return n;
}

// ---- Tree growth: apply reward amount to current growth state ----
export function applyTreeGrowth(
  rewardRub: number,
  currentMM: number,
  currentRemainder: number,
): { newMM: number; newRemainder: number } {
  const wholeMM = Math.floor(rewardRub);
  const remainder = rewardRub - wholeMM;
  let newMM = currentMM + wholeMM;
  let newRemainder = currentRemainder + remainder;
  if (newRemainder >= 1) {
    const extraMM = Math.floor(newRemainder);
    newMM += extraMM;
    newRemainder -= extraMM;
  }
  return { newMM, newRemainder };
}

// ---- Tree growth formatter ----
export function formatTreeGrowth(mm: number): string {
  if (mm < 10) return `${mm} мм`;
  if (mm < 1000) return `${(mm / 10).toFixed(1)} см`;
  return `${(mm / 1000).toFixed(2)} м`;
}

export function formatLbSessions(n: number): string {
  if (n === 0) return "0 с.";
  if (n < 3) return `${n} с.`;
  return `${Math.floor(n / 3)} сут.`;
}

export function formatLbGrowth(mm: number): string {
  if (mm < 10) return `${mm} мм.`;
  if (mm < 1000) return `${(mm / 10).toFixed(1)} см.`;
  return `${(mm / 1000).toFixed(1)} м.`;
}

// ---- Formatters ----
export function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "₽";
}

export function formatTimer(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatCapital(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("ru-RU")} млн ₽`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("ru-RU")} тыс. ₽`;
  return formatRub(n);
}
