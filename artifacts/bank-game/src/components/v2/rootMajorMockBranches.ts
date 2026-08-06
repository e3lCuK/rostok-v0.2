import type { RootWhorl } from "./RootEnergySystem";
import { ROOT_ART_VIEW, ROOT_TRUNK_OVERLAP_PX } from "./rootArtCatalog";
import {
  buildTaperedRootFill,
  MAJOR_ROOT_BASE_WIDTH,
} from "./rootTaperGeometry";
import {
  V2_ROOT_EMPTY_COLOR,
  V2_ROOT_GENERATING_FILL_COLOR,
  V2_ROOT_READY_COLOR,
} from "@/lib/v2RootColors";

/** Local SVG origin — glued to measured trunk bottom via useV2TrunkAnchor. */
export const MAJOR_ROOT_ORIGIN = {
  x: ROOT_ART_VIEW.originX,
  y: ROOT_ART_VIEW.originY,
} as const;

/** Ready / filled energy — dark wood (alias of palette constant). */
export const MAJOR_MOCK_ROOT_COLOR = V2_ROOT_READY_COLOR;
/** Empty sections — warm light wood. */
export const ROOT_SECTION_EMPTY_COLOR = V2_ROOT_EMPTY_COLOR;
/** Generating progress fill. */
export const ROOT_SECTION_GENERATING_COLOR = V2_ROOT_GENERATING_FILL_COLOR;

export {
  V2_ROOT_EMPTY_COLOR,
  V2_ROOT_GENERATING_FILL_COLOR,
  V2_ROOT_READY_COLOR,
};

export { ROOT_TRUNK_OVERLAP_PX };

export interface MajorMockBranchDef {
  id: string;
  whorl: RootWhorl;
  /** Centerline for visuals + 15-section hit areas. */
  d: string;
  direction: string;
}

/**
 * Four major roots — common start at (originX, originY - overlap).
 * Immediate outward fan; mid/tip geometry unchanged from the established curves.
 */
export const MAJOR_MOCK_BRANCH_CATALOG: readonly MajorMockBranchDef[] = [
  {
    id: "root-major-1",
    whorl: 1,
    direction: "far left — longest, smoothest",
    d: "M 100 1 C 52 5, 28 34, 18 80",
  },
  {
    id: "root-major-2",
    whorl: 2,
    direction: "near left — milder outward, still ends down",
    d: "M 100 1 C 78 5, 58 42, 54 76",
  },
  {
    id: "root-major-3",
    whorl: 3,
    direction: "near right — not a mirror of left-inner",
    d: "M 100 1 C 124 5, 142 46, 148 76",
  },
  {
    id: "root-major-4",
    whorl: 4,
    direction: "far right — different radius than left-outer",
    d: "M 100 1 C 150 5, 176 36, 184 80",
  },
] as const;

export const MAJOR_MOCK_BRANCH_BY_ID = new Map(
  MAJOR_MOCK_BRANCH_CATALOG.map((b) => [b.id, b]),
);

/** Precomputed tapered fills — same centerlines, variable visual thickness. */
export const MAJOR_TAPER_FILL_BY_ID = new Map(
  MAJOR_MOCK_BRANCH_CATALOG.map((b) => {
    const fill = buildTaperedRootFill(b.d, MAJOR_ROOT_BASE_WIDTH);
    if (!fill) {
      throw new Error(`Failed to build taper fill for ${b.id}`);
    }
    return [b.id, fill] as const;
  }),
);

export const MAJOR_MOCK_PATH_LENGTH = 100;
export { MAJOR_ROOT_BASE_WIDTH };

/** SVG canvas — compact; chest sits under trunk among the four roots. */
export const ROOT_SYSTEM_VIEW = {
  width: ROOT_ART_VIEW.width,
  height: ROOT_ART_VIEW.height,
  originX: ROOT_ART_VIEW.originX,
  originY: ROOT_ART_VIEW.originY,
} as const;
