/**
 * Frontend Metelka visibility for Economy v3.
 * Gate is excessAvailable only — independent of roots / transfer.
 */

import type {
  EconomyV2ExcessState,
  EconomyV3RootsState,
} from "@/lib/api";
import { isExcessResultAvailable } from "@/lib/excessResultUi";
import {
  careBlockedByMetelka as careBlockedByMetelkaFromCare,
  isV3CareSessionBlocking,
  shouldAcknowledgeV3CareCycle,
  shouldShowV3CareShovel,
  shouldShowV3RewardPreview,
} from "@/lib/v3CareClient";

export {
  careBlockedByMetelka,
  CARE_BLOCKED_BY_METELKA_HINT,
} from "@/lib/v3CareClient";

/** True when live v3 snapshot owns Care exclusivity helpers. */
export function isV3MetelkaGateActive(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return v3Roots?.enabled === true;
}

/**
 * @deprecated Excess gate no longer uses rootsFull — kept for call-site compat.
 */
export function isV3RootsFullForMetelka(
  _v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return true;
}

/** @deprecated Use excessAvailable — ordinaryFull / rootsFull are not Metelka gates. */
export function isV3OrdinaryFullForMetelka(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return isV3RootsFullForMetelka(v3Roots);
}

/**
 * Base Metelka-card checks from excess snapshot.
 * Active session / pending result hide the card (cleaning UI takes over).
 */
export function excessSnapshotAllowsMetelkaCard(
  excess?: EconomyV2ExcessState | null,
): boolean {
  if (!excess) return false;
  if (excess.session?.active === true) return false;
  if (isExcessResultAvailable(excess)) return false;
  return excess.excessAvailable === true;
}

/**
 * Show Metelka start card when excessAvailable (v2 and v3).
 * Care mid-cycle can still steal the row via v3CareBlocksMetelka.
 */
export function shouldShowMetelkaCardWithV3Gate(input: {
  excess?: EconomyV2ExcessState | null;
  v3Roots?: EconomyV3RootsState | null;
}): boolean {
  return excessSnapshotAllowsMetelkaCard(input.excess);
}

/**
 * Unfinished v3 Care (activity session or cycle ready/finished/claimed)
 * always beats Metelka card. Does not hide an already-active Metelka session
 * (that is handled by cleaning/result row modes).
 */
export function v3CareBlocksMetelka(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!isV3MetelkaGateActive(v3Roots)) return false;
  if (isV3CareSessionBlocking(v3Roots)) return true;
  if (shouldShowV3CareShovel(v3Roots)) return true;
  if (shouldShowV3RewardPreview(v3Roots)) return true;
  if (shouldAcknowledgeV3CareCycle(v3Roots)) return true;

  const cycle = v3Roots!.careCycle;
  if (!cycle) return false;
  if (cycle.status === "ready" || cycle.status === "finished") return true;
  if (cycle.readyToFinish === true) return true;
  if (cycle.status === "in_progress") {
    const acts = cycle.activities;
    if (
      acts?.water?.completed === true ||
      acts?.sun?.completed === true ||
      acts?.fertilizer?.completed === true
    ) {
      return true;
    }
    if (cycle.startedAt != null && String(cycle.startedAt).length > 0) {
      return true;
    }
  }
  return false;
}

/** Server says root transfer is locked (active/pending Metelka only). */
export function isV3RootTransferLocked(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return v3Roots?.metelkaCycle?.transferLocked === true;
}

/** @deprecated Prefer {@link careBlockedByMetelka}. */
export function isV3CareLockedByMetelkaCycle(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return careBlockedByMetelkaFromCare({ v3Roots });
}
