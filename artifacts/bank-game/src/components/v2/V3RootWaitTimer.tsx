/**
 * Economy v3 full-cycle wait countdown — centered between roots and capital chest.
 * Uses absolute nextWholeSecondAt / secondsUntilNextWholeSecond (~12:00 cycle).
 * Stays visible during transfer freeze/insurance — never swaps in the 60s pause.
 *
 * Holds a stable absolute deadline across polling; display = deadline − nowMs.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Zap } from "lucide-react";
import type { EconomyV3RootsState } from "@/lib/api";
import {
  captureV3RootWaitTimer,
  mergeV3RootWaitTimerSnapshot,
  resolveV3RootWaitTimerDisplay,
  type V3RootWaitTimerSnapshot,
} from "@/lib/v3RootWaitTimer";

type Props = {
  v3Roots: EconomyV3RootsState | null | undefined;
  capital: number;
  tutorialDone: boolean;
  /** GamePage 1s clock — remount / tab-return safe with wall deadline. */
  nowMs: number;
  /** Hide during Metelka cleaning (same gate as v2). */
  hideTimer?: boolean;
  onRefreshState: () => void | Promise<void>;
};

export default function V3RootWaitTimer({
  v3Roots,
  capital,
  tutorialDone,
  nowMs,
  hideTimer = false,
  onRefreshState,
}: Props) {
  const refreshingRef = useRef(false);
  const prevSnapshotRef = useRef<V3RootWaitTimerSnapshot | null>(null);

  const snapshot = useMemo(() => {
    if (hideTimer || !tutorialDone) return null;
    const captured = captureV3RootWaitTimer({
      v3Roots,
      capital,
      nowMs,
      tutorialDone,
    });
    return mergeV3RootWaitTimerSnapshot({
      prev: prevSnapshotRef.current,
      next: captured,
      nowMs,
    });
  }, [
    hideTimer,
    tutorialDone,
    capital,
    nowMs,
    v3Roots,
    v3Roots?.enabled,
    v3Roots?.generation?.accumulating,
    v3Roots?.generation?.nextWholeSecondAt,
    v3Roots?.generation?.secondsUntilNextWholeSecond,
    v3Roots?.generation?.cycleDurationSeconds,
    v3Roots?.generation?.progress,
  ]);

  useLayoutEffect(() => {
    prevSnapshotRef.current = snapshot;
  }, [snapshot]);

  const timer = hideTimer
    ? ({ kind: "hidden" } as const)
    : resolveV3RootWaitTimerDisplay({ snapshot, nowMs });

  useEffect(() => {
    if (!snapshot || hideTimer || !tutorialDone) return;
    const display = resolveV3RootWaitTimerDisplay({ snapshot, nowMs });
    if (display.kind !== "countdown" || display.seconds > 0) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    void Promise.resolve(onRefreshState())
      .catch(() => {})
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [snapshot, nowMs, hideTimer, tutorialDone, onRefreshState]);

  if (timer.kind !== "countdown") return null;

  return (
    <div
      className={`v3-root-wait-timer${timer.pulse ? " v3-root-wait-timer--pulse" : ""}`}
      data-v3-root-wait-timer="true"
      data-testid="v3-root-wait-timer"
      data-timer-kind="countdown"
      data-timer-source={snapshot?.source ?? "none"}
      data-timer-visible="true"
      aria-live="polite"
    >
      <div
        className="v3-root-wait-timer-capsule"
        data-testid="v3-root-wait-timer-capsule"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(timer.barProgress * 100)}
        aria-label="До следующего накопления"
        data-timer-capsule="true"
      >
        <div
          className="v3-root-wait-timer-capsule__fill"
          style={{ height: `${timer.barProgress * 100}%` }}
          data-timer-fill="true"
        />
        <span
          className="v3-root-wait-timer-icon"
          data-timer-energy-icon="true"
          aria-hidden="true"
        >
          <Zap size={16} strokeWidth={2.25} fill="none" />
        </span>
        <span className="v3-root-wait-timer-capsule__time">{timer.timeLabel}</span>
      </div>
    </div>
  );
}
