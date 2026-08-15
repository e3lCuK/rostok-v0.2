// ============================================================
//  SINGLE SOURCE OF TRUTH — all calculations live here
//  UI must NOT compute anything; call these functions instead
// ============================================================

export const APP_VERSION = "BETA V0.3";
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
    /** Capital in the vault icon (0 after tutorial transfer). */
    vaultBalance?: number;
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
    metelkaPendingReward?: {
      active: boolean;
      baseAmount: number;
      bonusAmount: number;
      totalAmount: number;
      xpAmount: number;
      createdAt: number | null;
      claimToken: string | null;
      claimedAt: number | null;
    };
    pendingStoredSessions: number;
    treeGrowthMM: number;
    treeGrowthRemainder: number;
    playerXP: number;
    playerLevel: number;
    xpHistory: XpHistoryEntry[];
    totalApples: number;
    purchasedItems: string[];
    tutorialDone: boolean;
    /** Tree + underground unlocked after tutorial plant (or tutorial already done). */
    sproutPlanted?: boolean;
    /** Economy v2 available activity seconds (0–60). Isolated from v1 8h lock. */
    v2EnergySeconds?: number;
    v2EnergyAnchorAt?: number | null;
    /** Economy v2 Care cycle snapshot from GET /game/state (server source of truth). */
    v2Care?: import("@/lib/api").EconomyV2CareStateResponse | null;
    /** Ordinary Care Freshness 0.50–1.00 (informational; money uses server calc). */
    v2Freshness?: number;
    /** Epoch ms of last ordinary Care income settle. */
    v2IncomeAnchorAt?: number | null;
    /** Root maturation (ready mask). Collected bank is v2EnergySeconds. */
    v2Roots?: import("@/lib/api").EconomyV2RootsState | null;
    /** Excess beyond ordinary 60-capacity (server snapshot). */
    v2Excess?: import("@/lib/api").EconomyV2ExcessState | null;
    /** Economy v3 parallel roots — null when feature flag off / omitted. */
    v3Roots?: import("@/lib/api").EconomyV3RootsState | null;
    /** One-shot auto-transfer from last GET (not persisted). */
    v3AutoTransfer?: import("@/lib/api").EconomyV3AutoTransferPublic | null;
  };
  history: {
    date: string;
    amount: number;
    type:
      | "base"
      | "bonus"
      | "tutorial"
      | "metelka"
      | "excess"
      | "excess_base"
      | "excess_bonus"
      | string;
  }[];
  /** Server SoT catalog — income for one completed mini-game by duration. */
  incomeByPreset?: Array<{
    presetSeconds: number;
    income: number;
    base: number;
    bonus: number;
  }>;
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

// ---- Streak / visit day (must match api-server resolveV3CurrentVisitDay) ----
/**
 * 1-based current visit day from persisted streak_days.
 * streak ≤ 0 (legacy unset) → day 1; streak ≥ 1 → that day.
 */
export function resolveCurrentVisitDay(streakDays: unknown): number {
  const n =
    typeof streakDays === "number"
      ? streakDays
      : parseInt(String(streakDays ?? "0"), 10);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

/**
 * Daily preset bonus seconds: day 1 → +1 … day 5+ → +5.
 * Same mapping as backend computeV3VisitBonusSeconds.
 */
export function getStreakBonusSeconds(streakDays: number): number {
  const day = resolveCurrentVisitDay(streakDays);
  return Math.min(5, day);
}

/** Calendar slot state for the 5 visit-reward cards (labels День 1…5). */
export function getVisitRewardCalendarState(currentVisitDay: number): {
  visitDay: number;
  allMaxed: boolean;
  /** 0-based index of the active (⭐) card; ignored when allMaxed. */
  activeIndex: number;
} {
  const visitDay = Math.max(1, Math.floor(Number(currentVisitDay) || 1));
  // Day 5 is still the active card; only day 6+ marks the cycle complete.
  const allMaxed = visitDay > 5;
  return {
    visitDay,
    allMaxed,
    activeIndex: Math.min(visitDay, 5) - 1,
  };
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

/** Leaderboard: total login days (calendar days with a game open). */
export function formatLbLoginDays(n: number): string {
  const days = Math.max(0, Math.floor(Number(n) || 0));
  return `${days} дн.`;
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
