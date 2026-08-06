/**
 * Single-flight finish guard for Metelka cleaning.
 * One finish attempt per session key; timer expiry can force past in-flight clears.
 * Recoverable errors release the lock so retry/resync can run.
 */

export type ExcessFinishSessionKey = string;

export type ExcessFinishRequest = {
  /** Stable id for the active attempt (startedAt:presetSeconds). */
  sessionKey: ExcessFinishSessionKey;
  /**
   * Timer / reload expiry: do not wait for in-flight web clears.
   * All-webs-cleared finish may omit force and wait for clears to settle.
   */
  force?: boolean;
};

type FinishRunner = (sessionKey: ExcessFinishSessionKey) => Promise<void>;

export type ExcessFinishGuard = {
  requestFinish: (req: ExcessFinishRequest) => void;
  setClearInFlight: (count: number) => void;
  /** Drop all local finish state (new session / debug wipe / acknowledge). */
  reset: () => void;
  /** Ignore in-flight result for this key (debug superseded the session). */
  invalidate: (sessionKey: ExcessFinishSessionKey) => void;
  /** True after a successful finish for the given key (or last finished key). */
  getFinished: (sessionKey?: ExcessFinishSessionKey) => boolean;
  /** True while a finish POST is running for the key. */
  getInFlight: (sessionKey?: ExcessFinishSessionKey) => boolean;
  /** True if finish was requested / running / done for this key. */
  getFinishStarted: (sessionKey: ExcessFinishSessionKey) => boolean;
  getLastError: () => string | null;
  clearLastError: () => void;
};

export function createExcessFinishGuard(
  runFinish: FinishRunner,
): ExcessFinishGuard {
  let clearInFlight = 0;
  let pending = false;
  let pendingForce = false;
  let inFlight = false;
  let finishedKey: ExcessFinishSessionKey | null = null;
  let activeKey: ExcessFinishSessionKey | null = null;
  let generation = 0;
  let lastError: string | null = null;
  const invalidatedKeys = new Set<ExcessFinishSessionKey>();

  async function tryRun() {
    if (inFlight) return;
    if (finishedKey != null && finishedKey === activeKey) return;
    if (!pending || activeKey == null) return;
    if (!pendingForce && clearInFlight > 0) return;

    const sessionKey = activeKey;
    const gen = generation;
    pending = false;
    pendingForce = false;
    inFlight = true;
    try {
      if (invalidatedKeys.has(sessionKey)) {
        return;
      }
      await runFinish(sessionKey);
      if (gen !== generation || invalidatedKeys.has(sessionKey)) {
        // Debug / reset superseded this attempt — do not lock finished.
        return;
      }
      finishedKey = sessionKey;
      lastError = null;
    } catch (err) {
      if (gen !== generation || invalidatedKeys.has(sessionKey)) {
        return;
      }
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Не удалось завершить Метёлку";
      lastError = msg;
      // Allow retry for the same session.
      finishedKey = null;
    } finally {
      inFlight = false;
      if (
        pending &&
        activeKey != null &&
        finishedKey !== activeKey &&
        (pendingForce || clearInFlight === 0)
      ) {
        void tryRun();
      }
    }
  }

  return {
    requestFinish(req) {
      const key = String(req.sessionKey || "").trim();
      if (!key) return;
      if (invalidatedKeys.has(key)) return;
      if (finishedKey === key) return;

      if (activeKey != null && activeKey !== key) {
        // New session identity — drop prior attempt state.
        pending = false;
        pendingForce = false;
        finishedKey = null;
        lastError = null;
      }
      activeKey = key;
      pending = true;
      if (req.force === true) {
        pendingForce = true;
        clearInFlight = 0;
      }
      void tryRun();
    },
    setClearInFlight(count) {
      clearInFlight = Math.max(0, Math.floor(count));
      if (clearInFlight === 0 && pending) {
        void tryRun();
      }
    },
    reset() {
      generation += 1;
      clearInFlight = 0;
      pending = false;
      pendingForce = false;
      inFlight = false;
      finishedKey = null;
      activeKey = null;
      lastError = null;
      invalidatedKeys.clear();
    },
    invalidate(sessionKey) {
      const key = String(sessionKey || "").trim();
      if (!key) return;
      invalidatedKeys.add(key);
      if (activeKey === key) {
        pending = false;
        pendingForce = false;
        finishedKey = null;
        lastError = null;
        activeKey = null;
        generation += 1;
      }
    },
    getFinished(sessionKey) {
      if (sessionKey == null) return finishedKey != null;
      return finishedKey === sessionKey;
    },
    getInFlight(sessionKey) {
      if (!inFlight) return false;
      if (sessionKey == null) return true;
      return activeKey === sessionKey;
    },
    getFinishStarted(sessionKey) {
      if (!sessionKey) return false;
      if (finishedKey === sessionKey) return true;
      if (activeKey === sessionKey && (pending || inFlight)) return true;
      return false;
    },
    getLastError() {
      return lastError;
    },
    clearLastError() {
      lastError = null;
    },
  };
}
