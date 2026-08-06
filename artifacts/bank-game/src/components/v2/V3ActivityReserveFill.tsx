/**
 * Continuous reserve fill for Economy v3 activity cards (bottom → top).
 * Visual-only — height from server reserve / dailyCap.
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { EconomyV3RootKind } from "@/lib/api";

/**
 * Reserve fills — same RGB as root/button accents at 50% opacity
 * (#2b7fff / #ffc107 / #f0a020).
 */
export const V3_ACTIVITY_RESERVE_FILL_COLORS: Record<
  EconomyV3RootKind,
  string
> = {
  water: "rgba(43, 127, 255, 0.5)",
  sun: "rgba(255, 193, 7, 0.5)",
  fertilizer: "rgba(240, 160, 32, 0.5)",
};

type Props = {
  kind: EconomyV3RootKind;
  /** 0–100 visual height from reserve / dailyCap. */
  fillPercent: number;
  /** Dim fill when card is disabled / session-locked (not completed). */
  muted?: boolean;
};

/**
 * Stable fill layer: no remount on percent change; F5 skips 0→value animation.
 */
export default function V3ActivityReserveFill({
  kind,
  fillPercent,
  muted = false,
}: Props) {
  const clamped = Math.min(100, Math.max(0, Number(fillPercent) || 0));
  /** After first paint, enable height transitions for live updates. */
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setAnimate(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={[
        "v3-activity-reserve-fill",
        animate ? "v3-activity-reserve-fill--animate" : "",
        muted ? "v3-activity-reserve-fill--muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-v3-activity-reserve-fill={kind}
      data-v3-activity-reserve-pct={String(Math.round(clamped))}
      data-v3-activity-reserve-animate={animate ? "true" : "false"}
      aria-hidden="true"
      style={
        {
          height: `${clamped}%`,
          ["--v3-act-reserve-color" as string]:
            V3_ACTIVITY_RESERVE_FILL_COLORS[kind],
        } as CSSProperties
      }
    />
  );
}
