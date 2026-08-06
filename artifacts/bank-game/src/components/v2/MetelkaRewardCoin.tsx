/**
 * Metelka pending reward coin — same visuals as Care activity coin
 * (`tree-apple` + `tree-apple-coin`). Claim logic stays separate.
 */

import { motion } from "framer-motion";

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
  onClaim: () => void;
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
}: Props) {
  const busy = claiming || disabled;

  return (
    <>
      <div
        className="tree-apples-overlay tree-apples-overlay-active"
        data-metelka-reward-coin="true"
        data-metelka-reward-claiming={claiming ? "true" : "false"}
        style={{ width: overlayWidth, height: overlayHeight }}
      >
        <motion.div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Забрать награду Метёлки"
          aria-busy={claiming || undefined}
          data-metelka-reward-coin-btn="true"
          className="tree-apple tree-apple-pending tree-apple-coin"
          onClick={() => {
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
            opacity: 0,
            scale: 0.25,
            y: -220,
            x: -90,
            transition: { duration: 0.38, ease: "easeIn" },
          }}
          transition={{
            delay: 0,
            duration: 0.5,
            type: "spring",
            stiffness: 220,
            damping: 15,
          }}
          style={{
            width: radius * 2,
            height: radius * 2,
            left: `${xPct}%`,
            top: `${yPct}%`,
            marginLeft: -radius,
            marginTop: -radius,
            pointerEvents: busy ? "none" : "all",
          }}
        />
      </div>
      {error ? (
        <p className="metelka-reward-coin-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
