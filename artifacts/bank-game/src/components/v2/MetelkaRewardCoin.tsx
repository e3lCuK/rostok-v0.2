/**
 * Metelka pending reward coin — same drag-to-chest collect as Care reward coin
 * (`tree-apple` + `tree-apple-coin` + TreeRewardToken). Claim on drag-end.
 */

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import TreeRewardToken from "@/components/v2/TreeRewardToken";

type Props = {
  /** Tree overlay size — same as Care apples overlay (STAGE_DIMS). */
  overlayWidth: number;
  overlayHeight: number;
  /** Coin slot on the tree (Care uses index 3 of APPLE_POSITIONS). */
  xPct: number;
  yPct: number;
  /** Pixel radius — Care coin uses Math.round(APPLE_SIZES[stage] * 1.3). */
  radius: number;
  claiming: boolean;
  disabled?: boolean;
  error?: string | null;
  /** Credit / API claim — called on drag-end (hit or miss). */
  onClaim: () => void;
  /** Pulse capital-chest lock + field cursor while dragging. */
  onDragActiveChange?: (active: boolean) => void;
};

export default function MetelkaRewardCoin({
  overlayWidth,
  overlayHeight,
  xPct,
  yPct,
  radius,
  claiming,
  disabled = false,
  error = null,
  onClaim,
  onDragActiveChange,
}: Props) {
  const busy = claiming || disabled;
  const [dragging, setDragging] = useState(false);
  const dragLockRef = useRef(false);
  const onDragActiveChangeRef = useRef(onDragActiveChange);
  onDragActiveChangeRef.current = onDragActiveChange;

  const tokenStyle = {
    width: radius * 2,
    height: radius * 2,
    left: `${xPct}%`,
    top: `${yPct}%`,
    marginLeft: -radius,
    marginTop: -radius,
  };

  return (
    <>
      <div
        className={`tree-apples-overlay tree-apples-overlay-active${dragging ? " tree-apples-overlay--dragging" : ""}`}
        data-metelka-reward-coin="true"
        data-metelka-reward-claiming={claiming ? "true" : "false"}
        data-metelka-reward-dragging={dragging ? "true" : "false"}
        style={{ width: overlayWidth, height: overlayHeight }}
      >
        {dragging ? (
          <div
            className="tree-apple-drag-ghost"
            style={tokenStyle}
            aria-hidden="true"
          >
            <TreeRewardToken kind="coin" tone="stone" />
          </div>
        ) : null}
        <motion.div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Забрать награду Метёлки — перетащите к замку сундука"
          aria-busy={claiming || undefined}
          data-metelka-reward-coin-btn="true"
          className={`tree-apple tree-apple-pending tree-apple-coin tree-apple-coin--stone${dragging ? " tree-apple--dragging" : ""}`}
          drag={!busy}
          dragMomentum={false}
          dragElastic={0}
          dragSnapToOrigin={false}
          whileDrag={{ scale: 1.28, zIndex: 50, cursor: "grabbing" }}
          onDragStart={() => {
            if (busy || dragLockRef.current) return;
            dragLockRef.current = true;
            setDragging(true);
            onDragActiveChangeRef.current?.(true);
          }}
          onDragEnd={() => {
            setDragging(false);
            onDragActiveChangeRef.current?.(false);
            dragLockRef.current = false;
            if (busy) return;
            onClaim();
          }}
          onKeyDown={(e) => {
            if (busy) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClaim();
            }
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{
            // Same flight as Care coin → capital chest.
            opacity: 0,
            scale: 0.2,
            y: 120,
            x: 0,
            transition: { duration: 0.42, ease: "easeIn" },
          }}
          transition={{
            delay: 0,
            duration: 0.5,
            type: "spring",
            stiffness: 220,
            damping: 15,
          }}
          style={{
            ...tokenStyle,
            pointerEvents: busy ? "none" : "all",
          }}
        >
          <TreeRewardToken kind="coin" tone="stone" />
        </motion.div>
      </div>
      {error ? (
        <p className="metelka-reward-coin-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
