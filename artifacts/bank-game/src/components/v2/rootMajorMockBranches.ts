import type { RootWhorl } from "./RootEnergySystem";

/** Local SVG origin — trunk base at soil line. */
export const MAJOR_ROOT_ORIGIN = { x: 100, y: 4 } as const;

/** Unified mock root color — light natural brown. */
export const MAJOR_MOCK_ROOT_COLOR = "#c9a574";

export interface MajorMockBranchDef {
  id: string;
  whorl: RootWhorl;
  /** Smooth polyline-like path (quadratic segments). */
  d: string;
  direction: string;
}

/**
 * Four major mock roots (4 × 15 s = 60 s).
 * Equal segment structure; pathLength normalized to 100 in renderer.
 */
export const MAJOR_MOCK_BRANCH_CATALOG: readonly MajorMockBranchDef[] = [
  {
    id: "root-major-1",
    whorl: 1,
    direction: "far left-down",
    d: "M 100 4 Q 92 12 84 20 Q 68 32 52 42 Q 36 50 22 58",
  },
  {
    id: "root-major-2",
    whorl: 2,
    direction: "slight left-down",
    d: "M 100 4 Q 96 12 90 20 Q 84 32 78 42 Q 72 50 68 58",
  },
  {
    id: "root-major-3",
    whorl: 3,
    direction: "slight right-down",
    d: "M 100 4 Q 104 12 110 20 Q 116 32 122 42 Q 128 50 132 58",
  },
  {
    id: "root-major-4",
    whorl: 4,
    direction: "far right-down",
    d: "M 100 4 Q 108 12 116 20 Q 132 32 148 42 Q 164 50 178 58",
  },
] as const;

export const MAJOR_MOCK_BRANCH_BY_ID = new Map(
  MAJOR_MOCK_BRANCH_CATALOG.map((b) => [b.id, b]),
);

/** Normalized path length used for equal mock root sizing. */
export const MAJOR_MOCK_PATH_LENGTH = 100;
