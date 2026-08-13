import { useEffect, useRef, useState } from "react";

export type V2CapitalChestLayer = "body" | "label" | "all";

export type V2CapitalChestProps = {
  /** Raw capital — same source as HUD `balances.balance`. */
  capital?: number;
  /** Pre-formatted display string; wins over formatting `capital`. */
  formattedCapital?: string;
  /** Soft bump when the displayed value changes (default true). */
  animateValueChange?: boolean;
  className?: string;
  /** `body` behind roots; `label` above roots for readable capital text. */
  layer?: V2CapitalChestLayer;
  /** Pulse only the lock/clasp while a Care / Metelka coin is dragged. */
  dropHighlight?: boolean;
  /** Care = gold; Metelka / excess = stone grey. */
  dropHighlightTone?: "gold" | "stone";
};

/** Same display rule as the top-left HUD capital row. */
export function formatV2ChestCapital(balance: number): string {
  return `${Math.floor(balance).toLocaleString("ru-RU")} ₽`;
}

function estimateLabelWidth(label: string, fontSize: number): number {
  let w = 0;
  for (const ch of label) {
    if (ch === " " || ch === "\u00a0" || ch === "\u202f") w += fontSize * 0.32;
    else if (ch === "₽") w += fontSize * 0.72;
    else w += fontSize * 0.58;
  }
  return w;
}

function fitCapitalFontSize(label: string, maxWidth: number): number {
  let fs = 9.5;
  while (fs > 6.2 && estimateLabelWidth(label, fs) > maxWidth) {
    fs -= 0.3;
  }
  return fs;
}

const CX = 100;
/**
 * Flat wooden chest — same paint language as AppleBasket / field bushes.
 * Compact vertical span so the v3 host crop stays tight under the timer.
 */
const BODY_X = 52;
const BODY_Y = 36;
const BODY_W = 96;
const BODY_H = 42;
const LID_OVERHANG = 4;
/**
 * Thin lid crown. Clasp sits on the seam with open face around it
 * (lid wood must not fill the whole lock zone).
 */
const LID_PEAK = 26;
/** Optical center of the face (label sits here). */
const FACE_CENTER_Y = BODY_Y + BODY_H * 0.5;
/**
 * Text zone width in viewBox units — keep wider than the previous layout.
 * Previous: 36 × 2.14 × 0.88 ≈ 67.7
 */
export const V2_CHEST_LABEL_MAX_W = BODY_W * 0.92;
const LABEL_MAX_W = V2_CHEST_LABEL_MAX_W;
/** Previous label max width (for regression tests). */
export const V2_CHEST_LABEL_MAX_W_PREV = 36 * 2.14 * 0.88;

/** Painted bounds — used by CapitalChestUnderRoots crop (flush to lid peak). */
export const V2_CHEST_PAINT = {
  top: LID_PEAK,
  bottom: BODY_Y + BODY_H + 1,
  left: BODY_X - LID_OVERHANG,
  right: BODY_X + BODY_W + LID_OVERHANG,
} as const;

/**
 * Same paint language as AppleBasket / field bushes:
 * flat fills, thin uniform stroke, soft weave bands.
 */
const WOOD = "#8b623e";
const WOOD_FACE = "#a67845";
const WOOD_BAND = "#5c3a1a";
/** Cavity between lid seam and concave body top */
const WOOD_INTERIOR = "#A67845";
const EDGE = "#5c3a1a";
const EDGE_W = 1.1;

function ChestBodyGeometry({
  dropHighlight = false,
  dropHighlightTone = "gold",
}: {
  dropHighlight?: boolean;
  dropHighlightTone?: "gold" | "stone";
}) {
  const x0 = BODY_X;
  const y0 = BODY_Y;
  const x1 = BODY_X + BODY_W;
  const mid = CX;
  const lidX0 = x0 - LID_OVERHANG;
  const lidX1 = x1 + LID_OVERHANG;
  /** Body top / lid seam */
  const lidSeamY = y0 + 1;
  const earInset = 10;
  const earL = lidX0 + earInset;
  const earR = lidX1 - earInset;

  return (
    <g className="v2-chest-body-geo" data-chest-part="geometry">
      {/* Interior cavity under the lid */}
      <path
        data-chest-part="interior"
        d={[
          `M ${earL} ${lidSeamY - 1.5}`,
          `L ${earR} ${lidSeamY - 1.5}`,
          `L ${earR} ${lidSeamY + 1}`,
          `Q ${mid} ${y0 + 5} ${earL} ${lidSeamY + 1}`,
          `Z`,
        ].join(" ")}
        fill={WOOD_INTERIOR}
      />

      {/* Body — single flat crate + thin rim */}
      <path
        data-chest-part="body"
        d={[
          `M ${x0 + 5} ${lidSeamY}`,
          `L ${x0 + 2.5} ${y0 + BODY_H - 5}`,
          `Q ${mid} ${y0 + BODY_H + 2.5} ${x1 - 2.5} ${y0 + BODY_H - 5}`,
          `L ${x1 - 5} ${lidSeamY}`,
          `Q ${mid} ${y0 + 5} ${x0 + 5} ${lidSeamY}Z`,
        ].join(" ")}
        fill={WOOD}
        stroke={EDGE}
        strokeWidth={EDGE_W}
        strokeLinejoin="round"
      />

      {/* Weave bands — same read as basket stripes */}
      <g
        data-chest-part="panels"
        stroke={WOOD_BAND}
        strokeWidth="1.05"
        fill="none"
        strokeLinecap="round"
        opacity="0.55"
      >
        <path
          d={`M ${x0 + 12} ${y0 + 18} Q ${mid} ${y0 + 22} ${x1 - 12} ${y0 + 18}`}
        />
        <path
          d={`M ${x0 + 13} ${y0 + 29} Q ${mid} ${y0 + 33} ${x1 - 13} ${y0 + 29}`}
        />
      </g>

      {/* Seam strip */}
      <rect
        data-chest-part="seam"
        x={earL}
        y={lidSeamY - 1.2}
        width={earR - earL}
        height={2.8}
        rx="1"
        fill={WOOD_INTERIOR}
        stroke={EDGE}
        strokeWidth="0.85"
      />

      {/* Lid — simple arched plank + thin outline (no ornate ears) */}
      <path
        data-chest-part="lid"
        data-lid-state="closed"
        d={[
          `M ${earL} ${lidSeamY + 1.2}`,
          `L ${lidX0 + 6} ${LID_PEAK + 3}`,
          `Q ${mid} ${LID_PEAK} ${lidX1 - 6} ${LID_PEAK + 3}`,
          `L ${earR} ${lidSeamY + 1.2}`,
          `Q ${mid} ${lidSeamY + 3.5} ${earL} ${lidSeamY + 1.2}Z`,
        ].join(" ")}
        fill={WOOD}
        stroke={EDGE}
        strokeWidth={EDGE_W}
        strokeLinejoin="round"
      />

      {/* Lock / clasp — Care coin drop target (pulse only this, not the whole chest). */}
      <g
        className={`v2-chest-clasp${
          dropHighlight
            ? dropHighlightTone === "stone"
              ? " v2-chest-clasp--drop-target v2-chest-clasp--drop-target-stone"
              : " v2-chest-clasp--drop-target"
            : ""
        }`}
        data-chest-part="clasp-group"
        data-chest-clasp="true"
        data-chest-clasp-drop-target={dropHighlight ? "true" : undefined}
        data-chest-clasp-tone={
          dropHighlight ? dropHighlightTone ?? "gold" : undefined
        }
      >
        <rect
          data-chest-part="clasp"
          x={mid - 5.5}
          y={lidSeamY - 4}
          width="11"
          height="10"
          rx="2.2"
          fill={WOOD_FACE}
          stroke={EDGE}
          strokeWidth="1.05"
        />
        <rect
          data-chest-part="clasp-slot"
          x={mid - 0.75}
          y={lidSeamY - 1.8}
          width="1.5"
          height="5.2"
          rx="0.6"
          fill={WOOD}
        />
      </g>
    </g>
  );
}

function ChestCapitalLabel({
  label,
  bump,
}: {
  label: string;
  bump: boolean;
}) {
  /* Leave room for pill padding (same chrome as .tree-growth-badge / .apple-basket-badge). */
  const fontSize = fitCapitalFontSize(label, LABEL_MAX_W * 0.86);
  const textW = estimateLabelWidth(label, fontSize);
  const padX = Math.max(3.2, fontSize * 0.55);
  const padY = Math.max(1.2, fontSize * 0.28);
  const pillW = Math.min(LABEL_MAX_W, textW + padX * 2);
  const pillH = fontSize + padY * 2;
  const pillR = pillH / 2;

  return (
    <g
      className={`v2-chest-capital${bump ? " v2-chest-capital--bump" : ""}`}
      /* Match topbar deposit row (.progress-row-deposit). */
      fill="#c9920a"
      transform={`translate(${CX} ${FACE_CENTER_Y})`}
      aria-hidden="true"
      data-chest-part="capital-label"
      data-label-max-w={String(LABEL_MAX_W)}
      data-value-bump={bump ? "true" : "false"}
    >
      {/* Soft white pill — same read as growth / apple field captions */}
      <rect
        data-chest-part="label-zone"
        className="v2-chest-capital__pill"
        x={-pillW / 2}
        y={-pillH / 2}
        width={pillW}
        height={pillH}
        rx={pillR}
        ry={pillR}
        fill="rgba(255, 248, 236, 0.92)"
        stroke="none"
        pointerEvents="none"
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="500"
        letterSpacing="0.01em"
        className="v2-chest-capital__text"
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Warm brown crate for capital under the trunk / roots.
 * Lid permanently closed; capital tap is handled by the host hit target.
 */
export function V2CapitalChest({
  capital,
  formattedCapital,
  animateValueChange = true,
  className,
  layer = "all",
  dropHighlight = false,
  dropHighlightTone = "gold",
}: V2CapitalChestProps) {
  const label =
    formattedCapital != null && formattedCapital !== ""
      ? formattedCapital
      : capital != null && Number.isFinite(capital)
        ? formatV2ChestCapital(capital)
        : null;

  const valueKey = label ?? "";
  const prevValueRef = useRef<string | null>(null);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (!animateValueChange || !valueKey) {
      prevValueRef.current = valueKey || null;
      return;
    }
    const prev = prevValueRef.current;
    prevValueRef.current = valueKey;
    if (prev == null || prev === valueKey) return;

    setBump(true);
    const t = window.setTimeout(() => setBump(false), 420);
    return () => window.clearTimeout(t);
  }, [valueKey, animateValueChange]);

  const showBody = layer === "all" || layer === "body";
  const showLabel = (layer === "all" || layer === "label") && label != null;

  return (
    <g
      className={["v2-capital-chest", "v2-capital-chest--svg", className]
        .filter(Boolean)
        .join(" ")}
      data-capital-chest={showBody ? "true" : undefined}
      data-capital-label={showLabel ? "true" : undefined}
      data-lid-state="closed"
      data-value-bump={bump ? "true" : "false"}
      data-animate-value={animateValueChange ? "true" : "false"}
      aria-label={label && showBody ? `Капитал ${label}` : undefined}
      pointerEvents="none"
    >
      {showBody && (
        <g
          className={`v2-chest-motion${bump ? " v2-chest-motion--react" : ""}`}
          data-chest-part="motion"
          style={{
            transformOrigin: `${CX}px ${BODY_Y + BODY_H * 0.55}px`,
          }}
        >
          <ChestBodyGeometry
            dropHighlight={dropHighlight}
            dropHighlightTone={dropHighlightTone}
          />
        </g>
      )}
      {showLabel && label != null && (
        <ChestCapitalLabel label={label} bump={bump} />
      )}
    </g>
  );
}

export default V2CapitalChest;
