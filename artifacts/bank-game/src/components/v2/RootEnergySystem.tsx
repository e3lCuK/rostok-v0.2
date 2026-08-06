import { useCallback, useMemo, useState, type MouseEvent } from "react";

import { V2CapitalChest } from "./V2CapitalChest";
import {
  MAJOR_MOCK_BRANCH_CATALOG,
  MAJOR_MOCK_PATH_LENGTH,
  MAJOR_TAPER_FILL_BY_ID,
  ROOT_SYSTEM_VIEW,
} from "./rootMajorMockBranches";
import {
  V2_ROOT_EMPTY_COLOR,
  V2_ROOT_GENERATING_FILL_COLOR,
  V2_ROOT_READY_COLOR,
} from "@/lib/v2RootColors";
import {
  findGeneratingSectionIndex,
  getNextCollectableSectionIndex,
  parseReadyMask,
  resolveSectionVisualState,
  ROOT_SECTION_PATH_LENGTH,
  ROOT_SECTION_VISUAL_LEN,
  rootHasReadySection,
  sectionDashOffset,
  sectionStrokeWidthFactor,
  type RootSectionVisualState,
  V2_ROOT_COUNT,
  V2_ROOT_SECTION_COUNT,
  V2_SECTIONS_PER_ROOT,
} from "@/lib/v2Roots";

export type RootSegmentState = "empty" | "growing" | "ready" | "collected";
export type RootWhorl = 1 | 2 | 3 | 4;

export interface RootSegment {
  id: string;
  whorl: RootWhorl;
  state: RootSegmentState;
  growProgress?: number;
}

interface Props {
  readyMask?: string;
  generatingProgress?: number;
  /** When true: capital chest (section art when production mask is set). */
  artMode?: boolean;
  /** Same capital value as the top-left HUD (`balances.balance`). */
  capital?: number;
  segments?: RootSegment[];
  /** Production: collect one tip→base section on this root. */
  onRootCollect?: (rootIndex: number, event: MouseEvent) => void;
  /** Fallback if onRootCollect is absent — receives tip→base sectionIndex. */
  onSectionCollect?: (sectionIndex: number) => void;
  onSegmentCollect?: (id: string) => void;
  collectingSectionIndices?: ReadonlySet<number> | null;
  collectingRootIndices?: ReadonlySet<number> | null;
  /**
   * When false, production root hit-paths stay non-interactive (Tutorial).
   * Default true — does not affect mock/art-only segment collect.
   */
  productionCollectEnabled?: boolean;
}

const COLLECT_ANIM_MS = 200;
const PATH_LEN = MAJOR_MOCK_PATH_LENGTH;
const MAJOR_HIT_STROKE_WIDTH = 18;
/** Whole-root hit stroke — generous tap target along centerline. */
const ROOT_HIT_STROKE_WIDTH = 28;
/** Visual base width — slightly under hit width so round-cap gaps stay readable. */
const SECTION_VISUAL_BASE_WIDTH = 6.8;
const SECTION_DASH = `${ROOT_SECTION_VISUAL_LEN} ${ROOT_SECTION_PATH_LENGTH}`;

function sectionStrokeWidth(sectionInRoot: number): number {
  return SECTION_VISUAL_BASE_WIDTH * sectionStrokeWidthFactor(sectionInRoot);
}

function SectionDashPath({
  d,
  sectionInRoot,
  stroke,
  strokeWidth,
  className,
  opacity = 1,
  dashLength = ROOT_SECTION_VISUAL_LEN,
}: {
  d: string;
  sectionInRoot: number;
  stroke: string;
  strokeWidth: number;
  className?: string;
  opacity?: number;
  dashLength?: number;
}) {
  const offset = sectionDashOffset(sectionInRoot);
  const dash =
    dashLength === ROOT_SECTION_VISUAL_LEN
      ? SECTION_DASH
      : `${dashLength} ${ROOT_SECTION_PATH_LENGTH}`;

  return (
    <path
      className={className}
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={PATH_LEN}
      strokeDasharray={dash}
      strokeDashoffset={offset}
      opacity={opacity}
      pointerEvents="none"
    />
  );
}

/** Visible section bead — light base always; ready/generating/collecting overlays on top. */
function VisibleRootSection({
  d,
  sectionIndex,
  sectionInRoot,
  state,
  generatingProgress,
}: {
  d: string;
  sectionIndex: number;
  sectionInRoot: number;
  state: RootSectionVisualState;
  generatingProgress: number;
}) {
  const width = sectionStrokeWidth(sectionInRoot);
  const progress = Math.min(1, Math.max(0, generatingProgress));

  return (
    <g
      data-section-index={sectionIndex}
      data-section-in-root={sectionInRoot}
      data-section-state={state}
      data-section-visual="true"
      className={`v2-root-section v2-root-section--${state}`}
    >
      <SectionDashPath
        d={d}
        sectionInRoot={sectionInRoot}
        stroke={V2_ROOT_EMPTY_COLOR}
        strokeWidth={width}
        className="v2-root-section__bead v2-root-section__base"
      />

      {state === "generating" && progress > 0.02 && (
        <SectionDashPath
          d={d}
          sectionInRoot={sectionInRoot}
          stroke={V2_ROOT_GENERATING_FILL_COLOR}
          strokeWidth={width}
          className="v2-root-section__fill"
          dashLength={Math.max(0.15, ROOT_SECTION_VISUAL_LEN * progress)}
        />
      )}

      {state === "ready" && (
        <SectionDashPath
          d={d}
          sectionInRoot={sectionInRoot}
          stroke={V2_ROOT_READY_COLOR}
          strokeWidth={width}
          className="v2-root-section__bead v2-root-section__ready"
        />
      )}

      {state === "collecting" && (
        <SectionDashPath
          d={d}
          sectionInRoot={sectionInRoot}
          stroke={V2_ROOT_READY_COLOR}
          strokeWidth={width}
          className="v2-root-section__bead v2-root-section__collecting"
        />
      )}
    </g>
  );
}

/** Transparent whole-root hit path along the centerline. */
function RootHitPath({
  d,
  rootIndex,
  hasReady,
  disabled,
  onClick,
}: {
  d: string;
  rootIndex: number;
  hasReady: boolean;
  disabled: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  const clickable = hasReady && !disabled;

  return (
    <g
      data-root-hit={rootIndex}
      data-root-has-ready={hasReady ? "true" : "false"}
      className={`v2-root-hit${clickable ? " v2-root-hit--ready" : ""}`}
    >
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={ROOT_HIT_STROKE_WIDTH}
        strokeLinecap="round"
        pathLength={PATH_LEN}
        pointerEvents={clickable ? "stroke" : "none"}
        style={{ cursor: clickable ? "pointer" : "default" }}
        onClick={clickable ? onClick : undefined}
      />
    </g>
  );
}

/** Debug mock: whole-root tapered fill (no readyMask). */
function MajorRootStroke({
  d,
  fillD,
  state,
  isCollecting,
  interactive,
  onClick,
}: {
  d: string;
  fillD: string;
  state: RootSegmentState;
  isCollecting: boolean;
  interactive: boolean;
  onClick?: () => void;
}) {
  const isCollected = state === "collected";
  const isClickable = interactive && state === "ready" && !isCollecting;
  const faded = isCollected && !isCollecting;

  return (
    <g data-root-kind="major">
      {interactive && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={MAJOR_HIT_STROKE_WIDTH}
          strokeLinecap="round"
          pathLength={PATH_LEN}
          pointerEvents={isClickable ? "stroke" : "none"}
          style={{ cursor: isClickable ? "pointer" : "default" }}
          onClick={isClickable ? onClick : undefined}
        />
      )}
      <path
        d={fillD}
        fill={V2_ROOT_READY_COLOR}
        stroke="none"
        opacity={faded ? 0 : 1}
        pointerEvents="none"
      >
        {isCollecting && (
          <animate attributeName="opacity" from="1" to="0" dur="0.48s" fill="freeze" />
        )}
      </path>
    </g>
  );
}

export default function RootEnergySystem({
  readyMask,
  generatingProgress = 0,
  artMode = true,
  capital,
  segments,
  onRootCollect,
  onSectionCollect,
  onSegmentCollect,
  collectingSectionIndices = null,
  collectingRootIndices = null,
  productionCollectEnabled = true,
}: Props) {
  const [localCollectingId, setLocalCollectingId] = useState<string | null>(null);
  const productionMode = readyMask != null;
  const showArt = artMode;

  const mask = useMemo(
    () => (productionMode ? parseReadyMask(readyMask) : 0n),
    [productionMode, readyMask],
  );

  const generatingSectionIndex = useMemo(
    () => (productionMode ? findGeneratingSectionIndex(mask) : null),
    [productionMode, mask],
  );

  const handleRootClick = useCallback(
    (rootIndex: number, event: MouseEvent) => {
      if (!productionMode || !productionCollectEnabled) return;
      if (collectingRootIndices?.has(rootIndex)) return;
      if (!rootHasReadySection(rootIndex, mask)) return;
      if (onRootCollect) {
        onRootCollect(rootIndex, event);
        return;
      }
      const sectionIndex = getNextCollectableSectionIndex(rootIndex, mask);
      if (sectionIndex == null) return;
      onSectionCollect?.(sectionIndex);
    },
    [
      productionMode,
      productionCollectEnabled,
      collectingRootIndices,
      mask,
      onRootCollect,
      onSectionCollect,
    ],
  );

  const segmentById = useMemo(() => {
    const map = new Map<string, RootSegment>();
    for (const segment of segments ?? []) map.set(segment.id, segment);
    return map;
  }, [segments]);

  const handleMajorClick = useCallback(
    (segment: RootSegment) => {
      if (segment.state !== "ready" || localCollectingId) return;
      setLocalCollectingId(segment.id);
      window.setTimeout(() => {
        setLocalCollectingId(null);
        onSegmentCollect?.(segment.id);
      }, COLLECT_ANIM_MS);
    },
    [localCollectingId, onSegmentCollect],
  );

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
        isCollecting: localCollectingId === branch.id,
      };
    });
  }, [segmentById, localCollectingId]);

  const { width, height, originX, originY } = ROOT_SYSTEM_VIEW;

  return (
    <div
      className={`v2-root-system${showArt ? " v2-root-system--art" : ""}`}
      data-generating-section={generatingSectionIndex ?? undefined}
      data-art-mode={showArt ? "true" : "false"}
      data-origin-x={originX}
      data-origin-y={originY}
      data-production={productionMode ? "true" : "false"}
    >
      <svg
        className="v2-root-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        overflow="visible"
        role="group"
        aria-label="Корневая система и капитал"
      >
        <rect
          className="v2-root-bbox-stabilizer"
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          pointerEvents="none"
          aria-hidden="true"
        />

        {showArt && <V2CapitalChest capital={capital} layer="body" />}

        {productionMode ? (
          <>
            <g className="v2-root-majors v2-root-majors--sections">
              {MAJOR_MOCK_BRANCH_CATALOG.map((branch, rootIndex) => (
                <g
                  key={branch.id}
                  data-root-kind="major"
                  data-root={rootIndex}
                  data-root-slot={branch.id}
                  data-whorl={branch.whorl}
                  data-root-ready={
                    rootHasReadySection(rootIndex, mask) ? "true" : "false"
                  }
                >
                  {Array.from({ length: V2_SECTIONS_PER_ROOT }, (_, sectionInRoot) => {
                    const sectionIndex =
                      rootIndex * V2_SECTIONS_PER_ROOT + sectionInRoot;
                    const state = resolveSectionVisualState({
                      sectionIndex,
                      readyMask: mask,
                      generatingSectionIndex,
                      collectingSectionIndices,
                    });
                    return (
                      <VisibleRootSection
                        key={sectionIndex}
                        d={branch.d}
                        sectionIndex={sectionIndex}
                        sectionInRoot={sectionInRoot}
                        state={state}
                        generatingProgress={
                          state === "generating" ? generatingProgress : 0
                        }
                      />
                    );
                  })}
                </g>
              ))}
            </g>

            {showArt && <V2CapitalChest capital={capital} layer="label" />}

            <g className="v2-root-hit-layer" aria-hidden="true">
              {MAJOR_MOCK_BRANCH_CATALOG.map((branch, rootIndex) => (
                <RootHitPath
                  key={branch.id}
                  d={branch.d}
                  rootIndex={rootIndex}
                  hasReady={rootHasReadySection(rootIndex, mask)}
                  disabled={
                    !productionCollectEnabled ||
                    collectingRootIndices?.has(rootIndex) === true
                  }
                  onClick={(event) => handleRootClick(rootIndex, event)}
                />
              ))}
            </g>
          </>
        ) : (
          <>
            <g className="v2-root-majors">
              {majorSlots.map(({ branch, segment, isCollecting }) => {
                const fillD = MAJOR_TAPER_FILL_BY_ID.get(branch.id) ?? branch.d;
                return (
                  <g key={branch.id} data-root-slot={branch.id} data-whorl={branch.whorl}>
                    <MajorRootStroke
                      d={branch.d}
                      fillD={fillD}
                      state={segment.state}
                      isCollecting={isCollecting}
                      interactive
                      onClick={() => handleMajorClick(segment)}
                    />
                  </g>
                );
              })}
            </g>
            {showArt && <V2CapitalChest capital={capital} layer="label" />}
          </>
        )}
      </svg>
      {productionMode && (
        <span className="v2-root-section-count" hidden>
          {V2_ROOT_COUNT}:{V2_SECTIONS_PER_ROOT}:{V2_ROOT_SECTION_COUNT}
        </span>
      )}
    </div>
  );
}
