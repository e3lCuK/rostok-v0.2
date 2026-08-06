/**
 * Client refresh gates for Economy v3 roots.
 * Does not invent economy — only decides when to re-fetch server SoT.
 */

import type { EconomyV3RootsState } from "@/lib/api";

export type V3RootsRefreshDecision = {
  refresh: boolean;
  reason: "none" | "insurance-elapsed" | "accumulating";
};

/**
 * Whether the client should re-fetch /game/state so waiting/generate stay
 * aligned with server time (insurance unfreeze, accumulating ticks).
 */
export function shouldRefreshV3RootsFromClock(
  v3Roots: EconomyV3RootsState | null | undefined,
  nowMs: number,
  lastRefreshAtMs = 0,
): V3RootsRefreshDecision {
  if (!v3Roots || v3Roots.enabled !== true) {
    return { refresh: false, reason: "none" };
  }
  const gen = v3Roots.generation;
  if (!gen) return { refresh: false, reason: "none" };

  const since = Math.max(0, nowMs - lastRefreshAtMs);

  if (gen.frozenAt != null && gen.insuranceDeadlineAt) {
    const deadline = Date.parse(gen.insuranceDeadlineAt);
    if (Number.isFinite(deadline) && deadline <= nowMs && since >= 2000) {
      return { refresh: true, reason: "insurance-elapsed" };
    }
  }

  if (
    gen.accumulating === true &&
    gen.frozenAt == null &&
    since >= 5000
  ) {
    return { refresh: true, reason: "accumulating" };
  }

  return { refresh: false, reason: "none" };
}

/** After a transfer commit, excess may need a fresh getState (ordinaryFull flip). */
export function shouldRefreshV3ExcessAfterTransfer(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return v3Roots?.excessGate?.ordinaryFull === true;
}
