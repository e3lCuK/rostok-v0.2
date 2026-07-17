import { useCallback, useMemo, useState } from "react";

import {
  MAJOR_MOCK_BRANCH_CATALOG,
  MAJOR_MOCK_BRANCH_BY_ID,
  MAJOR_MOCK_PATH_LENGTH,
  MAJOR_MOCK_ROOT_COLOR,
  type MajorMockBranchDef,
} from "./rootMajorMockBranches";

export type RootSegmentState = "empty" | "growing" | "ready" | "collected";

export type RootWhorl = 1 | 2 | 3 | 4;

export interface RootSegment {
  id: string;
  /** Growth whorl 1–4 (each whorl = 15 s, 5 branches × 3 s). */
  whorl: RootWhorl;
  state: RootSegmentState;
  /** 0–1 visual fill for growing state; omit for indeterminate animation */
  growProgress?: number;
}

interface Props {
  segments: RootSegment[];
  onSegmentCollect?: (id: string) => void;
}

/** Trunk base at soil line — all branches sprout from here. */
const ORIGIN = { x: 100, y: 4 };

export interface RootBranchDef {
  id: string;
  whorl: RootWhorl;
  end: { x: number; y: number };
}

/**
 * 20 collectible terminal branches — 5 per whorl.
 * Reserved for production economy; not used in current mock visual.
 */
export const ROOT_BRANCH_CATALOG: readonly RootBranchDef[] = [
  { id: "root-w1-1", whorl: 1, end: { x: 100, y: 22 } },
  { id: "root-w1-2", whorl: 1, end: { x: 91, y: 20 } },
  { id: "root-w1-3", whorl: 1, end: { x: 109, y: 20 } },
  { id: "root-w1-4", whorl: 1, end: { x: 84, y: 18 } },
  { id: "root-w1-5", whorl: 1, end: { x: 116, y: 18 } },
  { id: "root-w2-1", whorl: 2, end: { x: 70, y: 32 } },
  { id: "root-w2-2", whorl: 2, end: { x: 130, y: 32 } },
  { id: "root-w2-3", whorl: 2, end: { x: 82, y: 30 } },
  { id: "root-w2-4", whorl: 2, end: { x: 118, y: 30 } },
  { id: "root-w2-5", whorl: 2, end: { x: 100, y: 36 } },
  { id: "root-w3-1", whorl: 3, end: { x: 52, y: 46 } },
  { id: "root-w3-2", whorl: 3, end: { x: 148, y: 46 } },
  { id: "root-w3-3", whorl: 3, end: { x: 68, y: 44 } },
  { id: "root-w3-4", whorl: 3, end: { x: 132, y: 44 } },
  { id: "root-w3-5", whorl: 3, end: { x: 100, y: 50 } },
  { id: "root-w4-1", whorl: 4, end: { x: 28, y: 58 } },
  { id: "root-w4-2", whorl: 4, end: { x: 172, y: 58 } },
  { id: "root-w4-3", whorl: 4, end: { x: 48, y: 60 } },
  { id: "root-w4-4", whorl: 4, end: { x: 152, y: 60 } },
  { id: "root-w4-5", whorl: 4, end: { x: 100, y: 62 } },
] as const;

const CATALOG_GEOMETRY = ROOT_BRANCH_CATALOG.map((def) => {
  const length = Math.hypot(def.end.x - ORIGIN.x, def.end.y - ORIGIN.y);
  return {
    ...def,
    d: `M ${ORIGIN.x} ${ORIGIN.y} L ${def.end.x} ${def.end.y}`,
    length,
    kind: "catalog" as const,
  };
});

const CATALOG_BY_ID = new Map(CATALOG_GEOMETRY.map((b) => [b.id, b]));

const MAJOR_MOCK_STROKE_WIDTH = 6;
const MAJOR_MOCK_HIT_WIDTH = 18;
const COLLECT_ANIM_MS = 480;

type VisualState = RootSegmentState | "collecting";

interface BranchStroke {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
  strokeDashoffset: number;
  opacity: number;
  filter?: string;
  pulse?: boolean;
  fadeOut?: boolean;
}

function catalogStroke(
  state: VisualState,
  whorl: RootWhorl,
  length: number,
  growProgress?: number,
): BranchStroke {
  const baseW = ({ 1: 2.5, 2: 3, 3: 3.5, 4: 4 } as const)[whorl];

  switch (state) {
    case "empty":
      return {
        stroke: "rgba(74, 55, 40, 0.5)",
        strokeWidth: baseW,
        strokeDasharray: `${length * 0.14} ${length}`,
        strokeDashoffset: 0,
        opacity: 0.55,
      };
    case "growing": {
      const progress = Math.min(1, Math.max(0, growProgress ?? 0.65));
      return {
        stroke: "#7a5c2e",
        strokeWidth: baseW + 0.5,
        strokeDasharray: `${length}`,
        strokeDashoffset: length * (1 - progress),
        opacity: 0.88,
      };
    }
    case "ready":
      return {
        stroke: "#e8d5a8",
        strokeWidth: baseW + 2,
        strokeDasharray: `${length}`,
        strokeDashoffset: 0,
        opacity: 1,
        filter: "url(#v2-root-ready-glow)",
        pulse: true,
      };
    case "collecting":
      return {
        stroke: "#e8d5a8",
        strokeWidth: baseW + 2,
        strokeDasharray: `${length}`,
        strokeDashoffset: 0,
        opacity: 1,
        filter: "url(#v2-root-ready-glow)",
        fadeOut: true,
      };
    case "collected":
      return {
        stroke: "rgba(74, 55, 40, 0.42)",
        strokeWidth: baseW,
        strokeDasharray: `${length * 0.22} ${length}`,
        strokeDashoffset: 0,
        opacity: 0.45,
      };
  }
}

type ResolvedBranch =
  | { kind: "major"; branch: MajorMockBranchDef }
  | { kind: "catalog"; branch: (typeof CATALOG_GEOMETRY)[number] };

function resolveBranch(id: string): ResolvedBranch | null {
  const major = MAJOR_MOCK_BRANCH_BY_ID.get(id);
  if (major) return { kind: "major", branch: major };
  const catalog = CATALOG_BY_ID.get(id);
  if (catalog) return { kind: "catalog", branch: catalog };
  return null;
}

function MajorMockRootPath({
  d,
  state,
  isCollecting,
  onClick,
}: {
  d: string;
  state: RootSegmentState;
  isCollecting: boolean;
  onClick: () => void;
}) {
  const isCollected = state === "collected";
  const isClickable = state === "ready" && !isCollecting;
  // Stay in the DOM with fixed path `d` — never unmount slots (avoids layout/bbox reflow).
  const faded = isCollected && !isCollecting;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={MAJOR_MOCK_HIT_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={MAJOR_MOCK_PATH_LENGTH}
        pointerEvents={isClickable ? "stroke" : "none"}
        style={{ cursor: isClickable ? "pointer" : "default" }}
        onClick={isClickable ? onClick : undefined}
      />
      <path
        d={d}
        fill="none"
        stroke={MAJOR_MOCK_ROOT_COLOR}
        strokeWidth={MAJOR_MOCK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={MAJOR_MOCK_PATH_LENGTH}
        pointerEvents="none"
        opacity={faded ? 0 : 1}
      >
        {isCollecting && (
          <animate attributeName="opacity" from="1" to="0" dur="0.48s" fill="freeze" />
        )}
      </path>
    </g>
  );
}

function logMajorRootBounds(phase: "before" | "after", rootId: string) {
  if (!import.meta.env.DEV) return;
  const anchor = document.querySelector(".v2-root-anchor");
  const svg = document.querySelector(".v2-root-svg");
  const toBox = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  console.info(`[v2 root bounds ${phase}]`, { rootId, anchor: toBox(anchor), svg: toBox(svg) });
}

export default function RootEnergySystem({ segments, onSegmentCollect }: Props) {
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const segmentById = useMemo(() => {
    const map = new Map<string, RootSegment>();
    for (const segment of segments) map.set(segment.id, segment);
    return map;
  }, [segments]);

  const handleMajorClick = useCallback(
    (segment: RootSegment) => {
      if (segment.state !== "ready" || collectingId) return;
      logMajorRootBounds("before", segment.id);
      setCollectingId(segment.id);
      window.setTimeout(() => {
        setCollectingId(null);
        onSegmentCollect?.(segment.id);
        logMajorRootBounds("after", segment.id);
      }, COLLECT_ANIM_MS);
    },
    [collectingId, onSegmentCollect],
  );

  const handleCatalogClick = useCallback(
    (segment: RootSegment) => {
      if (segment.state !== "ready" || collectingId) return;
      setCollectingId(segment.id);
      window.setTimeout(() => {
        setCollectingId(null);
        onSegmentCollect?.(segment.id);
      }, COLLECT_ANIM_MS);
    },
    [collectingId, onSegmentCollect],
  );

  /**
   * Always render the four permanent major-mock slots (fixed path geometry).
   * Collected roots stay in the DOM — only visual/interaction state changes.
   */
  const majorSlots = useMemo(() => {
    return MAJOR_MOCK_BRANCH_CATALOG.map((branch) => {
      const segment = segmentById.get(branch.id) ?? {
        id: branch.id,
        whorl: branch.whorl,
        state: "ready" as const,
      };
      return {
        branch,
        segment,
        isCollecting: collectingId === branch.id,
      };
    });
  }, [segmentById, collectingId]);

  const catalogLayers = useMemo(() => {
    return segments
      .map((segment) => {
        if (MAJOR_MOCK_BRANCH_BY_ID.has(segment.id)) return null;
        const resolved = resolveBranch(segment.id);
        if (!resolved || resolved.kind !== "catalog") return null;

        const isCollecting = collectingId === segment.id;
        const visualState: VisualState = isCollecting ? "collecting" : segment.state;
        const growPct =
          segment.state === "growing" && segment.growProgress != null
            ? Math.min(1, Math.max(0, segment.growProgress))
            : undefined;
        const stroke = catalogStroke(visualState, resolved.branch.whorl, resolved.branch.length, growPct);
        const clickable = segment.state === "ready" && !isCollecting;

        return { segment, resolved, stroke, clickable, isCollecting };
      })
      .filter((layer): layer is NonNullable<typeof layer> => layer != null)
      .sort((a, b) => a.resolved.branch.whorl - b.resolved.branch.whorl);
  }, [segments, collectingId]);

  return (
    <div className="v2-root-system" aria-hidden="true">
      <svg
        className="v2-root-svg"
        width={200}
        height={66}
        viewBox="0 0 200 66"
        overflow="visible"
        aria-hidden="true"
      >
        <defs>
          <filter id="v2-root-ready-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.55  0 0 0 0 0.85  0 0 0 0 0.25  0 0 0 0.65 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Permanent bbox stabilizer — geometry must not depend on visible root count. */}
        <rect
          className="v2-root-bbox-stabilizer"
          x={0}
          y={0}
          width={200}
          height={66}
          fill="transparent"
          pointerEvents="none"
          aria-hidden="true"
        />

        {majorSlots.map(({ branch, segment, isCollecting }) => (
          <g key={branch.id} data-root-slot={branch.id} data-whorl={branch.whorl}>
            <MajorMockRootPath
              d={branch.d}
              state={segment.state}
              isCollecting={isCollecting}
              onClick={() => handleMajorClick(segment)}
            />
          </g>
        ))}

        {catalogLayers.map((layer) => {
          const { segment, resolved, stroke, clickable } = layer;
          const d = resolved.branch.d;

          return (
            <g key={segment.id} data-whorl={resolved.branch.whorl}>
              {clickable && (
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinecap="round"
                  pointerEvents="stroke"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleCatalogClick(segment)}
                />
              )}
              <path
                d={d}
                fill="none"
                strokeLinecap="round"
                stroke={stroke.stroke}
                strokeWidth={stroke.strokeWidth}
                strokeDasharray={stroke.strokeDasharray}
                strokeDashoffset={stroke.strokeDashoffset}
                opacity={stroke.opacity}
                filter={stroke.filter}
                pointerEvents={clickable ? "none" : "stroke"}
              >
                {stroke.pulse && (
                  <animate
                    attributeName="opacity"
                    values="0.82;1;0.82"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                )}
                {stroke.fadeOut && (
                  <animate attributeName="opacity" from="1" to="0" dur="0.48s" fill="freeze" />
                )}
              </path>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
