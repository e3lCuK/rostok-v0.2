/**
 * Soft energy flight from a v3 root to its activity reserve card.
 * Fixed-layer portal; path from measured DOM rects; pointer-events none.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { EconomyV3RootKind } from "@/lib/api";
import {
  measureV3TransferFlight,
  type V3TransferFlightPoints,
} from "@/lib/v3TransferFlight";

type Props = {
  kind: EconomyV3RootKind;
  /** Flight duration in ms — should match parent transfer anim window. */
  durationMs: number;
  onComplete?: () => void;
};

export default function V3TransferFlight({
  kind,
  durationMs,
  onComplete,
}: Props) {
  const [points, setPoints] = useState<V3TransferFlightPoints | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    const measure = () => setPoints(measureV3TransferFlight(kind));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
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

  if (typeof document === "undefined" || !points) return null;

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
      aria-hidden="true"
    >
      <span className="v3-transfer-flight-blob" style={style} />
      <span
        className="v3-transfer-flight-blob v3-transfer-flight-blob--soft"
        style={style}
      />
    </div>,
    document.body,
  );
}
