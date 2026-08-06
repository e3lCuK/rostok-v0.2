import type {
  EconomyV2CareActivityResponse,
  EconomyV2CareAllocationResponse,
  EconomyV2CareCompletedResponse,
  EconomyV2CareStartResponse,
  EconomyV2CareStateResponse,
} from "@/lib/api";
import type { UserState } from "@/lib/engine";
import type { ActivityEnergyAllocation } from "@/lib/gamePresets";

export const V2_CARE_MIN_START_SECONDS = 15;

export type V2CareGameSlice = {
  v2EnergySeconds?: number;
  v2EnergyAnchorAt?: number | null;
  v2Care?: EconomyV2CareStateResponse | null;
  water?: boolean;
  sun?: boolean;
  fertilizer?: boolean;
  sessionInProgress?: boolean;
};

export function emptyV2CareScores(): {
  water: number | null;
  sun: number | null;
  fertilizer: number | null;
} {
  return { water: null, sun: null, fertilizer: null };
}

export function emptyV2CareState(): EconomyV2CareStateResponse {
  return {
    inProgress: false,
    cycleId: null,
    allocation: {
      waterSeconds: 0,
      sunSeconds: 0,
      fertilizerSeconds: 0,
      totalAllocatedSeconds: 0,
    },
    completed: { water: false, sun: false, fertilizer: false },
    allCompleted: false,
    scores: emptyV2CareScores(),
  };
}

export function normalizeV2Care(
  raw: EconomyV2CareStateResponse | null | undefined,
): EconomyV2CareStateResponse {
  if (!raw) return emptyV2CareState();
  const allocation = raw.allocation ?? emptyV2CareState().allocation;
  const completed = raw.completed ?? emptyV2CareState().completed;
  const allCompleted =
    typeof raw.allCompleted === "boolean"
      ? raw.allCompleted
      : !!(completed.water && completed.sun && completed.fertilizer);
  const scores = raw.scores ?? emptyV2CareScores();
  return {
    inProgress: !!raw.inProgress,
    cycleId: raw.cycleId ?? null,
    allocation: {
      waterSeconds: Number(allocation.waterSeconds) || 0,
      sunSeconds: Number(allocation.sunSeconds) || 0,
      fertilizerSeconds: Number(allocation.fertilizerSeconds) || 0,
      totalAllocatedSeconds:
        Number(allocation.totalAllocatedSeconds) ||
        (Number(allocation.waterSeconds) || 0) +
          (Number(allocation.sunSeconds) || 0) +
          (Number(allocation.fertilizerSeconds) || 0),
    },
    completed: {
      water: !!completed.water,
      sun: !!completed.sun,
      fertilizer: !!completed.fertilizer,
    },
    allCompleted,
    scores: {
      water: scores.water == null ? null : Number(scores.water),
      sun: scores.sun == null ? null : Number(scores.sun),
      fertilizer: scores.fertilizer == null ? null : Number(scores.fertilizer),
    },
  };
}

/** Whole seconds available for the Care start gate. */
export function floorV2EnergySeconds(energy: unknown): number {
  const n = Number(energy);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function canStartV2Care(energySeconds: unknown): boolean {
  return floorV2EnergySeconds(energySeconds) >= V2_CARE_MIN_START_SECONDS;
}

export function allocationToActivityMap(
  allocation: EconomyV2CareAllocationResponse,
): ActivityEnergyAllocation {
  return {
    water: allocation.waterSeconds,
    sun: allocation.sunSeconds,
    fertilizer: allocation.fertilizerSeconds,
  };
}

export function durationFromServerAllocation(
  allocation: EconomyV2CareAllocationResponse | null | undefined,
  activity: "water" | "sun" | "fertilizer",
): number {
  if (!allocation) return 0;
  const map = allocationToActivityMap(allocation);
  return Math.max(0, map[activity] ?? 0);
}

/** Remaining unfinished activities in an active v2 Care cycle. */
export function v2CareActionsLeft(
  care: EconomyV2CareStateResponse | null | undefined,
): number {
  const c = normalizeV2Care(care);
  if (!c.inProgress || c.allCompleted) return 0;
  let n = 0;
  if (!c.completed.water) n++;
  if (!c.completed.sun) n++;
  if (!c.completed.fertilizer) n++;
  return n;
}

export function applyV2CareStartToState(
  state: UserState,
  result: EconomyV2CareStartResponse,
): UserState {
  const completed = result.completed ?? {
    water: false,
    sun: false,
    fertilizer: false,
  };
  const care = normalizeV2Care({
    inProgress: true,
    cycleId: result.cycleId,
    allocation: result.allocation,
    completed,
    allCompleted: !!result.allCompleted,
    scores: result.scores ?? emptyV2CareScores(),
  });
  return {
    ...state,
    game: {
      ...state.game,
      v2EnergySeconds: result.energySeconds,
      v2Care: care,
      // v2 Care UI is gated by v2Care.inProgress — do not force v1 sessionInProgress.
      water: completed.water,
      sun: completed.sun,
      fertilizer: completed.fertilizer,
    },
  };
}

/**
 * Apply atomic activity response: energy, completed flags, activity done flags.
 * Pending rewards / XP for sessionComplete are applied by the caller (UI animation).
 */
export function applyV2CareActivityToState(
  state: UserState,
  result: EconomyV2CareActivityResponse,
): UserState {
  const prev = normalizeV2Care(state.game.v2Care);
  const completed: EconomyV2CareCompletedResponse = result.completed;
  const care = normalizeV2Care({
    ...prev,
    // Keep inProgress true until finishV2Care so UI can still read completed flags.
    inProgress: true,
    cycleId: result.cycleId,
    completed,
    allCompleted: !!result.allCompleted,
    scores: result.scores ?? prev.scores,
  });
  return {
    ...state,
    game: {
      ...state.game,
      v2EnergySeconds: result.energySeconds,
      v2Care: care,
      // Mirror server completed → activity buttons (source of truth is v2 endpoint).
      water: completed.water,
      sun: completed.sun,
      fertilizer: completed.fertilizer,
      ...(result.sessionComplete
        ? {
            pendingBaseReward: result.pendingBaseReward,
            pendingBonusReward: result.pendingBonusReward,
            pendingStoredSessions: 0,
            lastSessionTime: Date.now(),
          }
        : {}),
    },
  };
}

export function applyV2CareFinishToState(
  state: UserState,
  energySeconds: number,
): UserState {
  return {
    ...state,
    game: {
      ...state.game,
      v2EnergySeconds: energySeconds,
      v2Care: emptyV2CareState(),
    },
  };
}

/** Merge GET /game/state care snapshot into local game flags for F5 recovery. */
export function applyV2CareSnapshotToState(
  state: UserState,
  careRaw: EconomyV2CareStateResponse | null | undefined,
  energySeconds?: number,
): UserState {
  const care = normalizeV2Care(careRaw);
  const nextEnergy =
    energySeconds !== undefined
      ? energySeconds
      : state.game.v2EnergySeconds;
  return {
    ...state,
    game: {
      ...state.game,
      v2EnergySeconds: nextEnergy,
      v2Care: care,
      water: care.inProgress ? care.completed.water : state.game.water,
      sun: care.inProgress ? care.completed.sun : state.game.sun,
      fertilizer: care.inProgress
        ? care.completed.fertilizer
        : state.game.fertilizer,
    },
  };
}

export function careErrorMessage(err: unknown): string {
  const e = err as { status?: number; message?: string; code?: string };
  const status = e?.status;
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? "");
  if (status === 409 && (code === "pending_rewards" || /pending/i.test(msg))) {
    return "Сначала заберите награду за прошлый уход.";
  }
  if (status === 409 && /energy|insufficient/i.test(msg)) {
    return "Недостаточно энергии для ухода (нужно не меньше 15 сек).";
  }
  if (status === 409 && /cycle/i.test(msg)) {
    return "Цикл ухода устарел. Обновляем состояние…";
  }
  if (status === 409 && /incomplete|activities/i.test(msg)) {
    return "Сначала завершите все три активности.";
  }
  if (status === 400) {
    return "Некорректный запрос ухода.";
  }
  if (!status || status >= 500) {
    return "Сеть или сервер недоступны. Попробуйте ещё раз.";
  }
  return msg || "Не удалось синхронизировать уход.";
}
