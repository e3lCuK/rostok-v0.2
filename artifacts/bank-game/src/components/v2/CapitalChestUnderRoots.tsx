/**
 * Shared capital chest under the root system (v3 primary UI).
 * Reuses V2CapitalChest body art; capital sum is an HTML field caption
 * (same chrome as apple / growth badges).
 */

import { useEffect, useRef, useState } from "react";
import {
  V2CapitalChest,
  V2_CHEST_PAINT,
  formatV2ChestCapital,
} from "./V2CapitalChest";
import { ROOT_ART_VIEW } from "./rootArtCatalog";
import IncomeChestFloat from "./IncomeChestFloat";
import type { IncomeChestFeedback } from "@/lib/incomeChestFeedback";

type Props = {
  capital: number;
  incomeChestFeedback?: IncomeChestFeedback | null;
  onIncomeChestFeedbackComplete?: (id: string) => void;
  /** Opens accrual history (activities / excess), same as former capital «?». */
  onCapitalClick?: () => void;
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
}: Props) {
  const viewBox = `${CHEST_VIEW.x} ${CHEST_VIEW.y} ${CHEST_VIEW.width} ${CHEST_VIEW.height}`;
  const label = formatV2ChestCapital(capital);
  const { value, unit } = splitCapitalLabel(label);

  const prevLabelRef = useRef<string | null>(null);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    const prev = prevLabelRef.current;
    prevLabelRef.current = label;
    if (prev == null || prev === label) return;
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 420);
    return () => window.clearTimeout(t);
  }, [label]);

  return (
    <>
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
        <span
          className={`field-caption-badge v3-capital-badge${
            bump ? " v3-capital-badge--bump" : ""
          }`}
          data-capital-label="true"
          data-chest-part="capital-label"
          data-value-bump={bump ? "true" : "false"}
          aria-hidden="true"
        >
          <span className="field-caption-value">{value}</span>
          {unit ? <span className="field-caption-unit">{unit}</span> : null}
        </span>
        <IncomeChestFloat
          feedback={incomeChestFeedback}
          onComplete={(id) => onIncomeChestFeedbackComplete?.(id)}
        />
        {onCapitalClick ? (
          <button
            type="button"
            className="v3-capital-chest-hit"
            data-capital-chest-hit="true"
            aria-label={`Капитал ${label}. История начислений`}
            onClick={onCapitalClick}
          />
        ) : null}
      </div>
    </>
  );
}
