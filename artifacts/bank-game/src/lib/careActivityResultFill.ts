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
 * «Уход» shovel fill — mean of the three activity result fills (same live + tutorial).
 * Missing results count as 0 so early shovel chrome stays empty.
 */
export function careShovelFillPercent(
  waterPct: number | null | undefined,
  sunPct: number | null | undefined,
  fertilizerPct: number | null | undefined,
): number {
  const avg =
    ((waterPct ?? 0) + (sunPct ?? 0) + (fertilizerPct ?? 0)) / 3;
  return Math.min(100, Math.max(0, Math.round(avg)));
}

/** Server cycle skill is 0…1 → same 0…100 fill percent as minigame scores. */
export function activityFillPercentFromV3Skill(
  skill: number | null | undefined,
): number | null {
  if (skill == null || !Number.isFinite(Number(skill))) return null;
  const n = Number(skill);
  if (n < 0 || n > 1) return null;
  return activityResultFillPercent(Math.round(n * 100));
}

export type V3CareCycleSkillSources = {
  water?: { skill?: number | null } | null;
  sun?: { skill?: number | null } | null;
  fertilizer?: { skill?: number | null } | null;
};

/**
 * Prefer local result fills; fill gaps from cycle activity skills / averageSkill
 * so «Уход» still shows quality after F5 or a stale clear.
 */
export function resolveCareShovelFillPercent(input: {
  waterPct: number | null | undefined;
  sunPct: number | null | undefined;
  fertilizerPct: number | null | undefined;
  cycleActivities?: V3CareCycleSkillSources | null;
  averageSkill?: number | null;
  combinedFallback?: number | null;
}): number {
  const fromCycle = (kind: CareActivityFillKey): number | null =>
    activityFillPercentFromV3Skill(input.cycleActivities?.[kind]?.skill);

  const water = mergeActivityFillPercent(input.waterPct, fromCycle("water"));
  const sun = mergeActivityFillPercent(input.sunPct, fromCycle("sun"));
  const fertilizer = mergeActivityFillPercent(
    input.fertilizerPct,
    fromCycle("fertilizer"),
  );

  if (water != null || sun != null || fertilizer != null) {
    return careShovelFillPercent(water, sun, fertilizer);
  }

  const fromAverage = activityFillPercentFromV3Skill(input.averageSkill);
  if (fromAverage != null) return fromAverage;

  if (input.combinedFallback != null) {
    return activityResultFillPercent(input.combinedFallback);
  }
  return 0;
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
