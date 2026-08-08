/**
 * Economy v3 full-cycle wait countdown — tall hourglass on the capital chest.
 * Uses absolute nextWholeSecondAt / secondsUntilNextWholeSecond (~12:00 cycle).
 * Always visible (idle empty glass when no active countdown).
 *
 * During Metelka cleaning: grey frozen capsule (clock held, no refresh).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EconomyV3RootsState } from "@/lib/api";
import {
  captureV3RootWaitTimer,
  mergeV3RootWaitTimerSnapshot,
  resolveV3RootWaitTimerDisplay,
  type V3RootWaitTimerSnapshot,
} from "@/lib/v3RootWaitTimer";
import V3WaitTimerHourglass from "./V3WaitTimerHourglass";

type Props = {
  v3Roots: EconomyV3RootsState | null | undefined;
  capital: number;
  tutorialDone: boolean;
  nowMs: number;
  frozen?: boolean;
  handoffDeadlineAtMs?: number | null;
  handoffTotalSeconds?: number;
  onRefreshState: () => void | Promise<void>;
};

type FrozenHold = {
  timeLabel: string;
  barProgress: number;
};

const IDLE_TIMER = {
  kind: "countdown" as const,
  timeLabel: "—:—",
  barProgress: 0,
  pulse: false,
  seconds: 0,
};

export default function V3RootWaitTimer({
  v3Roots,
  capital,
  tutorialDone,
  nowMs,
  frozen = false,
  handoffDeadlineAtMs = null,
  handoffTotalSeconds = 12 * 60,
  onRefreshState,
}: Props) {
  const refreshingRef = useRef(false);
  const prevSnapshotRef = useRef<V3RootWaitTimerSnapshot | null>(null);
  const handoffSeededRef = useRef(false);
  const [frozenNowMs, setFrozenNowMs] = useState<number | null>(null);
  const [frozenHold, setFrozenHold] = useState<FrozenHold | null>(null);
  const protectHandoff =
    handoffDeadlineAtMs != null &&
    Number.isFinite(handoffDeadlineAtMs) &&
    handoffDeadlineAtMs > nowMs - 2000;

  useEffect(() => {
    if (frozen) {
      setFrozenNowMs((prev) => prev ?? nowMs);
    } else {
      setFrozenNowMs(null);
      setFrozenHold(null);
    }
  }, [frozen, nowMs]);

  const displayNowMs = frozen && frozenNowMs != null ? frozenNowMs : nowMs;

  if (
    tutorialDone &&
    !handoffSeededRef.current &&
    handoffDeadlineAtMs != null &&
    Number.isFinite(handoffDeadlineAtMs)
  ) {
    handoffSeededRef.current = true;
    prevSnapshotRef.current = {
      source: "cycle",
      deadlineAtMs: Math.trunc(handoffDeadlineAtMs),
      totalSeconds:
        Number.isFinite(handoffTotalSeconds) && handoffTotalSeconds > 0
          ? handoffTotalSeconds
          : 12 * 60,
      capturedAtMs: displayNowMs,
    };
  }

  const snapshot = useMemo(() => {
    if (!tutorialDone) return null;
    const captured = captureV3RootWaitTimer({
      v3Roots,
      capital,
      nowMs: displayNowMs,
      tutorialDone,
    });
    return mergeV3RootWaitTimerSnapshot({
      prev: prevSnapshotRef.current,
      next: captured,
      nowMs: displayNowMs,
      protectTutorialHandoff: protectHandoff,
    });
  }, [
    tutorialDone,
    capital,
    displayNowMs,
    protectHandoff,
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

  const liveTimer = resolveV3RootWaitTimerDisplay({
    snapshot,
    nowMs: displayNowMs,
  });

  useEffect(() => {
    if (!frozen || frozenHold != null) return;
    if (liveTimer.kind !== "countdown") return;
    setFrozenHold({
      timeLabel: liveTimer.timeLabel,
      barProgress: liveTimer.barProgress,
    });
  }, [frozen, frozenHold, liveTimer]);

  const timer =
    frozen && frozenHold
      ? {
          kind: "countdown" as const,
          timeLabel: frozenHold.timeLabel,
          barProgress: frozenHold.barProgress,
          pulse: false,
          seconds: 0,
        }
      : liveTimer.kind === "countdown"
        ? liveTimer
        : IDLE_TIMER;

  useEffect(() => {
    if (!snapshot || frozen || !tutorialDone) return;
    const display = resolveV3RootWaitTimerDisplay({ snapshot, nowMs });
    if (display.kind !== "countdown" || display.seconds > 0) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    void Promise.resolve(onRefreshState())
      .catch(() => {})
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [snapshot, nowMs, frozen, tutorialDone, onRefreshState]);

  return (
    <div
      className={`v3-root-wait-timer${
        !frozen && "pulse" in timer && timer.pulse
          ? " v3-root-wait-timer--pulse"
          : ""
      }${frozen ? " v3-root-wait-timer--frozen" : ""}`}
      data-v3-root-wait-timer="true"
      data-testid="v3-root-wait-timer"
      data-timer-kind={
        liveTimer.kind === "countdown" ? "countdown" : "idle"
      }
      data-timer-frozen={frozen ? "true" : "false"}
      data-timer-source={snapshot?.source ?? "none"}
      data-timer-visible="true"
      aria-live="polite"
    >
      <V3WaitTimerHourglass
        barProgress={timer.barProgress}
        timeLabel={timer.timeLabel}
        ariaLabel={
          frozen
            ? "Накопление приостановлено"
            : liveTimer.kind === "countdown"
              ? "До следующего накопления"
              : "Ожидание накопления"
        }
        testId="v3-root-wait-timer-capsule"
      />
    </div>
  );
}
