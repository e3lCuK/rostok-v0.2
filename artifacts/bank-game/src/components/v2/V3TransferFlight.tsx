/**
 * Transfer cue: cream `+X с` pill (clock + label) flies from the root to
 * above its activity card — same family as XP / apple / income flashes.
 * No colored particle blobs (tutorial + live).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import type { EconomyV3RootKind } from "@/lib/api";
import {
  formatV3TransferSecondsLabel,
  measureV3TransferFlight,
  resolveV3TransferFlightHost,
  type V3TransferFlightPoints,
} from "@/lib/v3TransferFlight";

type Props = {
  kind: EconomyV3RootKind;
  /** Whole seconds transferred — drives the `+X с` floater. */
  seconds?: number;
  /** Flight duration in ms — should match parent transfer anim window. */
  durationMs: number;
  onComplete?: () => void;
};

const MEASURE_RETRY_FRAMES = 8;

export default function V3TransferFlight({
  kind,
  seconds = 0,
  durationMs,
  onComplete,
}: Props) {
  const [points, setPoints] = useState<V3TransferFlightPoints | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);
  const label = formatV3TransferSecondsLabel(seconds);

  useEffect(() => {
    completedRef.current = false;
    let cancelled = false;
    let frames = 0;
    let raf = 0;

    const tryMeasure = () => {
      if (cancelled) return;
      const host = resolveV3TransferFlightHost();
      const next = measureV3TransferFlight(
        kind,
        document,
        host?.getBoundingClientRect() ?? null,
      );
      if (next) {
        setPoints(next);
        return;
      }
      frames += 1;
      if (frames < MEASURE_RETRY_FRAMES) {
        raf = window.requestAnimationFrame(tryMeasure);
      }
    };

    tryMeasure();
    const onResize = () => {
      const host = resolveV3TransferFlightHost();
      const next = measureV3TransferFlight(
        kind,
        document,
        host?.getBoundingClientRect() ?? null,
      );
      if (next) setPoints(next);
    };
    window.addEventListener("resize", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
    };
  }, [kind]);

  useEffect(() => {
    if (!points) return;
    const timer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current?.();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [points, durationMs]);

  if (typeof document === "undefined" || !points || !label) return null;

  const host = resolveV3TransferFlightHost();
  if (!host) return null;

  const style = {
    ["--v3-flight-color" as string]: points.color,
    ["--v3-flight-x0" as string]: `${points.fromX}px`,
    ["--v3-flight-y0" as string]: `${points.fromY}px`,
    ["--v3-flight-xm" as string]: `${points.midX}px`,
    ["--v3-flight-ym" as string]: `${points.midY}px`,
    ["--v3-flight-x1" as string]: `${points.toX}px`,
    ["--v3-flight-y1" as string]: `${points.toY}px`,
    ["--v3-flight-ms" as string]: `${durationMs}ms`,
  } as CSSProperties;

  return createPortal(
    <div
      className="v3-transfer-flight-layer"
      data-v3-transfer-flight="true"
      data-v3-transfer-flight-kind={kind}
      data-v3-transfer-flight-seconds={String(
        Math.floor(Number(seconds) || 0),
      )}
      data-v3-transfer-flight-particles="false"
      aria-hidden="true"
    >
      <span
        className="v3-transfer-flight-label"
        data-v3-transfer-flight-label="true"
        style={style}
      >
        <span
          className="v3-transfer-flight-icon"
          data-v3-transfer-flight-clock="true"
        >
          <Clock size={13} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="v3-transfer-flight-text">{label}</span>
      </span>
    </div>,
    host,
  );
}
