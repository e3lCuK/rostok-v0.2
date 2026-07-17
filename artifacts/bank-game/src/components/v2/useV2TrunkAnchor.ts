import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Must match RootEnergySystem SVG layout (local origin). */
const ROOT_SVG = { width: 200, height: 66, originX: 100, originY: 4 } as const;

const ANCHOR_BOTTOM_OFFSET = ROOT_SVG.height - ROOT_SVG.originY;

const STABLE_PX = 0.5;
const STABLE_FRAMES_REQUIRED = 2;
const MAX_RAF_FRAMES = 90;

export interface V2TrunkAnchorMetrics {
  /** Trunk base center — px from .game-area left edge. */
  trunkBaseX: number;
  /** Trunk base — px from .game-area bottom edge. */
  trunkBaseBottom: number;
  /** SVG local origin (100, 4) mapped to game-area — should match trunk base. */
  svgOriginX: number;
  svgOriginBottom: number;
}

export interface V2TrunkAnchorResult {
  metrics: V2TrunkAnchorMetrics | null;
  anchorReady: boolean;
  /** Dev-only: log anchor geometry once after first root click (verification). */
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

export function useV2TrunkAnchor(
  anchorRef: RefObject<HTMLElement | null>,
): V2TrunkAnchorResult {
  const [metrics, setMetrics] = useState<V2TrunkAnchorMetrics | null>(null);
  const [anchorReady, setAnchorReady] = useState(false);
  const postClickLoggedRef = useRef(false);
  /** After initial alignment, keep CSS vars frozen unless the viewport/layout size changes. */
  const lockedRef = useRef(false);
  const lastAppliedRef = useRef<V2TrunkAnchorMetrics | null>(null);

  const measureAnchor = useCallback(
    (phase: string, opts?: { apply?: boolean; force?: boolean }): V2TrunkAnchorMetrics | null => {
      const area = document.querySelector(".game-area");
      const trunk = document.querySelector(".game-tree-wrap .tree-trunk");
      const anchor = anchorRef.current;
      if (!area || !trunk || !anchor) return null;

      const gameRect = area.getBoundingClientRect();
      const trunkRect = trunk.getBoundingClientRect();

      const trunkBaseX = trunkRect.left + trunkRect.width / 2 - gameRect.left;
      const trunkBaseBottom = gameRect.bottom - trunkRect.bottom;

      const applyRequested = opts?.apply !== false;
      const shouldApply = opts?.force === true || (applyRequested && !lockedRef.current);

      if (shouldApply) {
        const prev = lastAppliedRef.current;
        const changed =
          !prev ||
          Math.abs(prev.trunkBaseX - trunkBaseX) >= STABLE_PX ||
          Math.abs(prev.trunkBaseBottom - trunkBaseBottom) >= STABLE_PX;
        // Skip sub-pixel jitter that would nudge the whole root system.
        if (changed || opts?.force) {
          anchor.style.setProperty("--v2-trunk-base-x", `${trunkBaseX}px`);
          anchor.style.setProperty("--v2-trunk-base-bottom", `${trunkBaseBottom}px`);
          lastAppliedRef.current = {
            trunkBaseX,
            trunkBaseBottom,
            svgOriginX: 0,
            svgOriginBottom: 0,
          };
        }
      }

      const anchorRect = anchor.getBoundingClientRect();
      const svgOriginScreenY = anchorRect.top + ROOT_SVG.originY;
      const result: V2TrunkAnchorMetrics = {
        trunkBaseX,
        trunkBaseBottom,
        svgOriginX: anchorRect.left + ROOT_SVG.originX - gameRect.left,
        svgOriginBottom: gameRect.bottom - svgOriginScreenY,
      };

      if (import.meta.env.DEV) {
        console.info(`[v2 anchor measure ${phase}]`, {
          apply: shouldApply,
          locked: lockedRef.current,
          gameRect: rectSnapshot(gameRect),
          trunkRect: rectSnapshot(trunkRect),
          trunkBaseX,
          trunkBaseBottom,
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
    // Read-only verification — never rewrite CSS vars after roots are clicked.
    measureAnchor("post-click", { apply: false });
  }, [measureAnchor]);

  useLayoutEffect(() => {
    let frame1 = 0;
    let frame2 = 0;
    let stableFrame = 0;
    let cancelled = false;

    const finishInitial = () => {
      if (cancelled) return;
      lockedRef.current = true;
      setAnchorReady(true);
    };

    const runStableLoop = (startFrom: V2TrunkAnchorMetrics | null, frameIndex: number) => {
      let last = startFrom;
      let stableCount = 0;

      const tick = (index: number) => {
        if (cancelled) return;
        const current = measureAnchor(`raf-stable-${index}`, { apply: true });
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

    measureAnchor("initial", { apply: true });

    frame1 = requestAnimationFrame(() => {
      measureAnchor("raf1", { apply: true });
      frame2 = requestAnimationFrame(() => {
        const r2 = measureAnchor("raf2", { apply: true });
        runStableLoop(r2, 3);
      });
    });

    const onViewportChange = () => {
      // Explicit layout changes only — not SVG ink/overflow from collecting roots.
      lockedRef.current = false;
      measureAnchor("resize", { force: true });
      lockedRef.current = true;
    };

    window.addEventListener("resize", onViewportChange);

    const ro = new ResizeObserver((entries) => {
      // Ignore noise from SVG content bbox / absolute children; only react to game-area box size.
      for (const entry of entries) {
        if (!(entry.target as Element).classList?.contains("game-area")) continue;
        onViewportChange();
        return;
      }
    });
    const area = document.querySelector(".game-area");
    if (area) ro.observe(area);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      cancelAnimationFrame(stableFrame);
      ro.disconnect();
      window.removeEventListener("resize", onViewportChange);
    };
  }, [measureAnchor]);

  return { metrics, anchorReady, logPostClickMeasure };
}

export { ANCHOR_BOTTOM_OFFSET, ROOT_SVG };
