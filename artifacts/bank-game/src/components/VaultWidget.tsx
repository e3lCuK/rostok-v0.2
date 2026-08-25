/**
 * Permanent vault (safe) under the level badge.
 * Holds starting capital until the tutorial drag-to-chest transfer.
 * Palette matches capital flask / capital sum (#c9920a on cream).
 */

import { useRef, useState } from "react";
import { motion } from "framer-motion";

/** Same gold as flask rim / capital face. */
const FLASK_GOLD = "#c9920a";
/** Same rim weight as LevelWidget diamond outline. */
const SW = 1.05;
const SHELL = "rgba(255, 248, 236, 0.92)";
const FILL_WASH = "rgba(201, 146, 10, 0.42)";

type Props = {
  /** Capital still in the vault (not yet in play). */
  vaultBalance: number;
  /**
   * Total deposit the player chose — denominator of `unused/total`.
   * e.g. unused 0 + total 100000 → `0/100к`.
   */
  totalCapital?: number;
  /** Tutorial capital-transfer step only. */
  dragEnabled?: boolean;
  dragging?: boolean;
  onDragActiveChange?: (active: boolean) => void;
  /** Called when drag ends over the chest clasp (or miss — still transfer). */
  onTransfer?: () => void;
  /** Opens capital help — the safe itself is the button (hidden while dragging). */
  onHelpClick?: () => void;
};

/** Compact amounts — 100000 → "100к". */
export function formatVaultAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000) {
    return `${Math.round(n / 1000)}к`;
  }
  return String(Math.round(n));
}

/**
 * `unused/total` — unused = still in vault; total = chosen deposit.
 * Before transfer: `100к/100к`. After: `0/100к`.
 */
export function formatVaultChestLabel(
  unusedCapital: number,
  totalCapital: number,
): string {
  return `${formatVaultAmount(unusedCapital)}/${formatVaultAmount(totalCapital)}`;
}

/**
 * Classic gold safe — outer rim open at bottom; inner frame stays closed.
 * viewBox is cropped flush to the painted shell (+ half stroke) so the
 * caption gap matches «УРОВЕНЬ» under the diamond tip (no empty SVG pad).
 */
function VaultSafeSvg({ width = 56, height = 45 }: { width?: number; height?: number }) {
  // Cream shell ends at the outer-rim tips (flat cut) — no white lip below.
  const outerShell = [
    "M 14 12",
    "H 42",
    "Q 48 12 48 18",
    "V 40",
    "Q 48 44 46.2 44.2",
    "H 9.8",
    "Q 8 44 8 40",
    "V 18",
    "Q 8 12 14 12",
    "Z",
  ].join(" ");
  // Stroke follows the same outline but stays open across the flat cut.
  const outerRim = [
    "M 9.8 44.2",
    "Q 8 44 8 40",
    "V 18",
    "Q 8 12 14 12",
    "H 42",
    "Q 48 12 48 18",
    "V 40",
    "Q 48 44 46.2 44.2",
  ].join(" ");

  return (
    <svg
      className="vault-badge-svg"
      width={width}
      height={height}
      // Shell 8..48 × 12..44.2 + ~0.5 stroke → flush crop (was 6 10 44 36).
      viewBox="7.5 11.5 41 33.3"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g className="vault-safe-body">
        <path d={outerShell} fill={SHELL} />
        <rect
          x="12"
          y="16"
          width="32"
          height="26"
          rx="4"
          fill={FILL_WASH}
          stroke={FLASK_GOLD}
          strokeWidth={SW}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={outerRim}
          stroke={FLASK_GOLD}
          strokeWidth={SW}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Dial */}
        <circle
          cx="28"
          cy="29"
          r="7.5"
          fill={SHELL}
          stroke={FLASK_GOLD}
          strokeWidth={SW}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="28" cy="29" r="2.2" fill={FLASK_GOLD} />
        <path
          d="M28 22.5v3.2M28 32.3v3.2M21.5 29h3.2M31.3 29h3.2"
          stroke={FLASK_GOLD}
          strokeWidth={SW}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

function WalletGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="6"
        width="19"
        height="13"
        rx="2.5"
        fill={SHELL}
        stroke={FLASK_GOLD}
        strokeWidth={SW}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M2.5 10h19"
        stroke={FLASK_GOLD}
        strokeWidth={SW}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="16.5" cy="14.5" r="1.6" fill={FLASK_GOLD} />
    </svg>
  );
}

export default function VaultWidget({
  vaultBalance,
  totalCapital = 0,
  dragEnabled = false,
  onDragActiveChange,
  onTransfer,
  onHelpClick,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const dragLockRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const unused = Math.max(0, Number(vaultBalance) || 0);
  const total = Math.max(unused, Number(totalCapital) || 0);
  const label = formatVaultChestLabel(unused, total);
  const canDrag = dragEnabled && unused > 0 && !!onTransfer;
  const canOpenHelp = !!onHelpClick && !canDrag;

  const badge = (
    <>
      <VaultSafeSvg width={56} height={45} />
      {/* Same type as apple / mm field captions (--v3-flask-*). */}
      <span
        className="field-caption-value vault-badge-amount"
        data-vault-amount="true"
        data-vault-chest-label={label}
        aria-hidden="true"
      >
        {label}
      </span>
    </>
  );

  return (
    <div
      className={`vault-badge-wrap${canDrag ? " vault-badge-wrap--draggable" : ""}${
        dragging ? " vault-badge-wrap--dragging" : ""
      }${canOpenHelp ? " vault-badge-wrap--help" : ""}`}
      data-vault-widget="true"
      data-vault-drag-enabled={canDrag ? "true" : "false"}
    >
      {canOpenHelp ? (
        <button
          type="button"
          className="vault-badge vault-badge--help"
          data-testid="vault-capital-help"
          aria-label="Сейф"
          title={`Не в игре ${formatVaultAmount(unused)} / всего ${formatVaultAmount(total)}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHelpClick?.();
          }}
        >
          {badge}
        </button>
      ) : (
        <div
          className="vault-badge"
          aria-hidden={canDrag ? undefined : true}
          title={`Не в игре ${formatVaultAmount(unused)} / всего ${formatVaultAmount(total)}`}
        >
          {badge}
        </div>
      )}

      {canDrag ? (
        <>
          {dragging ? (
            <div className="vault-drag-ghost" aria-hidden="true">
              <WalletGlyph size={26} />
            </div>
          ) : null}
          <motion.div
            role="button"
            tabIndex={0}
            aria-label="Перенесите капитал — перетащите кошелёк в сундук"
            className={`vault-drag-token${dragging ? " vault-drag-token--dragging" : ""}`}
            data-vault-drag-token="true"
            drag
            dragMomentum={false}
            dragElastic={0}
            dragSnapToOrigin={false}
            whileDrag={{ scale: 1.08, zIndex: 80, cursor: "grabbing" }}
            onDragStart={() => {
              if (dragLockRef.current) return;
              dragLockRef.current = true;
              setDragging(true);
              onDragActiveChange?.(true);
            }}
            onDrag={(_, info) => {
              lastPointRef.current = {
                x: info.point.x,
                y: info.point.y,
              };
            }}
            onDragEnd={() => {
              setDragging(false);
              onDragActiveChange?.(false);
              dragLockRef.current = false;
              lastPointRef.current = null;
              // Miss still credits — same as Care coin UX.
              onTransfer?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTransfer?.();
              }
            }}
          >
            <WalletGlyph size={dragging ? 28 : 26} />
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
