/**
 * Decorative root artwork wrapping the v3 underground column
 * (activity buttons · gameplay roots · timer · chest).
 * Paths fan out from the tree trunk base at the grass line.
 * Visual-only — does not change layout or hit targets.
 */

import { buildTaperedRootFill } from "@/components/v2/rootTaperGeometry";
import { getTreeTrunkColor } from "@/components/TreeSVG";

/**
 * Local canvas: y=0 is the trunk collar (grass line),
 * y→height is the floor under the chest.
 */
export const V3_WRAP_ROOTS_VIEW = { width: 300, height: 300 } as const;

/** Trunk fork origin — roots emerge from here. */
const TRUNK = { x: 150, y: 6 } as const;

type WrapRootStroke = {
  id: string;
  /** Single cubic: M x y C c1x c1y, c2x c2y, ex ey — start at trunk. */
  d: string;
  baseWidth: number;
};

/**
 * All majors start at the trunk collar and fan down/out around the UI column.
 * Each stroke is one cubic (required by buildTaperedRootFill).
 * Wide end = trunk (t=0); tip tapers underground.
 */
const WRAP_STROKES: readonly WrapRootStroke[] = [
  // Left major — out from trunk, down past actions/roots
  {
    id: "L-major-a",
    d: `M ${TRUNK.x - 4} ${TRUNK.y} C 118 36, 78 90, 58 150`,
    baseWidth: 13,
  },
  {
    id: "L-major-b",
    d: "M 58 150 C 48 198, 62 248, 98 288",
    baseWidth: 9,
  },
  // Right major
  {
    id: "R-major-a",
    d: `M ${TRUNK.x + 4} ${TRUNK.y} C 182 36, 222 90, 242 150`,
    baseWidth: 13,
  },
  {
    id: "R-major-b",
    d: "M 242 150 C 252 198, 238 248, 202 288",
    baseWidth: 9,
  },
  // Inner left — closer to center column
  {
    id: "L-inner-a",
    d: `M ${TRUNK.x - 2} ${TRUNK.y + 2} C 132 40, 108 88, 96 140`,
    baseWidth: 9,
  },
  {
    id: "L-inner-b",
    d: "M 96 140 C 88 180, 96 220, 120 252",
    baseWidth: 6.5,
  },
  // Inner right
  {
    id: "R-inner-a",
    d: `M ${TRUNK.x + 2} ${TRUNK.y + 2} C 168 40, 192 88, 204 140`,
    baseWidth: 9,
  },
  {
    id: "R-inner-b",
    d: "M 204 140 C 212 180, 204 220, 180 252",
    baseWidth: 6.5,
  },
  // Wide outer flares (activity-button height)
  {
    id: "L-flare-a",
    d: `M ${TRUNK.x - 6} ${TRUNK.y + 1} C 100 28, 52 70, 36 110`,
    baseWidth: 7,
  },
  {
    id: "L-flare-b",
    d: "M 36 110 C 24 148, 30 178, 54 198",
    baseWidth: 5,
  },
  {
    id: "R-flare-a",
    d: `M ${TRUNK.x + 6} ${TRUNK.y + 1} C 200 28, 248 70, 264 110`,
    baseWidth: 7,
  },
  {
    id: "R-flare-b",
    d: "M 264 110 C 276 148, 270 178, 246 198",
    baseWidth: 5,
  },
  // Tips under / beside chest
  {
    id: "L-tip",
    d: "M 98 252 C 72 268, 50 282, 42 296",
    baseWidth: 5,
  },
  {
    id: "R-tip",
    d: "M 202 252 C 228 268, 250 282, 258 296",
    baseWidth: 5,
  },
  // Hair roots
  {
    id: "L-hair-a",
    d: `M ${TRUNK.x - 8} ${TRUNK.y + 8} C 110 50, 70 96, 52 130`,
    baseWidth: 3.4,
  },
  {
    id: "L-hair-b",
    d: "M 70 180 C 48 210, 40 240, 48 270",
    baseWidth: 2.8,
  },
  {
    id: "R-hair-a",
    d: `M ${TRUNK.x + 8} ${TRUNK.y + 8} C 190 50, 230 96, 248 130`,
    baseWidth: 3.4,
  },
  {
    id: "R-hair-b",
    d: "M 230 180 C 252 210, 260 240, 252 270",
    baseWidth: 2.8,
  },
  // Soft center drop behind timer / under trunk
  {
    id: "C-drop",
    d: `M ${TRUNK.x} ${TRUNK.y + 4} C 146 70, 144 120, 150 168`,
    baseWidth: 5.5,
  },
] as const;

type BuiltRoot = {
  id: string;
  fillPath: string;
};

export function buildV3WrapRoots(): BuiltRoot[] {
  const out: BuiltRoot[] = [];
  for (const stroke of WRAP_STROKES) {
    const fillPath = buildTaperedRootFill(stroke.d, stroke.baseWidth);
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
};

export default function V3UndergroundWrapRoots({ treeStage = 0 }: Props) {
  const trunkColor = getTreeTrunkColor(treeStage);
  return (
    <svg
      className="v3-underground-wrap-roots"
      data-v3-underground-wrap-roots="true"
      data-wrap-root-color={trunkColor}
      viewBox={`0 0 ${V3_WRAP_ROOTS_VIEW.width} ${V3_WRAP_ROOTS_VIEW.height}`}
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
      focusable="false"
    >
      <g className="v3-underground-wrap-roots__body">
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
