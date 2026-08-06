import type { EconomyV2ExcessState, EconomyV3RootsState } from "@/lib/api";
import { isExcessCleaningMode } from "@/lib/excessCleaningCountdown";
import { isExcessResultAvailable } from "@/lib/excessResultUi";
import { shouldShowMetelkaCardWithV3Gate } from "@/lib/v3MetelkaUi";

export type CareActivityCompletedFlags = {
  water: boolean;
  sun: boolean;
  fertilizer: boolean;
};

/** True when Полив + Солнце + Удобрение are all done. */
export function allActivitiesDone(
  completed: CareActivityCompletedFlags | null | undefined,
): boolean {
  if (!completed) return false;
  return !!(completed.water && completed.sun && completed.fertilizer);
}

/**
 * Post-activities Care phase: trio finished, shovel «Уход» should appear
 * (or is animating in). Independent of Metelka / excess.
 */
export function isWaitingForCareShovel(input: {
  allActivitiesDone: boolean;
  showCompletionStage: boolean;
  showCareButton: boolean;
  showActivityGhost: boolean;
}): boolean {
  if (input.showCareButton || input.showCompletionStage || input.showActivityGhost) {
    return true;
  }
  return input.allActivitiesDone;
}

/** When the shovel «Уход» itself should render (after merge animation). */
export function shouldShowCareShovelButton(input: {
  showCareButton: boolean;
  showRewards: boolean;
}): boolean {
  return input.showCareButton && !input.showRewards;
}

/**
 * Active ordinary Care cycle (including all-done awaiting shovel) must beat Metelka.
 * Accumulated excess alone must not interrupt this cycle.
 */
export function careCycleBlocksMetelka(input: {
  careInProgress: boolean;
  allActivitiesDone: boolean;
  showCompletionStage: boolean;
  showCareButton: boolean;
  showActivityGhost: boolean;
  /** Unclaimed Care pending — claim via «Уход», not Metelka. */
  hasUnclaimedPending: boolean;
}): boolean {
  if (input.careInProgress || input.allActivitiesDone) return true;
  if (
    input.showCompletionStage ||
    input.showCareButton ||
    input.showActivityGhost
  ) {
    return true;
  }
  if (input.hasUnclaimedPending) return true;
  return false;
}

function excessAvailableForMetelka(
  excess?: EconomyV2ExcessState | null,
  v3Roots?: EconomyV3RootsState | null,
): boolean {
  return shouldShowMetelkaCardWithV3Gate({ excess, v3Roots });
}

export type CareReadyRowMode =
  | "care"
  | "metelka"
  | "cleaning"
  | "result";

/**
 * Ready-row (`CareActionsRow`) mode. Metelka only when Care is not mid-cycle
 * and not waiting for «Уход». With v3 enabled, also requires roots-full cycle.
 */
export function resolveCareReadyRowMode(input: {
  excess?: EconomyV2ExcessState | null;
  careBlocksMetelka: boolean;
  v3Roots?: EconomyV3RootsState | null;
}): CareReadyRowMode {
  const { excess, careBlocksMetelka, v3Roots } = input;
  if (isExcessResultAvailable(excess)) return "result";
  if (isExcessCleaningMode(excess)) return "cleaning";
  if (careBlocksMetelka) return "care";
  if (excessAvailableForMetelka(excess, v3Roots)) return "metelka";
  return "care";
}

/**
 * Leave post-care chrome only after the rewards flow started (`showRewards`),
 * once pending is cleared. Do NOT exit merely because pending is 0 when
 * `showCompletionStage` opens (short income window can yield 0₽) — that was
 * wiping «Уход» and letting Metelka steal the row.
 */
export function shouldExitPostCareUi(input: {
  tutorialDone: boolean;
  pendingBase: number;
  pendingBonus: number;
  showCompletionStage: boolean;
  showActivityGhost: boolean;
  showCareButton: boolean;
  showRewards: boolean;
}): boolean {
  if (!input.tutorialDone) return false;
  if (input.pendingBase !== 0 || input.pendingBonus !== 0) return false;
  if (!input.showRewards) return false;
  return (
    input.showCompletionStage ||
    input.showActivityGhost ||
    input.showCareButton ||
    input.showRewards
  );
}

/** F5: restore shovel path whenever the cycle is fully done (even if 0 pending). */
export function shouldRestoreCareShovelOnRecovery(input: {
  allCompleted: boolean;
  hasUnclaimedPending: boolean;
}): boolean {
  return input.allCompleted || input.hasUnclaimedPending;
}
