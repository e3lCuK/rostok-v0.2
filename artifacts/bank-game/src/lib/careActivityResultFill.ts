/**
 * Care activity cube fill — same mapping used by GamePage since v1:
 * skillScore 0–100 → fill height percent (no new formula).
 */
export function activityResultFillPercent(skillScore: unknown): number {
  const n = typeof skillScore === "number" ? skillScore : Number(skillScore);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export type CareActivityFillKey = "water" | "sun" | "fertilizer";

export type CareActivityFillMap = Record<CareActivityFillKey, number | null>;

export type CareDisplayFillMap = Record<CareActivityFillKey, number>;

export function zeroDisplayFills(): CareDisplayFillMap {
  return { water: 0, sun: 0, fertilizer: 0 };
}

/** Map stored targets (null = unused) → display heights (null → 0). */
export function targetsToDisplayFills(
  targets: CareActivityFillMap,
): CareDisplayFillMap {
  return {
    water: targets.water ?? 0,
    sun: targets.sun ?? 0,
    fertilizer: targets.fertilizer ?? 0,
  };
}

/** Whether a cube should show the result fill layer. */
export function hasActivityResultFill(pct: number | null | undefined): boolean {
  return pct != null && Number.isFinite(pct);
}

/**
 * Done chrome: real completion flag and/or a stored fill percent.
 * Fill percent alone is enough after finish clears server completed flags.
 * Completion flag must NOT invent a 100% fill — only enables done chrome.
 */
export function isCareActivityCubeDone(input: {
  fillPercent: number | null | undefined;
  completedFlag: boolean;
}): boolean {
  return hasActivityResultFill(input.fillPercent) || !!input.completedFlag;
}

/** Snapshot must not wipe an existing fill with null/undefined. */
export function mergeActivityFillPercent(
  prev: number | null | undefined,
  next: number | null | undefined,
): number | null {
  if (next == null) return prev ?? null;
  return activityResultFillPercent(next);
}

export function allActivityFillsPresent(fills: CareActivityFillMap): boolean {
  return (
    hasActivityResultFill(fills.water) &&
    hasActivityResultFill(fills.sun) &&
    hasActivityResultFill(fills.fertilizer)
  );
}

/**
 * CSS height transition only runs when an existing node changes height.
 * Mounting already at target% → no animation. Schedule: paint 0%, then target%.
 */
export function scheduleFillHeightReveal(applyTargetHeights: () => void): () => void {
  let raf2 = 0;
  const raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => {
      applyTargetHeights();
    });
  });
  return () => {
    cancelAnimationFrame(raf1);
    if (raf2) cancelAnimationFrame(raf2);
  };
}

/**
 * Pure step used by tests: first commit is always zeros, second is targets.
 * Simulates the two-render reveal without touching the DOM.
 */
export function revealFillHeightsStep(
  step: "initial" | "after_frame",
  targets: CareActivityFillMap,
): CareDisplayFillMap {
  if (step === "initial") return zeroDisplayFills();
  return targetsToDisplayFills(targets);
}
