import type { EconomyV2ExcessSessionState, EconomyV2ExcessState } from "@/lib/api";
import { isExcessResultAvailable } from "./excessResultUi";

/** Cleaning mode is driven only by the server session flag. */
export function isExcessCleaningMode(
  excess?: EconomyV2ExcessState | null,
): boolean {
  return excess?.session?.active === true;
}

/**
 * Absolute end time of the active Metelka attempt.
 * deadlineAtMs = startedAt + presetSeconds * 1000
 * Never rebuild as Date.now() + remaining.
 */
export function excessCleaningEndAtMs(
  session?: EconomyV2ExcessSessionState | null,
): number | null {
  if (!session || session.active !== true) return null;
  const startedAt = Number(session.startedAt);
  const presetSeconds = Number(session.presetSeconds);
  if (!Number.isFinite(startedAt) || !Number.isFinite(presetSeconds)) {
    return null;
  }
  return startedAt + presetSeconds * 1000;
}

/**
 * Stable finish-guard identity for one Metelka attempt.
 * Uses frozen startedAt + presetSeconds (no separate session token in API).
 */
export function excessSessionFinishKey(
  session?: EconomyV2ExcessSessionState | null,
): string | null {
  if (!session || session.active !== true) return null;
  const startedAt = Number(session.startedAt);
  const presetSeconds = Number(session.presetSeconds);
  if (!Number.isFinite(startedAt) || !Number.isFinite(presetSeconds)) {
    return null;
  }
  return `${startedAt}:${presetSeconds}`;
}

/** True when absolute deadline has been reached (raw ms, not display ceil). */
export function isExcessCleaningDeadlineReached(
  session?: EconomyV2ExcessSessionState | null,
  nowMs: number = Date.now(),
): boolean {
  const endAt = excessCleaningEndAtMs(session);
  if (endAt == null) return false;
  return nowMs >= endAt;
}

/** Remaining ms until endAt, never negative. */
export function computeExcessCleaningRemainingMs(
  session: EconomyV2ExcessSessionState | null | undefined,
  nowMs: number = Date.now(),
): number {
  const endAt = excessCleaningEndAtMs(session);
  if (endAt == null) return 0;
  return Math.max(0, endAt - nowMs);
}

/**
 * Display seconds: ceil(remainingMs / 1000), never negative.
 * Uses wall clock vs endAt — do not decrement by 1 each tick.
 */
export function computeExcessCleaningRemainingSeconds(
  session: EconomyV2ExcessSessionState | null | undefined,
  nowMs: number = Date.now(),
): number {
  return Math.max(
    0,
    Math.ceil(computeExcessCleaningRemainingMs(session, nowMs) / 1000),
  );
}

/**
 * Whether frontend should POST finish for the current Metelka attempt.
 * Uses absolute remainingMs <= 0 (not display ceil) so finish fires exactly
 * when the deadline is reached — even if webs remain.
 * Never true once result.available — prevents re-finish loops.
 */
export function shouldRequestExcessFinish(
  excess?: EconomyV2ExcessState | null,
  nowMs: number = Date.now(),
): boolean {
  if (!excess) return false;
  if (excess.session?.active !== true) return false;
  if (isExcessResultAvailable(excess)) return false;
  const session = excess.session;
  const remainingMs = computeExcessCleaningRemainingMs(session, nowMs);
  const remainingWebs = Number(session.remainingWebCount);
  return (
    remainingMs <= 0 ||
    (Number.isFinite(remainingWebs) && remainingWebs <= 0)
  );
}

/** Timer-expiry finish must force past in-flight clears. */
export function shouldForceExcessFinish(
  excess?: EconomyV2ExcessState | null,
  nowMs: number = Date.now(),
): boolean {
  if (!excess || excess.session?.active !== true) return false;
  if (isExcessResultAvailable(excess)) return false;
  return isExcessCleaningDeadlineReached(excess.session, nowMs);
}
