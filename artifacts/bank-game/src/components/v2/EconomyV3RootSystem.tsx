/**
 * Economy v3 roots — three activity roots × five segments.
 * Primary UI when `game.v3Roots.enabled` (server ENABLE_ECONOMY_V3_ROOTS).
 * Manual transfer via POST /game/v3/roots/transfer.
 * After success, a short in-root energy-rise animation may play before applying snapshot.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api, type EconomyV3RootKind, type EconomyV3RootState, type EconomyV3RootsState } from "@/lib/api";
import {
  normalizeEconomyV3RootsSnapshot,
  V3_ROOT_KINDS,
} from "@/lib/v3Roots";
import { V3_ACTIVITY_ENERGY_COLORS } from "@/lib/v3ActivityColors";
import { pulseV3ActivityReceive } from "@/lib/v3TransferFlight";
import { commitV3TransferPendingOnce } from "@/lib/v3TransferCommit";
import V3TransferFlight from "@/components/v2/V3TransferFlight";

export const V3_SEGMENT_COUNT = 5;
/** One visual segment = 5 game-seconds on the fixed 0–25 scale. */
export const V3_SEGMENT_SECONDS = 5;
/**
 * Fixed visual scale for root columns: 5 segments × 5s = 25s.
 * Independent of effectivePresetSeconds (backend capacity).
 */
export const V3_VISUAL_SCALE_SECONDS = V3_SEGMENT_COUNT * V3_SEGMENT_SECONDS;
/** Absolute max capacity fallback (base 25 + visit bonus 5). Prefer root.capacitySeconds. */
export const V3_ROOT_CAPACITY_SECONDS = 30;

/**
 * Visual fill ratio on the fixed 0–25 scale.
 * `effectivePresetSeconds` is ignored when passed — it is a backend cap, not the visual scale.
 */
export function v3RootFillRatio(
  currentRootSeconds: unknown,
  _effectivePresetSeconds?: unknown,
): number {
  const seconds = Number(currentRootSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(
    1,
    Math.max(0, seconds / V3_VISUAL_SCALE_SECONDS),
  );
}

/**
 * Fill fraction for one segment from a continuous visual fillRatio (0–1 on the 25s scale).
 * Equivalent to five equal 5-second buckets.
 */
export function v3SegmentFillFromRatio(
  segmentIndex: number,
  fillRatio: number,
): number {
  if (
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    segmentIndex >= V3_SEGMENT_COUNT
  ) {
    return 0;
  }
  const ratio = Math.min(1, Math.max(0, Number(fillRatio) || 0));
  const total = ratio * V3_SEGMENT_COUNT;
  return Math.min(1, Math.max(0, total - segmentIndex));
}

/**
 * Fill fraction for one segment from server fullSegments + partialSegmentSeconds.
 * Legacy 5-second segment split — prefer {@link v3SegmentFillForDisplay}.
 * Partial seconds are not floored — keeps within-segment fill continuous.
 */
export function v3SegmentFillFraction(
  segmentIndex: number,
  fullSegments: number,
  partialSegmentSeconds: number,
): number {
  if (
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    segmentIndex >= V3_SEGMENT_COUNT
  ) {
    return 0;
  }
  const full = Math.max(
    0,
    Math.min(V3_SEGMENT_COUNT, Math.floor(Number(fullSegments) || 0)),
  );
  const partialRaw = Number(partialSegmentSeconds);
  const partial = Number.isFinite(partialRaw)
    ? Math.max(0, Math.min(V3_SEGMENT_SECONDS, partialRaw))
    : 0;
  if (segmentIndex < full) return 1;
  if (segmentIndex === full && partial > 0) {
    return Math.min(1, partial / V3_SEGMENT_SECONDS);
  }
  return 0;
}

/**
 * Display fill for one visual segment on the fixed 0–25 scale.
 *
 * segmentIndex i covers seconds [i×5, (i+1)×5).
 * effectivePresetSeconds / capacitySeconds do NOT stretch the scale.
 */
export function v3SegmentFillForDisplay(
  segmentIndex: number,
  root: Pick<
    EconomyV3RootState,
    | "seconds"
    | "capacitySeconds"
    | "fullSegments"
    | "partialSegmentSeconds"
    | "fillFraction"
  >,
  _effectivePresetSeconds?: number | null,
): number {
  if (
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    segmentIndex >= V3_SEGMENT_COUNT
  ) {
    return 0;
  }
  const seconds = Number(root.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const segmentStart = segmentIndex * V3_SEGMENT_SECONDS;
  return Math.min(
    1,
    Math.max(0, (seconds - segmentStart) / V3_SEGMENT_SECONDS),
  );
}

/** In-root drain / press feedback at the start of transfer (ms). */
export const V3_TRANSFER_RISE_MS = 180;
/** Soft flight root → activity reserve (ms). */
export const V3_TRANSFER_FLIGHT_MS = 520;
/** Short settle before snapshot apply (ms). */
export const V3_TRANSFER_FADE_MS = 100;
/** Total manual transfer animation before applying snapshot. */
export const V3_TRANSFER_ANIM_MS =
  V3_TRANSFER_RISE_MS + V3_TRANSFER_FLIGHT_MS + V3_TRANSFER_FADE_MS;

export const V3_ROOT_LABELS: Record<EconomyV3RootKind, string> = {
  water: "Полив",
  sun: "Свет",
  fertilizer: "Удобрение",
};

/**
 * Soft energy fills by activity (filled seconds only).
 * Derived from V3_ACTIVITY_ACCENT_COLORS (button/icon palette).
 * Shell / empty cells use --field-caption-bg (same cream as apple/growth/capital).
 */
export const V3_ROOT_FILL_COLORS: Record<EconomyV3RootKind, string> =
  V3_ACTIVITY_ENERGY_COLORS;

export type V3RootVisualState =
  | "empty"
  | "accumulating"
  | "ready"
  | "transferred"
  | "frozen"
  | "waiting"
  | "full"
  | "transferring";

/** Transient UI held only in React state (not persisted across reloads). */
export type V3TransferringState = {
  kind: EconomyV3RootKind;
  /** Pre-success fill; not recalculated from economy. */
  holdRoot: EconomyV3RootState;
  pendingSnapshot: EconomyV3RootsState;
};

/**
 * Root-level visual class from server snapshot.
 * Freeze/insurance is not “generation stopped”: waiting only for a root that
 * still has transferable energy during the insurance window. An empty
 * transferred root uses calm `empty` visuals (lock stays via transferred flag).
 */
export function resolveV3RootVisualState(
  root: Pick<
    EconomyV3RootState,
    | "seconds"
    | "fullSegments"
    | "transferred"
    | "frozen"
    | "playableFromRoot"
    | "capacitySeconds"
  >,
  generating: boolean,
  cycleFrozen = false,
  effectivePresetSeconds?: number | null,
): V3RootVisualState {
  const seconds = Math.max(0, Math.floor(Number(root.seconds) || 0));
  if (root.transferred) {
    // Visual ≠ business: empty transferred looks idle; re-transfer stays gated.
    return seconds <= 0 ? "empty" : "transferred";
  }
  if (
    cycleFrozen &&
    seconds > 0 &&
    root.playableFromRoot === true
  ) {
    return "waiting";
  }
  // Empty shells stay idle even if the cycle/root freeze flag is set.
  if (seconds <= 0) return "empty";
  if (root.frozen) return "frozen";
  const capacityFromPreset =
    effectivePresetSeconds != null && Number.isFinite(Number(effectivePresetSeconds))
      ? Math.floor(Number(effectivePresetSeconds))
      : 0;
  const capacity = Math.max(
    1,
    capacityFromPreset > 0
      ? capacityFromPreset
      : Math.floor(Number(root.capacitySeconds)) || V3_ROOT_CAPACITY_SECONDS,
  );
  // Full only when seconds reach effective capacity — never via fixed 5-seg × 5s.
  if (seconds >= capacity) return "full";
  if (generating && seconds > 0) return "accumulating";
  if (root.playableFromRoot) return "ready";
  return "accumulating";
}

/** True when soft waiting pulse should run (false under prefers-reduced-motion). */
export function shouldAnimateV3Waiting(
  reducedMotionPreference?: boolean | null,
): boolean {
  if (reducedMotionPreference === true) return false;
  if (reducedMotionPreference === false) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Manual transfer rise animation (false under prefers-reduced-motion). */
export function shouldAnimateV3Transfer(
  reducedMotionPreference?: boolean | null,
): boolean {
  return shouldAnimateV3Waiting(reducedMotionPreference);
}

/**
 * After successful POST transfer: either animate (hold fill) or apply immediately.
 * Auto-transfer / GET paths never call this — no manual animation there.
 */
export function planV3ManualTransferSuccess(input: {
  kind: EconomyV3RootKind;
  holdRoot: EconomyV3RootState;
  pendingSnapshot: EconomyV3RootsState;
  reducedMotion?: boolean | null;
}):
  | { mode: "immediate"; snapshot: EconomyV3RootsState }
  | {
      mode: "animate";
      kind: EconomyV3RootKind;
      holdRoot: EconomyV3RootState;
      pendingSnapshot: EconomyV3RootsState;
      durationMs: number;
    } {
  if (!shouldAnimateV3Transfer(input.reducedMotion)) {
    return { mode: "immediate", snapshot: input.pendingSnapshot };
  }
  return {
    mode: "animate",
    kind: input.kind,
    holdRoot: input.holdRoot,
    pendingSnapshot: input.pendingSnapshot,
    durationMs: V3_TRANSFER_ANIM_MS,
  };
}

/**
 * Snapshot shown during the flight. Always the live props snapshot so reserves
 * and sibling roots do not jump ahead of the visual phase. The successful
 * server snapshot is held in transferring.pendingSnapshot and applied only
 * when onTransferred fires after the animation.
 */
export function resolveV3RootsDisplaySnapshot(
  live: EconomyV3RootsState,
  _transferring: Pick<V3TransferringState, "pendingSnapshot"> | null,
): EconomyV3RootsState {
  return live;
}

/** Hold pre-transfer fill on the animating root; others use display snapshot. */
export function resolveV3RootDisplayDuringTransfer(
  kind: EconomyV3RootKind,
  serverRoot: EconomyV3RootState,
  transferring: Pick<V3TransferringState, "kind" | "holdRoot"> | null,
): EconomyV3RootState {
  if (transferring?.kind === kind) return transferring.holdRoot;
  return serverRoot;
}

export function v3RootAriaLabel(
  kind: EconomyV3RootKind,
  _seconds?: number,
): string {
  return V3_ROOT_LABELS[kind];
}

/** Click allowed only when playable, not transferred, not busy, not Metelka-locked. */
export function canTransferV3Root(
  root: Pick<EconomyV3RootState, "playableFromRoot" | "transferred">,
  busy: boolean,
  transferLocked = false,
): boolean {
  return (
    transferLocked !== true &&
    root.playableFromRoot === true &&
    root.transferred === false &&
    busy !== true
  );
}

export function formatV3TransferError(err: unknown): string {
  const anyErr = err as { status?: number; message?: string; code?: string };
  const msg = anyErr?.message ? String(anyErr.message) : "transfer failed";
  if (anyErr?.code) return `${anyErr.code}: ${msg}`;
  if (anyErr?.status != null) return `HTTP ${anyErr.status}: ${msg}`;
  return msg;
}

export type PerformV3RootTransferResult =
  | { ok: true; root: EconomyV3RootKind; v3Roots: EconomyV3RootsState }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

/**
 * Shared transfer orchestration for preview clicks + unit tests.
 * Caller owns busy UI; this only gates and calls the API once.
 */
export async function performEconomyV3RootTransfer(input: {
  kind: EconomyV3RootKind;
  root: Pick<EconomyV3RootState, "playableFromRoot" | "transferred">;
  busyRoot: EconomyV3RootKind | null;
  transferEnabled: boolean;
  transferLocked?: boolean;
  transferFn?: (root: EconomyV3RootKind) => Promise<{ v3Roots: unknown }>;
}): Promise<PerformV3RootTransferResult> {
  if (!input.transferEnabled) return { ok: false, skipped: true };
  if (input.busyRoot != null) return { ok: false, skipped: true };
  if (!canTransferV3Root(input.root, false, input.transferLocked === true)) {
    return { ok: false, skipped: true };
  }
  const transferFn = input.transferFn ?? ((r) => api.transferV3Root(r));
  try {
    const res = await transferFn(input.kind);
    const normalized = normalizeEconomyV3RootsSnapshot(res.v3Roots);
    if (!normalized) {
      return {
        ok: false,
        skipped: false,
        error: "transfer response missing v3Roots",
      };
    }
    return { ok: true, root: input.kind, v3Roots: normalized };
  } catch (err) {
    return { ok: false, skipped: false, error: formatV3TransferError(err) };
  }
}

type Props = {
  v3Roots: EconomyV3RootsState | null | undefined;
  /** When true, playable roots can call transfer. */
  transferEnabled?: boolean;
  /**
   * Metelka obligation: gray non-interactive roots (careLocked SoT).
   * Does not hide columns — only color + clicks.
   */
  metelkaLocked?: boolean;
  /** Tutorial: only this root is clickable; others stay waiting/frozen. */
  tutorialHighlightRoot?: EconomyV3RootKind | null;
  /** Apply normalized server snapshot after success (+ optional animation). */
  onTransferred?: (v3Roots: EconomyV3RootsState) => void;
  /**
   * Override prefers-reduced-motion (tests). When omitted, reads matchMedia.
   * true = no waiting / transfer motion.
   */
  reducedMotion?: boolean | null;
  /** Test seam: override transfer API. */
  transferFn?: (root: EconomyV3RootKind) => Promise<{ v3Roots: unknown }>;
  /** Test seam: override animation duration (ms). */
  transferAnimMs?: number;
};

/** Neutral fill while Metelka blocks Care / root interaction. */
export const V3_ROOT_METELKA_LOCKED_FILL = "#8a847c";

function EconomyV3RootColumn({
  kind,
  root,
  effectivePresetSeconds,
  generating,
  cycleFrozen,
  waitingMotion,
  transferring,
  clickable,
  busy,
  pressed = false,
  tutorialPulse = false,
  metelkaLocked = false,
  onTransfer,
}: {
  kind: EconomyV3RootKind;
  root: EconomyV3RootState;
  /** Server effectivePresetSeconds — used for full/ready visual state, not segment height. */
  effectivePresetSeconds?: number | null;
  generating: boolean;
  cycleFrozen: boolean;
  waitingMotion: boolean;
  transferring: boolean;
  clickable: boolean;
  busy: boolean;
  pressed?: boolean;
  tutorialPulse?: boolean;
  metelkaLocked?: boolean;
  onTransfer: (kind: EconomyV3RootKind) => void;
}) {
  const visual = transferring
    ? "transferring"
    : resolveV3RootVisualState(
        root,
        generating,
        cycleFrozen,
        effectivePresetSeconds,
      );
  const fillColor = metelkaLocked
    ? V3_ROOT_METELKA_LOCKED_FILL
    : V3_ROOT_FILL_COLORS[kind];
  const className = [
    "v3-root",
    `v3-root--${kind}`,
    `v3-root--${visual}`,
    visual === "waiting" && waitingMotion && !metelkaLocked
      ? "v3-root--waiting-motion"
      : "",
    transferring ? "v3-root--transferring" : "",
    clickable ? "v3-root--clickable" : "v3-root--disabled",
    busy ? "v3-root--busy" : "",
    pressed ? "v3-root--press" : "",
    tutorialPulse && !metelkaLocked ? "v3-root--tutorial-pulse" : "",
    metelkaLocked ? "v3-root--metelka-locked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      data-v3-root={kind}
      data-v3-root-state={visual}
      data-v3-root-clickable={clickable ? "true" : "false"}
      data-v3-root-busy={busy ? "true" : "false"}
      data-v3-root-waiting={visual === "waiting" ? "true" : "false"}
      data-v3-root-transferring={transferring ? "true" : "false"}
      data-v3-root-tutorial-pulse={tutorialPulse ? "true" : "false"}
      data-v3-root-metelka-locked={metelkaLocked ? "true" : "false"}
      aria-label={v3RootAriaLabel(kind, root.seconds)}
      aria-disabled={!clickable}
      disabled={!clickable}
      onClick={() => {
        if (!clickable || metelkaLocked) return;
        onTransfer(kind);
      }}
    >
      <div className="v3-root-trajectory" data-v3-root-trajectory={kind}>
        <div className="v3-root-segments" data-v3-segments={kind}>
          {Array.from({ length: V3_SEGMENT_COUNT }, (_, i) => {
            const fill = v3SegmentFillForDisplay(
              i,
              root,
              effectivePresetSeconds,
            );
            const segState =
              fill >= 1 ? "full" : fill > 0 ? "partial" : "empty";
            const fillPct = (fill * 100).toFixed(2);
            return (
              <div
                key={i}
                className={`v3-root-segment v3-root-segment--${segState}`}
                data-v3-segment={i}
                data-segment-index={i}
                data-v3-segment-fill={fill.toFixed(2)}
                data-segment-fill={`${fillPct}%`}
                data-v3-segment-state={segState}
                style={
                  fill > 0
                    ? ({
                        ["--v3-seg-fill" as string]: `${fillPct}%`,
                        ["--v3-seg-color" as string]: fillColor,
                      } as CSSProperties)
                    : undefined
                }
              />
            );
          })}
          {transferring ? (
            <div
              className="v3-root-transfer-channel"
              data-v3-transfer-channel={kind}
              aria-hidden="true"
            >
              <span
                className="v3-root-transfer-energy"
                style={{ background: fillColor }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/**
 * Three v3 roots under the tree. Safe with null snapshot (renders nothing).
 * When transferEnabled, playable roots call api.transferV3Root.
 * Waiting/frozen visuals come only from server `generation.frozenAt`.
 * Manual transfer animation is transient React state only (not persisted).
 */
export default function EconomyV3RootSystem({
  v3Roots,
  transferEnabled = false,
  metelkaLocked = false,
  tutorialHighlightRoot = null,
  onTransferred,
  reducedMotion,
  transferFn,
  transferAnimMs = V3_TRANSFER_ANIM_MS,
}: Props) {
  const transferLocked =
    v3Roots?.metelkaCycle?.transferLocked === true || metelkaLocked === true;
  const [busyRoot, setBusyRoot] = useState<EconomyV3RootKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pressKind, setPressKind] = useState<EconomyV3RootKind | null>(null);
  const [transferring, setTransferring] = useState<V3TransferringState | null>(
    null,
  );
  const busyRef = useRef<EconomyV3RootKind | null>(null);
  const transferringRef = useRef<V3TransferringState | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const committedKeyRef = useRef<string | null>(null);
  const onTransferredRef = useRef(onTransferred);
  onTransferredRef.current = onTransferred;

  function commitPendingTransfer(pending: V3TransferringState | null) {
    const result = commitV3TransferPendingOnce({
      pending,
      committedKey: committedKeyRef.current,
      onPulse: (kind) => pulseV3ActivityReceive(kind),
      onTransferred: (snap) => onTransferredRef.current?.(snap),
    });
    if (result.nextKey) committedKeyRef.current = result.nextKey;
    return result.committed;
  }

  useEffect(() => {
    return () => {
      if (pressTimerRef.current != null) {
        window.clearTimeout(pressTimerRef.current);
      }
      // Unmount mid-flight: flush pending so parent stays consistent with server.
      const pending = transferringRef.current;
      if (pending) {
        transferringRef.current = null;
        commitPendingTransfer(pending);
        busyRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only flush
  }, []);

  useEffect(() => {
    transferringRef.current = transferring;
    if (!transferring) return;
    // Commit server snapshot only after the visual flight finishes.
    // Pending snapshot is never merged into display earlier (reserves stay live).
    const timer = window.setTimeout(() => {
      const pending = transferringRef.current;
      transferringRef.current = null;
      if (pending) {
        // Apply-then-unlock: parent gets SoT before clicks reopen.
        commitPendingTransfer(pending);
      }
      busyRef.current = null;
      setBusyRoot(null);
      setTransferring(null);
    }, transferAnimMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit helper is stable via refs
  }, [transferring, transferAnimMs]);

  if (!v3Roots || v3Roots.enabled !== true) {
    return null;
  }

  const displaySnapshot = resolveV3RootsDisplaySnapshot(v3Roots, transferring);
  const cycleFrozen = displaySnapshot.generation.frozenAt != null;
  // Variant B: freeze does not pause the generation clock — only accumulating matters.
  const generating = displaySnapshot.generation.accumulating === true;
  const waitingMotion = shouldAnimateV3Waiting(reducedMotion);
  const uiLocked = busyRoot != null || transferring != null;
  const effectivePresetSeconds =
    displaySnapshot.effectivePresetSeconds ??
    displaySnapshot.roots.water.capacitySeconds ??
    null;

  async function handleTransfer(kind: EconomyV3RootKind) {
    const root = v3Roots!.roots[kind];
    if (!transferEnabled || metelkaLocked) return;
    if (busyRef.current != null || transferringRef.current != null) return;
    if (!canTransferV3Root(root, false, transferLocked)) return;

    const holdRoot: EconomyV3RootState = { ...root };
    // Immediate press feedback + hard lock against double-click / re-entry.
    busyRef.current = kind;
    setBusyRoot(kind);
    setPressKind(kind);
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
    }
    pressTimerRef.current = window.setTimeout(() => {
      setPressKind((prev) => (prev === kind ? null : prev));
      pressTimerRef.current = null;
    }, 180);
    setError(null);

    const result = await performEconomyV3RootTransfer({
      kind,
      root,
      busyRoot: null,
      transferEnabled: true,
      transferLocked,
      transferFn,
    });

    if (!result.ok) {
      // Rollback visual lock — root stays on previous live snapshot.
      busyRef.current = null;
      setBusyRoot(null);
      setPressKind(null);
      if (!result.skipped) {
        setError(result.error);
      }
      return;
    }

    const plan = planV3ManualTransferSuccess({
      kind,
      holdRoot,
      pendingSnapshot: result.v3Roots,
      reducedMotion,
    });

    if (plan.mode === "immediate") {
      // prefers-reduced-motion: short state transition, no flying particles.
      commitPendingTransfer({
        kind,
        holdRoot,
        pendingSnapshot: plan.snapshot,
      });
      busyRef.current = null;
      setBusyRoot(null);
      return;
    }

    const next: V3TransferringState = {
      kind: plan.kind,
      holdRoot: plan.holdRoot,
      pendingSnapshot: plan.pendingSnapshot,
    };
    transferringRef.current = next;
    setTransferring(next);
  }

  return (
    <div
      className={[
        "v3-root-system",
        metelkaLocked ? "v3-root-system--metelka-locked" : "",
        metelkaLocked ? "roots--metelka-locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-v3-root-system="true"
      data-v3-transfer-enabled={transferEnabled && !metelkaLocked ? "true" : "false"}
      data-v3-cycle-frozen={cycleFrozen ? "true" : "false"}
      data-v3-transferring={transferring ? transferring.kind : "false"}
      data-v3-roots-metelka-locked={metelkaLocked ? "true" : "false"}
    >
      <div className="v3-root-system-row">
        {V3_ROOT_KINDS.map((kind) => {
          const serverRoot = displaySnapshot.roots[kind];
          const root = resolveV3RootDisplayDuringTransfer(
            kind,
            serverRoot,
            transferring,
          );
          const isTransferring = transferring?.kind === kind;
          const busy = busyRoot === kind || isTransferring;
          const tutorialAllows =
            tutorialHighlightRoot == null || tutorialHighlightRoot === kind;
          const clickable =
            !metelkaLocked &&
            transferEnabled &&
            tutorialAllows &&
            !uiLocked &&
            canTransferV3Root(serverRoot, false, transferLocked) &&
            !isTransferring;
          const tutorialPulse =
            tutorialHighlightRoot === kind && clickable;
          return (
            <EconomyV3RootColumn
              key={kind}
              kind={kind}
              root={root}
              effectivePresetSeconds={effectivePresetSeconds}
              generating={generating}
              cycleFrozen={cycleFrozen}
              waitingMotion={waitingMotion}
              transferring={isTransferring}
              clickable={clickable}
              busy={busy || uiLocked}
              pressed={pressKind === kind}
              tutorialPulse={tutorialPulse}
              metelkaLocked={metelkaLocked}
              onTransfer={(k) => {
                void handleTransfer(k);
              }}
            />
          );
        })}
      </div>
      {transferring ? (
        <V3TransferFlight
          kind={transferring.kind}
          durationMs={V3_TRANSFER_FLIGHT_MS}
        />
      ) : null}
      {error && (
        <div className="v3-root-transfer-error" data-v3-transfer-error="true">
          {error}
        </div>
      )}
    </div>
  );
}
