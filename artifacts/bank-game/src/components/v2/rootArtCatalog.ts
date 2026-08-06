/**
 * Compact root canvas + major centerline lock helpers.
 * Visual composition is only the four majors in MAJOR_MOCK_BRANCH_CATALOG
 * (no secondary / tip / flare art).
 */

export const ROOT_ART_VIEW = {
  width: 200,
  /** Tall enough that tip strokes stay inside the SVG hit-testing box. */
  height: 88,
  originX: 100,
  /** Local glue point — CSS places this on the measured trunk bottom. */
  originY: 4,
} as const;

/**
 * How far (px) the shared SVG origin sits into the stump above trunk bottom.
 * Thin overlap so the four major strokes cover the stump seam (no separate junction shape).
 */
export const ROOT_TRUNK_OVERLAP_PX = 2;

export type RootArtStroke = {
  id: string;
  d: string;
  kind: "major";
};

/** Majors only — paths must match MAJOR_MOCK_BRANCH_CATALOG exactly. */
export const ROOT_ART_STROKES: readonly RootArtStroke[] = [
  {
    id: "major-left-outer",
    kind: "major",
    d: "M 100 1 C 52 5, 28 34, 18 80",
  },
  {
    id: "major-left-inner",
    kind: "major",
    d: "M 100 1 C 78 5, 58 42, 54 76",
  },
  {
    id: "major-right-inner",
    kind: "major",
    d: "M 100 1 C 124 5, 142 46, 148 76",
  },
  {
    id: "major-right-outer",
    kind: "major",
    d: "M 100 1 C 150 5, 176 36, 184 80",
  },
] as const;

export const ROOT_ART_MAJOR_COUNT = 4;
export const ROOT_ART_SECONDARY_COUNT = 0;
export const ROOT_ART_TIP_COUNT = 0;

export const ROOT_ART_MAJOR_CENTERLINE_IDS = [
  { artId: "major-left-outer", catalogId: "root-major-1" },
  { artId: "major-left-inner", catalogId: "root-major-2" },
  { artId: "major-right-inner", catalogId: "root-major-3" },
  { artId: "major-right-outer", catalogId: "root-major-4" },
] as const;
