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
import { V3_ACTIVITY_ACCENT_COLORS } from "@/lib/v3ActivityColors";

/** Legacy local minigame duration (v3 uses server session preset). */
export const TUTORIAL_ACTIVITY_DURATION_SEC = 10;

/** Matches server V3_TUTORIAL_ROOT_SECONDS — two 5s cells (10s activities). */
export const TUTORIAL_V3_ROOT_SECONDS = 10;

/**
 * Staged root-energy reveal during intro:
 * 5s timer (root still empty) → quick pop fills two cells (10s) → next root.
 */
export const TUTORIAL_V3_FILL_SECONDS = 5;
export const TUTORIAL_V3_FILL_MS = TUTORIAL_V3_FILL_SECONDS * 1000;
/** Visual pop after each wait — root fills quickly, not during the timer. */
export const TUTORIAL_V3_ROOT_POP_MS = 350;

/** After all three roots are filled, keep the wait capsule and start a live ~12:00 cycle. */
export const TUTORIAL_V3_WAIT_SECONDS = 12 * 60;
export const TUTORIAL_V3_WAIT_MS = TUTORIAL_V3_WAIT_SECONDS * 1000;

/**
 * Epoch ms when the tutorial 12:00 wait started — for tutorial/complete handoff.
 * Prefer the stored start; else derive from the wait capsule deadline.
 */
export function resolveTutorialGenerationAnchorAt(input: {
  startedAtMs: number | null | undefined;
  waitDeadlineMs: number | null | undefined;
  waitMs?: number;
}): number | null {
  const started = Number(input.startedAtMs);
  if (Number.isFinite(started) && started > 0) return Math.trunc(started);
  const deadline = Number(input.waitDeadlineMs);
  const waitMs =
    input.waitMs != null && Number.isFinite(input.waitMs) && input.waitMs > 0
      ? input.waitMs
      : TUTORIAL_V3_WAIT_MS;
  if (Number.isFinite(deadline) && deadline > 0) {
    return Math.trunc(deadline - waitMs);
  }
  return null;
}

/**
 * After tutorial dismiss: drop Care checkmarks/session so activity cards show
 * reserve seconds again ("0 с") instead of completed ticks.
 */
export function clearV3CareUiAfterTutorial(
  v3Roots: EconomyV3RootsState | null | undefined,
): EconomyV3RootsState | null {
  if (!v3Roots || v3Roots.enabled !== true) return v3Roots ?? null;
  const emptyAct = {
    completed: false,
    presetSeconds: null as number | null,
    skill: null as number | null,
  };
  return {
    ...v3Roots,
    careSession: {
      ...v3Roots.careSession,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      status: null,
      skill: null,
      finishedAt: null,
      active: false,
    },
    careCycle: {
      ...v3Roots.careCycle,
      startedAt: null,
      completedAt: null,
      finishedAt: null,
      status: null,
      allCompleted: false,
      readyToFinish: false,
      totalPresetSeconds: null,
      averageSkill: null,
      activities: {
        water: { ...emptyAct },
        sun: { ...emptyAct },
        fertilizer: { ...emptyAct },
      },
      rewardPreview: {
        available: false,
        xp: 0,
        apples: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
      claim: {
        claimed: false,
        claimedAt: null,
        xp: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
    },
  };
}

/**
 * Stale post-tutorial Care chrome: empty reserves + leftover completed/shovel
 * flags (server poll can re-apply them and hide "0 с" behind checkmarks).
 */
export function shouldClearStaleV3CareUiAfterTutorial(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!v3Roots || v3Roots.enabled !== true) return false;
  const kinds = ["water", "sun", "fertilizer"] as const;
  const reservesEmpty = kinds.every(
    (k) => Math.max(0, Math.floor(Number(v3Roots.reserves?.[k]?.seconds) || 0)) === 0,
  );
  if (!reservesEmpty) return false;
  if (v3Roots.careSession?.active === true) return false;
  if (
    v3Roots.careSession?.status === "active" ||
    v3Roots.careSession?.status === "completed"
  ) {
    return true;
  }
  if (
    v3Roots.careCycle?.readyToFinish === true ||
    v3Roots.careCycle?.status === "ready" ||
    v3Roots.careCycle?.status === "finished" ||
    v3Roots.careCycle?.allCompleted === true
  ) {
    return true;
  }
  return kinds.some(
    (k) => v3Roots.careCycle?.activities?.[k]?.completed === true,
  );
}

/**
 * After tutorial «Уход»: short pause, then inactive activity cubes return
 * (same ghost row as live Care rewards).
 */
export const TUTORIAL_CARE_GHOST_DELAY_MS = 750;

/**
 * After apple + coin collected: hold before chrome reset + congrats card.
 * Must cover coin→chest float; slightly longer so the scene settles.
 */
export const TUTORIAL_REWARD_TO_FINISH_MS = 1800;

export type TutorialV3TimerKind = "fill" | "wait";

export type TutorialStep =
  | "welcome"
  | "plant-sprout"
  | "capital-transfer"
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

/** Steps before energy fill / 12:00 wait bootstrap. */
export function isV3TutorialPreEnergyStep(step: TutorialStep): boolean {
  return (
    step === "welcome" ||
    step === "plant-sprout" ||
    step === "capital-transfer"
  );
}

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
    step === "plant-sprout" ||
    step === "capital-transfer" ||
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

/** Root already has tutorial energy (on root, in reserve, or transferred). */
export function isV3TutorialRootEnergyReady(
  v3Roots: EconomyV3RootsState | null | undefined,
  kind: EconomyV3RootKind,
): boolean {
  if (!v3Roots || v3Roots.enabled !== true) return false;
  if (isTransferred(v3Roots, kind)) return true;
  if (reserveSeconds(v3Roots, kind) > 0) return true;
  return rootSeconds(v3Roots, kind) >= TUTORIAL_V3_ROOT_SECONDS;
}

/** All three roots have been staged-filled (ready to teach collection). */
export function areV3TutorialRootsEnergyReady(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!v3Roots || v3Roots.enabled !== true) return false;
  return V3_TUTORIAL_ROOT_ORDER.every((kind) =>
    isV3TutorialRootEnergyReady(v3Roots, kind),
  );
}

/** Next root to grant during intro fill, or null when all three are ready. */
export function nextV3TutorialFillKind(
  v3Roots: EconomyV3RootsState | null | undefined,
): EconomyV3RootKind | null {
  for (const kind of V3_TUTORIAL_ROOT_ORDER) {
    if (!isV3TutorialRootEnergyReady(v3Roots, kind)) return kind;
  }
  return null;
}

/** One root cell — keep at 5s so 10s fill lights two segments. */
const TUTORIAL_SEGMENT_SECONDS = 5;

/** Patch one root's energy locally (staged intro fill — UI source of truth). */
export function withTutorialRootSeconds(
  snap: EconomyV3RootsState,
  kind: EconomyV3RootKind,
  seconds: number,
): EconomyV3RootsState {
  const capacity = Math.max(
    1,
    Math.floor(Number(snap.roots[kind]?.capacitySeconds) || 25),
  );
  const sec = Math.max(0, Math.min(capacity, Number(seconds) || 0));
  const fullSegments = Math.floor(sec / TUTORIAL_SEGMENT_SECONDS);
  const partialSegmentSeconds = sec % TUTORIAL_SEGMENT_SECONDS;
  return {
    ...snap,
    roots: {
      ...snap.roots,
      [kind]: {
        ...snap.roots[kind],
        seconds: sec,
        fullSegments,
        partialSegmentSeconds,
        fillFraction: sec / capacity,
        playableFromRoot: sec >= TUTORIAL_V3_ROOT_SECONDS,
      },
    },
  };
}

/**
 * After a staged prepare: take server fields, but keep other roots at local
 * values so a buggy all-three grant cannot skip the sequence visually.
 * For the prepared kind, keep the fuller fill so a stale 5s grant cannot
 * underrun the local two-cell (10s) pop and loop forever on the same root.
 */
export function mergeStagedTutorialPrepare(
  local: EconomyV3RootsState,
  kind: EconomyV3RootKind,
  server: EconomyV3RootsState,
): EconomyV3RootsState {
  const pickPrepared = (k: EconomyV3RootKind) => {
    const serverRoot = server.roots[k];
    const localRoot = local.roots[k];
    const serverSec = Number(serverRoot?.seconds) || 0;
    const localSec = Number(localRoot?.seconds) || 0;
    return localSec > serverSec ? localRoot : serverRoot;
  };
  return {
    ...server,
    roots: {
      water: kind === "water" ? pickPrepared("water") : local.roots.water,
      sun: kind === "sun" ? pickPrepared("sun") : local.roots.sun,
      fertilizer:
        kind === "fertilizer"
          ? pickPrepared("fertilizer")
          : local.roots.fertilizer,
    },
  };
}

/**
 * After collect/transfer (or prepare all): keep fuller fills on roots that are
 * not yet transferred so a stale 5s DB grant cannot snap two-cell siblings to one.
 *
 * Important: when the third root is collected the server clears `transferredRoots`
 * (cycle complete). Treat root emptied into a non-zero reserve as collected so we
 * never resurrect the last root's local two-cell fill.
 */
export function mergeTutorialRootsPreserveFill(
  local: EconomyV3RootsState,
  server: EconomyV3RootsState,
): EconomyV3RootsState {
  const transferred = new Set([
    ...(server.generation?.transferredRoots ?? []),
    ...(local.generation?.transferredRoots ?? []),
  ]);
  let roots = { ...server.roots };
  for (const kind of V3_TUTORIAL_ROOT_ORDER) {
    const serverRoot = server.roots[kind];
    const serverSec = Number(serverRoot?.seconds) || 0;
    const reserveSec = Number(server.reserves?.[kind]?.seconds) || 0;
    const collected =
      transferred.has(kind) ||
      serverRoot?.transferred === true ||
      (serverSec <= 0 && reserveSec > 0);
    if (collected) {
      roots = { ...roots, [kind]: serverRoot };
      continue;
    }
    const localSec = Number(local.roots[kind]?.seconds) || 0;
    if (localSec > serverSec) {
      roots = withTutorialRootSeconds(
        { ...server, roots },
        kind,
        localSec,
      ).roots;
    }
  }
  return { ...server, roots };
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
  sproutPlanted?: boolean;
  vaultBalance?: number;
}): TutorialStep {
  if (input.tutorialDone) return null;
  const snap = input.v3Roots;
  if (!snap || snap.enabled !== true) return "welcome";

  const hasRootProgress =
    areV3TutorialRootsEnergyReady(snap) ||
    V3_TUTORIAL_ROOT_ORDER.some((k) => rootSeconds(snap, k) >= 1) ||
    areV3TutorialAllReservesReady(snap) ||
    getV3CareActivitiesCompleted(snap).water ||
    getV3CareActivitiesCompleted(snap).sun ||
    getV3CareActivitiesCompleted(snap).fertilizer ||
    !!snap.careCycle?.startedAt;

  const sproutPlanted = input.sproutPlanted === true || hasRootProgress;
  const vaultBalance = Math.max(0, Number(input.vaultBalance) || 0);

  if (!sproutPlanted) {
    // F5 before plant: keep client on plant-sprout (caller ignores "welcome").
    return "welcome";
  }
  if (vaultBalance > 0 && !hasRootProgress) {
    return "capital-transfer";
  }

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
    // Staged fill incomplete → resume intro timers; only teach collect when all filled.
    if (areV3TutorialRootsEnergyReady(snap)) return "v3-root-water";
    if (V3_TUTORIAL_ROOT_ORDER.some((k) => rootSeconds(snap, k) >= 1)) {
      return "intro";
    }
    // Planted + vault emptied — resume energy wait, not welcome.
    return "intro";
  }

  return "v3-activities-intro";
}

/**
 * Rank for F5 re-resolve — never jump backward (e.g. Care shovel clears roots
 * → resolve returns "intro" → wait-energy tip must not reappear).
 */
const V3_TUTORIAL_STEP_RANK: Record<string, number> = {
  welcome: 0,
  "plant-sprout": 1,
  "capital-transfer": 2,
  intro: 3,
  "v3-root-water": 4,
  "v3-root-sun": 5,
  "v3-root-fertilizer": 6,
  "v3-activities-intro": 7,
  water: 7,
  sun: 7,
  fertilizer: 7,
  "sun-intro": 7,
  "fertilizer-intro": 7,
  complete: 8,
};

/** Whether server-resolved step may replace the current client tutorial step. */
export function shouldApplyResolvedV3TutorialStep(
  current: TutorialStep,
  resolved: TutorialStep,
): boolean {
  if (resolved == null || resolved === "welcome") return false;
  if (current == null || current === "welcome") return true;
  if (current === resolved) return false;
  const curRank = V3_TUTORIAL_STEP_RANK[current] ?? 0;
  const nextRank = V3_TUTORIAL_STEP_RANK[resolved] ?? 0;
  return nextRank >= curRank;
}

/** After welcome: plant sprout, then capital transfer, then energy intro. */
export function tutorialStepAfterWelcome(_useV3: boolean): TutorialStep {
  return "plant-sprout";
}

/** Icon key for tutorial overlay card (rendered in GamePage). */
export type V3TutorialOverlayIcon =
  | "water"
  | "sun"
  | "fertilizer"
  | "wait"
  | "energy"
  | "plant"
  | "vault"
  | "care"
  | "reward";

/**
 * Welcome-plan icon colors — also tint every matching tutorial hint card
 * (icon + title + subtitle).
 */
export const TUTORIAL_PLAN_ICON_COLORS = {
  plant: "#166534",
  /** Clock / wait beat — distinct from plant green. */
  wait: "#0f766e",
  energy: "#c9920a",
  /** Capital vault / flask gold (transfer beat). */
  vault: "#c9920a",
  care: "#92400e",
  reward: "#ca8a04",
} as const;

export type V3TutorialOverlayConfig = {
  icon: V3TutorialOverlayIcon;
  text: string;
  hint: string;
  /** Ink for icon + title + hint — same as welcome-plan step color. */
  accent: string;
};

export const V3_TUTORIAL_PLANT_SPROUT_OVERLAY: V3TutorialOverlayConfig = {
  icon: "plant",
  text: "Посадите росток",
  hint: "Коснитесь пунктирного овала под деревом.",
  accent: TUTORIAL_PLAN_ICON_COLORS.plant,
};

export const V3_TUTORIAL_CAPITAL_TRANSFER_OVERLAY: V3TutorialOverlayConfig = {
  icon: "vault",
  text: "Перенесите капитал в сундук",
  hint: "Перетащите кошелёк из сейфа в сундук дерева.",
  accent: TUTORIAL_PLAN_ICON_COLORS.vault,
};

/** Intro fill timers — wait for root energy before collect teaching. */
export const V3_TUTORIAL_WAIT_ENERGY_OVERLAY: V3TutorialOverlayConfig = {
  icon: "wait",
  text: "Дождитесь формирования энергии",
  hint: "Смотрите на таймер у корней.",
  accent: TUTORIAL_PLAN_ICON_COLORS.wait,
};

/** After wait — teach collecting filled root cells (pulse on highlighted root). */
export const V3_TUTORIAL_COLLECT_ROOTS_OVERLAY: V3TutorialOverlayConfig = {
  icon: "energy",
  text: "Соберите энергию из корней",
  hint: "Нажмите на корневые ячейки по очереди.",
  accent: TUTORIAL_PLAN_ICON_COLORS.energy,
};

export const V3_TUTORIAL_REWARD_OVERLAY: V3TutorialOverlayConfig = {
  icon: "reward",
  text: "Соберите награду",
  hint: "Перенесите яблоки и монетки.",
  accent: TUTORIAL_PLAN_ICON_COLORS.reward,
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
      accent: V3_ACTIVITY_ACCENT_COLORS.sun,
    };
  }
  if (kind === "fertilizer") {
    return {
      icon: "fertilizer",
      text: "Пройдите активность",
      hint: "Собирайте гранулы в ряд.",
      accent: V3_ACTIVITY_ACCENT_COLORS.fertilizer,
    };
  }
  return {
    icon: "water",
    text: "Пройдите активность",
    hint: "Ловите капли воды.",
    accent: V3_ACTIVITY_ACCENT_COLORS.water,
  };
}

/**
 * Overlay cards: energy-wait → collect roots → Care activity intros.
 * For `v3-activities-intro`, pass `recommendedActivity` (same as button pulse).
 */
export function v3TutorialOverlayConfig(
  step: TutorialStep,
  options?: { recommendedActivity?: EconomyV3RootKind | null },
): V3TutorialOverlayConfig | null {
  switch (step) {
    case "plant-sprout":
      return V3_TUTORIAL_PLANT_SPROUT_OVERLAY;
    case "capital-transfer":
      return V3_TUTORIAL_CAPITAL_TRANSFER_OVERLAY;
    case "intro":
      return V3_TUTORIAL_WAIT_ENERGY_OVERLAY;
    case "v3-root-water":
    case "v3-root-sun":
    case "v3-root-fertilizer":
      return V3_TUTORIAL_COLLECT_ROOTS_OVERLAY;
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
