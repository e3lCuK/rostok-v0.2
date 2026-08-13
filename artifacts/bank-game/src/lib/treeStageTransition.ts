/**
 * Tree stage swap timing after Care / tutorial growth beat.
 * Order: growth timer → +мм accrual → stage crossfade (no empty gap).
 */

/** Match left-of-tree +N мм popup hold before swapping the stage graphic. */
export const TREE_STAGE_SWAP_AFTER_MM_MS = 1450;

/** Overlapping exit/enter — keep short so the field never looks empty. */
export const TREE_STAGE_CROSSFADE_S = 0.28;

/** Delay stage visual until mm accrual UI has played (growth-timer path). */
export function resolveTreeStageSwapDelayMs(input: {
  growthAnimActive: boolean;
}): number {
  return input.growthAnimActive ? TREE_STAGE_SWAP_AFTER_MM_MS : 0;
}
