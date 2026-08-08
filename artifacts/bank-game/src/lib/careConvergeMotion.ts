import { CARE_TO_SHOVEL_MS } from "./careActionsPhase";

/** Framer Motion converge/diverge — MotionConfig reducedMotion="never". */
export const CARE_CONVERGE_EASE = [0.45, 0.02, 0.2, 1] as const;

/**
 * Single continuous tween (no mid keyframes) — mid keyframes caused a visible
 * stall then a rush into the end pose.
 */
export const CARE_CONVERGE_TRANSITION = {
  duration: CARE_TO_SHOVEL_MS / 1000,
  ease: CARE_CONVERGE_EASE,
};

/** Opacity eases out later so cubes stay readable while sliding. */
export const CARE_CONVERGE_OPACITY_TRANSITION = {
  duration: CARE_TO_SHOVEL_MS / 1000,
  ease: [0.7, 0, 0.3, 1] as const,
};

/** «Уход» → inactive trio split duration (ms). */
export const CARE_DIVERGE_MS = 700;

export const CARE_DIVERGE_TRANSITION = {
  duration: CARE_DIVERGE_MS / 1000,
  ease: CARE_CONVERGE_EASE,
};

export const CARE_DIVERGE_OPACITY_TRANSITION = {
  duration: CARE_DIVERGE_MS / 1000,
  ease: [0.25, 0, 0.35, 1] as const,
};

export function careTrioConvergeTransition() {
  return {
    x: CARE_CONVERGE_TRANSITION,
    y: CARE_CONVERGE_TRANSITION,
    scale: CARE_CONVERGE_TRANSITION,
    opacity: CARE_CONVERGE_OPACITY_TRANSITION,
  };
}

export function careTrioDivergeTransition() {
  return {
    x: CARE_DIVERGE_TRANSITION,
    y: CARE_DIVERGE_TRANSITION,
    scale: CARE_DIVERGE_TRANSITION,
    opacity: CARE_DIVERGE_OPACITY_TRANSITION,
  };
}

const SLIDE_PX = 52;

export type CareConvergeSlot = "left" | "center" | "right";

function collapsedPose(slot: CareConvergeSlot, axis: "x" | "y") {
  if (slot === "center") {
    return { x: 0, y: 0, scale: 0.82, opacity: 0 };
  }
  const sign = slot === "left" ? 1 : -1;
  const end = sign * SLIDE_PX;
  if (axis === "x") {
    return { x: end, y: 0, scale: 0.72, opacity: 0 };
  }
  return { x: 0, y: end, scale: 0.72, opacity: 0 };
}

const REST_POSE = { x: 0, y: 0, scale: 1, opacity: 1 };

/**
 * End pose for merge. Continuous tween from rest → end (no waypoint stall).
 */
export function careTrioConvergeAnimate(
  merging: boolean,
  slot: CareConvergeSlot,
  /** v3 row = x; legacy column = y */
  axis: "x" | "y",
) {
  if (!merging) return REST_POSE;
  return collapsedPose(slot, axis);
}

/** Mount pose when splitting «Уход» back into three cubes. */
export function careTrioDivergeInitial(
  slot: CareConvergeSlot,
  axis: "x" | "y",
) {
  return collapsedPose(slot, axis);
}

/** Shovel cross-fades in while cubes are still sliding. */
export function careShovelConvergeAnimate(
  merging: boolean,
  diverging: boolean,
  visible: boolean,
) {
  if (diverging) return { opacity: 0, scale: 0.88 };
  if (!visible && !merging) return { opacity: 0, scale: 0.9 };
  return { opacity: 1, scale: 1 };
}

export function careShovelConvergeInitial(merging: boolean) {
  if (merging) return { opacity: 0, scale: 0.9 };
  return false as const;
}

export function careShovelConvergeTransition(
  merging: boolean,
  diverging: boolean,
) {
  if (diverging) {
    return {
      duration: (CARE_DIVERGE_MS / 1000) * 0.55,
      ease: CARE_CONVERGE_EASE,
    };
  }
  if (merging) {
    const total = CARE_TO_SHOVEL_MS / 1000;
    return {
      duration: total * 0.7,
      delay: total * 0.22,
      ease: CARE_CONVERGE_EASE,
    };
  }
  return { duration: 0.28, ease: CARE_CONVERGE_EASE };
}

export function careConvergeSlotForIndex(index: number): CareConvergeSlot {
  if (index <= 0) return "left";
  if (index >= 2) return "right";
  return "center";
}
