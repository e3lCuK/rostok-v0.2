import { allActivitiesDone, type CareActivityCompletedFlags } from "./careSessionActionsUi";
import type {
  CareActivityFillKey,
  CareActivityFillMap,
  CareDisplayFillMap,
} from "./careActivityResultFill";

/**
 * Unidirectional Care actions chrome (pre-«Уход»).
 * Never regress to `activities` for the same cycle except via `reset`.
 *
 * Live path after third minigame:
 *   all_done → activities_completed → (third fill presented) → hold
 *   → care_transition → care_button
 * `all_done` / `allCompleted` must NEVER jump straight to `care_button`.
 */
export type CareActionsPhase =
  | "activities"
  | "activities_completed"
  | "care_transition"
  | "care_button";

export type CarePhaseEvent =
  | { type: "activity_progress"; completed: CareActivityCompletedFlags }
  | { type: "all_done" }
  | { type: "start_transition" }
  | { type: "transition_finished" }
  /** Only for reduced-motion after trio was presented, or explicit skip — not from all_done. */
  | { type: "restore_shovel" }
  | { type: "reset" };

/** Must match CSS `--care-fill-duration`. Fallback if transitionend is missed. */
export const CARE_FILL_ANIMATION_MS = 900;

/** Hold after third fill is presented, before converge. */
export const CARE_RESULT_HOLD_MS = 300;

/** CSS converge duration (ms) — match `--care-converge-duration`. */
export const CARE_TO_SHOVEL_MS = 350;

const PHASE_RANK: Record<CareActionsPhase, number> = {
  activities: 0,
  activities_completed: 1,
  care_transition: 2,
  care_button: 3,
};

export function carePhaseAtLeast(
  phase: CareActionsPhase,
  min: CareActionsPhase,
): boolean {
  return PHASE_RANK[phase] >= PHASE_RANK[min];
}

export function reduceCareActionsPhase(
  phase: CareActionsPhase,
  event: CarePhaseEvent,
): CareActionsPhase {
  switch (event.type) {
    case "reset":
      return "activities";
    case "restore_shovel":
      return "care_button";
    case "all_done": {
      // Always land on activities_completed — never skip to care_button.
      if (carePhaseAtLeast(phase, "activities_completed")) return phase;
      return "activities_completed";
    }
    case "activity_progress": {
      if (carePhaseAtLeast(phase, "activities_completed")) return phase;
      if (allActivitiesDone(event.completed)) return "activities_completed";
      return "activities";
    }
    case "start_transition": {
      if (phase === "activities_completed") return "care_transition";
      return phase;
    }
    case "transition_finished": {
      if (phase === "care_transition") return "care_button";
      return phase;
    }
    default:
      return phase;
  }
}

export function carePhaseKeepsSessionBranch(phase: CareActionsPhase): boolean {
  return phase !== "activities";
}

export function carePhaseShowsShovel(phase: CareActionsPhase): boolean {
  return phase === "care_button";
}

export function carePhaseShowsCompletedTrio(phase: CareActionsPhase): boolean {
  return (
    phase === "activities_completed" ||
    phase === "care_transition" ||
    phase === "activities"
  );
}

export function carePhaseIsConverging(phase: CareActionsPhase): boolean {
  return phase === "care_transition";
}

/** Gate: do not start converge until third (last) result was shown on its cube. */
export function shouldStartCareTransition(input: {
  phase: CareActionsPhase;
  allResultsPresented: boolean;
}): boolean {
  return (
    input.phase === "activities_completed" && input.allResultsPresented === true
  );
}

export function areDisplayFillsAtTargets(
  display: CareDisplayFillMap,
  targets: CareActivityFillMap,
): boolean {
  return (["water", "sun", "fertilizer"] as const).every(
    (k) => display[k] === (targets[k] ?? 0),
  );
}

/**
 * On activities_completed: keep 1st/2nd at targets; force last-completed cube to 0
 * so its CSS height transition can run 0% → target%.
 */
export function displayFillsForCompletedReveal(input: {
  targets: CareActivityFillMap;
  lastCompleted: CareActivityFillKey;
  /** Instant final heights (F5 / reduced-motion). */
  skipAnimation?: boolean;
}): CareDisplayFillMap {
  const base: CareDisplayFillMap = {
    water: input.targets.water ?? 0,
    sun: input.targets.sun ?? 0,
    fertilizer: input.targets.fertilizer ?? 0,
  };
  if (input.skipAnimation) return base;
  return { ...base, [input.lastCompleted]: 0 };
}

export function initialCareActionsPhase(input: {
  hasUnclaimedPending: boolean;
  midCare: boolean;
  allCompleted: boolean;
}): CareActionsPhase {
  if (input.midCare && !input.allCompleted) return "activities";
  if (input.allCompleted || input.hasUnclaimedPending) {
    return "activities_completed";
  }
  return "activities";
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** @deprecated use shouldStartCareTransition + hold; kept for older timing tests */
export function careCompletedToTransitionDelayMs(input?: {
  reducedMotion?: boolean;
  skipFillAnimation?: boolean;
}): number {
  if (input?.reducedMotion) return CARE_RESULT_HOLD_MS;
  if (input?.skipFillAnimation) return CARE_RESULT_HOLD_MS;
  return CARE_FILL_ANIMATION_MS + CARE_RESULT_HOLD_MS;
}
