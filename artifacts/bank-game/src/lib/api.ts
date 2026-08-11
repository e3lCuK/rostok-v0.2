// API client — thin wrapper around fetch for game endpoints
const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...restOptions } = options ?? {};
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders as Record<string, string> ?? {}),
    },
    ...restOptions,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), {
      status: res.status,
      code: body.code,
    });
  }
  return res.json();
}

export interface AuthUser {
  id: number;
  username: string;
  nickname: string;
  email?: string | null;
}

export interface GameStateResponse {
  exists: boolean;
  balances?: {
    balance: number;
    vaultBalance?: number;
    earned: number;
    totalDaysEarned: number;
    startDate: number;
  };
  game?: {
    lastSessionTime: number | null;
    sessionInProgress: boolean;
    water: boolean;
    sun: boolean;
    fertilizer: boolean;
    streakDays: number;
    missedSessions: number;
    pendingBaseReward: number;
    pendingBonusReward: number;
    /** Separate Metelka pending reward (not Care claimAll). */
    metelkaPendingReward?: {
      active: boolean;
      baseAmount: number;
      bonusAmount: number;
      totalAmount: number;
      xpAmount: number;
      createdAt: number | null;
      claimToken: string | null;
      claimedAt: number | null;
    };
    pendingStoredSessions: number;
    treeGrowthMM: number;
    treeGrowthRemainder: number;
    playerXP: number;
    playerLevel: number;
    xpHistory?: import("@/lib/engine").XpHistoryEntry[];
    tutorialDone?: boolean;
    sproutPlanted?: boolean;
    v2EnergySeconds?: number;
    v2EnergyAnchorAt?: number | null;
    /** Economy v2 Care cycle snapshot. */
    v2Care?: EconomyV2CareStateResponse;
    /** Root maturation (ready mask). Collected bank is v2EnergySeconds. */
    v2Roots?: EconomyV2RootsState;
    /** Excess beyond ordinary 60-capacity (t_excess). */
    v2Excess?: EconomyV2ExcessState;
    v2Freshness?: number;
    v2IncomeAnchorAt?: number | null;
    /**
     * Economy v3 parallel roots snapshot — omitted when feature flag is off.
     * Nested careCycle includes rewardPreview + claim.
     */
    v3Roots?: EconomyV3RootsState;
    /** One-shot auto-transfer metadata for this GET only (not persisted). */
    v3AutoTransfer?: EconomyV3AutoTransferPublic;
    /** Legacy v1 scores. */
    sessionWaterScore?: number;
    sessionSunScore?: number;
    sessionFertilizerScore?: number;
  };
  history?: {
    amount: number;
    type:
      | "base"
      | "bonus"
      | "metelka"
      | "excess"
      | "excess_base"
      | "excess_bonus"
      | string;
    date: string;
  }[];
  /** Server SoT: income for one completed mini-game by duration preset. */
  incomeByPreset?: Array<{
    presetSeconds: number;
    income: number;
    base: number;
    bonus: number;
  }>;
}

export type EconomyV2CareActivity = "water" | "sun" | "fertilizer";

/** Economy v3 root kinds (same labels as Care activities). */
export type EconomyV3RootKind = "water" | "sun" | "fertilizer";

export interface EconomyV3RootState {
  seconds: number;
  fullSegments: number;
  partialSegmentSeconds: number;
  capacitySeconds: number;
  fillFraction: number;
  playableFromRoot: boolean;
  transferred: boolean;
  frozen: boolean;
}

export interface EconomyV3ActivityReserve {
  seconds: number;
  capacitySeconds: number;
  playable: boolean;
}

export interface EconomyV3CareAvailabilityEntry {
  reserveSeconds: number;
  playable: boolean;
  maxPresetSeconds: number;
}

export type EconomyV3CareActivityStatus = "active" | "completed";

export interface EconomyV3CareSessionState {
  active: boolean;
  activity: EconomyV3RootKind | null;
  presetSeconds: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: EconomyV3CareActivityStatus | null;
  skill: number | null;
}

export type EconomyV3CareCycleStatus = "in_progress" | "ready" | "finished";

export interface EconomyV3CareCycleActivityResult {
  completed: boolean;
  presetSeconds: number | null;
  skill: number | null;
}

export interface EconomyV3CareRewardPreview {
  available: boolean;
  xp: number;
  apples: number;
  treeGrowth: number;
  income: {
    base: number;
    bonus: number;
    total: number;
  };
}

export interface EconomyV3CareCycleClaim {
  claimed: boolean;
  claimedAt: string | null;
  xp: number;
  treeGrowth: number;
  income: {
    base: number;
    bonus: number;
    total: number;
  };
}

export interface EconomyV3CareCycleState {
  startedAt: string | null;
  completedAt: string | null;
  finishedAt: string | null;
  status: EconomyV3CareCycleStatus | null;
  allCompleted: boolean;
  readyToFinish: boolean;
  totalPresetSeconds: number | null;
  averageSkill: number | null;
  activities: Record<EconomyV3RootKind, EconomyV3CareCycleActivityResult>;
  rewardPreview: EconomyV3CareRewardPreview;
  claim: EconomyV3CareCycleClaim;
}

export interface EconomyV3GenerationState {
  anchorAt: string | null;
  progress: number;
  /** Persisted round-robin cursor: 0=water, 1=sun, 2=fertilizer. */
  rrCursor?: number;
  /** Next root that will receive a generated unit (from rrCursor). */
  nextRoot?: EconomyV3RootKind | null;
  frozenAt: string | null;
  insuranceDeadlineAt: string | null;
  firstTransferredRoot: EconomyV3RootKind | null;
  transferredRoots: EconomyV3RootKind[];
  secondsUntilNextWholeSecond: number | null;
  /** Absolute ISO deadline for the current full energy-unit cycle. */
  nextWholeSecondAt?: string | null;
  /** Full cycle length in real seconds (`720 / M(K)`); null when idle. */
  cycleDurationSeconds?: number | null;
  accumulating: boolean;
}

/** Excess / Metelka gate from server (reserves + roots). */
export interface EconomyV3ExcessGateState {
  ordinaryFull: boolean;
  /** All three roots at capacity 25 — Metelka product gate. */
  rootsFull: boolean;
  reservesFull: Record<EconomyV3RootKind, boolean>;
  generatingExcess: boolean;
}

/** Roots-full → Metelka-before-transfer cycle (server). */
export interface EconomyV3MetelkaCycleState {
  required: boolean;
  completedForCycle: boolean;
  transferLocked: boolean;
  careLocked: boolean;
  phase:
    | "roots_accumulating"
    | "roots_full_waiting_excess"
    | "metelka_available"
    | "metelka_active"
    | "metelka_pending_result"
    | "root_transfer_unlocked";
}

/** Public `game.v3Roots` when Economy v3 is enabled. */
export interface EconomyV3RootsState {
  enabled: true;
  dailyCapSeconds: number;
  /** Same as dailyCapSeconds — shared base preset (5…25). */
  basePresetSeconds?: number;
  /** Visit streak bonus seconds (0…5). */
  activeDailyBonusSeconds?: number;
  /** 1-based visit day used for the daily preset bonus. */
  currentVisitDay?: number;
  /** base + bonus, capped at 30 — root and reserve capacity. */
  effectivePresetSeconds?: number;
  dayKey: string | null;
  roots: Record<EconomyV3RootKind, EconomyV3RootState>;
  reserves: Record<EconomyV3RootKind, EconomyV3ActivityReserve>;
  careAvailability: Record<EconomyV3RootKind, EconomyV3CareAvailabilityEntry>;
  careSession: EconomyV3CareSessionState;
  careCycle: EconomyV3CareCycleState;
  generation: EconomyV3GenerationState;
  excessGate: EconomyV3ExcessGateState;
  metelkaCycle: EconomyV3MetelkaCycleState;
}

/** One-shot insurance auto-transfer from GET /game/state (sibling of v3Roots). */
export interface EconomyV3AutoTransferPublic {
  applied: true;
  at: string;
  roots: EconomyV3RootKind[];
  acceptedByRoot: Partial<Record<EconomyV3RootKind, number>>;
  discardedByRoot: Partial<Record<EconomyV3RootKind, number>>;
}

export interface EconomyV2RootsState {
  readyMask: string;
  readyCount: number;
  generationProgress: number;
  secondsPerSection: number;
  secondsUntilNextSection: number | null;
  isFull: boolean;
  /** Shared bank+ready+progress capacity is full (server truth). */
  storageFull?: boolean;
  storageOccupied?: number;
  storageFree?: number;
  storageOverCapacity?: boolean;
}

/** Excess (t_excess) snapshot from GET /game/state — server formulas only. */
export interface EconomyV2ExcessWeb {
  id: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  kind?: "regular" | "special" | "base_income";
  type?: "regular" | "base_income" | "special";
  cleared?: boolean;
}

export interface EconomyV2ExcessSessionState {
  active: boolean;
  /** 2 = new model; null/1 = legacy. */
  version?: number | null;
  startedAt: number | null;
  sourceSeconds: number | null;
  sourceElapsedMs?: number | null;
  capital?: number | null;
  /** Snapshot of excess-base ledger at start (version=2). */
  baseIncome?: number | null;
  baseWebCleared?: boolean;
  baseWebCollectionMode?: "manual" | "automatic" | null;
  presetSeconds: number | null;
  rate: number | null;
  /** Regular Skill/XP webs only (excludes red base-income web). */
  webCount?: number | null;
  whiteWebCount?: number | null;
  layoutSeed?: number | null;
  clearedWebIds?: string[];
  clearedWebCount?: number;
  remainingWebCount?: number;
  specialWebId?: string | null;
  baseWebId?: string | null;
  specialCleared?: boolean;
  /** Version=2: cumulative raw bonus unlocked by white clears (not yet credited). */
  bonusRawUnlocked?: number | null;
  /** Version=2: integer XP already applied this session. */
  xpAwarded?: number | null;
  webs?: EconomyV2ExcessWeb[];
}

/** Version=2 clear payload — visual/raw shares from server (no local formulas). */
export interface EconomyV2ExcessRewardDelta {
  kind: "regular" | "base_income" | "progress";
  bonusRawDelta?: number;
  xpRawDelta?: number;
  clearedWhiteCount?: number;
  whiteWebCount?: number;
  cumulativeBonusRaw?: number;
  cumulativeXpRaw?: number;
  baseIncomeAmount?: number;
  collectionMode?: "manual" | "automatic";
}

export interface EconomyV2ExcessResultXp {
  max: number | null;
  raw: number | null;
  awarded: number | null;
  applied: boolean;
}

export interface EconomyV2ExcessResultIncomeBase {
  amount: number | null;
  collectionMode: "manual" | "automatic" | null;
  applied: boolean;
}

export interface EconomyV2ExcessResultIncomeBonus {
  gross: number | null;
  skill: number | null;
  paid: number | null;
  applied: boolean;
}

export interface EconomyV2ExcessResultIncomeTotal {
  paid: number | null;
  applied: boolean;
}

export interface EconomyV2ExcessResultIncome {
  available: boolean;
  reason?: "ok" | "missing_excess_elapsed_history" | "zero" | null;
  capital: number | null;
  excessElapsedMs: number | null;
  annualRate: number | null;
  gross: number | null;
  paymentFactor: number | null;
  paid: number | null;
  applied: boolean;
  base?: EconomyV2ExcessResultIncomeBase;
  bonus?: EconomyV2ExcessResultIncomeBonus;
  total?: EconomyV2ExcessResultIncomeTotal;
}

export interface EconomyV2ExcessResultState {
  available: boolean;
  sessionVersion?: number | null;
  finishedAt: number | null;
  reason: "time_expired" | "all_webs_cleared" | null;
  clearedCount: number | null;
  clearedWhiteCount?: number | null;
  webCount: number | null;
  whiteWebCount?: number | null;
  skill: number | null;
  sourceSeconds: number | null;
  presetSeconds: number | null;
  rate: number | null;
  xp?: EconomyV2ExcessResultXp;
  income?: EconomyV2ExcessResultIncome;
}

export interface EconomyV2ExcessState {
  excessSeconds: number;
  excessElapsedMs?: number;
  /** Accrued Care-rate base income for excess-period wall-clock (server ledger). */
  excessBaseIncome?: number;
  excessFinanciallyValid?: boolean;
  excessCycle: number;
  excessAvailable: boolean;
  /**
   * Live Metelka duration T(n) — derived from excessSeconds on server/client.
   * Not a DB column. Session freeze uses session.presetSeconds only.
   */
  excessPresetSeconds: number;
  excessRate: number;
  session?: EconomyV2ExcessSessionState;
  result?: EconomyV2ExcessResultState;
}

export interface EconomyV2RootsCollectResponse {
  collected: true;
  collectedSectionIndex: number;
  energySeconds: number;
  roots: EconomyV2RootsState;
}

export interface EconomyV2CareAllocationResponse {
  waterSeconds: number;
  sunSeconds: number;
  fertilizerSeconds: number;
  totalAllocatedSeconds: number;
}

export interface EconomyV2CareCompletedResponse {
  water: boolean;
  sun: boolean;
  fertilizer: boolean;
}

export interface EconomyV2CareScoresResponse {
  water: number | null;
  sun: number | null;
  fertilizer: number | null;
}

export interface EconomyV2CareStateResponse {
  inProgress: boolean;
  cycleId: string | null;
  allocation: EconomyV2CareAllocationResponse;
  completed: EconomyV2CareCompletedResponse;
  allCompleted: boolean;
  scores?: EconomyV2CareScoresResponse;
}

export interface EconomyV2CareStartResponse {
  cycleId: string;
  allocation: EconomyV2CareAllocationResponse;
  completed: EconomyV2CareCompletedResponse;
  allCompleted: boolean;
  energySeconds: number;
  scores?: EconomyV2CareScoresResponse;
}

export interface EconomyV2CareActivityResultPayload {
  skillScore: number;
  collected?: number;
  maximum?: number;
}

export interface EconomyV2CareActivityResponse {
  cycleId: string;
  activity: EconomyV2CareActivity;
  spentSeconds: number;
  energySeconds: number;
  skillScore: number;
  activityXp: number;
  totalCycleXp: number;
  cycleSkill: number;
  completed: EconomyV2CareCompletedResponse;
  allCompleted: boolean;
  sessionComplete: boolean;
  scores: EconomyV2CareScoresResponse;
  baseReward: number;
  bonusReward: number;
  pendingBaseReward: number;
  pendingBonusReward: number;
  /** Always 0 in Economy v2 income path. */
  pendingStoredSessions: number;
  /** @deprecated Not used for v2 money. */
  storedSessions?: number;
  xpGained: number;
  playerXp: number;
  playerLevel: number;
  freshness?: number;
  prevLevel?: number;
  newLevel?: number;
  levelUp?: boolean;
  xpHistory?: import("@/lib/engine").XpHistoryEntry[];
}

export interface EconomyV2CareFinishResponse {
  finished: true;
  energySeconds: number;
}

export const api = {
  // Auth
  authMe: () => request<AuthUser>("/auth/me"),
  login: (username: string, password: string) =>
    request<AuthUser>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, nickname: string, password: string) =>
    request<AuthUser>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, nickname, password }),
    }),
  logout: () =>
    request<{ success: boolean }>("/auth/logout", { method: "POST" }),

  // Game
  getState: () => request<GameStateResponse>("/game/state"),

  initAccount: (startingCapital: number) =>
    request<{ success: boolean }>("/game/init", {
      method: "POST",
      body: JSON.stringify({ startingCapital }),
    }),

  /**
   * Finish tutorial. Pass `generationAnchorAt` (epoch ms) = start of the
   * tutorial 12:00 wait so live root generation continues from that clock.
   */
  tutorialComplete: (input?: { generationAnchorAt?: number | null }) =>
    request<{
      success: boolean;
      energyAnchorAt?: number;
      generationAnchorAt?: number;
    }>("/game/tutorial/complete", {
      method: "POST",
      body: JSON.stringify(
        input?.generationAnchorAt != null &&
          Number.isFinite(input.generationAnchorAt)
          ? { generationAnchorAt: Math.trunc(input.generationAnchorAt) }
          : {},
      ),
    }),

  /**
   * Economy v3 Tutorial — idempotent grant of 5s per root (no excess / income).
   * Pass `kind` to stage one root (water → sun → fertilizer).
   * Pass `{ all: true }` only for recovery (fills all three).
   * Requires ENABLE_ECONOMY_V3_ROOTS + tutorial_done=false.
   */
  prepareTutorialV3: (
    input: { kind: EconomyV3RootKind } | { all: true },
  ) =>
    request<{
      granted: true;
      alreadyPrepared: boolean;
      changed: boolean;
      rootsSeconds: Record<EconomyV3RootKind, number>;
      v3Roots: EconomyV3RootsState;
    }>("/game/tutorial/v3/prepare", {
      method: "POST",
      body: JSON.stringify(
        "all" in input && input.all
          ? { all: true }
          : { kind: (input as { kind: EconomyV3RootKind }).kind },
      ),
    }),

  /** Tutorial: tap plant pad → unlock tree + underground. */
  plantTutorialSprout: () =>
    request<{
      planted: true;
      alreadyPlanted: boolean;
      sproutPlanted: true;
      balances: {
        balance: number;
        vaultBalance: number;
        earned: number;
      };
    }>("/game/tutorial/v3/plant-sprout", { method: "POST" }),

  /** Tutorial: drag vault capital into the tree chest. */
  transferTutorialCapitalVault: () =>
    request<{
      transferred: true;
      alreadyTransferred: boolean;
      amount: number;
      sproutPlanted: boolean;
      balances: {
        balance: number;
        vaultBalance: number;
        earned: number;
      };
    }>("/game/tutorial/v3/capital-vault/transfer", { method: "POST" }),

  /** Persist tutorial 12:00 wait start as v3 generation anchor. */
  armTutorialV3Wait: (startedAtMs: number) =>
    request<{
      armed: true;
      startedAtMs: number;
      v3Roots: EconomyV3RootsState;
    }>("/game/tutorial/v3/arm-wait", {
      method: "POST",
      body: JSON.stringify({ startedAtMs: Math.trunc(startedAtMs) }),
    }),

  /**
   * After tutorial 12:00 elapses — settle root energy like main play
   * without completing the tutorial.
   */
  syncTutorialV3WaitEnergy: (startedAtMs?: number | null) =>
    request<{
      synced: true;
      wholeSeconds: number;
      v3Roots: EconomyV3RootsState;
    }>("/game/tutorial/v3/sync-wait-energy", {
      method: "POST",
      body: JSON.stringify(
        startedAtMs != null && Number.isFinite(startedAtMs)
          ? { startedAtMs: Math.trunc(startedAtMs) }
          : {},
      ),
    }),

  accrue: () =>
    request<{ accrued: number; days: number }>("/game/accrue", { method: "POST" }),

  startSession: () =>
    request<{ success: boolean }>("/game/session/start", { method: "POST" }),

  /**
   * Economy v2 Care — atomic spend + result + XP (+ pending rewards on 3rd).
   */
  startV2Care: () =>
    request<EconomyV2CareStartResponse>("/game/v2/care/start", { method: "POST" }),

  completeV2CareActivity: (
    cycleId: string,
    activity: EconomyV2CareActivity,
    result: EconomyV2CareActivityResultPayload,
  ) =>
    request<EconomyV2CareActivityResponse>("/game/v2/care/activity", {
      method: "POST",
      body: JSON.stringify({ cycleId, activity, result }),
    }),

  finishV2Care: (cycleId: string) =>
    request<EconomyV2CareFinishResponse>("/game/v2/care/finish", {
      method: "POST",
      body: JSON.stringify({ cycleId }),
    }),

  /** Collect one matured root section into the Care energy bank. */
  collectV2RootSection: (sectionIndex: number) =>
    request<EconomyV2RootsCollectResponse>("/game/v2/roots/collect", {
      method: "POST",
      body: JSON.stringify({ sectionIndex }),
    }),

  doAction: (action: "water" | "sun" | "fertilizer", skillScore?: number, count?: number) =>
    request<{
      success: boolean;
      sessionComplete: boolean;
      baseReward: number;
      bonusReward: number;
      storedSessions: number;
      xpGained?: number;
      newLevel?: number;
      prevLevel?: number;
      levelUp?: boolean;
      xpHistory?: import("@/lib/engine").XpHistoryEntry[];
    }>(
      "/game/session/action",
      { method: "POST", body: JSON.stringify({ action, skillScore, count }) },
    ),

  buyShopItem: (itemId: string) =>
    request<{ success: boolean; totalApples: number; purchasedItems: string[] }>(
      "/game/shop/buy",
      { method: "POST", body: JSON.stringify({ itemId }) },
    ),

  claim: (type: "base" | "bonus") =>
    request<{ success: boolean; amount: number; treeGrowthMM: number; treeGrowthRemainder: number }>(
      "/game/session/claim",
      { method: "POST", body: JSON.stringify({ type }) },
    ),

  claimAll: (applesCollected?: number) =>
    request<{ success: boolean; totalAmount: number; baseAmount: number; bonusAmount: number; treeGrowthMM: number; treeGrowthRemainder: number }>(
      "/game/session/claimAll",
      { method: "POST", body: JSON.stringify({ applesCollected: applesCollected ?? 0 }) },
    ),

  forgotPassword: (email: string) =>
    request<{ success: boolean }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),

  updateNickname: (nickname: string) =>
    request<AuthUser>("/auth/nickname", { method: "PATCH", body: JSON.stringify({ nickname }) }),

  updateEmail: (email: string) =>
    request<AuthUser>("/auth/email", { method: "PATCH", body: JSON.stringify({ email }) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),

  getAchievements: () =>
    request<{
      counts: {
        total_sessions: number;
        total_login_days: number;
        total_water_drops: number;
        total_sun_catches: number;
        total_leaf_picks: number; // legacy name — fertilizer catch count from API/DB
        tutorial_done: number; // 0|1 — unlocks «Пройти обучение»
      };
      claimed: string[];
      totalApples: number;
    }>("/game/achievements"),

  claimAchievement: (id: string) =>
    request<{ success: boolean; applesAwarded: number; totalApples: number }>(
      "/game/achievements/claim",
      { method: "POST", body: JSON.stringify({ id }) },
    ),

  getLeaderboard: () =>
    request<{ players: LeaderboardPlayer[] }>("/game/leaderboard"),

  // Debug (server endpoints available only outside production)
  debugAddXP: (xp: number) =>
    request<{ success: boolean; playerXP: number; playerLevel: number }>(
      "/game/debug/add-xp",
      { method: "POST", body: JSON.stringify({ xp }) },
    ),

  debugAddApples: (amount: number) =>
    request<{ success: boolean; totalApples: number }>(
      "/game/debug/add-apples",
      { method: "POST", body: JSON.stringify({ amount }) },
    ),

  debugAddSessions: () =>
    request<{ success: boolean; missedSessions: number }>(
      "/game/debug/add-sessions",
      { method: "POST" },
    ),

  resetProgress: () =>
    request<{ success: boolean }>("/game/reset-progress", { method: "DELETE" }),

  debugResetAll: () =>
    request<{ success: boolean }>("/game/debug/reset-all", { method: "DELETE" }),

  debugResetTutorial: () =>
    request<{ success: boolean }>("/game/debug/reset-tutorial", { method: "POST" }),

  /**
   * Dev-only: mutate Economy v2 stored energy (game seconds 0–60).
   * Backend gated by areDebugRoutesEnabled(); returns authoritative state.
   */
  debugEconomyV2Energy: (body: { deltaSeconds?: number; setSeconds?: number }) =>
    request<{
      success: boolean;
      economyV2: {
        energySeconds: number;
        energyAnchorAt: number;
        lastSessionTime: number | null;
        missedSessions: number;
      };
      capacity?: {
        bankSeconds: number;
        readyCount: number;
        generationProgress: number;
        occupied: number;
        freeCapacity: number;
        storageFull: boolean;
        storageOverCapacity: boolean;
      };
      game: {
        v2EnergySeconds: number;
        v2EnergyAnchorAt: number;
        lastSessionTime: number | null;
        missedSessions: number;
        v2Roots: EconomyV2RootsState;
      };
    }>("/game/debug/economy-v2/energy", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /**
   * Dev-only: mutate server readyMask (reset / add free sections).
   * Does not change the Care energy bank. Backend gated by areDebugRoutesEnabled().
   */
  debugEconomyV2Roots: (
    body: { action: "reset" } | { action: "add"; count: number },
  ) =>
    request<{
      success: boolean;
      readyMask: string;
      readyCount: number;
      generationProgress: number;
      energySeconds: number;
      anchorAt: number;
      roots: EconomyV2RootsState;
      game: {
        v2EnergySeconds: number;
        v2EnergyAnchorAt: number;
        v2Roots: EconomyV2RootsState;
      };
    }>("/game/debug/economy-v2/roots", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /**
   * Dev-only: mutate v2_excess_seconds / Metelka preset via min ledger /
   * or clear Metelka session fields (resetSession).
   * Backend gated by areDebugRoutesEnabled().
   *
   * addPresetSeconds: +N ledger seconds + fill v3 roots to capacity + natural elapsed.
   * Legacy: setPreset / setElapsed / add (raw ledger).
   */
  debugEconomyV2Excess: (
    body:
      | { action: "reset" }
      | { action: "addPresetSeconds"; seconds: number }
      | { action: "add"; seconds: number }
      | { action: "set"; seconds: number }
      | {
          action: "setPreset";
          presetSeconds: number;
          /** Omit → natural elapsed; 0 → zero-money test. */
          elapsedMs?: number;
        }
      | { action: "setElapsed"; elapsedMs: number }
      | { action: "setFinancial"; seconds: number; elapsedMs: number }
      | { action: "resetSession" },
  ) =>
    request<{
      success: boolean;
      excessSeconds: number;
      excessElapsedMs?: number;
      excess: EconomyV2ExcessState;
      capacitySeconds?: number;
      v3Roots?: EconomyV3RootsState;
      game: {
        v2Excess: EconomyV2ExcessState;
        v3Roots?: EconomyV3RootsState;
      };
    }>("/game/debug/economy-v2/excess", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /**
   * Dev-only: set/reset Economy v3 root + reserve seconds.
   * Requires ENABLE_ECONOMY_V3_ROOTS + debug routes. Does not touch Economy v2.
   */
  debugEconomyV3Roots: (
    body:
      | { action: "reset" }
      | {
          action?: "set";
          roots?: { water?: number; sun?: number; fertilizer?: number };
          reserves?: { water?: number; sun?: number; fertilizer?: number };
        }
      | {
          action: "add";
          roots?: { water?: number; sun?: number; fertilizer?: number };
          reserves?: { water?: number; sun?: number; fertilizer?: number };
        }
      | {
          action: "fillToCapacity";
          roots?: boolean;
          reserves?: boolean;
        },
  ) =>
    request<{
      success: boolean;
      v3Roots: EconomyV3RootsState;
      capacitySeconds?: number;
      clamp?: {
        capacitySeconds: number;
        roots?: Partial<
          Record<
            EconomyV3RootKind,
            {
              requestedSeconds: number;
              appliedSeconds: number;
              capacitySeconds: number;
              clamped: boolean;
            }
          >
        >;
        reserves?: Partial<
          Record<
            EconomyV3RootKind,
            {
              requestedSeconds: number;
              appliedSeconds: number;
              capacitySeconds: number;
              clamped: boolean;
            }
          >
        >;
        addRoots?: Partial<
          Record<
            EconomyV3RootKind,
            {
              requestedAddition: number;
              appliedAddition: number;
              discardedDebugAddition: number;
              beforeSeconds: number;
              afterSeconds: number;
              capacitySeconds: number;
            }
          >
        >;
        addReserves?: Partial<
          Record<
            EconomyV3RootKind,
            {
              requestedAddition: number;
              appliedAddition: number;
              discardedDebugAddition: number;
              beforeSeconds: number;
              afterSeconds: number;
              capacitySeconds: number;
            }
          >
        >;
      };
      game: { v3Roots: EconomyV3RootsState };
    }>("/game/debug/economy-v3/roots", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /**
   * Start one Metelka (excess) attempt. Production route (auth required).
   * Freezes source/preset/rate; does not deduct excess.
   */
  startEconomyV2ExcessSession: () =>
    request<{
      excessSeconds: number;
      excess: EconomyV2ExcessState;
      session: EconomyV2ExcessSessionState;
    }>("/game/v2/excess/start", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /**
   * Clear one Metelka cobweb.
   * Version=2: record-only progress (moneyGained/xpGained = 0).
   * Legacy: per-click XP/money via reward.
   */
  clearEconomyV2ExcessWeb: (webId: string) =>
    request<{
      excessSeconds: number;
      excess: EconomyV2ExcessState;
      session: EconomyV2ExcessSessionState;
      clearedWebId: string;
      reward: {
        kind: "regular" | "special" | "base_income" | "progress";
        xpGained: number;
        moneyGained: number;
      };
      /** Version=2 only; null/absent for legacy. */
      rewardDelta?: EconomyV2ExcessRewardDelta | null;
      playerXp: number;
      playerLevel: number;
      balances: { balance: number; earned: number };
    }>("/game/v2/excess/webs/clear", {
      method: "POST",
      body: JSON.stringify({ webId }),
    }),

  /**
   * Finish Metelka (timer / all regular webs).
   * Version=2: writes separate metelkaPendingReward; deducts excess; clears session.
   * Does not credit balance / player_xp yet. Legacy: auto-collect special.
   */
  finishEconomyV2ExcessSession: () =>
    request<{
      excessSeconds: number;
      excessElapsedMs?: number;
      excess: EconomyV2ExcessState;
      result: EconomyV2ExcessResultState;
      playerXp: number;
      playerLevel: number;
      xpGained: number;
      balances: { balance: number; earned: number };
      moneyGained: number;
      finishReason: "time_expired" | "all_webs_cleared" | null;
      /** Ledger seconds deducted this finish (not a game preset T). */
      consumedExcessSeconds?: number;
      income?: {
        base: number;
        bonus: number;
        total: number;
      };
      pendingBaseReward?: number;
      pendingBonusReward?: number;
      automaticReward?: { baseIncomeAppliedNow: number };
      bonusIncomeAppliedNow?: number;
      metelkaPendingReward?: {
        active: boolean;
        baseAmount: number;
        bonusAmount: number;
        totalAmount: number;
        xpAmount: number;
        createdAt: number | null;
        claimToken: string | null;
        claimedAt: number | null;
      };
    }>("/game/v2/excess/finish", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /**
   * Claim Metelka pending reward by claimToken.
   * Credits balance + XP + income_history; closes pending. No tree growth.
   */
  claimMetelkaPendingReward: (claimToken: string) =>
    request<{
      success: true;
      reward: {
        baseAmount: number;
        bonusAmount: number;
        totalAmount: number;
        xpAmount: number;
        claimedAt: number;
        claimToken: string;
      };
      moneyGained: number;
      xpGained: number;
      balances: { balance: number; earned: number };
      playerXp: number;
      playerLevel: number;
      metelkaPendingReward: {
        active: boolean;
        baseAmount: number;
        bonusAmount: number;
        totalAmount: number;
        xpAmount: number;
        createdAt: number | null;
        claimToken: string | null;
        claimedAt: number | null;
      };
    }>("/game/v2/excess/metelka/claim", {
      method: "POST",
      body: JSON.stringify({ claimToken }),
    }),

  /**
   * Acknowledge finished Metelka result — legacy pending card / old pending v2.
   * New version=2 finishes settle in finish itself.
   */
  acknowledgeEconomyV2ExcessResult: () =>
    request<{
      excessSeconds: number;
      excessElapsedMs?: number;
      excess: EconomyV2ExcessState;
      result: EconomyV2ExcessResultState;
      balances: { balance: number; earned: number };
      paidIncomeApplied: number;
    }>("/game/v2/excess/result/acknowledge", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /**
   * Economy v3: transfer one finished root into its activity reserve.
   * Response includes fresh `v3Roots` for commitState (no UI yet).
   */
  transferV3Root: (root: EconomyV3RootKind) =>
    request<{
      transferred: true;
      root: EconomyV3RootKind;
      acceptedSeconds: number;
      discardedSeconds: number;
      v3Roots: EconomyV3RootsState;
    }>("/game/v3/roots/transfer", {
      method: "POST",
      body: JSON.stringify({ root }),
    }),

  /**
   * Economy v3 Care — start one activity (spends reserve on server).
   * Body presetSeconds must come from careAvailability[activity].maxPresetSeconds.
   */
  startV3CareActivity: (activity: EconomyV3RootKind, presetSeconds: number) =>
    request<{
      started: true;
      activity: EconomyV3RootKind;
      presetSeconds: number;
      spentSeconds: number;
      v3Roots: EconomyV3RootsState;
    }>("/game/v3/care/start-activity", {
      method: "POST",
      body: JSON.stringify({ activity, presetSeconds }),
    }),

  /** Economy v3 Care — finish active activity with skill in [0, 1]. */
  finishV3CareActivity: (
    activity: EconomyV3RootKind,
    skill: number,
    /** Items caught — counted toward catch achievements (incl. tutorial). */
    count: number = 0,
  ) =>
    request<{
      finished: true;
      alreadyCompleted: boolean;
      activity: EconomyV3RootKind;
      skill: number;
      /** Calculated into pending; not yet on balance. */
      income: {
        base: number;
        bonus: number;
        total: number;
        presetSeconds: number;
      };
      balances: { balance: number; earned: number };
      treeGrowthMM: number;
      pendingBaseReward: number;
      pendingBonusReward: number;
      v3Roots: EconomyV3RootsState;
    }>("/game/v3/care/finish-activity", {
      method: "POST",
      body: JSON.stringify({ activity, skill, count }),
    }),

  /** Economy v3 Care — clear completed transient session after result UI. */
  acknowledgeV3CareActivity: (activity: EconomyV3RootKind) =>
    request<{
      acknowledged: true;
      activity: EconomyV3RootKind;
      v3Roots: EconomyV3RootsState;
    }>("/game/v3/care/acknowledge-activity", {
      method: "POST",
      body: JSON.stringify({ activity }),
    }),

  /** Economy v3 Care — finish full cycle (after all three activities). */
  finishV3CareCycle: () =>
    request<{
      finished: true;
      cycle: {
        status: "finished";
        finishedAt: string;
        totalPresetSeconds: number;
        averageSkill: number;
      };
      rewardPreview: EconomyV3CareRewardPreview;
      v3Roots: EconomyV3RootsState;
    }>("/game/v3/care/finish-cycle", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /** Economy v3 Care — claim cycle rewards (XP; money stays pending for coin/claimAll). */
  claimV3CareCycle: () =>
    request<{
      claimed: true;
      alreadyClaimed: boolean;
      xp: number;
      income: { base: number; bonus: number; total: number };
      treeGrowth: number;
      playerXp: number;
      playerLevel: number;
      pendingBaseReward: number;
      pendingBonusReward: number;
      totalApples: number;
      treeGrowthMm: number;
      v3Roots: EconomyV3RootsState;
    }>("/game/v3/care/claim-cycle", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /** Economy v3 Care — clear finished cycle after claim UI. */
  acknowledgeV3CareCycle: () =>
    request<{
      acknowledged: true;
      v3Roots: EconomyV3RootsState;
    }>("/game/v3/care/acknowledge-cycle", {
      method: "POST",
      body: JSON.stringify({}),
    }),

};

export interface LeaderboardPlayer {
  rank: number;
  nickname: string;
  xp: number;
  level: number;
  /** Distinct calendar days the player opened the game. */
  loginDays: number;
  treeGrowthMM: number;
  lastSessionXp: number;
  isMe: boolean;
}
