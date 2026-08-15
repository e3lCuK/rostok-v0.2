/**
 * Tutorial energy timer in the capital-hourglass slot.
 * - fill: 5s integer countdown while staging each root (never shows 0)
 * - wait: MM:SS countdown (T(K): 60:00 at K=0, 12:00 at 100k) after roots ready
 * - fast fill: 5s integer beats that grant 10s presets on each root
 */

import { useEffect, useState } from "react";
import {
  TUTORIAL_PLAN_ICON_COLORS,
  TUTORIAL_V3_FILL_MS,
  TUTORIAL_V3_WAIT_MS,
  type TutorialV3TimerKind,
} from "@/lib/tutorialFlow";
import { formatRootTimer } from "@/lib/v2Roots";
import V3WaitTimerHourglass from "./V3WaitTimerHourglass";

type Props = {
  deadlineMs: number;
  kind?: TutorialV3TimerKind;
  durationMs?: number;
  /** Clock on the flask — shorten remaining wait to 5s staging beats. */
  onFastFillClick?: () => void;
};

export default function V3TutorialFillTimer({
  deadlineMs,
  kind = "fill",
  durationMs,
  onFastFillClick,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const totalMs =
    durationMs ??
    (kind === "wait" ? TUTORIAL_V3_WAIT_MS : TUTORIAL_V3_FILL_MS);
  const fastFillBeat = totalMs <= TUTORIAL_V3_FILL_MS + 50;

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [deadlineMs, kind]);

  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const remainingSeconds = Math.max(0, remainingMs / 1000);
  const total = Math.max(1, totalMs);
  const barProgress = Math.min(1, Math.max(0, 1 - remainingMs / total));
  const timeLabel =
    kind === "wait" && !fastFillBeat
      ? formatRootTimer(
          Math.max(remainingSeconds, 0.001),
          totalMs / 1000,
        )
      : String(Math.max(1, Math.ceil(remainingSeconds)));

  return (
    <div
      className="v3-root-wait-timer"
      data-v3-root-wait-timer="true"
      data-testid="v3-tutorial-fill-timer"
      data-timer-kind={kind === "wait" ? "tutorial-wait" : "tutorial-fill"}
      data-timer-frozen="false"
      data-timer-visible="true"
      aria-live="polite"
    >
      <V3WaitTimerHourglass
        barProgress={barProgress}
        timeLabel={timeLabel}
        ariaLabel={
          kind === "wait" ? "До следующего накопления" : "Накопление энергии"
        }
        testId="v3-tutorial-fill-timer-capsule"
      />
      {onFastFillClick ? (
        <button
          type="button"
          className="v3-tutorial-fast-fill-btn"
          data-testid="v3-tutorial-fast-fill"
          style={{ color: TUTORIAL_PLAN_ICON_COLORS.fastFill }}
          aria-label="Ускорить наполнение корней: 5 секунд на корень"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFastFillClick();
          }}
        >
          <svg
            className="v3-tutorial-fast-fill-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="12" x2="12" y2="6.5" />
            <line x1="12" y1="12" x2="17" y2="12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
