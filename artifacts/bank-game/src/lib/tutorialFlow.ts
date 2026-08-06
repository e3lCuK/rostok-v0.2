/**
 * Tutorial Care flow.
 * Legacy path: local minigames only (isolated from Economy v2 energy).
 * V3 path: collect all three roots → then Care activities → finish/claim/ack.
 */

import type {
  EconomyV3RootKind,
  EconomyV3RootsState,
} from "@/lib/api";
import {
  isV3CareSessionBlocking,
  shouldAcknowledgeV3CareCycle,
  shouldShowV3CareShovel,
  shouldShowV3RewardPreview,
} from "@/lib/v3CareClient";

/** Legacy local minigame duration (v3 uses server session preset). */
export const TUTORIAL_ACTIVITY_DURATION_SEC = 10;

/** Matches server V3_TUTORIAL_ROOT_SECONDS / one segment. */
export const TUTORIAL_V3_ROOT_SECONDS = 5;

export type TutorialStep =
  | "welcome"
  | "intro"
  | "v3-root-water"
  | "v3-root-sun"
  | "v3-root-fertilizer"
  | "v3-activities-intro"
  | "water"
  | "sun-intro"
  | "sun"
  | "fertilizer-intro"
  | "fertilizer"
  | "complete"
  | null;

export const V3_TUTORIAL_ROOT_ORDER: EconomyV3RootKind[] = [
  "water",
  "sun",
  "fertilizer",
];

export function isV3TutorialRootStep(
  step: TutorialStep,
): step is "v3-root-water" | "v3-root-sun" | "v3-root-fertilizer" {
  return (
    step === "v3-root-water" ||
    step === "v3-root-sun" ||
    step === "v3-root-fertilizer"
  );
}

export function tutorialHighlightRoot(
  step: TutorialStep,
): EconomyV3RootKind | null {
  if (step === "v3-root-water") return "water";
  if (step === "v3-root-sun") return "sun";
  if (step === "v3-root-fertilizer") return "fertilizer";
  return null;
}

export function tutorialRootStepForKind(
  kind: EconomyV3RootKind,
): TutorialStep {
  if (kind === "water") return "v3-root-water";
  if (kind === "sun") return "v3-root-sun";
  return "v3-root-fertilizer";
}

/**
 * After a root transfer: next root, or activities once all three are done.
 * Water → Sun → Fertilizer → activities-intro.
 */
export function nextV3TutorialStepAfterRootTransfer(
  kind: EconomyV3RootKind,
): TutorialStep {
  if (kind === "water") return "v3-root-sun";
  if (kind === "sun") return "v3-root-fertilizer";
  return "v3-activities-intro";
}

/** @deprecated use {@link nextV3TutorialStepAfterRootTransfer} */
export function nextV3TutorialRootStep(
  kind: EconomyV3RootKind,
): TutorialStep {
  return nextV3TutorialStepAfterRootTransfer(kind);
}

export type V3TutorialActivitiesCompleted = {
  water: boolean;
  sun: boolean;
  fertilizer: boolean;
};

/** Source of truth: careCycle.activities.*.completed */
export function getV3CareActivitiesCompleted(
  v3Roots: EconomyV3RootsState | null | undefined,
): V3TutorialActivitiesCompleted {
  const acts = v3Roots?.careCycle?.activities;
  return {
    water: acts?.water?.completed === true,
    sun: acts?.sun?.completed === true,
    fertilizer: acts?.fertilizer?.completed === true,
  };
}

export function areAllV3CareActivitiesCompleted(
  completed: V3TutorialActivitiesCompleted,
): boolean {
  return completed.water && completed.sun && completed.fertilizer;
}

/**
 * Soft recommendation pulse only (Water → Sun → Fertilizer among remaining).
 * Must never gate clicks / disabled.
 */
export function tutorialRecommendedV3Activity(
  completed: V3TutorialActivitiesCompleted,
): EconomyV3RootKind | null {
  for (const kind of V3_TUTORIAL_ROOT_ORDER) {
    if (!completed[kind]) return kind;
  }
  return null;
}

/**
 * Activity-phase step from completed set (any order).
 * Stay on activities until all three Care activities are done → complete.
 */
export function nextV3TutorialStepFromCompletedActivities(
  completed: V3TutorialActivitiesCompleted,
): TutorialStep {
  if (areAllV3CareActivitiesCompleted(completed)) return "complete";
  return "v3-activities-intro";
}

/**
 * After finishing a Care activity: derive next step from the completed set.
 * Pass the post-ack snapshot (or explicit completed flags). The finished
 * `kind` alone is not enough — order is free.
 */
export function nextV3TutorialStepAfterActivity(
  kindOrCompleted: EconomyV3RootKind | V3TutorialActivitiesCompleted,
  completedFromSnapshot?: V3TutorialActivitiesCompleted,
): TutorialStep {
  if (typeof kindOrCompleted === "object") {
    return nextV3TutorialStepFromCompletedActivities(kindOrCompleted);
  }
  if (completedFromSnapshot) {
    return nextV3TutorialStepFromCompletedActivities({
      ...completedFromSnapshot,
      [kindOrCompleted]: true,
    });
  }
  // Without a completed set we cannot infer remaining activities — stay in phase.
  return "v3-activities-intro";
}

/** True while tutorial should run live v3 Care (not local-only minigames). */
export function isV3TutorialLiveCareStep(step: TutorialStep): boolean {
  return (
    step === "v3-activities-intro" ||
    step === "water" ||
    step === "sun-intro" ||
    step === "sun" ||
    step === "fertilizer-intro" ||
    step === "fertilizer" ||
    step === "complete"
  );
}

/**
 * Welcome / intro / root-teaching: activity icons stay grey & non-interactive
 * until all three roots have been collected.
 */
export function isV3TutorialActivitiesInteractionLocked(
  step: TutorialStep,
  tutorialDone: boolean,
): boolean {
  if (tutorialDone) return false;
  if (step == null) return false;
  return (
    step === "welcome" ||
    step === "intro" ||
    isV3TutorialRootStep(step)
  );
}

function reserveSeconds(
  v3Roots: EconomyV3RootsState,
  kind: EconomyV3RootKind,
): number {
  return Math.max(0, Math.floor(Number(v3Roots.reserves?.[kind]?.seconds) || 0));
}

function rootSeconds(
  v3Roots: EconomyV3RootsState,
  kind: EconomyV3RootKind,
): number {
  return Math.max(0, Math.floor(Number(v3Roots.roots?.[kind]?.seconds) || 0));
}

function isTransferred(
  v3Roots: EconomyV3RootsState,
  kind: EconomyV3RootKind,
): boolean {
  if (v3Roots.roots?.[kind]?.transferred === true) return true;
  const list = v3Roots.generation?.transferredRoots ?? [];
  return list.includes(kind);
}

/** True when each activity has a playable tutorial reserve (or was transferred). */
export function areV3TutorialAllReservesReady(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!v3Roots || v3Roots.enabled !== true) return false;
  return V3_TUTORIAL_ROOT_ORDER.every((kind) => {
    const res = reserveSeconds(v3Roots, kind);
    if (res >= TUTORIAL_V3_ROOT_SECONDS) return true;
    // Transferred with any remaining reserve still counts as "collected".
    return isTransferred(v3Roots, kind) && res > 0;
  });
}

/**
 * Derive durable tutorial step from server v3 snapshot (F5 recovery).
 * Critical progress must not live only in React state.
 *
 * Sequence: all three roots → then three Care activities → reward.
 */
export function resolveV3TutorialStepFromServer(input: {
  tutorialDone: boolean;
  v3Roots: EconomyV3RootsState | null | undefined;
}): TutorialStep {
  if (input.tutorialDone) return null;
  const snap = input.v3Roots;
  if (!snap || snap.enabled !== true) return "welcome";

  if (shouldAcknowledgeV3CareCycle(snap)) return "complete";
  if (shouldShowV3RewardPreview(snap)) return "complete";
  if (shouldShowV3CareShovel(snap)) return "complete";

  const session = snap.careSession;
  if (session?.activity && isV3CareSessionBlocking(snap)) {
    const act = session.activity;
    if (act === "water") return "water";
    if (act === "sun") return "sun";
    if (act === "fertilizer") return "fertilizer";
  }

  // Activity phase: free order — step from completed set, not last activity.
  const completed = getV3CareActivitiesCompleted(snap);
  if (areAllV3CareActivitiesCompleted(completed)) return "complete";

  const waterRes = reserveSeconds(snap, "water");
  const sunRes = reserveSeconds(snap, "sun");
  const fertRes = reserveSeconds(snap, "fertilizer");

  const waterDone = isTransferred(snap, "water") || waterRes > 0;
  const sunDone = isTransferred(snap, "sun") || sunRes > 0;
  const fertDone = isTransferred(snap, "fertilizer") || fertRes > 0;

  const allReservesReady = areV3TutorialAllReservesReady(snap);
  const anyActivityDone =
    completed.water || completed.sun || completed.fertilizer;

  if (allReservesReady || anyActivityDone || snap.careCycle?.startedAt) {
    // Roots collected (or mid-cycle): remaining Care activities in any order.
    return "v3-activities-intro";
  }

  // Root teaching: Water → Sun → Fertilizer (activities stay locked).
  if (waterDone && sunDone && !fertDone) return "v3-root-fertilizer";
  if (waterDone && !sunDone) return "v3-root-sun";
  if (!waterDone) {
    if (rootSeconds(snap, "water") >= 1) return "v3-root-water";
    return "welcome";
  }

  return "v3-activities-intro";
}

/** After welcome, v3 goes to roots intro; legacy stays on activity intro. */
export function tutorialStepAfterWelcome(useV3: boolean): TutorialStep {
  return useV3 ? "intro" : "intro";
}

/** Icon key for activity intro card (rendered in GamePage). */
export type V3TutorialOverlayIcon = "water" | "sun" | "fertilizer";

export type V3TutorialOverlayConfig = {
  icon: V3TutorialOverlayIcon;
  text: string;
  hint: string;
};

/** Per-activity intro copy — matches the recommended/pulsed Care button. */
export function v3TutorialActivityOverlayForKind(
  kind: EconomyV3RootKind,
): V3TutorialOverlayConfig {
  if (kind === "sun") {
    return {
      icon: "sun",
      text: "Пройдите активность",
      hint: "Собирайте солнечные лучи.",
    };
  }
  if (kind === "fertilizer") {
    return {
      icon: "fertilizer",
      text: "Пройдите активность",
      hint: "Собирайте гранулы в ряд.",
    };
  }
  return {
    icon: "water",
    text: "Пройдите активность",
    hint: "Ловите капли воды.",
  };
}

/**
 * Overlay cards for Care activity intros only.
 * Root-collection steps use root pulse alone — no white card / icon / copy.
 * For `v3-activities-intro`, pass `recommendedActivity` (same as button pulse).
 */
export function v3TutorialOverlayConfig(
  step: TutorialStep,
  options?: { recommendedActivity?: EconomyV3RootKind | null },
): V3TutorialOverlayConfig | null {
  switch (step) {
    case "intro":
    case "v3-root-water":
    case "v3-root-sun":
    case "v3-root-fertilizer":
      return null;
    case "v3-activities-intro":
      return v3TutorialActivityOverlayForKind(
        options?.recommendedActivity ?? "water",
      );
    case "sun-intro":
      return v3TutorialActivityOverlayForKind("sun");
    case "fertilizer-intro":
      return v3TutorialActivityOverlayForKind("fertilizer");
    default:
      return null;
  }
}
