import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Clock, Zap } from "lucide-react";

import RootEnergySystem from "./RootEnergySystem";
import { useV2TrunkAnchor } from "./useV2TrunkAnchor";
import { api, type EconomyV2RootsState } from "@/lib/api";
import {
  findGeneratingSectionIndex,
  getNextCollectableSectionIndex,
  normalizeV2Roots,
  parseReadyMask,
  resolveGeneratingProgress,
  resolveRootTimerDisplay,
  rootIndexForSection,
} from "@/lib/v2Roots";

interface Props {
  roots: EconomyV2RootsState | null | undefined;
  energySeconds: number;
  capital: number;
  tutorialDone: boolean;
  /** Hide the root energy countdown (e.g. during Metelka cleaning). */
  hideEnergyTimer?: boolean;
  onRootsChange: (roots: EconomyV2RootsState, energySeconds: number) => void;
  onRefreshState: () => Promise<void>;
  onError?: (message: string) => void;
}

type CollectFloater = {
  id: number;
  x: number;
  y: number;
};

const FLOATER_MS = 650;

/**
 * Production roots UI. Must be rendered inside `.game-tree-wrap`.
 * Ready sections always come from server `roots.readyMask` (no local override).
 */
export default function RootEnergyLayer({
  roots: rootsRaw,
  energySeconds,
  capital,
  tutorialDone,
  hideEnergyTimer = false,
  onRootsChange,
  onRefreshState,
  onError,
}: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const { anchorReady } = useV2TrunkAnchor(anchorRef);
  const floaterIdRef = useRef(0);

  const roots = normalizeV2Roots(rootsRaw);

  const [collectingSections, setCollectingSections] = useState(
    () => new Set<number>(),
  );
  const [collectingRoots, setCollectingRoots] = useState(
    () => new Set<number>(),
  );
  const collectingRootsRef = useRef(new Set<number>());
  const [floaters, setFloaters] = useState<CollectFloater[]>([]);
  const [localUntil, setLocalUntil] = useState<number | null>(
    roots.secondsUntilNextSection,
  );
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!tutorialDone) {
      setLocalUntil(null);
      return;
    }
    setLocalUntil(roots.secondsUntilNextSection);
  }, [
    tutorialDone,
    roots.secondsUntilNextSection,
    roots.readyMask,
    roots.generationProgress,
  ]);

  useEffect(() => {
    if (
      !tutorialDone ||
      localUntil == null ||
      roots.isFull ||
      roots.storageFull ||
      capital <= 0
    ) {
      return;
    }
    if (localUntil <= 0) return;
    const id = window.setInterval(() => {
      setLocalUntil((prev) => {
        if (prev == null) return prev;
        return Math.max(0, prev - 1);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [tutorialDone, localUntil, roots.isFull, roots.storageFull, capital]);

  useEffect(() => {
    if (!tutorialDone) return;
    if (localUntil !== 0) return;
    if (refreshingRef.current) return;
    if (roots.isFull || roots.storageFull || capital <= 0) return;
    refreshingRef.current = true;
    void onRefreshState()
      .catch(() => {})
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [
    tutorialDone,
    localUntil,
    onRefreshState,
    roots.isFull,
    roots.storageFull,
    capital,
  ]);

  const spawnFloater = useCallback((event: MouseEvent) => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const id = ++floaterIdRef.current;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setFloaters((prev) => [...prev, { id, x, y }]);
    window.setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, FLOATER_MS);
  }, []);

  const handleRootCollect = useCallback(
    async (rootIndex: number, event: MouseEvent) => {
      if (!tutorialDone) return;
      if (collectingRootsRef.current.has(rootIndex)) return;

      const mask = parseReadyMask(roots.readyMask);
      const sectionIndex = getNextCollectableSectionIndex(rootIndex, mask);
      if (sectionIndex == null) return;

      collectingRootsRef.current.add(rootIndex);
      setCollectingRoots(new Set(collectingRootsRef.current));
      setCollectingSections((prev) => new Set(prev).add(sectionIndex));

      try {
        const result = await api.collectV2RootSection(sectionIndex);
        onRootsChange(normalizeV2Roots(result.roots), result.energySeconds);
        spawnFloater(event);
      } catch (err) {
        const e = err as { code?: string; message?: string };
        if (e.code === "energy_bank_full") {
          onError?.(
            "Банк энергии заполнен (60 сек). Сначала потратьте энергию на уход.",
          );
        } else if (e.code === "section_not_ready") {
          onError?.("Эта секция уже собрана.");
          await onRefreshState().catch(() => {});
        } else {
          onError?.(e.message || "Не удалось собрать секцию.");
          await onRefreshState().catch(() => {});
        }
      } finally {
        collectingRootsRef.current.delete(rootIndex);
        setCollectingRoots(new Set(collectingRootsRef.current));
        setCollectingSections((prev) => {
          const next = new Set(prev);
          next.delete(sectionIndex);
          return next;
        });
      }
    },
    [
      tutorialDone,
      roots.readyMask,
      onRootsChange,
      onError,
      onRefreshState,
      spawnFloater,
    ],
  );

  const mask = useMemo(() => parseReadyMask(roots.readyMask), [roots.readyMask]);
  const generatingSectionIndex = useMemo(
    () =>
      roots.isFull || roots.storageFull
        ? null
        : findGeneratingSectionIndex(mask),
    [roots.isFull, roots.storageFull, mask],
  );

  const generatingProgress = useMemo(
    () =>
      resolveGeneratingProgress({
        generationProgress: roots.generationProgress,
        secondsUntilNextSection: localUntil,
        secondsPerSection: roots.secondsPerSection,
      }),
    [roots.generationProgress, localUntil, roots.secondsPerSection],
  );

  const timer = useMemo(
    () =>
      hideEnergyTimer || !tutorialDone
        ? ({ kind: "hidden" } as const)
        : resolveRootTimerDisplay({
            isFull: roots.isFull,
            storageFull: roots.storageFull,
            capital,
            secondsUntilNext: localUntil,
            secondsPerSection: roots.secondsPerSection,
            tutorialDone,
          }),
    [
      hideEnergyTimer,
      tutorialDone,
      roots.isFull,
      roots.storageFull,
      capital,
      localUntil,
      roots.secondsPerSection,
    ],
  );

  return (
    <div
      ref={anchorRef}
      className="v2-root-anchor v2-root-anchor--art"
      data-anchor-ready={anchorReady ? "true" : "false"}
      data-generating-section={generatingSectionIndex ?? undefined}
      data-energy-seconds={energySeconds}
      data-timer-kind={timer.kind}
      data-tutorial-done={tutorialDone ? "true" : "false"}
    >
      <RootEnergySystem
        readyMask={roots.readyMask}
        generatingProgress={tutorialDone ? generatingProgress : 0}
        artMode
        capital={capital}
        collectingSectionIndices={collectingSections}
        collectingRootIndices={collectingRoots}
        productionCollectEnabled={tutorialDone}
        onRootCollect={handleRootCollect}
      />

      <div
        className={`v2-root-timer-side${timer.kind === "countdown" && timer.pulse ? " v2-root-timer-side--pulse" : ""}`}
        data-timer-kind={timer.kind}
        aria-live="polite"
        hidden={timer.kind !== "countdown"}
      >
        {timer.kind === "countdown" ? (
          <div
            className="v2-root-timer-capsule"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(timer.barProgress * 100)}
            aria-label="Прогресс генерации следующей секции"
            data-timer-capsule="true"
          >
            <div
              className="v2-root-timer-capsule__fill"
              style={{ width: `${timer.barProgress * 100}%` }}
              data-timer-fill="true"
            />
            <span
              className="v2-root-timer-icon"
              data-timer-energy-icon="true"
              aria-hidden="true"
            >
              {/* Outline Zap inside capsule — ~23% smaller than prior 13px. */}
              <Zap size={10} strokeWidth={2.2} fill="none" />
            </span>
            <span className="v2-root-timer-capsule__time">{timer.timeLabel}</span>
          </div>
        ) : null}
      </div>

      {floaters.map((f) => (
        <span
          key={f.id}
          className="v2-root-collect-floater"
          style={{ left: f.x, top: f.y }}
          aria-hidden="true"
        >
          <span className="v2-root-collect-floater-icon" aria-hidden="true">
            <Clock size={12} strokeWidth={2.2} />
          </span>
          <span className="v2-root-collect-floater-text">+1 сек</span>
        </span>
      ))}

    </div>
  );
}

/** Exported for tests — maps a section flash back to its root. */
export function rootIndexOfCollectingSection(sectionIndex: number): number {
  return rootIndexForSection(sectionIndex);
}
