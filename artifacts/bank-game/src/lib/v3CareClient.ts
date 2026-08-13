/**
 * Economy v3 Care client helpers: activity lifecycle + full cycle
 * (finish-cycle → rewardPreview → claim-cycle → acknowledge-cycle).
 */

import type {
  EconomyV2ExcessState,
  EconomyV3CareRewardPreview,
  EconomyV3RootKind,
  EconomyV3RootsState,
} from "@/lib/api";

/** Minimum reserve / preset seconds (matches server careAvailability). */
export const V3_CARE_PLAYABLE_MIN_SECONDS = 5;

/** Minigame reports skillScore 0…100; server expects skill in [0, 1]. */
export function minigameScoreToV3Skill(scoreRaw: unknown): number {
  const n = typeof scoreRaw === "number" ? scoreRaw : Number(scoreRaw);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(100, Math.max(0, n));
  return clamped / 100;
}

/** Server preset for start-activity — never invent locally. */
export function resolveV3CareStartPresetSeconds(
  activity: EconomyV3RootKind,
  v3Roots: EconomyV3RootsState,
): number | null {
  const max = v3Roots.careAvailability?.[activity]?.maxPresetSeconds;
  const n = typeof max === "number" ? max : Number(max);
  if (!Number.isInteger(n) || n < V3_CARE_PLAYABLE_MIN_SECONDS) return null;
  return n;
}

/** Transient session blocks starting another activity (active or awaiting ack). */
export function isV3CareSessionBlocking(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  const s = v3Roots?.careSession;
  if (!s) return false;
  if (s.active === true) return true;
  if (s.status === "active" || s.status === "completed") return true;
  return false;
}

/**
 * Care blocked while Metelka must be cleared first.
 * SoT: server `metelkaCycle.careLocked`, or local excessAvailable / session.active.
 * Pending Metelka coin alone does not block.
 */
export function careBlockedByMetelka(input: {
  excess?: EconomyV2ExcessState | null;
  v3Roots?: EconomyV3RootsState | null;
}): boolean {
  if (input.v3Roots?.metelkaCycle?.careLocked === true) return true;
  if (input.excess?.session?.active === true) return true;
  if (input.excess?.excessAvailable === true) return true;
  return false;
}

export const CARE_BLOCKED_BY_METELKA_HINT = "Сначала уберите избыток";
export const ROOTS_COLLECTION_INCOMPLETE_HINT =
  "Сначала соберите энергию корня";

/**
 * Mid root-transfer trio (1st…2nd collect): Care stays locked until all three
 * roots are transferred — same gate as the tutorial root-teaching phase.
 * After the 3rd transfer the server clears freeze + transferredRoots; a stale
 * full list (length 3) must not keep Care grey.
 */
export function isV3RootCollectionIncomplete(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  if (!v3Roots || v3Roots.enabled !== true) return false;
  const gen = v3Roots.generation;
  if (gen?.frozenAt != null) return true;
  const n = gen?.transferredRoots?.length ?? 0;
  return n === 1 || n === 2;
}

export function canStartV3CareActivity(input: {
  activity: EconomyV3RootKind;
  v3Roots: EconomyV3RootsState;
  busy: boolean;
  /** Optional excess snapshot — same SoT as Metelka card / careLocked. */
  excess?: EconomyV2ExcessState | null;
}): boolean {
  if (input.busy) return false;
  if (
    careBlockedByMetelka({
      excess: input.excess,
      v3Roots: input.v3Roots,
    })
  ) {
    return false;
  }
  if (isV3RootCollectionIncomplete(input.v3Roots)) return false;
  if (isV3CareSessionBlocking(input.v3Roots)) return false;
  const { activity, v3Roots } = input;
  if (v3Roots.careCycle?.activities?.[activity]?.completed === true) {
    return false;
  }
  const avail = v3Roots.careAvailability?.[activity];
  const reserve = v3Roots.reserves?.[activity];
  const seconds = Math.max(0, Math.floor(Number(reserve?.seconds) || 0));
  const playable =
    typeof avail?.playable === "boolean"
      ? avail.playable
      : seconds >= V3_CARE_PLAYABLE_MIN_SECONDS;
  if (!playable || seconds < V3_CARE_PLAYABLE_MIN_SECONDS) return false;
  if (resolveV3CareStartPresetSeconds(activity, v3Roots) == null) return false;
  return true;
}

export type V3CareStartResponse = {
  started: true;
  activity: EconomyV3RootKind;
  presetSeconds: number;
  spentSeconds: number;
  v3Roots: EconomyV3RootsState;
};

export type V3CareFinishResponse = {
  finished: true;
  alreadyCompleted: boolean;
  activity: EconomyV3RootKind;
  skill: number;
  v3Roots: EconomyV3RootsState;
};

export type V3CareAcknowledgeResponse = {
  acknowledged: true;
  activity: EconomyV3RootKind;
  v3Roots: EconomyV3RootsState;
};

/** 409 codes that mean client/server cycle state drifted — refresh, don't toast. */
export function isV3CareStateConflict(err: unknown): boolean {
  const anyErr = err as { status?: number; code?: string; message?: string };
  if (Number(anyErr?.status) !== 409) return false;
  const code = String(anyErr?.code ?? "");
  return (
    code === "reward_preview_unavailable" ||
    code === "activity_session_pending" ||
    code === "care_cycle_not_finished" ||
    code === "care_cycle_not_complete" ||
    code === "care_cycle_already_finished" ||
    code === "care_cycle_already_claimed"
  );
}

/**
 * User-facing Care error — never expose raw HTTP/status/stack to the scene.
 * Backend logs remain the diagnostic source of truth.
 */
export function formatV3CareError(err: unknown): string {
  const anyErr = err as { status?: number; message?: string; code?: string };
  const status = Number(anyErr?.status) || 0;
  const code = String(anyErr?.code ?? "");
  const msg = String(anyErr?.message ?? "");
  const hay = `${code} ${msg}`;

  if (status === 409 && /roots_collection_incomplete/i.test(hay)) {
    return ROOTS_COLLECTION_INCOMPLETE_HINT;
  }
  if (status === 409 && /reserve|energy|insufficient/i.test(hay)) {
    return "Недостаточно энергии в запасе для ухода.";
  }
  // Only real unclaimed Care money — NOT reward_preview_* / activity_session_pending.
  if (
    status === 409 &&
    (code === "pending_rewards" ||
      code === "pending_reward" ||
      /unclaimed_reward|pending_rewards?/i.test(code))
  ) {
    return "Сначала заберите награду за прошлый уход.";
  }
  if (status === 409 && code === "activity_session_pending") {
    return "Уход уже выполняется. Дождитесь завершения.";
  }
  if (status === 409 && /busy|in_progress|active/i.test(hay)) {
    return "Уход уже выполняется. Дождитесь завершения.";
  }
  if (
    status === 409 &&
    /metelka_required_before_care|metelka/i.test(hay)
  ) {
    return "Сначала уберите избыток";
  }
  if (status === 409) {
    return "Сейчас нельзя продолжить уход. Обновите состояние и попробуйте ещё раз.";
  }
  if (status === 400) {
    return "Некорректный запрос ухода.";
  }
  if (status === 401 || status === 403) {
    return "Сессия устарела. Войдите снова.";
  }
  // 5xx / network / unknown — short neutral copy (no "HTTP 500: …").
  return "Не удалось выполнить уход. Попробуйте ещё раз.";
}

/**
 * F5 recovery: open minigame when session is active; await ack when completed.
 */
export type V3CareRecoveryAction =
  | { type: "open-minigame"; activity: EconomyV3RootKind; presetSeconds: number }
  | { type: "await-acknowledge"; activity: EconomyV3RootKind; skill: number | null }
  | { type: "none" };

export function resolveV3CareRecovery(
  v3Roots: EconomyV3RootsState | null | undefined,
): V3CareRecoveryAction {
  const s = v3Roots?.careSession;
  if (!s || !s.activity) return { type: "none" };
  if (s.status === "active") {
    const preset = Math.max(
      V3_CARE_PLAYABLE_MIN_SECONDS,
      Math.floor(Number(s.presetSeconds) || 0),
    );
    return {
      type: "open-minigame",
      activity: s.activity,
      presetSeconds: preset,
    };
  }
  if (s.status === "completed") {
    return {
      type: "await-acknowledge",
      activity: s.activity,
      skill: s.skill,
    };
  }
  return { type: "none" };
}

/**
 * Shovel «Уход» to finish the cycle — server-only.
 * Never true once status is `finished` (that stage uses claim / acknowledge).
 *
 * Use `readyToFinish` only (not bare `status === "ready"`). After the third
 * activity finish the cycle is already `ready` while the session is still
 * pending ack — treating that as shovel-ready hides the activity row before
 * ack and blocks the converge → «Уход» path (especially on a second cycle).
 */
export function shouldShowV3CareShovel(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  const cycle = v3Roots?.careCycle;
  if (!cycle) return false;
  if (cycle.status === "finished") return false;
  return cycle.readyToFinish === true;
}

/**
 * Which Care-cycle action the shovel «Уход» must run for the current snapshot.
 * Single button, ordered steps: finish → claim → acknowledge.
 */
export type V3CareShovelAction =
  | "finish-cycle"
  | "claim-cycle"
  | "acknowledge-cycle"
  | "none";

export function resolveV3CareShovelAction(
  v3Roots: EconomyV3RootsState | null | undefined,
): V3CareShovelAction {
  if (shouldShowV3CareShovel(v3Roots)) return "finish-cycle";
  if (shouldShowV3RewardPreview(v3Roots)) return "claim-cycle";
  if (shouldAcknowledgeV3CareCycle(v3Roots)) return "acknowledge-cycle";
  return "none";
}

/** Reward preview after finish-cycle (status finished, not yet claimed). */
export function shouldShowV3RewardPreview(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  const cycle = v3Roots?.careCycle;
  if (!cycle || cycle.status !== "finished") return false;
  if (cycle.claim?.claimed) return false;
  return cycle.rewardPreview?.available === true;
}

/** After claim: acknowledge-cycle should run (no re-claim). */
export function shouldAcknowledgeV3CareCycle(
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  const cycle = v3Roots?.careCycle;
  if (!cycle || cycle.status !== "finished") return false;
  return cycle.claim?.claimed === true;
}

export type V3CareCycleRecoveryAction =
  | { type: "show-shovel" }
  | { type: "show-reward-preview" }
  | { type: "acknowledge-cycle" }
  | { type: "none" };

/**
 * F5 recovery for the full Care cycle (finish → claim → ack).
 * Activity-session recovery ({@link resolveV3CareRecovery}) takes precedence.
 */
export function resolveV3CareCycleRecovery(
  v3Roots: EconomyV3RootsState | null | undefined,
): V3CareCycleRecoveryAction {
  if (!v3Roots?.enabled) return { type: "none" };
  if (resolveV3CareRecovery(v3Roots).type !== "none") return { type: "none" };
  if (shouldAcknowledgeV3CareCycle(v3Roots)) return { type: "acknowledge-cycle" };
  if (shouldShowV3RewardPreview(v3Roots)) return { type: "show-reward-preview" };
  if (shouldShowV3CareShovel(v3Roots)) return { type: "show-shovel" };
  return { type: "none" };
}

/** Existing GamePage sessionScores shape — values come from server only. */
export type V3CareSessionScoreUi = {
  water: number;
  sun: number;
  fert: number;
  xp: number;
  base: number;
  bonus: number;
  mm: number;
};

/** Map server rewardPreview into existing sessionScores (no local formulas). */
export function sessionScoresFromV3RewardPreview(
  preview: EconomyV3CareRewardPreview | null | undefined,
): V3CareSessionScoreUi | null {
  if (!preview || !preview.available) return null;
  return {
    water: 0,
    sun: 0,
    fert: 0,
    xp: Math.max(0, Math.floor(Number(preview.xp) || 0)),
    base: Math.max(0, Number(preview.income?.base) || 0),
    bonus: Math.max(0, Number(preview.income?.bonus) || 0),
    mm: Math.max(0, Math.floor(Number(preview.treeGrowth) || 0)),
  };
}

export function sessionScoresFromV3Claim(claim: {
  xp: number;
  treeGrowth: number;
  income?: { base: number; bonus: number; total: number };
  pendingBaseReward?: number;
  pendingBonusReward?: number;
}): V3CareSessionScoreUi {
  // Preview treeGrowth is currently always 0 — drive growth-timer / +N мм from
  // THIS cycle's income.total. Do not use cumulative pending_* (stacks across
  // Care cycles until claimAll) or two sessions become one 38s timer.
  const fromTree = Math.max(0, Math.floor(Number(claim.treeGrowth) || 0));
  const incomeTotal = Math.max(0, Math.floor(Number(claim.income?.total) || 0));
  const pendingTotal = Math.max(
    0,
    Math.floor(
      (Math.max(0, Number(claim.pendingBaseReward) || 0) +
        Math.max(0, Number(claim.pendingBonusReward) || 0)),
    ),
  );
  const fromMoney = incomeTotal > 0 ? incomeTotal : pendingTotal;
  return {
    water: 0,
    sun: 0,
    fert: 0,
    xp: Math.max(0, Math.floor(Number(claim.xp) || 0)),
    base: Math.max(0, Number(claim.income?.base) || 0),
    bonus: Math.max(0, Number(claim.income?.bonus) || 0),
    mm: fromTree > 0 ? fromTree : fromMoney,
  };
}

/** Preview apples are server-only (currently 0). */
export function applesFromV3RewardPreview(
  preview: EconomyV3CareRewardPreview | null | undefined,
): number {
  if (!preview || !preview.available) return 0;
  return Math.max(0, Math.floor(Number(preview.apples) || 0));
}

export type V3CareFinishCycleResponse = {
  finished: true;
  cycle: {
    status: "finished";
    finishedAt: string;
    totalPresetSeconds: number;
    averageSkill: number;
  };
  rewardPreview: EconomyV3CareRewardPreview;
  v3Roots: EconomyV3RootsState;
};

export type V3CareClaimCycleResponse = {
  claimed: true;
  claimedAt: string;
  xp: number;
  income: { base: number; bonus: number; total: number };
  treeGrowth: number;
  playerXp: number;
  playerLevel: number;
  pendingBaseReward: number;
  pendingBonusReward: number;
  v3Roots: EconomyV3RootsState;
};

export type V3CareAcknowledgeCycleResponse = {
  acknowledged: true;
  v3Roots: EconomyV3RootsState;
};
