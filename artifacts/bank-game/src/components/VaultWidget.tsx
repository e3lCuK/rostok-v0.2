/**
 * Permanent vault (safe) under the level badge.
 * Holds starting capital until the tutorial drag-to-chest transfer.
 * Palette matches capital flask / capital sum (#c9920a on cream).
 */

import { useRef, useState } from "react";
import { motion } from "framer-motion";

/** Same gold as flask rim / capital face. */
const FLASK_GOLD = "#c9920a";
const SHELL = "rgba(255, 248, 236, 0.92)";
const FILL_WASH = "rgba(201, 146, 10, 0.42)";

type Props = {
  vaultBalance: number;
  /** Tutorial capital-transfer step only. */
  dragEnabled?: boolean;
  dragging?: boolean;
  onDragActiveChange?: (active: boolean) => void;
  /** Called when drag ends over the chest clasp (or miss — still transfer). */
  onTransfer?: () => void;
};

function formatVaultAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000) {
    return `${Math.round(n / 1000)}k`;
  }
  return String(Math.round(n));
}

function VaultSafeSvg({ size = 52 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="8"
        y="12"
        width="40"
        height="34"
        rx="6"
        fill={SHELL}
        stroke={FLASK_GOLD}
        strokeWidth="1.6"
      />
      <rect
        x="12"
        y="16"
        width="32"
        height="26"
        rx="4"
        fill={FILL_WASH}
        stroke={FLASK_GOLD}
        strokeWidth="1.1"
      />
      {/* Dial */}
      <circle
        cx="28"
        cy="29"
        r="7.5"
        fill={SHELL}
        stroke={FLASK_GOLD}
        strokeWidth="1.4"
      />
      <circle cx="28" cy="29" r="2.2" fill={FLASK_GOLD} />
      <path
        d="M28 22.5v3.2M28 32.3v3.2M21.5 29h3.2M31.3 29h3.2"
        stroke={FLASK_GOLD}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Feet */}
      <path
        d="M14 46h8M34 46h8"
        stroke={FLASK_GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
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
        strokeWidth="1.4"
      />
      <path d="M2.5 10h19" stroke={FLASK_GOLD} strokeWidth="1.2" />
      <circle cx="16.5" cy="14.5" r="1.6" fill={FLASK_GOLD} />
    </svg>
  );
}

export default function VaultWidget({
  vaultBalance,
  dragEnabled = false,
  onDragActiveChange,
  onTransfer,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const dragLockRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const amount = Math.max(0, Number(vaultBalance) || 0);
  const canDrag = dragEnabled && amount > 0 && !!onTransfer;

  return (
    <div
      className={`vault-badge-wrap${canDrag ? " vault-badge-wrap--draggable" : ""}${
        dragging ? " vault-badge-wrap--dragging" : ""
      }`}
      data-vault-widget="true"
      data-vault-drag-enabled={canDrag ? "true" : "false"}
    >
      <div className="vault-badge" aria-hidden={canDrag ? undefined : true}>
        <VaultSafeSvg size={52} />
        <span className="vault-badge-amount" data-vault-amount="true">
          {formatVaultAmount(amount)}
        </span>
      </div>

      {canDrag ? (
        <>
          {dragging ? (
            <div className="vault-drag-ghost" aria-hidden="true">
              <WalletGlyph size={14} />
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
            <WalletGlyph size={dragging ? 16 : 15} />
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
