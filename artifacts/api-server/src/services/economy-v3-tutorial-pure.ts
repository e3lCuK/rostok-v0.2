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

/** Tutorial grants two segments per root (matches 10s mini-activities). */
export const V3_TUTORIAL_ROOT_SECONDS = V3_SEGMENT_SECONDS * 2; // 10

/**
 * Pure grant: fill root(s) to tutorial seconds when still empty and not yet
 * transferred into its reserve. Never bumps reserves/excess/income.
 * All root/reserve values are clamped to effectivePresetSeconds.
 *
 * When `kinds` is set, only those roots are considered (staged tutorial fill).
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
  /** Staged grant — only these kinds (default: all three). */
  kinds?: RootKind[];
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

  const scope: RootKind[] =
    input.kinds && input.kinds.length > 0
      ? input.kinds.filter((k): k is RootKind =>
          (V3_ROOT_KINDS as readonly string[]).includes(k),
        )
      : [...V3_ROOT_KINDS];

  let changed =
    roots.water !== rawRoots.water ||
    roots.sun !== rawRoots.sun ||
    roots.fertilizer !== rawRoots.fertilizer;
  for (const kind of scope) {
    if (transferred.has(kind)) continue;
    if (reserves[kind] > 0) continue;
    if (roots[kind] >= target) continue;
    roots[kind] = target;
    changed = true;
  }

  const alreadyPrepared = scope.every(
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

/**
 * Tutorial activity buttons must show 10 с. If a stale grant left 5 s in a
 * reserve, top it up to the tutorial target (never invent energy from 0).
 */
export function topUpTutorialReservesPure(input: {
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  effectivePresetSeconds: number;
  tutorialRootSeconds?: number;
}): {
  reserveWaterSeconds: number;
  reserveSunSeconds: number;
  reserveFertilizerSeconds: number;
  changed: boolean;
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
  const topUp = (raw: number): number => {
    const sec = clampReserveSeconds(raw, capacity);
    if (sec <= 0 || sec >= target) return sec;
    return clampReserveSeconds(target, capacity);
  };
  const reserveWaterSeconds = topUp(input.reserveWaterSeconds);
  const reserveSunSeconds = topUp(input.reserveSunSeconds);
  const reserveFertilizerSeconds = topUp(input.reserveFertilizerSeconds);
  return {
    reserveWaterSeconds,
    reserveSunSeconds,
    reserveFertilizerSeconds,
    changed:
      reserveWaterSeconds !==
        clampReserveSeconds(input.reserveWaterSeconds, capacity) ||
      reserveSunSeconds !==
        clampReserveSeconds(input.reserveSunSeconds, capacity) ||
      reserveFertilizerSeconds !==
        clampReserveSeconds(input.reserveFertilizerSeconds, capacity),
  };
}
