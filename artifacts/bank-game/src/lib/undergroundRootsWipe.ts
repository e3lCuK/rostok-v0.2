/** Eye-toggle wipe: bottom → top hide of underground UI (Framer Motion). */
export const UNDERGROUND_ROOTS_WIPE_MS = 2000;

export const UNDERGROUND_ROOTS_WIPE_TRANSITION = {
  duration: UNDERGROUND_ROOTS_WIPE_MS / 1000,
  ease: [0.4, 0, 0.2, 1] as const,
};

/**
 * clip-path inset: hide grows from the bottom edge upward.
 * When unmasked use `none` — `inset(0%)` still clips overflow (income float
 * left of the capital chest would be cut off).
 */
export function undergroundRootsWipeAnimate(masked: boolean) {
  return {
    opacity: masked ? 0 : 1,
    clipPath: masked ? "inset(0% 0% 100% 0%)" : "none",
  };
}

/**
 * Decorative wrap roots (collar + fan) — opacity only.
 * Never use clip-path here: the stump collar paints above y=0 via overflow,
 * and a leftover `inset(0)` after toggle permanently crops that join.
 */
export function undergroundWrapRootsWipeAnimate(masked: boolean) {
  return {
    opacity: masked ? 0 : 1,
    clipPath: "none" as const,
  };
}
