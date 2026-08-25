/**
 * Metelka pending reward coin — same click-to-collect as Care reward coin
 * (`tree-apple` + `tree-apple-coin` + TreeRewardToken). Claim on click.
 */

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
  /** Credit / API claim — called on click. */
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
          className="tree-apple tree-apple-pending tree-apple-coin tree-apple-coin--stone"
          whileTap={busy ? undefined : { scale: 1.12 }}
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
