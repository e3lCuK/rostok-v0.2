/**
 * Economy v3 roots snapshot — frontend normalize only.
 * Does not compute Care/income formulas; clamps unsafe numeric fields.
 */

import type { UserState } from "./engine";
import type {
  EconomyV3ActivityReserve,
  EconomyV3AutoTransferPublic,
  EconomyV3CareAvailabilityEntry,
  EconomyV3CareCycleActivityResult,
  EconomyV3CareCycleClaim,
  EconomyV3CareCycleState,
  EconomyV3CareCycleStatus,
  EconomyV3CareRewardPreview,
  EconomyV3CareSessionState,
  EconomyV3ExcessGateState,
  EconomyV3GenerationState,
  EconomyV3MetelkaCycleState,
  EconomyV3RootKind,
  EconomyV3RootState,
  EconomyV3RootsState,
} from "./api";

export const V3_ROOT_KINDS: readonly EconomyV3RootKind[] = [
  "water",
  "sun",
  "fertilizer",
] as const;

/** Absolute max root/reserve capacity (base 25 + visit bonus 5). Fallback only. */
export const V3_ROOT_CAPACITY_SECONDS = 30;
export const V3_DAILY_CAP_MIN = 5;
export const V3_DAILY_CAP_MAX = 25;
export const V3_DAILY_CAP_DEFAULT = 20;
export const V3_EFFECTIVE_CAPACITY_MIN = 5;
export const V3_EFFECTIVE_CAPACITY_MAX = 30;

function floorNonNeg(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Soft “please collect” pulse threshold — same 5s bar as Care playable min.
 * (Server may allow transfer earlier; pulse is recommendation only.)
 */
export const V3_ROOT_COLLECT_PULSE_MIN_SECONDS = 5;

/**
 * Left→right recommend among roots ready to collect (≥5s, not transferred).
 * Same pattern as activity-button recommend: only one pulses at a time.
 */
export function recommendedV3RootToCollect(
  v3Roots: EconomyV3RootsState | null | undefined,
): EconomyV3RootKind | null {
  if (!v3Roots || v3Roots.enabled !== true) return null;
  if (v3Roots.metelkaCycle?.transferLocked === true) return null;
  for (const kind of V3_ROOT_KINDS) {
    const root = v3Roots.roots?.[kind];
    if (!root || root.transferred === true) continue;
    const seconds = floorNonNeg(root.seconds);
    if (seconds >= V3_ROOT_COLLECT_PULSE_MIN_SECONDS) return kind;
  }
  return null;
}

/** Clamp root seconds to whole [0, capacity] (capacity default absolute max 30). */
export function clampV3RootSeconds(
  raw: unknown,
  capacityRaw: unknown = V3_ROOT_CAPACITY_SECONDS,
): number {
  const cap = Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(
      0,
      floorNonNeg(capacityRaw) || V3_ROOT_CAPACITY_SECONDS,
    ),
  );
  return Math.min(cap, floorNonNeg(raw));
}

/** Clamp server capacitySeconds into [5, 30]; invalid → 30 fallback. */
export function clampV3CapacitySecondsField(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return V3_ROOT_CAPACITY_SECONDS;
  const whole = Math.floor(n);
  return Math.min(
    V3_EFFECTIVE_CAPACITY_MAX,
    Math.max(V3_EFFECTIVE_CAPACITY_MIN, whole),
  );
}

/** Clamp daily cap to whole [5, 25]; invalid → 20. */
export function clampV3DailyCap(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return V3_DAILY_CAP_DEFAULT;
  const whole = Math.floor(n);
  return Math.min(V3_DAILY_CAP_MAX, Math.max(V3_DAILY_CAP_MIN, whole));
}

/** Clamp reserve seconds to whole [0, capacity]. */
export function clampV3ReserveSeconds(
  raw: unknown,
  capacityRaw: unknown = V3_DAILY_CAP_DEFAULT,
): number {
  const cap = clampV3CapacitySecondsField(capacityRaw);
  return Math.min(cap, floorNonNeg(raw));
}

/**
 * True when every activity holds max energy in its shared pool
 * (root + matching reserve ≥ effectivePreset). Energy on the root or on the
 * activity button both count — flask greys from this without waiting for
 * the next settle `generatingExcess` tick.
 */
export function isV3SharedPoolEnergyAtMaximum(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!v3Roots || v3Roots.enabled !== true) return false;
  const cap = clampV3CapacitySecondsField(
    v3Roots.effectivePresetSeconds ??
      v3Roots.roots?.water?.capacitySeconds ??
      v3Roots.dailyCapSeconds,
  );
  for (const kind of V3_ROOT_KINDS) {
    const root = clampV3RootSeconds(v3Roots.roots?.[kind]?.seconds, cap);
    const reserve = clampV3ReserveSeconds(
      v3Roots.reserves?.[kind]?.seconds,
      cap,
    );
    if (root + reserve < cap) return false;
  }
  return true;
}

/**
 * Excess-phase flask / capital stone-grey. Prefer live shared-pool max so the
 * flask greys as soon as energy is full in roots and/or buttons.
 * Care keeps grey + financial clock only when the cycle latched holdExcess
 * at start (capacity path — never during tutorial / partial-fill Care).
 */
export function isV3CareCycleHoldingExcess(
  v3Roots: EconomyV3RootsState | null | undefined,
  tutorialDone: boolean = true,
): boolean {
  if (tutorialDone === false) return false;
  if (v3Roots?.careCycle?.status !== "in_progress") return false;
  return v3Roots.careCycle?.holdExcess === true;
}

export function shouldGreyV3ExcessFlask(input: {
  v3Roots?: EconomyV3RootsState | null;
  excessCleaning?: boolean;
  excessAvailable?: boolean;
  /** Tutorial must never enter excess / grey-flask UX. */
  tutorialDone?: boolean;
}): boolean {
  if (input.tutorialDone === false) return false;
  if (input.excessCleaning === true) return true;
  if (input.excessAvailable === true) return true;
  if (isV3CareCycleHoldingExcess(input.v3Roots, true)) return true;
  const gate = input.v3Roots?.excessGate;
  if (gate?.generatingExcess === true) return true;
  if (gate?.ordinaryFull === true) return true;
  return isV3SharedPoolEnergyAtMaximum(input.v3Roots);
}

function asFiniteNumber(raw: unknown, fallback = 0): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableString(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  return String(raw);
}

function asBool(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

function parseRootKind(raw: unknown): EconomyV3RootKind | null {
  return raw === "water" || raw === "sun" || raw === "fertilizer" ? raw : null;
}

function emptyRootState(): EconomyV3RootState {
  return {
    seconds: 0,
    fullSegments: 0,
    partialSegmentSeconds: 0,
    capacitySeconds: V3_ROOT_CAPACITY_SECONDS,
    fillFraction: 0,
    playableFromRoot: false,
    transferred: false,
    frozen: false,
  };
}

function normalizeRootState(raw: unknown): EconomyV3RootState {
  if (!raw || typeof raw !== "object") return emptyRootState();
  const o = raw as Record<string, unknown>;
  const capacitySeconds = clampV3CapacitySecondsField(
    o.capacitySeconds ?? V3_ROOT_CAPACITY_SECONDS,
  );
  const seconds = clampV3RootSeconds(o.seconds, capacitySeconds);
  return {
    seconds,
    fullSegments: floorNonNeg(o.fullSegments),
    partialSegmentSeconds: floorNonNeg(o.partialSegmentSeconds),
    capacitySeconds,
    // Prefer server fillFraction; do not recompute from seconds.
    fillFraction: Math.min(
      1,
      Math.max(0, asFiniteNumber(o.fillFraction, seconds / capacitySeconds)),
    ),
    playableFromRoot: asBool(o.playableFromRoot),
    transferred: asBool(o.transferred),
    frozen: asBool(o.frozen),
  };
}

function normalizeReserve(
  raw: unknown,
  fallbackCapacity: number,
): EconomyV3ActivityReserve {
  if (!raw || typeof raw !== "object") {
    return { seconds: 0, capacitySeconds: fallbackCapacity, playable: false };
  }
  const o = raw as Record<string, unknown>;
  const capacitySeconds = clampV3CapacitySecondsField(
    o.capacitySeconds ?? fallbackCapacity,
  );
  const seconds = clampV3ReserveSeconds(o.seconds, capacitySeconds);
  return {
    seconds,
    capacitySeconds,
    playable: asBool(o.playable),
  };
}

function normalizeCareAvailability(
  raw: unknown,
): EconomyV3CareAvailabilityEntry {
  if (!raw || typeof raw !== "object") {
    return { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 };
  }
  const o = raw as Record<string, unknown>;
  return {
    reserveSeconds: floorNonNeg(o.reserveSeconds),
    playable: asBool(o.playable),
    maxPresetSeconds: floorNonNeg(o.maxPresetSeconds),
  };
}

function normalizeCareSession(raw: unknown): EconomyV3CareSessionState {
  if (!raw || typeof raw !== "object") {
    return {
      active: false,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      finishedAt: null,
      status: null,
      skill: null,
    };
  }
  const o = raw as Record<string, unknown>;
  const status =
    o.status === "active" || o.status === "completed" ? o.status : null;
  const skillRaw = o.skill;
  const skill =
    skillRaw == null || skillRaw === ""
      ? null
      : (() => {
          const n = asFiniteNumber(skillRaw, NaN);
          return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
        })();
  const presetRaw = o.presetSeconds;
  const presetSeconds =
    presetRaw == null || presetRaw === ""
      ? null
      : Number.isInteger(asFiniteNumber(presetRaw, NaN))
        ? Math.trunc(asFiniteNumber(presetRaw))
        : null;
  return {
    active: asBool(o.active),
    activity: parseRootKind(o.activity),
    presetSeconds,
    startedAt: asNullableString(o.startedAt),
    finishedAt: asNullableString(o.finishedAt),
    status,
    skill,
  };
}

function normalizeActivityResult(raw: unknown): EconomyV3CareCycleActivityResult {
  if (!raw || typeof raw !== "object") {
    return { completed: false, presetSeconds: null, skill: null };
  }
  const o = raw as Record<string, unknown>;
  const completed = asBool(o.completed);
  if (!completed) {
    return { completed: false, presetSeconds: null, skill: null };
  }
  const presetRaw = o.presetSeconds;
  const presetSeconds =
    presetRaw == null || presetRaw === ""
      ? null
      : Number.isFinite(Number(presetRaw))
        ? Math.trunc(Number(presetRaw))
        : null;
  const skillRaw = o.skill;
  const skill =
    skillRaw == null || skillRaw === ""
      ? null
      : (() => {
          const n = Number(skillRaw);
          return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
        })();
  return { completed: true, presetSeconds, skill };
}

function emptyRewardPreview(): EconomyV3CareRewardPreview {
  return {
    available: false,
    xp: 0,
    apples: 0,
    treeGrowth: 0,
    income: { base: 0, bonus: 0, total: 0 },
  };
}

function normalizeRewardPreview(raw: unknown): EconomyV3CareRewardPreview {
  if (!raw || typeof raw !== "object") return emptyRewardPreview();
  const o = raw as Record<string, unknown>;
  const income =
    o.income && typeof o.income === "object"
      ? (o.income as Record<string, unknown>)
      : {};
  return {
    available: asBool(o.available),
    xp: floorNonNeg(o.xp),
    apples: floorNonNeg(o.apples),
    treeGrowth: floorNonNeg(o.treeGrowth),
    income: {
      base: asFiniteNumber(income.base),
      bonus: asFiniteNumber(income.bonus),
      total: asFiniteNumber(income.total),
    },
  };
}

function emptyClaim(): EconomyV3CareCycleClaim {
  return {
    claimed: false,
    claimedAt: null,
    xp: 0,
    treeGrowth: 0,
    income: { base: 0, bonus: 0, total: 0 },
  };
}

function normalizeClaim(raw: unknown): EconomyV3CareCycleClaim {
  if (!raw || typeof raw !== "object") return emptyClaim();
  const o = raw as Record<string, unknown>;
  const income =
    o.income && typeof o.income === "object"
      ? (o.income as Record<string, unknown>)
      : {};
  return {
    claimed: asBool(o.claimed),
    claimedAt: asNullableString(o.claimedAt),
    xp: floorNonNeg(o.xp),
    treeGrowth: floorNonNeg(o.treeGrowth),
    income: {
      base: asFiniteNumber(income.base),
      bonus: asFiniteNumber(income.bonus),
      total: asFiniteNumber(income.total),
    },
  };
}

function normalizeCareCycle(raw: unknown): EconomyV3CareCycleState {
  if (!raw || typeof raw !== "object") {
    return {
      startedAt: null,
      completedAt: null,
      finishedAt: null,
      status: null,
      holdExcess: false,
      allCompleted: false,
      readyToFinish: false,
      totalPresetSeconds: null,
      averageSkill: null,
      activities: {
        water: { completed: false, presetSeconds: null, skill: null },
        sun: { completed: false, presetSeconds: null, skill: null },
        fertilizer: { completed: false, presetSeconds: null, skill: null },
      },
      rewardPreview: emptyRewardPreview(),
      claim: emptyClaim(),
    };
  }
  const o = raw as Record<string, unknown>;
  const statusRaw = o.status;
  const status: EconomyV3CareCycleStatus | null =
    statusRaw === "in_progress" ||
    statusRaw === "ready" ||
    statusRaw === "finished"
      ? statusRaw
      : null;
  const acts =
    o.activities && typeof o.activities === "object"
      ? (o.activities as Record<string, unknown>)
      : {};
  const totalPreset =
    o.totalPresetSeconds == null || o.totalPresetSeconds === ""
      ? null
      : floorNonNeg(o.totalPresetSeconds);
  const avgSkill =
    o.averageSkill == null || o.averageSkill === ""
      ? null
      : (() => {
          const n = Number(o.averageSkill);
          if (!Number.isFinite(n)) return null;
          return Math.min(1, Math.max(0, n));
        })();
  return {
    startedAt: asNullableString(o.startedAt),
    completedAt: asNullableString(o.completedAt),
    finishedAt: asNullableString(o.finishedAt),
    status,
    holdExcess: asBool(o.holdExcess),
    allCompleted: asBool(o.allCompleted),
    readyToFinish: asBool(o.readyToFinish),
    totalPresetSeconds: totalPreset,
    averageSkill: avgSkill,
    activities: {
      water: normalizeActivityResult(acts.water),
      sun: normalizeActivityResult(acts.sun),
      fertilizer: normalizeActivityResult(acts.fertilizer),
    },
    rewardPreview: normalizeRewardPreview(o.rewardPreview),
    claim: normalizeClaim(o.claim),
  };
}

function normalizeGeneration(raw: unknown): EconomyV3GenerationState {
  if (!raw || typeof raw !== "object") {
    return {
      anchorAt: null,
      progress: 0,
      frozenAt: null,
      insuranceDeadlineAt: null,
      firstTransferredRoot: null,
      transferredRoots: [],
      secondsUntilNextWholeSecond: null,
      nextWholeSecondAt: null,
      cycleDurationSeconds: null,
      rrCursor: 0,
      nextRoot: "water",
      accumulating: false,
    };
  }
  const o = raw as Record<string, unknown>;
  const progress = asFiniteNumber(o.progress);
  const transferredRaw = Array.isArray(o.transferredRoots)
    ? o.transferredRoots
    : [];
  const transferredRoots = transferredRaw
    .map(parseRootKind)
    .filter((k): k is EconomyV3RootKind => k != null);
  const until = o.secondsUntilNextWholeSecond;
  const cycleDur = o.cycleDurationSeconds;
  const rrRaw = o.rrCursor;
  const rrCursor =
    rrRaw == null || rrRaw === ""
      ? 0
      : Number.isFinite(Number(rrRaw))
        ? ((Math.trunc(Number(rrRaw)) % 3) + 3) % 3
        : 0;
  const nextRootParsed = parseRootKind(o.nextRoot);
  const nextRootFromCursor: EconomyV3RootKind =
    rrCursor === 1 ? "sun" : rrCursor === 2 ? "fertilizer" : "water";
  return {
    anchorAt: asNullableString(o.anchorAt),
    progress:
      Number.isFinite(progress) && progress >= 0 && progress < 1 ? progress : 0,
    rrCursor,
    nextRoot: nextRootParsed ?? nextRootFromCursor,
    frozenAt: asNullableString(o.frozenAt),
    insuranceDeadlineAt: asNullableString(o.insuranceDeadlineAt),
    firstTransferredRoot: parseRootKind(o.firstTransferredRoot),
    transferredRoots,
    secondsUntilNextWholeSecond:
      until == null || until === ""
        ? null
        : Number.isFinite(Number(until))
          ? Number(until)
          : null,
    nextWholeSecondAt: asNullableString(o.nextWholeSecondAt),
    cycleDurationSeconds:
      cycleDur == null || cycleDur === ""
        ? null
        : Number.isFinite(Number(cycleDur)) && Number(cycleDur) > 0
          ? Number(cycleDur)
          : null,
    accumulating: asBool(o.accumulating),
  };
}

function emptyExcessGate(): EconomyV3ExcessGateState {
  return {
    ordinaryFull: false,
    rootsFull: false,
    reservesFull: { water: false, sun: false, fertilizer: false },
    generatingExcess: false,
  };
}

function emptyMetelkaCycle(): EconomyV3MetelkaCycleState {
  return {
    required: false,
    completedForCycle: false,
    transferLocked: false,
    careLocked: false,
    phase: "roots_accumulating",
  };
}

function normalizeExcessGate(raw: unknown): EconomyV3ExcessGateState {
  if (!raw || typeof raw !== "object") return emptyExcessGate();
  const o = raw as Record<string, unknown>;
  const rf =
    o.reservesFull && typeof o.reservesFull === "object"
      ? (o.reservesFull as Record<string, unknown>)
      : {};
  return {
    ordinaryFull: asBool(o.ordinaryFull),
    rootsFull: asBool(o.rootsFull),
    reservesFull: {
      water: asBool(rf.water),
      sun: asBool(rf.sun),
      fertilizer: asBool(rf.fertilizer),
    },
    generatingExcess: asBool(o.generatingExcess),
  };
}

function normalizeMetelkaCycle(raw: unknown): EconomyV3MetelkaCycleState {
  if (!raw || typeof raw !== "object") return emptyMetelkaCycle();
  const o = raw as Record<string, unknown>;
  const phaseRaw = typeof o.phase === "string" ? o.phase : "";
  const phase =
    phaseRaw === "roots_full_waiting_excess" ||
    phaseRaw === "metelka_available" ||
    phaseRaw === "metelka_active" ||
    phaseRaw === "metelka_pending_result" ||
    phaseRaw === "root_transfer_unlocked"
      ? phaseRaw
      : "roots_accumulating";
  return {
    required: asBool(o.required),
    completedForCycle: asBool(o.completedForCycle),
    transferLocked: asBool(o.transferLocked),
    careLocked: asBool(o.careLocked),
    phase,
  };
}

/**
 * Normalize server `game.v3Roots`. Missing / disabled → null.
 * Clamps seconds & dailyCap; does not invent Care/income math.
 */
export function normalizeEconomyV3RootsSnapshot(
  raw: EconomyV3RootsState | null | undefined | unknown,
): EconomyV3RootsState | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.enabled !== true && o.enabled !== "true") return null;

  const dailyCapSeconds = clampV3DailyCap(o.dailyCapSeconds);
  const basePresetSeconds = clampV3DailyCap(
    o.basePresetSeconds ?? dailyCapSeconds,
  );
  const activeDailyBonusSeconds = Math.min(
    5,
    Math.max(0, floorNonNeg(o.activeDailyBonusSeconds)),
  );
  const currentVisitDay = Math.max(
    1,
    Math.floor(
      typeof o.currentVisitDay === "number" && Number.isFinite(o.currentVisitDay)
        ? o.currentVisitDay
        : activeDailyBonusSeconds > 0
          ? activeDailyBonusSeconds
          : 1,
    ),
  );
  const effectivePresetSeconds = clampV3CapacitySecondsField(
    o.effectivePresetSeconds ??
      Math.min(
        V3_EFFECTIVE_CAPACITY_MAX,
        basePresetSeconds + activeDailyBonusSeconds,
      ),
  );
  const rootsRaw =
    o.roots && typeof o.roots === "object"
      ? (o.roots as Record<string, unknown>)
      : {};
  const reservesRaw =
    o.reserves && typeof o.reserves === "object"
      ? (o.reserves as Record<string, unknown>)
      : {};
  const availRaw =
    o.careAvailability && typeof o.careAvailability === "object"
      ? (o.careAvailability as Record<string, unknown>)
      : {};

  return {
    enabled: true,
    dailyCapSeconds,
    basePresetSeconds,
    activeDailyBonusSeconds,
    currentVisitDay,
    effectivePresetSeconds,
    dayKey: asNullableString(o.dayKey),
    roots: {
      water: normalizeRootState(rootsRaw.water),
      sun: normalizeRootState(rootsRaw.sun),
      fertilizer: normalizeRootState(rootsRaw.fertilizer),
    },
    reserves: {
      water: normalizeReserve(reservesRaw.water, effectivePresetSeconds),
      sun: normalizeReserve(reservesRaw.sun, effectivePresetSeconds),
      fertilizer: normalizeReserve(
        reservesRaw.fertilizer,
        effectivePresetSeconds,
      ),
    },
    careAvailability: {
      water: normalizeCareAvailability(availRaw.water),
      sun: normalizeCareAvailability(availRaw.sun),
      fertilizer: normalizeCareAvailability(availRaw.fertilizer),
    },
    careSession: normalizeCareSession(o.careSession),
    careCycle: normalizeCareCycle(o.careCycle),
    generation: normalizeGeneration(o.generation),
    excessGate: normalizeExcessGate(o.excessGate),
    metelkaCycle: normalizeMetelkaCycle(o.metelkaCycle),
  };
}

export function normalizeEconomyV3AutoTransfer(
  raw: EconomyV3AutoTransferPublic | null | undefined | unknown,
): EconomyV3AutoTransferPublic | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.applied !== true && o.applied !== "true") return null;
  const rootsRaw = Array.isArray(o.roots) ? o.roots : [];
  const roots = rootsRaw
    .map(parseRootKind)
    .filter((k): k is EconomyV3RootKind => k != null);
  const accepted =
    o.acceptedByRoot && typeof o.acceptedByRoot === "object"
      ? (o.acceptedByRoot as Record<string, unknown>)
      : {};
  const discarded =
    o.discardedByRoot && typeof o.discardedByRoot === "object"
      ? (o.discardedByRoot as Record<string, unknown>)
      : {};
  const acceptedByRoot: Partial<Record<EconomyV3RootKind, number>> = {};
  const discardedByRoot: Partial<Record<EconomyV3RootKind, number>> = {};
  for (const k of V3_ROOT_KINDS) {
    if (accepted[k] != null) acceptedByRoot[k] = asFiniteNumber(accepted[k]);
    if (discarded[k] != null) discardedByRoot[k] = asFiniteNumber(discarded[k]);
  }
  return {
    applied: true,
    at: asNullableString(o.at) ?? "",
    roots,
    acceptedByRoot,
    discardedByRoot,
  };
}

/** Merge normalized v3 snapshot (+ optional one-shot autoTransfer) into UserState. */
export function applyEconomyV3RootsToState(
  state: UserState,
  v3Roots: EconomyV3RootsState | null | undefined,
  v3AutoTransfer?: EconomyV3AutoTransferPublic | null,
): UserState {
  return {
    ...state,
    game: {
      ...state.game,
      v3Roots: v3Roots ?? null,
      ...(v3AutoTransfer !== undefined
        ? { v3AutoTransfer: v3AutoTransfer ?? null }
        : {}),
    },
  };
}

/** Apply raw server game.v3Roots / v3AutoTransfer via normalize + commit-friendly merge. */
export function applyEconomyV3FromServerGame(
  state: UserState,
  game:
    | {
        v3Roots?: EconomyV3RootsState | null;
        v3AutoTransfer?: EconomyV3AutoTransferPublic | null;
      }
    | null
    | undefined,
): UserState {
  if (!game) return state;
  const hasRoots = Object.prototype.hasOwnProperty.call(game, "v3Roots");
  const hasAuto = Object.prototype.hasOwnProperty.call(game, "v3AutoTransfer");
  if (!hasRoots && !hasAuto) return state;
  return {
    ...state,
    game: {
      ...state.game,
      ...(hasRoots
        ? { v3Roots: normalizeEconomyV3RootsSnapshot(game.v3Roots) }
        : {}),
      ...(hasAuto
        ? {
            v3AutoTransfer: normalizeEconomyV3AutoTransfer(game.v3AutoTransfer),
          }
        : {}),
    },
  };
}

/** Compact DEV readout from a normalized snapshot (null when disabled). */
export type EconomyV3DebugReadout = {
  enabled: true;
  effectivePresetSeconds: number;
  currentVisitDay: number;
  activeDailyBonusSeconds: number;
  basePresetSeconds: number;
  waterRootSeconds: number;
  sunRootSeconds: number;
  fertilizerRootSeconds: number;
  waterReserveSeconds: number;
  sunReserveSeconds: number;
  fertilizerReserveSeconds: number;
  frozen: boolean;
  accumulating: boolean;
  careCycleStatus: EconomyV3CareCycleStatus | null;
  /** Server excessGate — read-only. */
  ordinaryFull: boolean;
  rootsFull: boolean;
  generatingExcess: boolean;
  /** From server v2Excess.excessAvailable — read-only. */
  excessAvailable: boolean;
  metelkaRequired: boolean;
  metelkaPhase: EconomyV3RootsState["metelkaCycle"]["phase"] | null;
};

export function economyV3DebugReadout(
  snap: EconomyV3RootsState | null | undefined,
  excess?: { excessAvailable?: boolean } | null,
): EconomyV3DebugReadout | null {
  if (!snap || snap.enabled !== true) return null;
  const effectivePresetSeconds =
    snap.effectivePresetSeconds ??
    snap.roots.water.capacitySeconds ??
    snap.dailyCapSeconds;
  const basePresetSeconds =
    snap.basePresetSeconds ?? snap.dailyCapSeconds ?? effectivePresetSeconds;
  const activeDailyBonusSeconds = Math.max(
    0,
    Math.min(
      5,
      typeof snap.activeDailyBonusSeconds === "number"
        ? snap.activeDailyBonusSeconds
        : Math.max(0, effectivePresetSeconds - basePresetSeconds),
    ),
  );
  const currentVisitDay = Math.max(
    1,
    typeof snap.currentVisitDay === "number" &&
      Number.isFinite(snap.currentVisitDay)
      ? Math.floor(snap.currentVisitDay)
      : Math.max(1, activeDailyBonusSeconds),
  );
  return {
    enabled: true,
    effectivePresetSeconds,
    currentVisitDay,
    activeDailyBonusSeconds,
    basePresetSeconds,
    waterRootSeconds: snap.roots.water.seconds,
    sunRootSeconds: snap.roots.sun.seconds,
    fertilizerRootSeconds: snap.roots.fertilizer.seconds,
    waterReserveSeconds: snap.reserves.water.seconds,
    sunReserveSeconds: snap.reserves.sun.seconds,
    fertilizerReserveSeconds: snap.reserves.fertilizer.seconds,
    frozen: snap.generation.frozenAt != null,
    accumulating: snap.generation.accumulating,
    careCycleStatus: snap.careCycle.status,
    ordinaryFull: snap.excessGate?.ordinaryFull === true,
    rootsFull: snap.excessGate?.rootsFull === true,
    generatingExcess: snap.excessGate?.generatingExcess === true,
    excessAvailable: excess?.excessAvailable === true,
    metelkaRequired: snap.metelkaCycle?.required === true,
    metelkaPhase: snap.metelkaCycle?.phase ?? null,
  };
}
