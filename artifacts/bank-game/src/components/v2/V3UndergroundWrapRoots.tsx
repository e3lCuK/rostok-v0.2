/**
 * Decorative root artwork wrapping the v3 underground column
 * (activity buttons · gameplay roots · timer · chest).
 * Paths fan out from the tree trunk base at the grass line.
 * Visual-only — does not change layout or hit targets.
 */

import {
  buildTaperedRootFill,
  taperWidthFactor,
  type RootTaperProfile,
} from "@/components/v2/rootTaperGeometry";
import { getTreeTrunkColor } from "@/components/TreeSVG";

/** Flat fill + thin outline — same wood language as tree trunk / basket. */
const WOOD_EDGE = "#5c3a1a";
const WOOD_STROKE = 1.05;

/**
 * Local canvas: y=0 is the trunk collar (grass line),
 * y→height is the floor under the chest.
 */
export const V3_WRAP_ROOTS_VIEW = { width: 300, height: 300 } as const;

/** Trunk fork origin — flush with the soil-lip join (SVG top / grass). */
const TRUNK = { x: 150, y: 0 } as const;

/**
 * Soft stump collar — under the wrap roots (one drawing with the fan).
 * APPROVED 2026-08-08 (user): one cubic per side, thin neck, smooth flare.
 * Stage 4 (могучее) uses a wider neck to match the thick trunk — no shoulders.
 * See `.cursor/rules/v3-trunk-collar-join.mdc`.
 */
export function buildTrunkShoulderCollarPath(
  treeStage = 0,
  trunk = TRUNK,
): string {
  const cx = trunk.x;
  const top = -12;
  const mighty = treeStage >= 4;

  // Mighty: wide neck + rounded flare (no pointed outer peaks / “уголки”).
  if (mighty) {
    const trunkHalf = 7.2;
    const peakY = 12;
    const valleyY = 10;
    return [
      `M ${cx - trunkHalf} ${top}`,
      // Soft left shoulder — rounded, not a sharp wing tip.
      `C ${cx - trunkHalf - 8} ${top + 6}, ${cx - 26} ${peakY - 2}, ${cx - 20} ${peakY + 1}`,
      `C ${cx - 14} ${valleyY + 0.5}, ${cx - 7} ${valleyY}, ${cx} ${valleyY}`,
      `C ${cx + 7} ${valleyY}, ${cx + 14} ${valleyY + 0.5}, ${cx + 20} ${peakY + 1}`,
      // Soft right shoulder — mirror.
      `C ${cx + 26} ${peakY - 2}, ${cx + trunkHalf + 8} ${top + 6}, ${cx + trunkHalf} ${top}`,
      "Z",
    ].join(" ");
  }

  // Default neck fits young/mid trees.
  const trunkHalf = 4.2;
  const leftPeakX = cx - 28;
  const rightPeakX = cx + 28;
  const peakY = 11;
  const valleyY = 9.5;

  return [
    `M ${cx - trunkHalf} ${top}`,
    // Single left arc: leave the trunk ~45°, ease into the outer peak.
    `C ${cx - trunkHalf - 7} ${top + 5}, ${cx - 20} ${peakY - 4}, ${leftPeakX} ${peakY}`,
    `C ${cx - 18} ${valleyY}, ${cx - 7} ${valleyY}, ${cx} ${valleyY}`,
    `C ${cx + 7} ${valleyY}, ${cx + 18} ${valleyY}, ${rightPeakX} ${peakY}`,
    // Single right arc — mirror.
    `C ${cx + 20} ${peakY - 4}, ${cx + trunkHalf + 7} ${top + 5}, ${cx + trunkHalf} ${top}`,
    "Z",
  ].join(" ");
}

type WrapRootStroke = {
  id: string;
  /** Single cubic: M x y C c1x c1y, c2x c2y, ex ey — start at trunk. */
  d: string;
  baseWidth: number;
  profile: RootTaperProfile;
};

/** Tip width of a lead segment — used so the next segment has no shoulder. */
function endWidth(baseWidth: number, profile: RootTaperProfile = "trunk-wide") {
  return baseWidth * taperWidthFactor(1, profile);
}

/* Slightly wider at the stump — removes young-tree shoulder steps. */
const MAJOR_A = 13;
const INNER_A = 9.5;
const FLARE_A = 7;
const HAIR_A = 3.6;
const MAJOR_B = endWidth(MAJOR_A);
const INNER_B = endWidth(INNER_A);
const FLARE_B = endWidth(FLARE_A);
const TIP_W = endWidth(MAJOR_B, "continue");

/**
 * Lead segments: trunk-wide taper.
 * Continuations: `continue` profile with baseWidth = previous tip width
 * so joins stay smooth (no step “shoulders”).
 */
const WRAP_STROKES: readonly WrapRootStroke[] = [
  // Left major
  {
    id: "L-major-a",
    d: `M ${TRUNK.x - 3} ${TRUNK.y} C 116 34, 76 88, 56 150`,
    baseWidth: MAJOR_A,
    profile: "trunk-wide",
  },
  {
    id: "L-major-b",
    d: "M 56 150 C 46 198, 60 248, 96 288",
    baseWidth: MAJOR_B,
    profile: "continue",
  },
  // Right major
  {
    id: "R-major-a",
    d: `M ${TRUNK.x + 3} ${TRUNK.y} C 184 34, 224 88, 244 150`,
    baseWidth: MAJOR_A,
    profile: "trunk-wide",
  },
  {
    id: "R-major-b",
    d: "M 244 150 C 254 198, 240 248, 204 288",
    baseWidth: MAJOR_B,
    profile: "continue",
  },
  // Inner left
  {
    id: "L-inner-a",
    d: `M ${TRUNK.x - 1.5} ${TRUNK.y + 2} C 130 38, 106 86, 94 140`,
    baseWidth: INNER_A,
    profile: "trunk-wide",
  },
  {
    id: "L-inner-b",
    d: "M 94 140 C 86 180, 94 220, 118 252",
    baseWidth: INNER_B,
    profile: "continue",
  },
  // Inner right
  {
    id: "R-inner-a",
    d: `M ${TRUNK.x + 1.5} ${TRUNK.y + 2} C 170 38, 194 86, 206 140`,
    baseWidth: INNER_A,
    profile: "trunk-wide",
  },
  {
    id: "R-inner-b",
    d: "M 206 140 C 214 180, 206 220, 182 252",
    baseWidth: INNER_B,
    profile: "continue",
  },
  // Outer flares
  {
    id: "L-flare-a",
    d: `M ${TRUNK.x - 5} ${TRUNK.y + 1} C 98 26, 50 68, 34 110`,
    baseWidth: FLARE_A,
    profile: "trunk-wide",
  },
  {
    id: "L-flare-b",
    d: "M 34 110 C 22 148, 28 178, 52 198",
    baseWidth: FLARE_B,
    profile: "continue",
  },
  {
    id: "R-flare-a",
    d: `M ${TRUNK.x + 5} ${TRUNK.y + 1} C 202 26, 250 68, 266 110`,
    baseWidth: FLARE_A,
    profile: "trunk-wide",
  },
  {
    id: "R-flare-b",
    d: "M 266 110 C 278 148, 272 178, 248 198",
    baseWidth: FLARE_B,
    profile: "continue",
  },
  // Tips — continue from major-b tip width
  {
    id: "L-tip",
    d: "M 96 252 C 70 268, 48 282, 40 296",
    baseWidth: TIP_W,
    profile: "continue",
  },
  {
    id: "R-tip",
    d: "M 204 252 C 230 268, 252 282, 260 296",
    baseWidth: TIP_W,
    profile: "continue",
  },
  // Hair
  {
    id: "L-hair-a",
    d: `M ${TRUNK.x - 7} ${TRUNK.y + 8} C 108 50, 68 96, 50 130`,
    baseWidth: HAIR_A,
    profile: "trunk-wide",
  },
  {
    id: "L-hair-b",
    d: "M 68 180 C 46 210, 38 240, 46 270",
    baseWidth: endWidth(HAIR_A),
    profile: "continue",
  },
  {
    id: "R-hair-a",
    d: `M ${TRUNK.x + 7} ${TRUNK.y + 8} C 192 50, 232 96, 250 130`,
    baseWidth: HAIR_A,
    profile: "trunk-wide",
  },
  {
    id: "R-hair-b",
    d: "M 232 180 C 254 210, 262 240, 254 270",
    baseWidth: endWidth(HAIR_A),
    profile: "continue",
  },
  // Soft center drop
  {
    id: "C-drop",
    d: `M ${TRUNK.x} ${TRUNK.y + 4} C 146 70, 144 120, 150 168`,
    baseWidth: 6.5,
    profile: "trunk-wide",
  },
] as const;

type BuiltRoot = {
  id: string;
  fillPath: string;
};

/** @param widthScale — 1 default; ~1.3 for mighty tree stump match */
export function buildV3WrapRoots(widthScale = 1): BuiltRoot[] {
  const out: BuiltRoot[] = [];
  for (const stroke of WRAP_STROKES) {
    const fillPath = buildTaperedRootFill(
      stroke.d,
      stroke.baseWidth * widthScale,
      stroke.profile,
    );
    if (!fillPath) continue;
    out.push({
      id: stroke.id,
      fillPath,
    });
  }
  return out;
}

const BUILT_WRAP_ROOTS = buildV3WrapRoots(1);
/** Wider fan for stage 4 — fills the thick stump; keep modest to avoid outer spikes. */
const BUILT_WRAP_ROOTS_MIGHTY = buildV3WrapRoots(1.22);

type Props = {
  /** Tree growth stage — wrap roots match that trunk fill. */
  treeStage?: number;
  className?: string;
};

export default function V3UndergroundWrapRoots({
  treeStage = 0,
  className,
}: Props) {
  const trunkColor = getTreeTrunkColor(treeStage);
  const mighty = treeStage >= 4;
  const collarPath = buildTrunkShoulderCollarPath(treeStage);
  const roots = mighty ? BUILT_WRAP_ROOTS_MIGHTY : BUILT_WRAP_ROOTS;
  return (
    <svg
      className={["v3-underground-wrap-roots", className]
        .filter(Boolean)
        .join(" ")}
      data-v3-underground-wrap-roots="true"
      data-wrap-root-color={trunkColor}
      data-wrap-root-mighty={mighty ? "true" : undefined}
      viewBox={`0 0 ${V3_WRAP_ROOTS_VIEW.width} ${V3_WRAP_ROOTS_VIEW.height}`}
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/*
          One outer rim for the whole fan: dilate the merged alpha, keep only
          the ring. Per-path strokes would draw seams between overlapping roots.
        */}
        <filter
          id="v3-wrap-roots-edge"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
          data-wrap-root-edge-filter="true"
        >
          <feMorphology
            in="SourceAlpha"
            operator="dilate"
            radius={WOOD_STROKE}
            result="dilated"
          />
          <feComposite
            in="dilated"
            in2="SourceAlpha"
            operator="out"
            result="rim"
          />
          <feFlood floodColor={WOOD_EDGE} result="rimColor" />
          <feComposite
            in="rimColor"
            in2="rim"
            operator="in"
            result="outline"
          />
          <feMerge>
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/*
        Flat fills only — outline is the union rim.
        Do NOT paint a tall neck stub above y=0: with wrap above/near the
        stump it read as a “cap” mid-trunk. Collar top=-12 stays under the tree.
      */}
      <g
        className="v3-underground-wrap-roots__body"
        data-v3-wrap-root-system="true"
        filter="url(#v3-wrap-roots-edge)"
      >
        <path
          data-wrap-root-collar="true"
          d={collarPath}
          fill={trunkColor}
        />
        {roots.map((root) => (
          <path
            key={root.id}
            data-wrap-root={root.id}
            d={root.fillPath}
            fill={trunkColor}
          />
        ))}
      </g>
    </svg>
  );
}
