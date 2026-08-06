/**
 * Pure Economy v3 Tutorial grant helpers (no DB).
 */

import {
  clampReserveSeconds,
  clampRootSeconds,
  normalizeTransferredRoots,
  type RootKind,
  V3_ROOT_KINDS,
  V3_SEGMENT_SECONDS,
} from "./economy-v3-roots";

/** Tutorial grants exactly one playable segment per root. */
export const V3_TUTORIAL_ROOT_SECONDS = V3_SEGMENT_SECONDS; // 5

/**
 * Pure grant: fill each root to tutorial seconds when still empty and not yet
 * transferred into its reserve. Never bumps reserves/excess/income.
 * All root/reserve values are clamped to effectivePresetSeconds.
 */
export function grantTutorialV3RootsPure(input: {
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  transferredRoots: RootKind[];
  /** Absolute ordinary ledger capacity (base + visit bonus). */
  effectivePresetSeconds: number;
  tutorialRootSeconds?: number;
}): {
  rootWaterSeconds: number;
  rootSunSeconds: number;
  rootFertilizerSeconds: number;
  changed: boolean;
  alreadyPrepared: boolean;
} {
  const capacity = Math.max(
    1,
    Math.floor(Number(input.effectivePresetSeconds) || 1),
  );
  const target = Math.min(
    capacity,
    Math.max(
      1,
      Math.floor(Number(input.tutorialRootSeconds) || V3_TUTORIAL_ROOT_SECONDS),
    ),
  );
  const transferred = new Set(normalizeTransferredRoots(input.transferredRoots));
  const rawRoots: Record<RootKind, number> = {
    water: Math.max(0, Math.floor(Number(input.rootWaterSeconds) || 0)),
    sun: Math.max(0, Math.floor(Number(input.rootSunSeconds) || 0)),
    fertilizer: Math.max(
      0,
      Math.floor(Number(input.rootFertilizerSeconds) || 0),
    ),
  };
  const roots: Record<RootKind, number> = {
    water: clampRootSeconds(rawRoots.water, capacity),
    sun: clampRootSeconds(rawRoots.sun, capacity),
    fertilizer: clampRootSeconds(rawRoots.fertilizer, capacity),
  };
  const reserves: Record<RootKind, number> = {
    water: clampReserveSeconds(input.reserveWaterSeconds, capacity),
    sun: clampReserveSeconds(input.reserveSunSeconds, capacity),
    fertilizer: clampReserveSeconds(input.reserveFertilizerSeconds, capacity),
  };

  let changed =
    roots.water !== rawRoots.water ||
    roots.sun !== rawRoots.sun ||
    roots.fertilizer !== rawRoots.fertilizer;
  for (const kind of V3_ROOT_KINDS) {
    if (transferred.has(kind)) continue;
    if (reserves[kind] > 0) continue;
    if (roots[kind] >= target) continue;
    roots[kind] = target;
    changed = true;
  }

  const alreadyPrepared = V3_ROOT_KINDS.every(
    (kind) =>
      transferred.has(kind) ||
      reserves[kind] > 0 ||
      roots[kind] >= target,
  );

  return {
    rootWaterSeconds: roots.water,
    rootSunSeconds: roots.sun,
    rootFertilizerSeconds: roots.fertilizer,
    changed,
    alreadyPrepared,
  };
}
