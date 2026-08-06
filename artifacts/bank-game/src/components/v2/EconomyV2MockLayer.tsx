import { useCallback, useEffect, useRef, useState } from "react";

import RootEnergySystem, { type RootSegment } from "./RootEnergySystem";
import ExcessWebs from "./ExcessWebs";
import { useV2TrunkAnchor } from "./useV2TrunkAnchor";

import { registerV2MockResetRoots, registerV2MockResetWebs } from "@/lib/v2MockDebug";

/** Four major mock roots — one per 15 s energy block (60 s total). */
export const INITIAL_MAJOR_MOCK_ROOTS: RootSegment[] = [
  { id: "root-major-1", whorl: 1, state: "ready" },
  { id: "root-major-2", whorl: 2, state: "ready" },
  { id: "root-major-3", whorl: 3, state: "ready" },
  { id: "root-major-4", whorl: 4, state: "ready" },
];

function cloneInitialRoots(): RootSegment[] {
  return INITIAL_MAJOR_MOCK_ROOTS.map((s) => ({ ...s }));
}

/**
 * Debug-only wrapper: local state, no API, no v1 side effects.
 * Still uses full artistic root composition (chest + secondaries + taper).
 */
export default function EconomyV2MockLayer() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const { metrics: anchorMetrics, anchorReady, logPostClickMeasure } = useV2TrunkAnchor(anchorRef);
  const [segments, setSegments] = useState<RootSegment[]>(cloneInitialRoots);
  const [websKey, setWebsKey] = useState(0);
  const [websDone, setWebsDone] = useState(false);

  const handleSegmentCollect = useCallback(
    (id: string) => {
      logPostClickMeasure();
      setSegments((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, state: "collected" as const } : s));
        if (next.every((s) => s.state === "collected")) {
          window.setTimeout(() => {
            console.info("[v2 mock] All four major roots collected (60 s mock)");
          }, 120);
        }
        return next;
      });
    },
    [logPostClickMeasure],
  );

  const handleWebsComplete = useCallback(() => {
    setWebsDone(true);
    console.info("[v2 mock] All excess webs collected");
  }, []);

  const resetWebs = useCallback(() => {
    setWebsKey((k) => k + 1);
    setWebsDone(false);
  }, []);

  const resetRoots = useCallback(() => {
    setSegments(cloneInitialRoots());
  }, []);

  useEffect(() => {
    registerV2MockResetWebs(resetWebs);
    return () => registerV2MockResetWebs(null);
  }, [resetWebs]);

  useEffect(() => {
    registerV2MockResetRoots(resetRoots);
    return () => registerV2MockResetRoots(null);
  }, [resetRoots]);

  useEffect(() => {
    if (!import.meta.env.DEV || !anchorMetrics) return;
    console.info("[v2 root anchor]", {
      trunkBase: { x: anchorMetrics.trunkBaseX, bottom: anchorMetrics.trunkBaseBottom },
      svgOrigin: { x: anchorMetrics.svgOriginX, bottom: anchorMetrics.svgOriginBottom },
    });
  }, [anchorMetrics]);

  return (
    <>
      {anchorMetrics && (
        <div className="v2-root-debug-markers" aria-hidden="true">
          <span
            className="v2-root-debug-marker v2-root-debug-marker--trunk"
            style={{ left: anchorMetrics.trunkBaseX, bottom: anchorMetrics.trunkBaseBottom }}
          />
          <span
            className="v2-root-debug-marker v2-root-debug-marker--origin"
            style={{ left: anchorMetrics.svgOriginX, bottom: anchorMetrics.svgOriginBottom }}
          />
        </div>
      )}

      {/*
        Mock roots still mount under .game-area (debug-only).
        Production roots live inside .game-tree-wrap via RootEnergyLayer.
        Art composition is always on — not gated by readyMask.
      */}
      <div
        className="v2-root-anchor v2-root-anchor--art"
        ref={anchorRef}
        data-anchor-ready={anchorReady ? "true" : "false"}
      >
        <RootEnergySystem
          artMode
          segments={segments}
          onSegmentCollect={handleSegmentCollect}
        />
      </div>

      {!websDone && <ExcessWebs key={websKey} onComplete={handleWebsComplete} />}
    </>
  );
}
