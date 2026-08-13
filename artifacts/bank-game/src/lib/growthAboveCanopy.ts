import { STAGE_DIMS } from "@/components/TreeSVG";

/** Fixed air gap between canopy top and growth timer / +мм pill. */
export const GROWTH_ABOVE_CANOPY_GAP_PX = 7;

export function clampTreeStage(stage: unknown): 0 | 1 | 2 | 3 | 4 {
  const n = Math.trunc(Number(stage));
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 4) return 4;
  return n as 0 | 1 | 2 | 3 | 4;
}

/** On-screen canopy height for Care tree (`TreeSVG` size={110}). */
export function treeCanopyHeightPx(stage: unknown): number {
  return STAGE_DIMS[clampTreeStage(stage)][1];
}

/**
 * `bottom` offset of the above-tree growth host from `.game-tree-wrap` bottom
 * so the pill sits a constant gap above the foliage for every stage.
 */
export function growthAboveHostBottomPx(stage: unknown): number {
  return treeCanopyHeightPx(stage) + GROWTH_ABOVE_CANOPY_GAP_PX;
}
