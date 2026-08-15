/**
 * Persist tutorial capital-idle compensation window across F5:
 * startedAt = capital armed on chest;
 * endedAt = gold flask first starts (roots filled to 10s presets).
 */

export const TUTORIAL_COMPENSATION_CLOCK_STORAGE_KEY =
  "rostok.v3.tutorialCompensationClock";

export type TutorialCompensationClock = {
  startedAtMs: number;
  endedAtMs: number | null;
  /** Active capital at vault→chest (for client demo coin). */
  capital: number;
};

let memoryClock: TutorialCompensationClock | null = null;

function readStorage(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(TUTORIAL_COMPENSATION_CLOCK_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(raw: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(TUTORIAL_COMPENSATION_CLOCK_STORAGE_KEY, raw);
  } catch {
    /* private mode / quota */
  }
}

function removeStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(TUTORIAL_COMPENSATION_CLOCK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function persist(clock: TutorialCompensationClock): void {
  memoryClock = {
    startedAtMs: Math.trunc(clock.startedAtMs),
    endedAtMs:
      clock.endedAtMs != null && Number.isFinite(clock.endedAtMs)
        ? Math.trunc(clock.endedAtMs)
        : null,
    capital:
      Number.isFinite(clock.capital) && clock.capital > 0
        ? clock.capital
        : 100_000,
  };
  writeStorage(JSON.stringify(memoryClock));
}

export function loadTutorialCompensationClock(
  nowMs: number = Date.now(),
): TutorialCompensationClock | null {
  let parsed: Partial<TutorialCompensationClock> | null = memoryClock;
  const raw = readStorage();
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Partial<TutorialCompensationClock>;
    } catch {
      parsed = memoryClock;
    }
  }
  if (!parsed) return null;
  const startedAtMs = Number(parsed.startedAtMs);
  if (!Number.isFinite(startedAtMs)) return null;
  if (startedAtMs > nowMs + 5_000) return null;
  // Ignore clocks older than the max compensation window + grace.
  if (startedAtMs < nowMs - 35 * 60 * 1000) return null;
  const endedRaw = parsed.endedAtMs;
  const endedAtMs =
    endedRaw == null
      ? null
      : Number.isFinite(Number(endedRaw))
        ? Math.trunc(Number(endedRaw))
        : null;
  const capitalRaw = Number(parsed.capital);
  return {
    startedAtMs: Math.trunc(startedAtMs),
    endedAtMs,
    capital:
      Number.isFinite(capitalRaw) && capitalRaw > 0 ? capitalRaw : 100_000,
  };
}

/** Mark capital-on-chest (idempotent — keeps first start). */
export function markTutorialCompensationStarted(
  atMs: number = Date.now(),
  capital: number = 100_000,
): TutorialCompensationClock {
  const existing = loadTutorialCompensationClock(atMs);
  if (existing) return existing;
  const clock: TutorialCompensationClock = {
    startedAtMs: Math.trunc(atMs),
    endedAtMs: null,
    capital: Number.isFinite(capital) && capital > 0 ? capital : 100_000,
  };
  persist(clock);
  return clock;
}

/** Mark gold flask first start (idempotent — keeps first end). */
export function markTutorialCompensationEnded(
  atMs: number = Date.now(),
): TutorialCompensationClock | null {
  const existing = loadTutorialCompensationClock(atMs);
  if (!existing) {
    const clock: TutorialCompensationClock = {
      startedAtMs: Math.trunc(atMs),
      endedAtMs: Math.trunc(atMs),
      capital: 100_000,
    };
    persist(clock);
    return clock;
  }
  if (existing.endedAtMs != null) return existing;
  const clock: TutorialCompensationClock = {
    startedAtMs: existing.startedAtMs,
    endedAtMs: Math.trunc(atMs),
    capital: existing.capital,
  };
  persist(clock);
  return clock;
}

export function clearTutorialCompensationClock(): void {
  memoryClock = null;
  removeStorage();
}
