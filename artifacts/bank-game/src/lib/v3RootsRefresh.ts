/**
 * Client refresh gates for Economy v3 roots.
 * Does not invent economy — only decides when to re-fetch server SoT.
 */

import type { EconomyV3RootsState } from "@/lib/api";
import { isV3SharedPoolEnergyAtMaximum } from "@/lib/v3Roots";

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

  // Keep settling while energy is at shared-pool max (excess minting), even
  // during transfer-freeze — otherwise financial time stays 0 until F5.
  if (
    (gen.accumulating === true ||
      v3Roots.excessGate?.generatingExcess === true ||
      isV3SharedPoolEnergyAtMaximum(v3Roots)) &&
    since >= 5000
  ) {
    return { refresh: true, reason: "accumulating" };
  }

  return { refresh: false, reason: "none" };
}

/**
 * After a transfer commit, excess / financial time may need a fresh getState.
 * ordinaryFull alone is too narrow — energy on buttons also starts excess.
 */
export function shouldRefreshV3ExcessAfterTransfer(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!v3Roots || v3Roots.enabled !== true) return false;
  if (v3Roots.excessGate?.ordinaryFull === true) return true;
  if (v3Roots.excessGate?.generatingExcess === true) return true;
  return isV3SharedPoolEnergyAtMaximum(v3Roots);
}
