/**
 * Economy v3 full-cycle wait countdown — tall hourglass on the capital chest.
 * Uses absolute nextWholeSecondAt / secondsUntilNextWholeSecond (~12:00 cycle).
 * Always visible (idle empty glass when no active countdown).
 *
 * Excess / grey flask: countdown of the financial cycle phased by whole
 * excessElapsed seconds (1s → 11:59), not the gold wait remaining.
 * Metelka cleaning must NOT freeze financial accrual (no idle gap).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EconomyV3RootsState } from "@/lib/api";
import { resolveV3FinancialFlaskDisplay } from "@/lib/v3FinancialFlask";
import { readMetelkaFinancialLiveMs } from "@/lib/metelkaFinancialLive";
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
  /**
   * Excess-phase (stone grey): drive label/fill from financial elapsed, never
   * from the gold generation wait-clock.
   */
  financialMode?: boolean;
  /** Production excessElapsedMs (server); live-projected while minting. */
  excessElapsedMs?: number;
  /** When true, project financial elapsed between polls. */
  financialMinting?: boolean;
  handoffDeadlineAtMs?: number | null;
  handoffTotalSeconds?: number;
  onRefreshState: () => void | Promise<void>;
  /** Tap upper flask → income help modal. */
  onHelpClick?: () => void;
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
  financialMode = false,
  excessElapsedMs = 0,
  financialMinting = false,
  handoffDeadlineAtMs = null,
  handoffTotalSeconds = 12 * 60,
  onRefreshState,
  onHelpClick,
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

  // Financial excess keeps minting during Metelka — never hold the grey flask.
  const holdFrozen = frozen && !financialMode;

  useEffect(() => {
    if (holdFrozen) {
      setFrozenNowMs((prev) => prev ?? nowMs);
    } else {
      setFrozenNowMs(null);
      setFrozenHold(null);
    }
  }, [holdFrozen, nowMs]);

  // Excess phase: drop gold-merge memory immediately so we never paint a
  // leftover generation / tutorial deadline on the grey flask.
  useLayoutEffect(() => {
    if (financialMode) {
      prevSnapshotRef.current = null;
    }
  }, [financialMode]);

  const displayNowMs = holdFrozen && frozenNowMs != null ? frozenNowMs : nowMs;

  if (
    !financialMode &&
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

  const financialLiveMs = financialMode
    ? readMetelkaFinancialLiveMs({
        serverElapsedMs: excessElapsedMs,
        // Keep projecting while grey even if cleaning freezes the label.
        minting: financialMinting,
        nowMs: displayNowMs,
      })
    : 0;

  const financialTimer = useMemo(() => {
    if (!financialMode) return null;
    return resolveV3FinancialFlaskDisplay({
      excessElapsedMs: financialLiveMs,
      cycleDurationSeconds: v3Roots?.generation?.cycleDurationSeconds,
      capital,
    });
  }, [
    financialMode,
    financialLiveMs,
    capital,
    v3Roots?.generation?.cycleDurationSeconds,
  ]);

  const snapshot = useMemo(() => {
    if (financialMode) return null;
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
    financialMode,
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
    if (financialMode) return;
    // Never wipe a seeded tutorial handoff with a null capture gap —
    // that flashed idle "—:—" for a frame after dismiss.
    if (snapshot != null) {
      prevSnapshotRef.current = snapshot;
    }
  }, [snapshot, financialMode]);

  const liveTimer = financialTimer
    ? {
        kind: "countdown" as const,
        timeLabel: financialTimer.timeLabel,
        barProgress: financialTimer.barProgress,
        pulse: false,
        seconds: financialTimer.remainingSeconds,
      }
    : resolveV3RootWaitTimerDisplay({
        snapshot,
        nowMs: displayNowMs,
      });

  useEffect(() => {
    if (!holdFrozen || frozenHold != null) return;
    if (liveTimer.kind !== "countdown") return;
    setFrozenHold({
      timeLabel: liveTimer.timeLabel,
      barProgress: liveTimer.barProgress,
    });
  }, [holdFrozen, frozenHold, liveTimer]);

  const timer =
    holdFrozen && frozenHold
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
    // Gold wait only: financial mode has no “deadline hit → settle roots”.
    if (financialMode || !snapshot || holdFrozen || !tutorialDone) return;
    const display = resolveV3RootWaitTimerDisplay({ snapshot, nowMs });
    if (display.kind !== "countdown" || display.seconds > 0) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    void Promise.resolve(onRefreshState())
      .catch(() => {})
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [
    financialMode,
    snapshot,
    nowMs,
    holdFrozen,
    tutorialDone,
    onRefreshState,
  ]);

  return (
    <div
      className={`v3-root-wait-timer${
        !holdFrozen && "pulse" in timer && timer.pulse
          ? " v3-root-wait-timer--pulse"
          : ""
      }${holdFrozen ? " v3-root-wait-timer--frozen" : ""}`}
      data-v3-root-wait-timer="true"
      data-testid="v3-root-wait-timer"
      data-timer-kind={
        financialMode
          ? "financial"
          : liveTimer.kind === "countdown"
            ? "countdown"
            : "idle"
      }
      data-timer-frozen={holdFrozen ? "true" : "false"}
      data-timer-source={
        financialMode ? "financial" : (snapshot?.source ?? "none")
      }
      data-timer-visible="true"
      aria-live="polite"
    >
      <V3WaitTimerHourglass
        barProgress={timer.barProgress}
        timeLabel={timer.timeLabel}
        ariaLabel={
          holdFrozen
            ? "Накопление приостановлено"
            : financialMode
              ? "Финансовое время избытка"
              : liveTimer.kind === "countdown"
                ? "До следующего накопления"
                : "Ожидание накопления"
        }
        testId="v3-root-wait-timer-capsule"
        onHelpClick={onHelpClick}
      />
    </div>
  );
}
