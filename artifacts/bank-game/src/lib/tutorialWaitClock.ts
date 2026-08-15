/**
 * Persist the tutorial energy wait start/deadline across F5.
 * In-memory refs alone reset the capsule to a fresh cycle on reload.
 */

import {
  TUTORIAL_V3_WAIT_MS,
  tutorialWaitMsForCapital,
} from "@/lib/tutorialFlow";

export const TUTORIAL_WAIT_CLOCK_STORAGE_KEY = "rostok.v3.tutorialWaitClock";

export type TutorialWaitClock = {
  startedAtMs: number;
  deadlineMs: number;
};

/** Fallback when sessionStorage is unavailable (SSR / private mode / node tests). */
let memoryClock: TutorialWaitClock | null = null;

function readStorage(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(TUTORIAL_WAIT_CLOCK_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(raw: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(TUTORIAL_WAIT_CLOCK_STORAGE_KEY, raw);
  } catch {
    /* private mode / quota */
  }
}

function removeStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(TUTORIAL_WAIT_CLOCK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function persistTutorialWaitClock(
  clock: TutorialWaitClock,
): void {
  const next: TutorialWaitClock = {
    startedAtMs: Math.trunc(clock.startedAtMs),
    deadlineMs: Math.trunc(clock.deadlineMs),
  };
  memoryClock = next;
  writeStorage(JSON.stringify(next));
}

export function loadTutorialWaitClock(
  nowMs: number = Date.now(),
): TutorialWaitClock | null {
  let parsed: Partial<TutorialWaitClock> | null = memoryClock;
  const raw = readStorage();
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Partial<TutorialWaitClock>;
    } catch {
      parsed = memoryClock;
    }
  }
  if (!parsed) return null;
  const startedAtMs = Number(parsed.startedAtMs);
  const deadlineMs = Number(parsed.deadlineMs);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(deadlineMs)) {
    return null;
  }
  // Ignore stale clocks older than one full wait + small grace (covers K=0 60 min).
  if (deadlineMs < nowMs - 60_000) return null;
  if (startedAtMs > nowMs + 5_000) return null;
  return {
    startedAtMs: Math.trunc(startedAtMs),
    deadlineMs: Math.trunc(deadlineMs),
  };
}

export function clearTutorialWaitClock(): void {
  memoryClock = null;
  removeStorage();
}

/**
 * Restore or arm a wait clock (F5-safe).
 * `capital` selects T(K): 0 → 60:00, 100k → 12:00.
 */
export function armTutorialWaitClock(
  nowMs: number = Date.now(),
  capital: number = 100_000,
): TutorialWaitClock {
  const existing = loadTutorialWaitClock(nowMs);
  if (existing) return existing;
  const waitMs = tutorialWaitMsForCapital(capital);
  const startedAtMs = Math.trunc(nowMs);
  const clock = {
    startedAtMs,
    deadlineMs:
      startedAtMs +
      (Number.isFinite(waitMs) && waitMs > 0 ? waitMs : TUTORIAL_V3_WAIT_MS),
  };
  persistTutorialWaitClock(clock);
  return clock;
}

/** One-shot purple skip clock — once used, do not show again this tutorial life. */
export const TUTORIAL_FAST_FILL_USED_STORAGE_KEY =
  "rostok.v3.tutorialFastFillUsed";

let memoryFastFillUsed = false;

export function loadTutorialFastFillUsed(): boolean {
  if (memoryFastFillUsed) return true;
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(TUTORIAL_FAST_FILL_USED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistTutorialFastFillUsed(): void {
  memoryFastFillUsed = true;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(TUTORIAL_FAST_FILL_USED_STORAGE_KEY, "1");
  } catch {
    /* private mode / quota */
  }
}

export function clearTutorialFastFillUsed(): void {
  memoryFastFillUsed = false;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(TUTORIAL_FAST_FILL_USED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
