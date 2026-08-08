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
 * See `.cursor/rules/v3-trunk-collar-join.mdc`.
 */
export function buildTrunkShoulderCollarPath(
  trunk = TRUNK,
): string {
  const cx = trunk.x;
  const top = -12;
  const trunkHalf = 3.2;
  const leftPeakX = cx - 26;
  const rightPeakX = cx + 26;
  const peakY = 11;
  const valleyY = 9.5;

  return [
    `M ${cx - trunkHalf} ${top}`,
    // Single left arc: leave the trunk ~45°, ease into the outer peak.
    `C ${cx - trunkHalf - 5} ${top + 5}, ${cx - 18} ${peakY - 4}, ${leftPeakX} ${peakY}`,
    `C ${cx - 17} ${valleyY}, ${cx - 7} ${valleyY}, ${cx} ${valleyY}`,
    `C ${cx + 7} ${valleyY}, ${cx + 17} ${valleyY}, ${rightPeakX} ${peakY}`,
    // Single right arc — mirror.
    `C ${cx + 18} ${peakY - 4}, ${cx + trunkHalf + 5} ${top + 5}, ${cx + trunkHalf} ${top}`,
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

const MAJOR_A = 11;
const INNER_A = 8;
const FLARE_A = 6;
const HAIR_A = 3.2;
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
    d: `M ${TRUNK.x - 4} ${TRUNK.y} C 118 36, 78 90, 58 150`,
    baseWidth: MAJOR_A,
    profile: "trunk-wide",
  },
  {
    id: "L-major-b",
    d: "M 58 150 C 48 198, 62 248, 98 288",
    baseWidth: MAJOR_B,
    profile: "continue",
  },
  // Right major
  {
    id: "R-major-a",
    d: `M ${TRUNK.x + 4} ${TRUNK.y} C 182 36, 222 90, 242 150`,
    baseWidth: MAJOR_A,
    profile: "trunk-wide",
  },
  {
    id: "R-major-b",
    d: "M 242 150 C 252 198, 238 248, 202 288",
    baseWidth: MAJOR_B,
    profile: "continue",
  },
  // Inner left
  {
    id: "L-inner-a",
    d: `M ${TRUNK.x - 2} ${TRUNK.y + 2} C 132 40, 108 88, 96 140`,
    baseWidth: INNER_A,
    profile: "trunk-wide",
  },
  {
    id: "L-inner-b",
    d: "M 96 140 C 88 180, 96 220, 120 252",
    baseWidth: INNER_B,
    profile: "continue",
  },
  // Inner right
  {
    id: "R-inner-a",
    d: `M ${TRUNK.x + 2} ${TRUNK.y + 2} C 168 40, 192 88, 204 140`,
    baseWidth: INNER_A,
    profile: "trunk-wide",
  },
  {
    id: "R-inner-b",
    d: "M 204 140 C 212 180, 204 220, 180 252",
    baseWidth: INNER_B,
    profile: "continue",
  },
  // Outer flares
  {
    id: "L-flare-a",
    d: `M ${TRUNK.x - 6} ${TRUNK.y + 1} C 100 28, 52 70, 36 110`,
    baseWidth: FLARE_A,
    profile: "trunk-wide",
  },
  {
    id: "L-flare-b",
    d: "M 36 110 C 24 148, 30 178, 54 198",
    baseWidth: FLARE_B,
    profile: "continue",
  },
  {
    id: "R-flare-a",
    d: `M ${TRUNK.x + 6} ${TRUNK.y + 1} C 200 28, 248 70, 264 110`,
    baseWidth: FLARE_A,
    profile: "trunk-wide",
  },
  {
    id: "R-flare-b",
    d: "M 264 110 C 276 148, 270 178, 246 198",
    baseWidth: FLARE_B,
    profile: "continue",
  },
  // Tips — continue from major-b tip width
  {
    id: "L-tip",
    d: "M 98 252 C 72 268, 50 282, 42 296",
    baseWidth: TIP_W,
    profile: "continue",
  },
  {
    id: "R-tip",
    d: "M 202 252 C 228 268, 250 282, 258 296",
    baseWidth: TIP_W,
    profile: "continue",
  },
  // Hair
  {
    id: "L-hair-a",
    d: `M ${TRUNK.x - 8} ${TRUNK.y + 8} C 110 50, 70 96, 52 130`,
    baseWidth: HAIR_A,
    profile: "trunk-wide",
  },
  {
    id: "L-hair-b",
    d: "M 70 180 C 48 210, 40 240, 48 270",
    baseWidth: endWidth(HAIR_A),
    profile: "continue",
  },
  {
    id: "R-hair-a",
    d: `M ${TRUNK.x + 8} ${TRUNK.y + 8} C 190 50, 230 96, 248 130`,
    baseWidth: HAIR_A,
    profile: "trunk-wide",
  },
  {
    id: "R-hair-b",
    d: "M 230 180 C 252 210, 260 240, 252 270",
    baseWidth: endWidth(HAIR_A),
    profile: "continue",
  },
  // Soft center drop
  {
    id: "C-drop",
    d: `M ${TRUNK.x} ${TRUNK.y + 4} C 146 70, 144 120, 150 168`,
    baseWidth: 5,
    profile: "trunk-wide",
  },
] as const;

type BuiltRoot = {
  id: string;
  fillPath: string;
};

export function buildV3WrapRoots(): BuiltRoot[] {
  const out: BuiltRoot[] = [];
  for (const stroke of WRAP_STROKES) {
    const fillPath = buildTaperedRootFill(
      stroke.d,
      stroke.baseWidth,
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

const BUILT_WRAP_ROOTS = buildV3WrapRoots();

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
  const collarPath = buildTrunkShoulderCollarPath();
  return (
    <svg
      className={["v3-underground-wrap-roots", className]
        .filter(Boolean)
        .join(" ")}
      data-v3-underground-wrap-roots="true"
      data-wrap-root-color={trunkColor}
      viewBox={`0 0 ${V3_WRAP_ROOTS_VIEW.width} ${V3_WRAP_ROOTS_VIEW.height}`}
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* One drawing: approved collar + fan (collar under roots). */}
      <g
        className="v3-underground-wrap-roots__body"
        data-v3-wrap-root-system="true"
      >
        <path
          data-wrap-root-collar="true"
          d={collarPath}
          fill={trunkColor}
        />
        {BUILT_WRAP_ROOTS.map((root) => (
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
