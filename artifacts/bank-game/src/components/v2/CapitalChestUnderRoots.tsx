/**
 * Shared capital chest under the root system (v3 primary UI).
 *
 * Three-part flask (fill order bottom → top):
 *   1. capital button bulb (visible, clickable)
 *   2. mid band behind the chest (invisible, still fills)
 *   3. upper SVG timer in the hourglass slot (children)
 *
 * Layer order (back → front):
 *   mid → chest body → upper hourglass → capital button
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  V2CapitalChest,
  V2_CHEST_PAINT,
  formatV2ChestCapital,
  fitCapitalFontSize,
} from "./V2CapitalChest";
import {
  V3_HOURGLASS_CAPITAL_BULB_PATH,
  V3_HOURGLASS_CAPITAL_BULB_VIEW,
} from "./V3WaitTimerHourglass";
import { ROOT_ART_VIEW } from "./rootArtCatalog";

type Props = {
  capital: number;
  /** Opens accrual history — capital label is the hit target. */
  onCapitalClick?: () => void;
  /** Tall hourglass (timer / tutorial) — lid-cut foot is inside that SVG. */
  children?: ReactNode;
  /** Pulse only the chest lock while a Care / Metelka coin is dragged. */
  dropHighlight?: boolean;
  /** Care = gold; Metelka / excess = stone grey. */
  dropHighlightTone?: "gold" | "stone";
  /**
   * Force value-bump pulse (tutorial coin) even if formatted label is unchanged
   * for a frame due to parent state batching.
   */
  bumpToken?: number;
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
  onCapitalClick,
  children,
  dropHighlight = false,
  dropHighlightTone = "gold",
  bumpToken = 0,
}: Props) {
  const viewBox = `${CHEST_VIEW.x} ${CHEST_VIEW.y} ${CHEST_VIEW.width} ${CHEST_VIEW.height}`;
  const label = formatV2ChestCapital(capital);
  const { value, unit } = splitCapitalLabel(label);

  const prevLabelRef = useRef<string | null>(null);
  const prevBumpTokenRef = useRef(0);
  const badgeRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    if (!bumpToken || bumpToken === prevBumpTokenRef.current) return;
    prevBumpTokenRef.current = bumpToken;
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 420);
    return () => window.clearTimeout(t);
  }, [bumpToken]);

  const clickable = typeof onCapitalClick === "function";

  useLayoutEffect(() => {
    const el = badgeRef.current;
    if (!el) return;
    const apply = () => {
      const usable = el.clientWidth * 0.7;
      if (!(usable > 0)) return;
      const fs = fitCapitalFontSize(label, usable, 11, 6.5);
      el.style.setProperty("--capital-label-fs", `${fs.toFixed(2)}px`);
    };
    apply();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", apply);
      return () => window.removeEventListener("resize", apply);
    }
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", apply);
      window.removeEventListener("resize", apply);
    };
  }, [label, clickable]);

  const badgeClass = [
    "field-caption-badge",
    "field-caption-badge--capital",
    "v3-capital-badge",
    "v3-capital-badge--in-bulb",
    // Drives `.v3-capital-badge--bump` (value-change pulse on +₽ / tutorial coin).
    bump ? "v3-capital-badge--bump" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
              data-v3-hourglass-fill="button"
              data-v3-hourglass-part="button"
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
      {/*
        Invisible mid flask segment — sits behind the chest wood so it never
        paints on screen, but still consumes sequential fill progress.
      */}
      <div
        className="v3-hourglass-mid"
        data-v3-hourglass-part="mid"
        data-v3-hourglass-mid="true"
        aria-hidden="true"
      >
        <div
          className="v3-hourglass-mid__fill"
          data-v3-hourglass-fill="mid"
          data-v3-hourglass-mid-fill="true"
        />
      </div>

      <div
        className="v3-capital-hourglass-slot"
        data-v3-root-wait-timer-host="true"
        data-v3-capital-hourglass-slot="true"
        data-v3-hourglass-part="upper-slot"
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
        <V2CapitalChest
          capital={capital}
          layer="body"
          dropHighlight={dropHighlight}
          dropHighlightTone={dropHighlightTone}
        />
      </svg>

      <div
        className="v3-capital-chest-overlay"
        data-v3-capital-chest-overlay="true"
      >
        {clickable ? (
          <button
            type="button"
            className={badgeClass}
            data-capital-label="true"
            data-chest-part="capital-label"
            data-capital-chest-hit="true"
            data-value-bump={bump ? "true" : "false"}
            aria-label={`Капитал ${label}. История начислений`}
            onClick={onCapitalClick}
            ref={(node) => {
              badgeRef.current = node;
            }}
          >
            {badgeInner}
          </button>
        ) : (
          <span
            className={badgeClass}
            data-capital-label="true"
            data-chest-part="capital-label"
            data-value-bump={bump ? "true" : "false"}
            aria-hidden="true"
            ref={(node) => {
              badgeRef.current = node;
            }}
          >
            {badgeInner}
          </span>
        )}
      </div>
    </>
  );
}

export { V2_CHEST_PAINT, formatV2ChestCapital };
