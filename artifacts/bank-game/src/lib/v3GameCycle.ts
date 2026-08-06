/**
 * Economy v3 exclusive game-cycle gate.
 *
 * When `game.v3Roots.enabled === true`, the live Care / session cycle is v3-only.
 * Economy v2 Care + v1 session APIs remain as fallback when the flag is off.
 */

import type { EconomyV3RootsState } from "@/lib/api";
import {
  isV3CareSessionBlocking,
  shouldAcknowledgeV3CareCycle,
  shouldShowV3CareShovel,
  shouldShowV3RewardPreview,
} from "@/lib/v3CareClient";

/** Single source of truth: server snapshot owns the live game cycle. */
export function isEconomyV3GameCycleEnabled(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return v3Roots?.enabled === true;
}

/**
 * Mid-care / shovel / claim UI that should suppress streak widgets etc.
 * Reads only v3 careSession + careCycle — never v1 sessionInProgress / v2Care.
 */
export function isV3CareUiBusy(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!isEconomyV3GameCycleEnabled(v3Roots)) return false;
  if (isV3CareSessionBlocking(v3Roots)) return true;
  if (shouldShowV3CareShovel(v3Roots)) return true;
  if (shouldShowV3RewardPreview(v3Roots)) return true;
  if (shouldAcknowledgeV3CareCycle(v3Roots)) return true;
  const cycle = v3Roots!.careCycle;
  if (!cycle) return false;
  if (cycle.status === "in_progress" || cycle.status === "ready") return true;
  if (cycle.status === "finished") return true;
  if (cycle.readyToFinish === true) return true;
  return false;
}

/**
 * Whether legacy v2 Care / v1 session helpers may run.
 * Always false when v3 owns the cycle.
 */
export function mayUseLegacyCareSessionFlow(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return !isEconomyV3GameCycleEnabled(v3Roots);
}
