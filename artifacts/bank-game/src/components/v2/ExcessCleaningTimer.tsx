import { useEffect, useState } from "react";
import type { EconomyV2ExcessSessionState } from "@/lib/api";
import { computeExcessCleaningRemainingSeconds } from "@/lib/excessCleaningCountdown";

const TICK_MS = 250;

type Props = {
  session?: EconomyV2ExcessSessionState | null;
};

/**
 * Compact cleaning countdown — only while session.active.
 * Remaining time is always derived from startedAt + presetSeconds.
 */
export default function ExcessCleaningTimer({ session }: Props) {
  const active = session?.active === true;
  const startedAt = session?.startedAt ?? null;
  const presetSeconds = session?.presetSeconds ?? null;

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    active ? computeExcessCleaningRemainingSeconds(session) : 0,
  );

  useEffect(() => {
    if (!active) {
      setRemainingSeconds(0);
      return;
    }
    if (
      startedAt == null ||
      !Number.isFinite(Number(startedAt)) ||
      presetSeconds == null ||
      !Number.isFinite(Number(presetSeconds))
    ) {
      setRemainingSeconds(0);
      return;
    }

    const locked: EconomyV2ExcessSessionState = {
      active: true,
      startedAt: Number(startedAt),
      presetSeconds: Number(presetSeconds),
      sourceSeconds: session?.sourceSeconds ?? null,
      rate: session?.rate ?? null,
    };

    const tick = () => {
      setRemainingSeconds(computeExcessCleaningRemainingSeconds(locked));
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [active, startedAt, presetSeconds, session?.sourceSeconds, session?.rate]);

  if (!active) return null;

  const urgent = remainingSeconds > 0 && remainingSeconds <= 3;
  const atZero = remainingSeconds === 0;

  return (
    <div
      className="excess-cleaning-timer"
      data-excess-cleaning-timer="true"
      data-excess-cleaning-remaining={remainingSeconds}
    >
      <div
        className={[
          "excess-cleaning-timer-capsule",
          urgent ? "excess-cleaning-timer-capsule--urgent" : "",
          atZero ? "excess-cleaning-timer-capsule--zero" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="timer"
        aria-live="polite"
        aria-label={`До завершения уборки: ${remainingSeconds} секунд`}
      >
        <span data-excess-cleaning-seconds="true">{remainingSeconds}</span>
      </div>
    </div>
  );
}
