export interface GameState {
  standardBalance: number;
  activeBalance: number;
  standardEarned: number;
  activeEarned: number;
  totalDaysEarned: number;
  startDate: number;
  sessionTimestamps: number[];
  currentSession: {
    active: boolean;
    actionsLeft: number;
    water: boolean;
    sun: boolean;
    fertilizer: boolean;
  } | null;
  history: { date: string; amount: number; type: "standard" | "active" | "base" | "bonus" }[];
}

const KEY = "treebank_v1";

const SESSION_REWARD = 13.7;
const STANDARD_DAILY = 32.88;
const SESSION_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 3;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function getDefaultState(): GameState {
  return {
    standardBalance: 100_000,
    activeBalance: 100_000,
    standardEarned: 0,
    activeEarned: 0,
    totalDaysEarned: 0,
    startDate: Date.now(),
    sessionTimestamps: [],
    currentSession: null,
    history: [],
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return getDefaultState();
    return JSON.parse(raw) as GameState;
  } catch {
    return getDefaultState();
  }
}

export function saveState(state: GameState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetState(): GameState {
  const fresh = getDefaultState();
  saveState(fresh);
  return fresh;
}

export function getAvailableSessions(timestamps: number[], now: number): number {
  const fresh = timestamps.filter(ts => now - ts < SESSION_COOLDOWN_MS);
  return Math.max(0, MAX_SESSIONS - fresh.length);
}

export function getNextSessionTime(timestamps: number[], now: number): number | null {
  const fresh = timestamps.filter(ts => now - ts < SESSION_COOLDOWN_MS);
  if (fresh.length < MAX_SESSIONS) return null;
  const oldest = Math.min(...fresh);
  return oldest + SESSION_COOLDOWN_MS;
}

export function getTreeProgress(startDate: number, now: number): number {
  return Math.min((now - startDate) / ONE_YEAR_MS, 1);
}

export function getTreeStage(progress: number): 0 | 1 | 2 | 3 | 4 {
  if (progress < 0.05) return 0;
  if (progress < 0.2) return 1;
  if (progress < 0.5) return 2;
  if (progress < 0.85) return 3;
  return 4;
}

export function accrueDailyIncome(state: GameState): GameState {
  const now = Date.now();
  const daysSinceStart = (now - state.startDate) / (24 * 60 * 60 * 1000);
  const daysToAccrue = Math.floor(daysSinceStart) - state.totalDaysEarned;
  if (daysToAccrue <= 0) return state;

  const standardIncome = daysToAccrue * STANDARD_DAILY;
  const newState = {
    ...state,
    standardBalance: state.standardBalance + standardIncome,
    standardEarned: state.standardEarned + standardIncome,
    totalDaysEarned: state.totalDaysEarned + daysToAccrue,
    history: [
      ...state.history,
      ...Array.from({ length: daysToAccrue }, (_, i) => ({
        date: new Date(state.startDate + (state.totalDaysEarned + i + 1) * 86400000).toLocaleDateString("ru-RU"),
        amount: STANDARD_DAILY,
        type: "standard" as const,
      })),
    ].slice(-30),
  };
  return newState;
}

export function startSession(state: GameState, now: number): GameState {
  const available = getAvailableSessions(state.sessionTimestamps, now);
  if (available <= 0 || state.currentSession?.active) return state;
  return {
    ...state,
    currentSession: { active: true, actionsLeft: 3, water: false, sun: false, fertilizer: false },
  };
}

export function doAction(state: GameState, action: "water" | "sun" | "fertilizer"): GameState {
  const s = state.currentSession;
  if (!s || !s.active || s[action]) return state;
  const updated = { ...s, [action]: true, actionsLeft: s.actionsLeft - 1 };
  if (updated.actionsLeft === 0) {
    const now = Date.now();
    return {
      ...state,
      currentSession: null,
      sessionTimestamps: [...state.sessionTimestamps, now],
      activeBalance: state.activeBalance + SESSION_REWARD,
      activeEarned: state.activeEarned + SESSION_REWARD,
      history: [
        ...state.history,
        { date: new Date(now).toLocaleDateString("ru-RU"), amount: SESSION_REWARD, type: "active" as const },
      ].slice(-30),
    };
  }
  return { ...state, currentSession: updated };
}

export function formatRub(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
}

export function formatTimer(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export { SESSION_REWARD, STANDARD_DAILY, MAX_SESSIONS };
