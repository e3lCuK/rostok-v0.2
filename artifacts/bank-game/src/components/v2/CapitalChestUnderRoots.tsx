/**
 * Shared capital chest under the root system (v3 primary UI).
 *
 * Layer order (back → front):
 *   1. continuous hourglass (+ lid-cut foot in the same SVG figure)
 *   2. chest body + lid
 *   3. capital face — lower-bulb base half (shared vertical fill)
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  V2CapitalChest,
  V2_CHEST_PAINT,
  formatV2ChestCapital,
} from "./V2CapitalChest";
import {
  V3_HOURGLASS_CAPITAL_BULB_PATH,
  V3_HOURGLASS_CAPITAL_BULB_VIEW,
} from "./V3WaitTimerHourglass";
import { ROOT_ART_VIEW } from "./rootArtCatalog";
import IncomeChestFloat from "./IncomeChestFloat";
import type { IncomeChestFeedback } from "@/lib/incomeChestFeedback";

type Props = {
  capital: number;
  incomeChestFeedback?: IncomeChestFeedback | null;
  onIncomeChestFeedbackComplete?: (id: string) => void;
  /** Opens accrual history — capital label is the hit target. */
  onCapitalClick?: () => void;
  /** Tall hourglass (timer / tutorial) — lid-cut foot is inside that SVG. */
  children?: ReactNode;
};

/**
 * Crop flush to painted crate (lid peak → base).
 * `preserveAspectRatio="none"` fills the host so flex `gap` is the only
 * timer↔chest spacing (no SVG letterboxing).
 */
const CHEST_VIEW = {
  x: 0,
  y: V2_CHEST_PAINT.top,
  width: ROOT_ART_VIEW.width,
  height: Math.max(1, V2_CHEST_PAINT.bottom - V2_CHEST_PAINT.top),
} as const;

function splitCapitalLabel(label: string): { value: string; unit: string } {
  const m = label.match(/^(.+?)\s*₽$/u);
  if (m) return { value: m[1].trim(), unit: "₽" };
  return { value: label, unit: "" };
}

export default function CapitalChestUnderRoots({
  capital,
  incomeChestFeedback = null,
  onIncomeChestFeedbackComplete,
  onCapitalClick,
  children,
}: Props) {
  const viewBox = `${CHEST_VIEW.x} ${CHEST_VIEW.y} ${CHEST_VIEW.width} ${CHEST_VIEW.height}`;
  const label = formatV2ChestCapital(capital);
  const { value, unit } = splitCapitalLabel(label);

  const prevLabelRef = useRef<string | null>(null);
  const [bump, setBump] = useState(false);
  const rawId = useId();
  const fillClipId = `v3-capital-bulb-fill-${rawId.replace(/:/g, "")}`;

  useEffect(() => {
    const prev = prevLabelRef.current;
    prevLabelRef.current = label;
    if (prev == null || prev === label) return;
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 420);
    return () => window.clearTimeout(t);
  }, [label]);

  const badgeClass = [
    "field-caption-badge",
    "field-caption-badge--capital",
    "v3-capital-badge",
    "v3-capital-badge--in-bulb",
  ].join(" ");

  const vw = V3_HOURGLASS_CAPITAL_BULB_VIEW.width;
  const vh = V3_HOURGLASS_CAPITAL_BULB_VIEW.height;
  const foY = V3_HOURGLASS_CAPITAL_BULB_VIEW.y;

  const badgeInner = (
    <>
      <svg
        className="v3-capital-badge__bulb"
        viewBox={`${V3_HOURGLASS_CAPITAL_BULB_VIEW.x} ${V3_HOURGLASS_CAPITAL_BULB_VIEW.y} ${vw} ${vh}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id={fillClipId}>
            <path d={V3_HOURGLASS_CAPITAL_BULB_PATH} />
          </clipPath>
        </defs>
        <path
          className="v3-capital-badge__shell"
          d={V3_HOURGLASS_CAPITAL_BULB_PATH}
        />
        <foreignObject
          x={0}
          y={foY}
          width={vw}
          height={vh}
          clipPath={`url(#${fillClipId})`}
        >
          <div className="v3-capital-badge__fill-host">
            <div
              className="v3-capital-badge__fill"
              data-capital-badge-fill="true"
            />
          </div>
        </foreignObject>
        <path
          className="v3-capital-badge__rim"
          d={V3_HOURGLASS_CAPITAL_BULB_PATH}
          fill="none"
        />
      </svg>
      <span className="v3-capital-badge__label">
        <span className="field-caption-value">{value}</span>
        {unit ? <span className="field-caption-unit">{unit}</span> : null}
      </span>
    </>
  );

  return (
    <>
      <div
        className="v3-capital-hourglass-slot"
        data-v3-root-wait-timer-host="true"
        data-v3-capital-hourglass-slot="true"
      >
        {children}
      </div>

      <svg
        className="v3-capital-chest-layer v3-capital-chest-layer--body"
        data-v3-capital-chest-layer="body"
        viewBox={viewBox}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        overflow="visible"
        aria-hidden="true"
      >
        <V2CapitalChest capital={capital} layer="body" />
      </svg>

      <div
        className="v3-capital-chest-overlay"
        data-v3-capital-chest-overlay="true"
      >
        {onCapitalClick ? (
          <button
            type="button"
            className={badgeClass}
            data-capital-label="true"
            data-chest-part="capital-label"
            data-capital-chest-hit="true"
            data-value-bump={bump ? "true" : "false"}
            aria-label={`Капитал ${label}. История начислений`}
            onClick={onCapitalClick}
          >
            {badgeInner}
          </button>
        ) : (
          <span
            className={badgeClass}
            data-capital-label="true"
            data-chest-part="capital-label"
            aria-hidden="true"
          >
            {badgeInner}
          </span>
        )}
        <IncomeChestFloat
          feedback={incomeChestFeedback}
          onComplete={(id) => onIncomeChestFeedbackComplete?.(id)}
        />
      </div>
    </>
  );
}

export { V2_CHEST_PAINT, formatV2ChestCapital };
