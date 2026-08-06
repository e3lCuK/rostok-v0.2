/**
 * Economy v3 full-cycle wait countdown (user-facing).
 *
 * Source of truth = server full energy-unit cycle (same as v2 RootEnergyLayer):
 *   secondsUntilNextWholeSecond ≡ v2 secondsUntilNextSection ≡ (1-progress)*(720/M(K))
 * Absolute deadline: generation.nextWholeSecondAt (or derived from remaining).
 *
 * Does NOT use the 60s transfer insurance window — that is a separate pause and
 * must not replace the ~12:00 cycle timer on the main screen.
 */

import type { EconomyV3RootsState } from "@/lib/api";
import {
  formatRootTimer,
  resolveCountdownProgress,
  shouldPulseRootTimerBar,
  type RootTimerDisplay,
} from "@/lib/v2Roots";

export type V3RootWaitTimerSource = "cycle" | "none";

export type V3RootWaitTimerSnapshot = {
  source: V3RootWaitTimerSource;
  /** Absolute wall-clock deadline for the current full cycle. */
  deadlineAtMs: number;
  /** Full cycle length (progress bar); from server cycleDurationSeconds when present. */
  totalSeconds: number;
  capturedAtMs: number;
};

/** Insurance-only remaining — never wired to the main cycle capsule. */
export function remainingV3InsuranceSeconds(
  v3Roots: EconomyV3RootsState | null | undefined,
  nowMs: number,
): number | null {
  const gen = v3Roots?.generation;
  if (!gen?.frozenAt || !gen.insuranceDeadlineAt) return null;
  const deadline = Date.parse(gen.insuranceDeadlineAt);
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, (deadline - nowMs) / 1000);
}

function resolveCycleDeadlineMs(input: {
  nextWholeSecondAt: string | null | undefined;
  secondsUntilNextWholeSecond: number | null | undefined;
  nowMs: number;
}): number | null {
  if (input.nextWholeSecondAt) {
    const abs = Date.parse(input.nextWholeSecondAt);
    if (Number.isFinite(abs)) return abs;
  }
  if (
    input.secondsUntilNextWholeSecond != null &&
    Number.isFinite(input.secondsUntilNextWholeSecond)
  ) {
    return (
      input.nowMs + Math.max(0, Number(input.secondsUntilNextWholeSecond)) * 1000
    );
  }
  return null;
}

/**
 * Capture full-cycle wait from server SoT.
 * Transfer freeze/insurance must not hide the continuous generation clock.
 * Never substitutes the 60s insurance window for this capsule.
 */
export function captureV3RootWaitTimer(input: {
  v3Roots: EconomyV3RootsState | null | undefined;
  capital: number;
  nowMs: number;
  tutorialDone: boolean;
}): V3RootWaitTimerSnapshot | null {
  if (!input.tutorialDone) return null;
  const snap = input.v3Roots;
  if (!snap || snap.enabled !== true) return null;
  const gen = snap.generation;
  if (!gen) return null;

  if (!(input.capital > 0)) return null;
  if (gen.accumulating !== true) return null;

  const deadlineAtMs = resolveCycleDeadlineMs({
    nextWholeSecondAt: gen.nextWholeSecondAt,
    secondsUntilNextWholeSecond: gen.secondsUntilNextWholeSecond,
    nowMs: input.nowMs,
  });
  if (deadlineAtMs == null) return null;

  const remainingSeconds = Math.max(0, (deadlineAtMs - input.nowMs) / 1000);
  // Keep visible briefly at 0 so UI can sync once.
  if (deadlineAtMs < input.nowMs - 2000) return null;

  let totalSeconds =
    gen.cycleDurationSeconds != null &&
    Number.isFinite(gen.cycleDurationSeconds) &&
    gen.cycleDurationSeconds > 0
      ? Number(gen.cycleDurationSeconds)
      : null;
  if (totalSeconds == null) {
    const progress =
      Number.isFinite(gen.progress) && gen.progress >= 0 && gen.progress < 1
        ? gen.progress
        : 0;
    totalSeconds =
      progress > 0 && progress < 1
        ? Math.max(remainingSeconds / (1 - progress), remainingSeconds, 1)
        : Math.max(remainingSeconds, 1);
  }

  return {
    source: "cycle",
    deadlineAtMs,
    totalSeconds,
    capturedAtMs: input.nowMs,
  };
}

/**
 * Prefer keeping an existing absolute deadline across polling refreshes.
 *
 * Take the new capture only when:
 * - there was no previous cycle snapshot;
 * - remaining jumped up by a large amount (new generation cycle / ~12:00);
 * - server deadline is significantly earlier (catch-up after lag).
 *
 * Do NOT adopt a deadline that slid later — that is the classic poll reset
 * (frozen progress + nextAt = now + remaining).
 */
export function mergeV3RootWaitTimerSnapshot(input: {
  prev: V3RootWaitTimerSnapshot | null;
  next: V3RootWaitTimerSnapshot | null;
  nowMs: number;
}): V3RootWaitTimerSnapshot | null {
  const { prev, next, nowMs } = input;
  if (!next) return null;
  if (!prev || prev.source !== "cycle") return next;

  const prevRem = Math.max(0, (prev.deadlineAtMs - nowMs) / 1000);
  const nextRem = Math.max(0, (next.deadlineAtMs - nowMs) / 1000);

  // New longer cycle (unit completed → fresh ~12:00).
  // Threshold must exceed typical poll slide (~3–8s remaining jump).
  if (nextRem > prevRem + 30) return next;

  // Server is ahead of us (deadline earlier) — catch up.
  if (next.deadlineAtMs < prev.deadlineAtMs - 3000) return next;

  // Keep previous absolute deadline (smooth tick across refresh).
  return {
    ...prev,
    totalSeconds: next.totalSeconds > 0 ? next.totalSeconds : prev.totalSeconds,
  };
}

/** Live remaining from absolute deadline (F5 / tab-return safe). */
export function remainingV3RootWaitSeconds(
  snap: V3RootWaitTimerSnapshot | null,
  nowMs: number,
): number | null {
  if (!snap) return null;
  return Math.max(0, (snap.deadlineAtMs - nowMs) / 1000);
}

export function resolveV3RootWaitTimerDisplay(input: {
  snapshot: V3RootWaitTimerSnapshot | null;
  nowMs: number;
}): RootTimerDisplay {
  const seconds = remainingV3RootWaitSeconds(input.snapshot, input.nowMs);
  if (seconds == null || !input.snapshot) return { kind: "hidden" };
  const total = input.snapshot.totalSeconds;
  return {
    kind: "countdown",
    seconds,
    timeLabel: formatRootTimer(seconds),
    barProgress: resolveCountdownProgress(seconds, total),
    pulse: shouldPulseRootTimerBar({
      remainingSeconds: seconds,
      totalSeconds: total,
    }),
  };
}

export function shouldShowV3RootWaitTimer(input: {
  v3Roots: EconomyV3RootsState | null | undefined;
  capital: number;
  tutorialDone: boolean;
  hideTimer?: boolean;
  nowMs: number;
}): boolean {
  if (input.hideTimer) return false;
  return (
    captureV3RootWaitTimer({
      v3Roots: input.v3Roots,
      capital: input.capital,
      nowMs: input.nowMs,
      tutorialDone: input.tutorialDone,
    }) != null
  );
}
