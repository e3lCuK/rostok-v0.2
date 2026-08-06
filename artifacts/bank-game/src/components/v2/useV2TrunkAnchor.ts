import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ROOT_ART_VIEW, ROOT_TRUNK_OVERLAP_PX } from "./rootArtCatalog";

/** Must match RootEnergySystem / ROOT_SYSTEM_VIEW / ROOT_ART_VIEW layout. */
const ROOT_SVG = {
  width: ROOT_ART_VIEW.width,
  height: ROOT_ART_VIEW.height,
  originX: ROOT_ART_VIEW.originX,
  originY: ROOT_ART_VIEW.originY,
} as const;

/** Distance from SVG bottom edge to local origin Y — used in CSS `bottom` math. */
const ANCHOR_BOTTOM_OFFSET = ROOT_SVG.height - ROOT_SVG.originY; // 84

const STABLE_PX = 0.5;
const STABLE_FRAMES_REQUIRED = 2;
const MAX_RAF_FRAMES = 90;

export interface V2TrunkAnchorMetrics {
  trunkBaseX: number;
  trunkBaseBottom: number;
  /** trunkBaseBottom + overlap — value written to CSS for origin placement */
  originBottom: number;
  svgOriginX: number;
  svgOriginBottom: number;
  overlapPx: number;
}

export interface V2TrunkAnchorResult {
  metrics: V2TrunkAnchorMetrics | null;
  anchorReady: boolean;
  logPostClickMeasure: () => void;
}

function rectSnapshot(rect: DOMRect) {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function metricsEqual(a: V2TrunkAnchorMetrics, b: V2TrunkAnchorMetrics) {
  return (
    Math.abs(a.trunkBaseX - b.trunkBaseX) < STABLE_PX &&
    Math.abs(a.trunkBaseBottom - b.trunkBaseBottom) < STABLE_PX
  );
}

function findTrunkEl(treeWrap: Element | null): Element | null {
  if (treeWrap) {
    const inWrap = treeWrap.querySelector(".tree-trunk");
    if (inWrap) return inWrap;
  }
  return (
    document.querySelector(".game-tree-wrap .tree-trunk") ??
    document.querySelector(".tree-trunk")
  );
}

/**
 * Aligns `.v2-root-anchor` so SVG local origin sits on the measured trunk base,
 * shifted UP by ROOT_TRUNK_OVERLAP_PX so root strokes cover the stump.
 * Anchor must be a descendant of `.game-tree-wrap` so tree + roots share one transform.
 */
export function useV2TrunkAnchor(
  anchorRef: RefObject<HTMLElement | null>,
): V2TrunkAnchorResult {
  const [metrics, setMetrics] = useState<V2TrunkAnchorMetrics | null>(null);
  const [anchorReady, setAnchorReady] = useState(false);
  const postClickLoggedRef = useRef(false);
  const lastAppliedRef = useRef<V2TrunkAnchorMetrics | null>(null);

  const measureAnchor = useCallback(
    (phase: string, opts?: { apply?: boolean; force?: boolean }): V2TrunkAnchorMetrics | null => {
      const anchor = anchorRef.current;
      if (!anchor) return null;

      const treeWrap = anchor.closest(".game-tree-wrap");
      const container =
        treeWrap ??
        (anchor.closest(".game-area") as HTMLElement | null) ??
        document.querySelector(".game-area");
      const trunk = findTrunkEl(treeWrap);
      if (!container || !trunk) return null;

      const containerRect = container.getBoundingClientRect();
      const trunkRect = trunk.getBoundingClientRect();

      // Distance from wrap bottom → trunk bottom (screen space, after all transforms).
      const trunkBaseX =
        trunkRect.left + trunkRect.width / 2 - containerRect.left;
      const trunkBaseBottom = containerRect.bottom - trunkRect.bottom;
      // Place origin slightly INTO the trunk so path starts overlap wood (no hairline gap).
      const originBottom = trunkBaseBottom + ROOT_TRUNK_OVERLAP_PX;

      const applyRequested = opts?.apply !== false;
      const shouldApply = opts?.force === true || applyRequested;

      if (shouldApply) {
        const prev = lastAppliedRef.current;
        const changed =
          !prev ||
          Math.abs(prev.trunkBaseX - trunkBaseX) >= STABLE_PX ||
          Math.abs(prev.trunkBaseBottom - trunkBaseBottom) >= STABLE_PX;
        if (changed || opts?.force) {
          anchor.style.setProperty("--v2-trunk-base-x", `${trunkBaseX}px`);
          anchor.style.setProperty("--v2-trunk-base-bottom", `${originBottom}px`);
          anchor.style.setProperty(
            "--v2-root-origin-from-bottom",
            `${ANCHOR_BOTTOM_OFFSET}px`,
          );
          anchor.dataset.trunkBaseX = trunkBaseX.toFixed(2);
          anchor.dataset.trunkBaseBottom = trunkBaseBottom.toFixed(2);
          anchor.dataset.rootOriginBottom = originBottom.toFixed(2);
          anchor.dataset.rootOverlapPx = String(ROOT_TRUNK_OVERLAP_PX);
          lastAppliedRef.current = {
            trunkBaseX,
            trunkBaseBottom,
            originBottom,
            svgOriginX: 0,
            svgOriginBottom: 0,
            overlapPx: ROOT_TRUNK_OVERLAP_PX,
          };
        }
      }

      const anchorRect = anchor.getBoundingClientRect();
      // Local origin in screen space (1 CSS px ≈ 1 viewBox unit for our 200×72 svg).
      const svgOriginScreenY =
        anchorRect.top + (ROOT_SVG.originY / ROOT_SVG.height) * anchorRect.height;
      const svgOriginScreenX =
        anchorRect.left + (ROOT_SVG.originX / ROOT_SVG.width) * anchorRect.width;
      const result: V2TrunkAnchorMetrics = {
        trunkBaseX,
        trunkBaseBottom,
        originBottom,
        svgOriginX: svgOriginScreenX - containerRect.left,
        svgOriginBottom: containerRect.bottom - svgOriginScreenY,
        overlapPx: ROOT_TRUNK_OVERLAP_PX,
      };

      if (import.meta.env.DEV) {
        console.info(`[v2 anchor measure ${phase}]`, {
          apply: shouldApply,
          container: treeWrap ? "game-tree-wrap" : "game-area",
          containerRect: rectSnapshot(containerRect),
          trunkRect: rectSnapshot(trunkRect),
          trunkBaseX,
          trunkBaseBottom,
          originBottom,
          overlapPx: ROOT_TRUNK_OVERLAP_PX,
          deltaOriginToTrunkY: result.svgOriginBottom - trunkBaseBottom,
          css: {
            left: anchor.style.getPropertyValue("--v2-trunk-base-x"),
            bottom: anchor.style.getPropertyValue("--v2-trunk-base-bottom"),
          },
        });
      }

      setMetrics(result);
      return result;
    },
    [anchorRef],
  );

  const logPostClickMeasure = useCallback(() => {
    if (!import.meta.env.DEV || postClickLoggedRef.current) return;
    postClickLoggedRef.current = true;
    measureAnchor("post-click", { apply: false });
  }, [measureAnchor]);

  useLayoutEffect(() => {
    let frame1 = 0;
    let frame2 = 0;
    let stableFrame = 0;
    let cancelled = false;

    const finishInitial = () => {
      if (cancelled) return;
      setAnchorReady(true);
    };

    const runStableLoop = (startFrom: V2TrunkAnchorMetrics | null, frameIndex: number) => {
      let last = startFrom;
      let stableCount = 0;

      const tick = (index: number) => {
        if (cancelled) return;
        const current = measureAnchor(`raf-stable-${index}`, { apply: true, force: true });
        if (current && last && metricsEqual(current, last)) {
          stableCount += 1;
          if (stableCount >= STABLE_FRAMES_REQUIRED) {
            finishInitial();
            return;
          }
        } else {
          stableCount = 0;
        }
        last = current;
        if (index >= MAX_RAF_FRAMES) {
          finishInitial();
          return;
        }
        stableFrame = requestAnimationFrame(() => tick(index + 1));
      };

      stableFrame = requestAnimationFrame(() => tick(frameIndex));
    };

    measureAnchor("initial", { apply: true, force: true });

    frame1 = requestAnimationFrame(() => {
      measureAnchor("raf1", { apply: true, force: true });
      frame2 = requestAnimationFrame(() => {
        const r2 = measureAnchor("raf2", { apply: true, force: true });
        runStableLoop(r2, 3);
      });
    });

    const onViewportChange = () => {
      measureAnchor("resize", { force: true });
    };

    window.addEventListener("resize", onViewportChange);

    const ro = new ResizeObserver(() => {
      onViewportChange();
    });
    const treeWrap = anchorRef.current?.closest(".game-tree-wrap");
    if (treeWrap) ro.observe(treeWrap);
    const area = document.querySelector(".game-area");
    if (area) ro.observe(area);
    const trunk = findTrunkEl(treeWrap ?? null);
    if (trunk) ro.observe(trunk);
    const treeWrapper = treeWrap?.querySelector(".tree-wrapper");
    if (treeWrapper) ro.observe(treeWrapper);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      cancelAnimationFrame(stableFrame);
      ro.disconnect();
      window.removeEventListener("resize", onViewportChange);
    };
  }, [measureAnchor, anchorRef]);

  return { metrics, anchorReady, logPostClickMeasure };
}

export { ANCHOR_BOTTOM_OFFSET, ROOT_SVG };
