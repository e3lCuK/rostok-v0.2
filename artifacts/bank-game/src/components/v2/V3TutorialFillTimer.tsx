/**
 * Tutorial energy timer in the capital-hourglass slot.
 * - fill: 5s integer countdown while staging each root (never shows 0)
 * - wait: MM:SS countdown from 12:00 after all three roots are ready
 */

import { useEffect, useState } from "react";
import {
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
};

export default function V3TutorialFillTimer({
  deadlineMs,
  kind = "fill",
  durationMs,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const totalMs =
    durationMs ??
    (kind === "wait" ? TUTORIAL_V3_WAIT_MS : TUTORIAL_V3_FILL_MS);

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
    kind === "wait"
      ? formatRootTimer(Math.max(remainingSeconds, 0.001))
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
    </div>
  );
}
