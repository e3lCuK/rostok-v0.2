/**
 * Economy v3 ordinary-full gate for excess.
 *
 * Metelka / ordinaryFull opens only when all three activity reserves are at
 * effectivePreset. Roots alone never open that product gate.
 *
 * Excess financial time / ledger minting:
 * - all reserves full (ordinaryFull), OR
 * - shared pool full on every activity (root + reserve ≥ cap) — energy on a
 *   root OR on its activity button counts the same, OR
 * - shared pool full on every still-eligible root (no ordinary room left).
 *
 * After the transfer trio is complete (all roots transferred) and reserves are
 * not full, generation pauses — do NOT mint excess. That matched
 * `generation.accumulating === false` and stops the “jumps to ~5s then resets
 * when roots form again” flicker.
 *
 * Reuses v2 split / elapsed-share helpers without changing the v2 cap-60 path.
 */

import { splitGeneratedIntoOrdinaryAndExcess } from "./economy-v2-excess";
import {
  computeExcessElapsedMsShare,
  computeOrdinaryElapsedMsShare,
} from "./economy-v2-excess-income";
import {
  clampV3CapacitySeconds,
  V3_BASE_PRESET_DEFAULT,
  V3_EFFECTIVE_CAPACITY_MAX,
  v3SharedPoolRootFreeRoom,
} from "./economy-v3-effective-capacity";
import {
  type RootKind,
  V3_ROOT_KINDS,
} from "./economy-v3-roots";
import { computeV3RootsFull } from "./economy-v3-metelka-cycle";

export type V3ReservesFullMap = Record<RootKind, boolean>;

export type V3OrdinaryFullState = {
  ordinaryFull: boolean;
  reservesFull: V3ReservesFullMap;
};

export type V3ExcessGatePublic = {
  /** All three activity reserves ≥ effectivePreset. */
  ordinaryFull: boolean;
  /** All three roots at effective capacity (Metelka product gate). */
  rootsFull: boolean;
  reservesFull: V3ReservesFullMap;
  /** True when this settle window directs new elapsed into the excess ledger. */
  generatingExcess: boolean;
};

function resolveEffectiveCapacity(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return V3_BASE_PRESET_DEFAULT;
  return Math.min(V3_EFFECTIVE_CAPACITY_MAX, Math.max(1, Math.floor(n)));
}

export function isV3ActivityReserveFull(
  reserveSeconds: unknown,
  capacitySeconds: unknown,
): boolean {
  const cap = resolveEffectiveCapacity(capacitySeconds);
  const seconds = clampV3CapacitySeconds(reserveSeconds, cap);
  return seconds >= cap;
}

/**
 * v3OrdinaryFull = waterFull && sunFull && fertilizerFull
 * Cap is effectivePreset (base + streak bonus), not base-only dailyCap.
 */
export function computeV3OrdinaryFullState(input: {
  reserveWaterSeconds: unknown;
  reserveSunSeconds: unknown;
  reserveFertilizerSeconds: unknown;
  /** Effective capacity (preferred). */
  effectivePresetSeconds?: unknown;
  /** Legacy alias — treated as effective when effectivePresetSeconds omitted. */
  dailyCapSeconds?: unknown;
}): V3OrdinaryFullState {
  const cap =
    input.effectivePresetSeconds ?? input.dailyCapSeconds ?? V3_BASE_PRESET_DEFAULT;
  const reservesFull: V3ReservesFullMap = {
    water: isV3ActivityReserveFull(input.reserveWaterSeconds, cap),
    sun: isV3ActivityReserveFull(input.reserveSunSeconds, cap),
    fertilizer: isV3ActivityReserveFull(input.reserveFertilizerSeconds, cap),
  };
  return {
    ordinaryFull:
      reservesFull.water && reservesFull.sun && reservesFull.fertilizer,
    reservesFull,
  };
}

/**
 * True when every root kind is in `transferredRoots` (post-trio, pre-cycle reset).
 * Generation must not mint excess in this state unless reserves are also full.
 */
export function areAllV3RootsTransferred(
  transferredRoots: ReadonlySet<RootKind> | readonly RootKind[],
): boolean {
  const transferred =
    transferredRoots instanceof Set
      ? transferredRoots
      : new Set(transferredRoots);
  return V3_ROOT_KINDS.every((k) => transferred.has(k));
}

/**
 * True when every activity holds max energy in its shared pool
 * (root + matching reserve ≥ effectivePreset). Location does not matter —
 * energy on the root or on the activity button both count.
 */
export function isV3SharedPoolEnergyAtMaximum(input: {
  rootWaterSeconds: unknown;
  rootSunSeconds: unknown;
  rootFertilizerSeconds: unknown;
  reserveWaterSeconds?: unknown;
  reserveSunSeconds?: unknown;
  reserveFertilizerSeconds?: unknown;
  effectivePresetSeconds?: unknown;
  rootCapacitySeconds?: unknown;
}): boolean {
  const cap = resolveEffectiveCapacity(
    input.rootCapacitySeconds ??
      input.effectivePresetSeconds ??
      V3_EFFECTIVE_CAPACITY_MAX,
  );
  for (const kind of V3_ROOT_KINDS) {
    const root =
      kind === "water"
        ? input.rootWaterSeconds
        : kind === "sun"
          ? input.rootSunSeconds
          : input.rootFertilizerSeconds;
    const reserve =
      kind === "water"
        ? input.reserveWaterSeconds
        : kind === "sun"
          ? input.reserveSunSeconds
          : input.reserveFertilizerSeconds;
    if (
      v3SharedPoolRootFreeRoom({
        rootSeconds: root,
        reserveSeconds: reserve ?? 0,
        capacitySeconds: cap,
      }) > 0
    ) {
      return false;
    }
  }
  return true;
}

/**
 * True when this settle window should mint excess (ledger + financial elapsed).
 *
 * - Care holding excess (capacity path already started) → yes
 * - ordinaryFull → yes (reserves at cap)
 * - shared-pool full on every activity (roots and/or buttons) → yes
 * - shared-pool full on eligible roots → yes
 * - all roots transferred and reserves not full → no (pause; wait for cycle)
 *   unless Care is holding excess (capacity path already started)
 */
export function shouldRouteV3GeneratedToExcess(input: {
  ordinaryFull: boolean;
  ordinaryAcceptBlocked: boolean;
  allRootsTransferred: boolean;
  /** root+reserve ≥ cap on every activity (buttons count). */
  sharedPoolEnergyAtMaximum?: boolean;
  /**
   * Care activities running after financial excess already started from
   * capacity — keep minting until the cycle leaves in_progress.
   * Must not be set for partial-fill Care (no prior excess clock).
   */
  careCycleHoldingExcess?: boolean;
}): boolean {
  if (input.careCycleHoldingExcess === true) return true;
  if (input.ordinaryFull === true) return true;
  if (input.allRootsTransferred === true) return false;
  if (input.sharedPoolEnergyAtMaximum === true) return true;
  return input.ordinaryAcceptBlocked === true;
}

/**
 * Care may keep minting financial excess only when the cycle was latched at
 * start from capacity (shared-pool / ordinary max). Partial-fill Care must
 * not invent or continue excess from leftover ledger alone.
 */
export function isV3CareCycleHoldingExcess(input: {
  careCycleStatus: unknown;
  /** Persisted latch from Care start at capacity. */
  careHoldExcess?: boolean;
}): boolean {
  if (input.careCycleStatus !== "in_progress") return false;
  return input.careHoldExcess === true;
}

/**
 * Soft Care / post-collect window: keep ordinary (gold flask) accruing, but do
 * not mint excess unless capacity was already latched (care hold) or reserves
 * are truly full. Stops idle capital without reopening false shared-pool excess
 * when roots refill on top of button energy.
 */
export function shouldSuppressV3ExcessForCarePhase(input: {
  careCycleStatus?: unknown;
  careHoldExcess?: boolean;
  /** Latched when transfer trio completed; awaiting Care / shovel ack. */
  postCollectPause?: boolean;
  ordinaryFull: boolean;
}): boolean {
  if (input.careHoldExcess === true) return false;
  if (input.ordinaryFull === true) return false;
  if (input.careCycleStatus === "in_progress") return true;
  return input.postCollectPause === true;
}

/**
 * @deprecated Full generation pause removed — capital stays productive via gold.
 * Kept as a thin wrapper: never pauses (always false). Prefer
 * {@link shouldSuppressV3ExcessForCarePhase}.
 */
export function shouldPauseV3GenerationForCarePhase(_input: {
  careCycleStatus?: unknown;
  careHoldExcess?: boolean;
  postCollectPause?: boolean;
  ordinaryFull: boolean;
  sharedPoolEnergyAtMaximum?: boolean;
}): boolean {
  return false;
}

/**
 * True when at least one ordinary-eligible root still has shared-pool room
 * (root + matching reserve < effectivePreset).
 * When false, settle must not discard generated seconds into the void
 * (unless all roots are already transferred — then pause instead of excess).
 */
export function canAcceptV3OrdinaryRootUnit(input: {
  rootWaterSeconds: unknown;
  rootSunSeconds: unknown;
  rootFertilizerSeconds: unknown;
  reserveWaterSeconds?: unknown;
  reserveSunSeconds?: unknown;
  reserveFertilizerSeconds?: unknown;
  reservesFull: V3ReservesFullMap;
  transferredRoots: ReadonlySet<RootKind> | readonly RootKind[];
  /** Effective root capacity (default absolute max 30). */
  rootCapacitySeconds?: unknown;
  effectivePresetSeconds?: unknown;
}): boolean {
  const cap = resolveEffectiveCapacity(
    input.rootCapacitySeconds ??
      input.effectivePresetSeconds ??
      V3_EFFECTIVE_CAPACITY_MAX,
  );
  for (const kind of V3_ROOT_KINDS) {
    if (
      !isV3RootOrdinaryEligible({
        kind,
        reservesFull: input.reservesFull,
        transferredRoots: input.transferredRoots,
      })
    ) {
      continue;
    }
    const root =
      kind === "water"
        ? input.rootWaterSeconds
        : kind === "sun"
          ? input.rootSunSeconds
          : input.rootFertilizerSeconds;
    const reserve =
      kind === "water"
        ? input.reserveWaterSeconds
        : kind === "sun"
          ? input.reserveSunSeconds
          : input.reserveFertilizerSeconds;
    if (
      v3SharedPoolRootFreeRoom({
        rootSeconds: root,
        reserveSeconds: reserve ?? 0,
        capacitySeconds: cap,
      }) > 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * A root receives ordinary generation only when its matching reserve is not
 * yet full and the root has not been transferred.
 * (Shared-pool free room is checked by callers via v3SharedPoolRootFreeRoom.)
 */
export function isV3RootOrdinaryEligible(input: {
  kind: RootKind;
  reservesFull: V3ReservesFullMap;
  transferredRoots: ReadonlySet<RootKind> | readonly RootKind[];
}): boolean {
  const transferred =
    input.transferredRoots instanceof Set
      ? input.transferredRoots
      : new Set(input.transferredRoots);
  if (transferred.has(input.kind)) return false;
  return !input.reservesFull[input.kind];
}

/**
 * Adapter over splitGeneratedIntoOrdinaryAndExcess for the v3 reserve gate.
 *
 * - ordinaryFull → freeCapacity 0 (all generated → excess)
 * - !ordinaryFull → freeCapacity ∞ (all generated → ordinary; excess 0)
 * - optional ordinaryFreeGameSeconds enables a mid-window partial split
 *   (ordinary brings the system exactly to full, remainder → excess)
 *
 * Does not use the v2 storage cap of 60.
 */
export function splitV3GeneratedIntoOrdinaryAndExcess(input: {
  generated: number;
  ordinaryFull: boolean;
  /**
   * Remaining ordinary game-seconds before the system is full.
   * When set, enables partial ordinary/excess split inside one window.
   */
  ordinaryFreeGameSeconds?: number | null;
}): { ordinaryAccepted: number; excessGenerated: number } {
  const generated =
    Number.isFinite(input.generated) && input.generated > 0
      ? input.generated
      : 0;

  if (
    input.ordinaryFreeGameSeconds != null &&
    Number.isFinite(input.ordinaryFreeGameSeconds)
  ) {
    return splitGeneratedIntoOrdinaryAndExcess({
      generated,
      freeCapacity: Math.max(0, Number(input.ordinaryFreeGameSeconds)),
    });
  }

  if (input.ordinaryFull) {
    return splitGeneratedIntoOrdinaryAndExcess({
      generated,
      freeCapacity: 0,
    });
  }

  // Not full: excess must not receive generation.
  return { ordinaryAccepted: generated, excessGenerated: 0 };
}

/**
 * Split wall-clock elapsed for a v3 ordinary→excess transition.
 * Reuses v2 elapsed-share helpers; does not invent a second Metelka ledger.
 */
export function splitV3ElapsedOrdinaryAndExcess(input: {
  elapsedMs: number;
  generatedGameSeconds: number;
  ordinaryFull: boolean;
  ordinaryFreeGameSeconds?: number | null;
}): {
  ordinaryAccepted: number;
  excessGenerated: number;
  ordinaryElapsedMs: number;
  excessElapsedMs: number;
} {
  const { ordinaryAccepted, excessGenerated } =
    splitV3GeneratedIntoOrdinaryAndExcess({
      generated: input.generatedGameSeconds,
      ordinaryFull: input.ordinaryFull,
      ordinaryFreeGameSeconds: input.ordinaryFreeGameSeconds,
    });

  const excessElapsedMs = computeExcessElapsedMsShare({
    elapsedMs: input.elapsedMs,
    generatedGameSeconds: input.generatedGameSeconds,
    excessGenerated,
  });
  const ordinaryElapsedMs = computeOrdinaryElapsedMsShare({
    elapsedMs: input.elapsedMs,
    excessElapsedMs,
  });

  return {
    ordinaryAccepted,
    excessGenerated,
    ordinaryElapsedMs,
    excessElapsedMs,
  };
}

export function buildV3ExcessGatePublic(input: {
  ordinaryFull: boolean;
  rootsFull: boolean;
  reservesFull: V3ReservesFullMap;
  generatingExcess: boolean;
}): V3ExcessGatePublic {
  return {
    ordinaryFull: input.ordinaryFull === true,
    rootsFull: input.rootsFull === true,
    reservesFull: {
      water: input.reservesFull.water === true,
      sun: input.reservesFull.sun === true,
      fertilizer: input.reservesFull.fertilizer === true,
    },
    generatingExcess: input.generatingExcess === true,
  };
}

/** Empty / default gate when snapshot has no settle context. */
export function emptyV3ExcessGatePublic(
  dailyCapSeconds?: unknown,
  reserves?: {
    water?: unknown;
    sun?: unknown;
    fertilizer?: unknown;
  },
  roots?: {
    water?: unknown;
    sun?: unknown;
    fertilizer?: unknown;
  },
  effectivePresetSeconds?: unknown,
): V3ExcessGatePublic {
  const cap =
    effectivePresetSeconds ?? dailyCapSeconds ?? V3_BASE_PRESET_DEFAULT;
  const state = computeV3OrdinaryFullState({
    reserveWaterSeconds: reserves?.water ?? 0,
    reserveSunSeconds: reserves?.sun ?? 0,
    reserveFertilizerSeconds: reserves?.fertilizer ?? 0,
    effectivePresetSeconds: cap,
  });
  return buildV3ExcessGatePublic({
    ordinaryFull: state.ordinaryFull,
    rootsFull: computeV3RootsFull({
      rootWaterSeconds: roots?.water ?? 0,
      rootSunSeconds: roots?.sun ?? 0,
      rootFertilizerSeconds: roots?.fertilizer ?? 0,
      capacitySeconds: cap,
    }),
    reservesFull: state.reservesFull,
    generatingExcess: false,
  });
}

export function allV3RootKinds(): readonly RootKind[] {
  return V3_ROOT_KINDS;
}
