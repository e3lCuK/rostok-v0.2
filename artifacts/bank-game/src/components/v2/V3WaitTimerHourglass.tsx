/**
 * Economy v3 wait-timer — one continuous classic hourglass through the chest.
 *
 * - Mirror upper/lower bulbs, same max width, slightly wider narrow neck
 * - Single mint wash bottom → top (host --v3-hg-fill syncs capital face)
 * - Upper bulb: centered Zap + time
 * - Lid-cut foot is part of the same SVG figure (not a separate overlay)
 */

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";

/**
 * Continuous hourglass silhouette in 80×140 viewBox.
 * Max bulb width ≈ full frame; neck ≈ 14 units at y=70 (mirror).
 */
export const V3_HOURGLASS_OUTER_PATH =
  "M6 5 C2 5 2 22 8 42 C14 58 28 66 33 70 C28 74 14 82 8 98 C2 118 2 135 6 135 L74 135 C78 135 78 118 72 98 C66 82 52 74 47 70 C52 66 66 58 72 42 C78 22 78 5 74 5 Z";

export const V3_HOURGLASS_GLASS_PATH = V3_HOURGLASS_OUTER_PATH;

export const V3_HOURGLASS_VIEW = { width: 80, height: 140 } as const;

/**
 * Capital face = bottom half of the lower bulb (the base), not the neck half.
 * Cut at mid-lower-bulb (y≈103); same side/base curves as the hourglass.
 * viewBox origin at (0,100) so the path stays in hourglass coordinates.
 */
export const V3_HOURGLASS_CAPITAL_BULB_PATH =
  "M8 103 C2 118 2 135 6 135 L74 135 C78 135 78 118 72 103 Z";

export const V3_HOURGLASS_CAPITAL_BULB_VIEW = {
  x: 0,
  y: 100,
  width: 80,
  height: 38,
} as const;

/** Default matches bank.css --v3-hourglass-tuck / --v3-hourglass-height. */
export const V3_HOURGLASS_DEFAULT_LID_CUT_Y =
  V3_HOURGLASS_VIEW.height * (1 - 46 / 112);

/** Keep lid-cut foot flush with the flask — stretch made green corners poke past the chest. */
const LID_CUT_STRETCH_X = 1;
const LID_CUT_EXTRA_PX = 0;

/** Half-width of outer path at y (lower bulb). */
function bulbHalfWidthAt(y: number): number {
  const mid = V3_HOURGLASS_VIEW.width / 2;
  if (y <= 98) {
    const t = Math.min(1, Math.max(0, (y - 70) / 28));
    const u = 1 - t;
    const x =
      u * u * u * 33 +
      3 * u * u * t * 28 +
      3 * u * t * t * 14 +
      t * t * t * 8;
    return mid - x;
  }
  const t = Math.min(1, Math.max(0, (y - 98) / 37));
  const u = 1 - t;
  const x =
    u * u * u * 8 + 3 * u * u * t * 2 + 3 * u * t * t * 2 + t * t * t * 6;
  return mid - x;
}

type Props = {
  barProgress: number;
  timeLabel: string;
  ariaLabel: string;
  testId?: string;
};

export default function V3WaitTimerHourglass({
  barProgress,
  timeLabel,
  ariaLabel,
  testId = "v3-root-wait-timer-capsule",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
  const clipId = `v3-hg-clip-${uid}`;
  const lidClipId = `v3-hg-lid-cut-${uid}`;
  const bodyClipId = `v3-hg-body-${uid}`;
  const fillPct = Math.min(100, Math.max(0, barProgress * 100));
  const vh = V3_HOURGLASS_VIEW.height;
  const fillHeight = (vh * fillPct) / 100;
  const fillY = vh - fillHeight;

  const [cutY, setCutY] = useState(V3_HOURGLASS_DEFAULT_LID_CUT_Y);
  const [pxToVb, setPxToVb] = useState(V3_HOURGLASS_VIEW.width / 64);

  // Capital face on the chest continues the same vertical progress.
  useLayoutEffect(() => {
    const host = rootRef.current?.closest(
      "[data-v3-capital-chest-host]",
    ) as HTMLElement | null;
    if (!host) return;
    host.style.setProperty("--v3-hg-fill", `${fillPct}%`);
  }, [fillPct]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const scope = root?.closest(".game-area--v3-roots") ?? root;
    if (!scope) return;
    const styles = getComputedStyle(scope);
    const tuck = parseFloat(styles.getPropertyValue("--v3-hourglass-tuck"));
    const height = parseFloat(
      styles.getPropertyValue("--v3-hourglass-height"),
    );
    if (Number.isFinite(tuck) && height > 0) {
      setCutY(V3_HOURGLASS_VIEW.height * (1 - tuck / height));
    }
    const paintW = root?.getBoundingClientRect().width ?? 0;
    if (paintW > 0) {
      setPxToVb(V3_HOURGLASS_VIEW.width / paintW);
    }
  }, []);

  const mid = V3_HOURGLASS_VIEW.width / 2;
  const half = Math.max(1, bulbHalfWidthAt(cutY));
  const stretchX = LID_CUT_STRETCH_X + (LID_CUT_EXTRA_PX * pxToVb) / half;
  // Lid line sits on the body cut — same stroke weight as the flask rim.
  const y0 = cutY - 0.4;
  const lidFootD = `M 0 ${y0} L ${V3_HOURGLASS_VIEW.width} ${y0}`;

  return (
    <div
      ref={rootRef}
      className="v3-root-wait-timer-capsule v3-root-wait-timer-capsule--hourglass"
      data-testid={testId}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fillPct)}
      aria-label={ariaLabel}
      data-timer-capsule="true"
      data-timer-shape="hourglass"
      data-timer-fill-pct={String(Math.round(fillPct))}
      data-v3-hourglass-lid-cut="true"
    >
      <svg
        className="v3-root-wait-timer-hourglass"
        viewBox={`0 0 ${V3_HOURGLASS_VIEW.width} ${V3_HOURGLASS_VIEW.height}`}
        width="100%"
        height="100%"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="none"
        overflow="visible"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={V3_HOURGLASS_OUTER_PATH} />
          </clipPath>
          {/* Hard cut: flask body never paints below the lid line. */}
          <clipPath id={bodyClipId}>
            <rect
              x={0}
              y={0}
              width={V3_HOURGLASS_VIEW.width}
              height={Math.max(0, y0)}
            />
          </clipPath>
          <clipPath id={lidClipId}>
            <path
              d={V3_HOURGLASS_OUTER_PATH}
              transform={`translate(${mid} ${cutY}) scale(${stretchX} 1) translate(${-mid} ${-cutY})`}
            />
          </clipPath>
        </defs>

        <g clipPath={`url(#${bodyClipId})`}>
          <path
            className="v3-root-wait-timer-hourglass__shell"
            d={V3_HOURGLASS_OUTER_PATH}
          />

          <g clipPath={`url(#${clipId})`}>
            <rect
              className="v3-root-wait-timer-capsule__fill"
              data-timer-fill="true"
              x={0}
              width={V3_HOURGLASS_VIEW.width}
              y={fillY}
              height={fillHeight}
            />
          </g>

          <path
            className="v3-root-wait-timer-hourglass__rim"
            d={V3_HOURGLASS_OUTER_PATH}
            fill="none"
          />
        </g>

        {/* Lid-cut line — same non-scaling stroke as the flask rim. */}
        <g clipPath={`url(#${lidClipId})`}>
          <path
            className="v3-root-wait-timer-hourglass__lid-foot"
            data-hourglass-lid-cut="true"
            d={lidFootD}
            fill="none"
          />
        </g>
      </svg>

      <div
        className="v3-root-wait-timer-upper"
        data-timer-upper="true"
        aria-hidden="true"
      >
        <span
          className="v3-root-wait-timer-icon"
          data-timer-energy-icon="true"
        >
          <Zap size={13} strokeWidth={2.25} fill="none" />
        </span>
        <span className="v3-root-wait-timer-capsule__time">{timeLabel}</span>
      </div>
    </div>
  );
}
