import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence, MotionConfig, useAnimation } from "framer-motion";
import {
  UserState,
  DEFAULT_CAPITAL,
  formatRub,
  formatLbLoginDays,
  formatLbGrowth,
  applyTreeGrowth,
  isSessionLocked,
  getNextSessionTime,
  getTreeStage,
  TREE_STAGE_NAMES,
  getSessionActionsLeft,
  getStreakBonusSeconds,
  getVisitRewardCalendarState,
  resolveCurrentVisitDay,
  SESSION_COOLDOWN_MS,
} from "@/lib/engine";
import { api, type LeaderboardPlayer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import TreeSVG, { STAGE_DIMS } from "@/components/TreeSVG";
import FallingGameWater, { GameType } from "@/components/FallingGameWater";
import ClickGameSun from "@/components/ClickGameSun";
import FertilizerMatchGame from "@/components/FertilizerMatchGame";
import FertilizerIcon from "@/components/FertilizerIcon";
import { ACHIEVEMENTS, AchievementsPanel } from "@/components/AchievementsModal";
import ShopModal from "@/components/ShopModal";
import { Droplets, Sun, Play, CheckCircle2, Shovel, Lock, X, TreePine, Pencil, Check, Settings, ScrollText, Star, Eye, EyeOff, Gift, Clock } from "lucide-react";
import LevelWidget from "@/components/LevelWidget";
import LevelUpAnimation from "@/components/LevelUpAnimation";
import { getLevelProgress } from "@/lib/levels";
import GameAreaBg from "@/components/GameAreaBg";
import AppleBasket from "@/components/AppleBasket";
import TreeGrowthBadge from "@/components/TreeGrowthBadge";
import UndergroundSoilArt from "@/components/v2/UndergroundSoilArt";
import SettingsWidget from "@/components/SettingsWidget";
import EconomyV2MockLayer from "@/components/v2/EconomyV2MockLayer";
import RootEnergyLayer from "@/components/v2/RootEnergyLayer";
import EconomyV3RootSystem from "@/components/v2/EconomyV3RootSystem";
import CapitalChestUnderRoots from "@/components/v2/CapitalChestUnderRoots";
import V3UndergroundWrapRoots from "@/components/v2/V3UndergroundWrapRoots";
import V3RootWaitTimer from "@/components/v2/V3RootWaitTimer";
import {
  createIncomeChestFeedback,
  INCOME_CHEST_FLOAT_MS,
  type IncomeChestFeedback,
} from "@/lib/incomeChestFeedback";
import {
  applyEconomyV2EnergyToState,
  applyEconomyV2RootsDebugToState,
  applyEconomyV2ExcessDebugToState,
  normalizeV2Excess,
} from "@/components/v2/EconomyV2EnergyDebugControls";
import {
  bumpEconomyV2ExcessDebugMutationSeq,
  notifyEconomyV2DebugSnapshot,
  readEconomyV2ExcessDebugMutationSeq,
  registerEconomyV2DebugBridge,
} from "@/lib/economyV2DebugBridge";
import {
  CareActionsRow,
  shouldShowMetelkaCard,
} from "@/components/v2/MetelkaActionCard";
import ExcessCleaningTimer from "@/components/v2/ExcessCleaningTimer";
import ExcessCleaningWebLayer from "@/components/v2/ExcessCleaningWebLayer";
import MetelkaRewardFloatHost from "@/components/v2/MetelkaRewardFloatHost";
import MetelkaRewardCoin from "@/components/v2/MetelkaRewardCoin";
import {
  asPositiveRewardAmount,
  EXCESS_REWARD_FLOAT_MS,
  type ExcessRewardFloat,
} from "@/lib/excessCleaningRewardFloat";
import {
  applyMetelkaClaimToGameState,
  hasMetelkaXpAnimationShown,
  isMetelkaPendingRewardActive,
  markMetelkaXpAnimationShown,
  metelkaClaimErrorMessage,
  metelkaPendingClaimToken,
  normalizeMetelkaPendingReward,
  shouldShowMetelkaFinishXpAnimation,
  unmarkMetelkaXpAnimationShown,
} from "@/lib/metelkaPendingRewardUi";
import {
  excessSessionFinishKey,
  isExcessCleaningMode,
  shouldForceExcessFinish,
  shouldRequestExcessFinish,
} from "@/lib/excessCleaningCountdown";
import { createExcessFinishGuard } from "@/lib/excessFinishGuard";
import { deriveExcessLiveFields } from "@/lib/excessEconomyDerive";
import { isExcessResultAvailable } from "@/lib/excessResultUi";
import {
  DEBUG_WATER_V2_PRESET_SEC,
  ENABLE_ECONOMY_V2_CARE,
  ENABLE_ECONOMY_V2_ROOT_COLLECTION,
  SHOW_ECONOMY_V2_MOCKS,
  SHOW_ECONOMY_V3_ROOTS_PREVIEW,
} from "@/lib/featureFlags";
import { normalizeV2Roots, emptyV2RootsState } from "@/lib/v2Roots";
import { V3_ACTIVITY_ACCENT_COLORS } from "@/lib/v3ActivityColors";
import {
  applyEconomyV3FromServerGame,
  applyEconomyV3RootsToState,
  economyV3DebugReadout,
  normalizeEconomyV3RootsSnapshot,
} from "@/lib/v3Roots";
import {
  isV3ActivityButtonVisuallyLocked,
  mayStartLegacyCareFromActivityCard,
  resolveV3ActivityCard,
  shouldThemeV3ActivityButton,
  shouldUseV3ActivityCardUi,
  v3ActivityReserveFillPercent,
} from "@/lib/v3ActivityCards";
import {
  canStartV3CareActivity,
  formatV3CareError,
  isV3CareSessionBlocking,
  isV3CareStateConflict,
  isV3RootCollectionIncomplete,
  minigameScoreToV3Skill,
  resolveV3CareCycleRecovery,
  resolveV3CareRecovery,
  resolveV3CareStartPresetSeconds,
  resolveV3CareShovelAction,
  ROOTS_COLLECTION_INCOMPLETE_HINT,
  sessionScoresFromV3Claim,
  sessionScoresFromV3RewardPreview,
  shouldAcknowledgeV3CareCycle,
  shouldShowV3CareShovel,
  shouldShowV3RewardPreview,
} from "@/lib/v3CareClient";
import {
  careBlockedByMetelka,
  v3CareBlocksMetelka,
} from "@/lib/v3MetelkaUi";
import {
  isEconomyV3GameCycleEnabled,
  isV3CareUiBusy,
  mayUseLegacyCareSessionFlow,
} from "@/lib/v3GameCycle";
import {
  shouldRefreshV3ExcessAfterTransfer,
  shouldRefreshV3RootsFromClock,
} from "@/lib/v3RootsRefresh";
import V3ActivityReserveFill from "@/components/v2/V3ActivityReserveFill";
import type { EconomyV3RootKind } from "@/lib/api";
import {
  buildWaterPreset,
  buildWaterV1LegacyPreset,
  computeLiveAllocation,
  WATER_PRESETS,
  type ActivityEnergyAllocation,
  type CareActivity,
} from "@/lib/gamePresets";
import {
  applyV2CareActivityToState,
  applyV2CareFinishToState,
  applyV2CareSnapshotToState,
  applyV2CareStartToState,
  canStartV2Care,
  careErrorMessage,
  durationFromServerAllocation,
  emptyV2CareState,
  floorV2EnergySeconds,
  normalizeV2Care,
  v2CareActionsLeft,
  V2_CARE_MIN_START_SECONDS,
} from "@/lib/economyV2CareClient";
import {
  careCycleBlocksMetelka,
  allActivitiesDone,
  shouldExitPostCareUi,
  shouldRestoreCareShovelOnRecovery,
} from "@/lib/careSessionActionsUi";
import {
  CARE_FILL_ANIMATION_MS,
  CARE_RESULT_HOLD_MS,
  CARE_TO_SHOVEL_MS,
  displayFillsForCompletedReveal,
  prefersReducedMotion,
  reduceCareActionsPhase,
  shouldStartCareTransition,
  carePhaseIsConverging,
  carePhaseKeepsSessionBranch,
  carePhaseShowsShovel,
  initialCareActionsPhase,
  type CareActionsPhase,
  type CarePhaseEvent,
} from "@/lib/careActionsPhase";
import {
  CARE_DIVERGE_MS,
  careConvergeSlotForIndex,
  careShovelConvergeAnimate,
  careShovelConvergeInitial,
  careShovelConvergeTransition,
  careTrioConvergeAnimate,
  careTrioConvergeTransition,
  careTrioDivergeInitial,
  careTrioDivergeTransition,
} from "@/lib/careConvergeMotion";
import {
  activityResultFillPercent,
  careShovelFillPercent,
  isCareActivityCubeDone,
  mergeActivityFillPercent,
  scheduleFillHeightReveal,
  zeroDisplayFills,
  type CareActivityFillKey,
  type CareDisplayFillMap,
} from "@/lib/careActivityResultFill";
import {
  TUTORIAL_ACTIVITY_DURATION_SEC,
  TUTORIAL_CARE_GHOST_DELAY_MS,
  TUTORIAL_REWARD_TO_FINISH_MS,
  areAllV3CareActivitiesCompleted,
  areV3TutorialRootsEnergyReady,
  getV3CareActivitiesCompleted,
  isV3TutorialActivitiesInteractionLocked,
  isV3TutorialLiveCareStep,
  isV3TutorialRootEnergyReady,
  isV3TutorialRootStep,
  mergeStagedTutorialPrepare,
  nextV3TutorialFillKind,
  nextV3TutorialStepFromCompletedActivities,
  nextV3TutorialStepAfterRootTransfer,
  resolveV3TutorialStepFromServer,
  TUTORIAL_V3_FILL_MS,
  TUTORIAL_V3_ROOT_POP_MS,
  TUTORIAL_V3_ROOT_SECONDS,
  TUTORIAL_V3_WAIT_MS,
  TUTORIAL_V3_WAIT_SECONDS,
  clearV3CareUiAfterTutorial,
  resolveTutorialGenerationAnchorAt,
  shouldClearStaleV3CareUiAfterTutorial,
  type TutorialStep,
  type TutorialV3TimerKind,
  tutorialHighlightRoot,
  tutorialRecommendedV3Activity,
  v3TutorialOverlayConfig,
  withTutorialRootSeconds,
} from "@/lib/tutorialFlow";
import {
  armTutorialWaitClock,
  clearTutorialWaitClock,
  loadTutorialWaitClock,
  persistTutorialWaitClock,
} from "@/lib/tutorialWaitClock";
import V3TutorialFillTimer from "@/components/v2/V3TutorialFillTimer";

import { APP_VERSION } from "@/lib/engine";
import {
  UNDERGROUND_ROOTS_WIPE_TRANSITION,
  undergroundRootsWipeAnimate,
  undergroundWrapRootsWipeAnimate,
} from "@/lib/undergroundRootsWipe";

interface Props {
  state: UserState;
  onStateChange: (s: UserState) => void;
  notif?: boolean;
  onClearNotif?: () => void;
  onResetAccount?: () => void;
}

interface Floater {
  id: number;
  x: number;
  y: number;
  label: string;
  big?: boolean;
  gold?: boolean;
}

const TREE_STAGE_DATA = [
  { emoji: "🌱", from: 0,   fromFmt: "0 мм",     toFmt: "4.9 см"  },
  { emoji: "🌿", from: 50,  fromFmt: "5.0 см",   toFmt: "19.9 см" },
  { emoji: "🌴", from: 200, fromFmt: "20.0 см",  toFmt: "49.9 см" },
  { emoji: "🌳", from: 500, fromFmt: "50.0 см",  toFmt: "84.9 см" },
  { emoji: "🌲", from: 850, fromFmt: "85.0 см",  toFmt: null      },
];

const APPLE_POSITIONS: [number, number][][] = [
  [[32, 40], [63, 44], [46, 47], [46, 16]],
  [[20, 52], [75, 52], [44, 57], [45, 22]],
  [[16, 50], [77, 50], [43, 55], [45, 20]],
  [[14, 50], [80, 50], [42, 54], [44, 20]],
  [[12, 48], [81, 48], [41, 52], [43, 18]],
];
const APPLE_SIZES = [4, 5, 6, 7, 8];

/** v1 / debug-only water preset (ignored for Economy v2 even allocation). */
function resolveWaterPresetV1(bonusSeconds: number) {
  if (DEBUG_WATER_V2_PRESET_SEC != null) {
    const v2Preset = WATER_PRESETS.find((p) => p.durationSec === DEBUG_WATER_V2_PRESET_SEC);
    if (v2Preset) return v2Preset;
  }
  return buildWaterV1LegacyPreset(bonusSeconds);
}

export default function GamePage({ state, onStateChange, notif, onClearNotif, onResetAccount }: Props) {
  const { user, logout, updateNickname } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeMinigame, setActiveMinigame] = useState<GameType | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [waterResultPct, setWaterResultPct] = useState<number | null>(null);
  const [lightResultPct, setLightResultPct] = useState<number | null>(null);
  const [fertilizerResultPct, setFertilizerResultPct] = useState<number | null>(null);
  /** Painted fill heights — must go 0% → target% on an existing DOM node for CSS transition. */
  const [displayFillHeights, setDisplayFillHeights] = useState<CareDisplayFillMap>(() =>
    zeroDisplayFills(),
  );
  /** Last minigame finished this cycle — its cube must animate before «Уход». */
  const lastCompletedActivityRef = useRef<CareActivityFillKey>("fertilizer");
  /** Gate: third/last result shown on its cube (transitionend or fallback). */
  const [allResultsPresented, setAllResultsPresented] = useState(false);
  const fillPresentedFallbackRef = useRef<number | null>(null);
  const hasPendingInit = (state.game.pendingBaseReward ?? 0) > 0 || (state.game.pendingBonusReward ?? 0) > 0;
  /** Boot gate: v3 owns Care when enabled — never read v2Care / sessionInProgress. */
  const useV3Init = isEconomyV3GameCycleEnabled(state.game.v3Roots);
  const midCareInit = useV3Init
    ? isV3CareUiBusy(state.game.v3Roots)
    : ENABLE_ECONOMY_V2_CARE
      ? !!(state.game.v2Care?.inProgress && !state.game.v2Care?.allCompleted)
      : !!state.game.sessionInProgress;
  const v3AllCompletedInit =
    useV3Init &&
    (shouldShowV3CareShovel(state.game.v3Roots) ||
      shouldShowV3RewardPreview(state.game.v3Roots) ||
      shouldAcknowledgeV3CareCycle(state.game.v3Roots));
  const [carePhase, setCarePhase] = useState<CareActionsPhase>(() =>
    initialCareActionsPhase({
      hasUnclaimedPending: hasPendingInit,
      midCare: midCareInit,
      allCompleted: useV3Init
        ? v3AllCompletedInit
        : !!state.game.v2Care?.allCompleted,
    }),
  );
  /** F5 / boot: fills already final — skip waiting for 0.9s fill replay. */
  const skipCareFillAnimationRef = useRef(
    hasPendingInit ||
      (useV3Init
        ? v3AllCompletedInit
        : !!state.game.v2Care?.allCompleted),
  );
  const fillRevealCancelRef = useRef<(() => void) | null>(null);
  const showCompletionStage = carePhaseKeepsSessionBranch(carePhase);
  const showCareButton = carePhaseShowsShovel(carePhase);
  const merging = carePhaseIsConverging(carePhase);
  /** «Уход» smoothly splits back into inactive activity cubes. */
  const [careDiverging, setCareDiverging] = useState(false);
  const careDivergeTimerRef = useRef<number | null>(null);
  /**
   * Tutorial: after «Уход» diverge, keep cubes spent/muted until tutorial ends.
   * Prevents a flash of “active” activities when reward chrome resets.
   */
  const [tutorialActivitiesExhausted, setTutorialActivitiesExhausted] =
    useState(false);
  const [showRewards, setShowRewards] = useState(hasPendingInit && !midCareInit);
  const [fadeActivities, setFadeActivities] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); // collapsed by default
  const [historyNotif, setHistoryNotif] = useState(notif ?? false);
  const [editingNick, setEditingNick] = useState(false);
  const [nickVal, setNickVal] = useState(user?.nickname ?? user?.username ?? "");
  const [nickErr, setNickErr] = useState("");
  const [nickBusy, setNickBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const autoClaimedOnLoadRef = useRef(false);
  const [levelUpData, setLevelUpData] = useState<{ level: number } | null>(null);
  const [xpGainAmount, setXpGainAmount] = useState<number | null>(null);
  const [showXpPopup, setShowXpPopup] = useState(false);
  /** Topbar XP flash amount when sessionScores is absent (Metelka finish). */
  const [xpFlashAmount, setXpFlashAmount] = useState<number | null>(null);
  const [showMmPopup, setShowMmPopup] = useState(false);
  /** +N мм accrual label (left of tree) — kept even if sessionScores is cleared. */
  const [mmPopupAmount, setMmPopupAmount] = useState(0);
  const [metelkaClaimBusy, setMetelkaClaimBusy] = useState(false);
  const [metelkaClaimError, setMetelkaClaimError] = useState<string | null>(null);
  const metelkaXpAnimTokenRef = useRef<string | null>(null);
  const [careClicked, setCareClicked] = useState(false);
  const [showActivityGhost, setShowActivityGhost] = useState(false);
  /** Compact error / status for v3 Care activity lifecycle (preview). */
  const [v3CareBusy, setV3CareBusy] = useState(false);
  /** Finish failed — allow retry without re-running the minigame. */
  const [v3PendingFinish, setV3PendingFinish] = useState<{
    activity: EconomyV3RootKind;
    skill: number;
    score: number;
  } | null>(null);
  /** Ack after result fill; blocks starting next activity until success. */
  const [v3PendingAck, setV3PendingAck] = useState<EconomyV3RootKind | null>(
    null,
  );
  const v3AckInFlightRef = useRef(false);
  const v3RecoveredSessionRef = useRef<string | null>(null);
  const v3FinishCycleInFlightRef = useRef(false);
  const v3ClaimCycleInFlightRef = useRef(false);
  const v3AckCycleInFlightRef = useRef(false);
  const v3CycleRecoveredRef = useRef<string | null>(null);
  /** Live trio→«Уход» converge in progress — F5 recovery must not steal with restore_shovel. */
  const v3LiveConvergeRef = useRef(false);
  const [showGrowthAnim, setShowGrowthAnim] = useState(false);
  const [growthCountdown, setGrowthCountdown] = useState<number | null>(null);
  const [growthTimerTotal, setGrowthTimerTotal] = useState(9);
  const [showApples, setShowApples] = useState(false);
  const [appleCount, setAppleCount] = useState(1);
  const [collectedAppleIndices, setCollectedAppleIndices] = useState<number[]>([]);
  const [flyingAppleIndices, setFlyingAppleIndices] = useState<number[]>([]);
  const [showApplePopup, setShowApplePopup] = useState(false);
  const [applePopupCount, setApplePopupCount] = useState(1);
  const [showIncomePopup, setShowIncomePopup] = useState(false);
  const [lastIncomeAmount, setLastIncomeAmount] = useState(0);
  const [totalApples, setTotalApples] = useState(state.game.totalApples ?? 0);
  const [tutorialDone, setTutorialDone] = useState(state.game.tutorialDone ?? true);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(
    (state.game.tutorialDone ?? true) ? null : "welcome"
  );
  const [activeAnim, setActiveAnim] = useState<GameType | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animParticlesRef = useRef<number[]>([]);
  const [showTreeInfo, setShowTreeInfo] = useState(false);
  /** Eye toggle: mask underground root system (clip wipe bottom → top). */
  const [undergroundRootsMasked, setUndergroundRootsMasked] = useState(false);
  const [showDepositInfo, setShowDepositInfo] = useState(false);
  const [showXpHistory, setShowXpHistory] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showTutorialComplete, setShowTutorialComplete] = useState(false);
  const [showTutorialCompletionCard, setShowTutorialCompletionCard] = useState(false);
  /** Tutorial reward beat: reveal mm / apple badges only when their counters appear. */
  const [tutorialShowGrowthBadge, setTutorialShowGrowthBadge] = useState(false);
  const [tutorialShowAppleBadge, setTutorialShowAppleBadge] = useState(false);
  const tutorialRewardCollectRef = useRef({ apple: false, coin: false });
  const tutorialRewardActiveRef = useRef(false);
  /** Demo counters kept until «Начать играть» reapplies them onto post-complete state. */
  const tutorialDemoRewardRef = useRef({ mm: 0, apples: 0, money: 0 });
  const [purchasedItems, setPurchasedItems] = useState<string[]>(state.game.purchasedItems ?? []);
  const [hasPendingAchievements, setHasPendingAchievements] = useState(false);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [showStreakWidget, setShowStreakWidget] = useState(() => {
    if (!(state.game.tutorialDone ?? true)) return false; // suppress during tutorial
    const todayStr = new Date().toISOString().slice(0, 10);
    // Suppress on first day — only show starting from the second calendar day
    const accountStartStr = new Date(state.balances.startDate).toISOString().slice(0, 10);
    if (accountStartStr === todayStr) return false;
    const seen = localStorage.getItem("streak_widget_date");
    const midCare = isEconomyV3GameCycleEnabled(state.game.v3Roots)
      ? isV3CareUiBusy(state.game.v3Roots)
      : ENABLE_ECONOMY_V2_CARE
        ? !!(state.game.v2Care?.inProgress && !state.game.v2Care?.allCompleted)
        : !!state.game.sessionInProgress;
    const noPending = (state.game.pendingBaseReward ?? 0) === 0 && (state.game.pendingBonusReward ?? 0) === 0;
    return seen !== todayStr && !midCare && noPending;
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [lbTab, setLbTab] = useState<"days" | "xp" | "growth">("days");

  function dismissStreakWidget() {
    const todayStr = new Date().toISOString().slice(0, 10);
    localStorage.setItem("streak_widget_date", todayStr);
    setShowStreakWidget(false);
  }
  useEffect(() => {
    if (!showXpHistory) return;
    setLeaderboardLoading(true);
    api.getLeaderboard()
      .then(r => setLeaderboard(r.players))
      .catch(() => {})
      .finally(() => setLeaderboardLoading(false));
  }, [showXpHistory]);

  useEffect(() => {
    if (!showSettings) return;
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettings]);

  async function saveNick() {
    if (nickBusy || !nickVal.trim()) return;
    setNickBusy(true); setNickErr("");
    try {
      await updateNickname(nickVal.trim());
      setEditingNick(false);
    } catch (e: any) { setNickErr(e.message ?? "Ошибка"); }
    finally { setNickBusy(false); }
  }

  const [sessionScores, setSessionScores] = useState<{ water: number; sun: number; fert: number; xp: number; base: number; bonus: number; mm: number } | null>(null);
  const [historyHighlight, setHistoryHighlight] = useState(false);

  const floaterRef = useRef(0);
  const stateRef = useRef(state);
  /** Bumped on every energy write so in-flight spend cannot overwrite a newer fill/reset. */
  const energyMutationIdRef = useRef(0);
  /**
   * Seconds to spend when the open minigame finishes (mock / debug path only).
   * Captured at minigame open from live allocation — not from a session-long snapshot.
   */
  const pendingSpendRef = useRef<Partial<Record<CareActivity, number>>>({});
  /** Prevents duplicate finishV2Care calls for the same cycle. */
  const v2CareFinishInFlightRef = useRef(false);
  const v2CareFinishedCycleRef = useRef<string | null>(null);
  const v2CareRecoveryDoneRef = useRef(false);
  const [careSyncError, setCareSyncError] = useState<string | null>(null);
  const [pendingActivitySync, setPendingActivitySync] = useState<CareActivity | null>(null);
  const appleAutoCollectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectedAppleIndicesRef = useRef<number[]>([]);
  const appleCountRef = useRef(1);
  useEffect(() => { stateRef.current = state; }, [state]);

  /** Keep stateRef in sync immediately so overlapping async writes cannot clobber each other. */
  function commitState(next: UserState) {
    stateRef.current = next;
    onStateChange(next);
    notifyEconomyV2DebugSnapshot();
  }

  // Care-UI flags for debug energy apply (exit post-care) — refs so bridge registers once.
  const debugCareUiRef = useRef({
    tutorialDone,
    showActivityGhost,
    showCareButton,
    showCompletionStage,
  });
  debugCareUiRef.current = {
    tutorialDone,
    showActivityGhost,
    showCareButton,
    showCompletionStage,
  };

  // Right local debug panel (src/local) — register once; snapshot via stateRef.
  useEffect(() => {
    registerEconomyV2DebugBridge({
      getSnapshot: () => {
        const g = stateRef.current.game;
        const v3 = economyV3DebugReadout(g.v3Roots, g.v2Excess);
        const live = deriveExcessLiveFields(g.v2Excess?.excessSeconds);
        const sessionActive = g.v2Excess?.session?.active === true;
        const sessionPresetRaw = g.v2Excess?.session?.presetSeconds;
        const sessionPresetSeconds =
          sessionActive &&
          sessionPresetRaw != null &&
          Number.isFinite(Number(sessionPresetRaw))
            ? Math.round(Number(sessionPresetRaw))
            : null;
        const anchorRaw = g.v3Roots?.generation?.anchorAt;
        const anchorMs =
          anchorRaw == null || anchorRaw === ""
            ? null
            : (() => {
                const asNum = Number(anchorRaw);
                if (Number.isFinite(asNum) && asNum > 1e11) {
                  return Math.trunc(asNum);
                }
                const t = Date.parse(String(anchorRaw));
                return Number.isFinite(t) ? t : null;
              })();
        const excessFields = {
          excessSeconds: live.excessSeconds,
          excessPresetSeconds: live.excessPresetSeconds,
          excessElapsedMs: Math.max(
            0,
            Number(g.v2Excess?.excessElapsedMs) || 0,
          ),
          excessFinancialAnchorAt: anchorMs,
          capital: Math.max(0, Number(stateRef.current.balances?.balance) || 0),
          sessionActive,
          sessionPresetSeconds,
        };
        // v3: do not expose energy bank / v2 roots counts to debug (UI already hides them).
        if (v3?.enabled === true) {
          return {
            energySeconds: 0,
            readyCount: 0,
            ...excessFields,
            v3,
          };
        }
        return {
          energySeconds: Number(g.v2EnergySeconds) || 0,
          readyCount:
            typeof g.v2Roots?.readyCount === "number" &&
            Number.isFinite(g.v2Roots.readyCount)
              ? Math.max(0, Math.floor(g.v2Roots.readyCount))
              : 0,
          ...excessFields,
          v3,
        };
      },
      onEnergyApplied: (patch) => {
        energyMutationIdRef.current += 1;
        const energy = Math.max(0, Number(patch.v2EnergySeconds) || 0);
        const gNow = stateRef.current.game;
        // v3: never apply energy-bank / session / missedSessions patches (Care is v3-only).
        if (isEconomyV3GameCycleEnabled(gNow.v3Roots)) {
          return;
        }
        const next = applyEconomyV2EnergyToState(stateRef.current, patch);
        commitState(next);
        const ui = debugCareUiRef.current;
        const g = stateRef.current.game;
        const midCare = ENABLE_ECONOMY_V2_CARE
          ? normalizeV2Care(g.v2Care).inProgress &&
            !normalizeV2Care(g.v2Care).allCompleted
          : !!g.sessionInProgress;
        if (
          ui.tutorialDone &&
          !midCare &&
          energy >= 1 &&
          (ui.showActivityGhost || ui.showCareButton || ui.showCompletionStage)
        ) {
          exitPostCareUiForNextCycle();
        }
      },
      onRootsApplied: (patch) => {
        if (isEconomyV3GameCycleEnabled(stateRef.current.game.v3Roots)) return;
        commitState(applyEconomyV2RootsDebugToState(stateRef.current, patch));
      },
      onExcessApplied: (patch) => {
        // Invalidate in-flight syncRootsFromServer / getState that could restore
        // pre-debug excessElapsedMs after reset/add.
        bumpEconomyV2ExcessDebugMutationSeq();
        const prevSession = stateRef.current.game.v2Excess?.session;
        const prevKey = excessSessionFinishKey(prevSession);
        const next = applyEconomyV2ExcessDebugToState(stateRef.current, patch);
        const nextSession = next.game.v2Excess?.session;
        const nextKey = excessSessionFinishKey(nextSession);
        // Debug wipe / new T: drop finish for the old attempt so a late response
        // cannot reopen overlay or invent pending.
        if (prevKey != null && prevKey !== nextKey) {
          excessFinishGuardRef.current.invalidate(prevKey);
        }
        commitState(next);
        if (nextSession?.active !== true) {
          excessFinishGuardRef.current.reset();
          setMetelkaFinishError(null);
        }
      },
      onV3RootsApplied: (v3Roots) => {
        commitState(
          applyEconomyV3RootsToState(stateRef.current, v3Roots),
        );
        // Debug fill/reset clears Care journal — drop muted ghost cubes so the
        // activity row can light after root→reserve transfer.
        setTutorialActivitiesExhausted(false);
        setShowActivityGhost(false);
        setCareClicked(false);
      },
    });
    return () => registerEconomyV2DebugBridge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; handlers use refs
  }, []);

  /**
   * Leave the post-care UI (ghost / care shovel / completion) so a new Care cycle can start.
   * Does NOT stop tree-growth visuals (timer / apples) — those are independent.
   * Resets client water/sun/fertilizer to match server after sessionComplete.
   * Never call during active Tutorial — finish shovel uses the same flags.
   */
  function dispatchCarePhase(event: CarePhaseEvent) {
    if (event.type === "reset") {
      v3LiveConvergeRef.current = false;
      skipCareFillAnimationRef.current = false;
      setDisplayFillHeights(zeroDisplayFills());
      setAllResultsPresented(false);
      if (fillPresentedFallbackRef.current != null) {
        clearTimeout(fillPresentedFallbackRef.current);
        fillPresentedFallbackRef.current = null;
      }
    }
    if (event.type === "all_done") {
      // Never treat all_done as permission to show «Уход» yet.
      setAllResultsPresented(false);
    }
    setCarePhase((prev) => {
      const next = reduceCareActionsPhase(prev, event);
      if (next === "care_button") {
        v3LiveConvergeRef.current = false;
      }
      return next;
    });
  }

  function markAllResultsPresented() {
    if (fillPresentedFallbackRef.current != null) {
      clearTimeout(fillPresentedFallbackRef.current);
      fillPresentedFallbackRef.current = null;
    }
    setAllResultsPresented(true);
  }

  function clearCareDivergeTimer() {
    if (careDivergeTimerRef.current != null) {
      clearTimeout(careDivergeTimerRef.current);
      careDivergeTimerRef.current = null;
    }
    setCareDiverging(false);
  }

  /**
   * Reverse of trio→«Уход»: shovel fades while cubes slide apart, then
   * settle as the inactive ghost row (tutorial + live Care).
   */
  function beginCareShovelDiverge() {
    if (careDiverging || showActivityGhost) return;
    if (!tutorialDone) setTutorialActivitiesExhausted(true);
    setCareDiverging(true);
    if (careDivergeTimerRef.current != null) {
      clearTimeout(careDivergeTimerRef.current);
    }
    careDivergeTimerRef.current = window.setTimeout(() => {
      careDivergeTimerRef.current = null;
      setCareDiverging(false);
      setShowActivityGhost(true);
    }, CARE_DIVERGE_MS);
  }

  function exitPostCareUiForNextCycle() {
    if (!tutorialDone) return;
    // Keep growthTimeoutsRef (XP/mm popup hide timers). Ghost must not be
    // scheduled from v3 claim — only clear the flag if a legacy path set it.
    clearCareDivergeTimer();
    setShowActivityGhost(false);
    dispatchCarePhase({ type: "reset" });
    setShowRewards(false);
    setCareClicked(false);
    setFadeActivities(false);
    const cur = stateRef.current;
    if (cur.game.water || cur.game.sun || cur.game.fertilizer) {
      commitState({
        ...cur,
        game: {
          ...cur.game,
          water: false,
          sun: false,
          fertilizer: false,
        },
      });
    }
  }

  /** Freeze spend seconds for an activity at the moment the minigame opens. */
  function armSpendForActivity(activity: CareActivity, alloc: ActivityEnergyAllocation) {
    pendingSpendRef.current[activity] = alloc[activity];
  }
  const pendingXpRef = useRef<{
    xpGained: number;
    newLevel?: number;
    xpHistory?: unknown[];
    levelUp?: boolean;
    newMM: number;
    newRemainder: number;
    /** When set (v2 Care), apply absolute playerXP instead of += xpGained. */
    playerXpAbsolute?: number;
  } | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const prevLevelRef = useRef(state.game.playerLevel ?? 1);
  const skillScoreRef = useRef<number>(40);
  const waterScoreRef = useRef<number>(40);
  const sunScoreRef = useRef<number>(40);
  const fertilizerScoreRef = useRef<number>(40);
  const treeControls = useAnimation();
  const animFrameRef = useRef<number | null>(null);
  const growthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const growthTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const displayGrowthMMRef = useRef(state.game.treeGrowthMM ?? 0);
  const [displayGrowthMM, setDisplayGrowthMM] = useState(state.game.treeGrowthMM ?? 0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentStage, setCurrentStage] = useState<0|1|2|3|4>(() => getTreeStage(state.game.treeGrowthMM ?? 0) as 0|1|2|3|4);
  const currentStageRef = useRef<0|1|2|3|4>(getTreeStage(state.game.treeGrowthMM ?? 0) as 0|1|2|3|4);
  const stageTransTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (animTimerRef.current !== null) clearTimeout(animTimerRef.current);
    };
  }, []);

  // After rewards are claimed, leave post-care UI so the next Care cycle can start.
  // Must NOT run during Tutorial — ghost → care shovel is the tutorial finish path.
  // Must NOT run when pending is already 0 at sessionComplete (short income window):
  // that previously wiped «Уход» and let Metelka steal the ready row.
  useEffect(() => {
    if (
      !shouldExitPostCareUi({
        tutorialDone,
        pendingBase: state.game.pendingBaseReward ?? 0,
        pendingBonus: state.game.pendingBonusReward ?? 0,
        showCompletionStage,
        showActivityGhost,
        showCareButton,
        showRewards,
      })
    ) {
      return;
    }
    exitPostCareUiForNextCycle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tutorialDone,
    state.game.pendingBaseReward,
    state.game.pendingBonusReward,
    showCompletionStage,
    showActivityGhost,
    showCareButton,
    showRewards,
  ]);

  // After third result is on its cube → short hold → converge. Never jump from all_done to «Уход».
  useEffect(() => {
    if (
      !shouldStartCareTransition({
        phase: carePhase,
        allResultsPresented,
      })
    ) {
      return;
    }
    const t = window.setTimeout(() => {
      skipCareFillAnimationRef.current = false;
      // Double rAF: paint resting trio, then add --converging so CSS transition runs.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          dispatchCarePhase({ type: "start_transition" });
        });
      });
    }, CARE_RESULT_HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carePhase, allResultsPresented]);

  /**
   * activities_completed: keep 1st/2nd fills; force last-completed cube to 0% then target%
   * so CSS height transition actually runs. Gate «Уход» on transitionend / fallback.
   */
  useLayoutEffect(() => {
    if (carePhase !== "activities_completed") return;
    const targets = {
      water: waterResultPct,
      sun: lightResultPct,
      fertilizer: fertilizerResultPct,
    };
    const last = lastCompletedActivityRef.current;
    fillRevealCancelRef.current?.();
    fillRevealCancelRef.current = null;
    if (fillPresentedFallbackRef.current != null) {
      clearTimeout(fillPresentedFallbackRef.current);
      fillPresentedFallbackRef.current = null;
    }

    const skipAnim =
      skipCareFillAnimationRef.current || prefersReducedMotion();

    setDisplayFillHeights(
      displayFillsForCompletedReveal({
        targets,
        lastCompleted: last,
        skipAnimation: skipAnim,
      }),
    );

    if (skipAnim) {
      // Still paint the trio one frame before allowing hold → «Уход».
      const raf = requestAnimationFrame(() => markAllResultsPresented());
      return () => cancelAnimationFrame(raf);
    }

    const cancel = scheduleFillHeightReveal(() => {
      setDisplayFillHeights((d) => ({
        ...d,
        [last]: targets[last] ?? 0,
      }));
      fillPresentedFallbackRef.current = window.setTimeout(() => {
        fillPresentedFallbackRef.current = null;
        markAllResultsPresented();
      }, CARE_FILL_ANIMATION_MS);
    });
    fillRevealCancelRef.current = cancel;
    return () => {
      cancel();
      if (fillRevealCancelRef.current === cancel) fillRevealCancelRef.current = null;
      if (fillPresentedFallbackRef.current != null) {
        clearTimeout(fillPresentedFallbackRef.current);
        fillPresentedFallbackRef.current = null;
      }
    };
  }, [carePhase, waterResultPct, lightResultPct, fertilizerResultPct]);

  useEffect(() => {
    if (carePhase !== "care_transition") return;
    const t = window.setTimeout(() => {
      dispatchCarePhase({ type: "transition_finished" });
    }, CARE_TO_SHOVEL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carePhase]);

  // (Tutorial minigames are opened by user interaction or handleMinigameComplete, not auto-opened)

  // F5 recovery for Economy v2 Care — skipped entirely when v3 owns the cycle.
  // GET state only; never session/start; never auto-open a minigame.
  useEffect(() => {
    if (!ENABLE_ECONOMY_V2_CARE || !tutorialDone) return;
    if (isEconomyV3GameCycleEnabled(stateRef.current.game.v3Roots)) {
      v2CareRecoveryDoneRef.current = true;
      return;
    }
    if (v2CareRecoveryDoneRef.current) return;
    const care = normalizeV2Care(stateRef.current.game.v2Care);
    if (!care.inProgress && !care.allCompleted) {
      v2CareRecoveryDoneRef.current = true;
      return;
    }
    v2CareRecoveryDoneRef.current = true;

    // Restore dedicated v2 Care scores into local refs for completion UI.
    const scores = care.scores;
    if (typeof scores?.water === "number") {
      waterScoreRef.current = scores.water;
      setWaterResultPct((prev) =>
        mergeActivityFillPercent(prev, activityResultFillPercent(scores.water)),
      );
    }
    if (typeof scores?.sun === "number") {
      sunScoreRef.current = scores.sun;
      setLightResultPct((prev) =>
        mergeActivityFillPercent(prev, activityResultFillPercent(scores.sun)),
      );
    }
    if (typeof scores?.fertilizer === "number") {
      fertilizerScoreRef.current = scores.fertilizer;
      setFertilizerResultPct((prev) =>
        mergeActivityFillPercent(
          prev,
          activityResultFillPercent(scores.fertilizer),
        ),
      );
    }

    commitState(
      applyV2CareSnapshotToState(
        stateRef.current,
        care,
        stateRef.current.game.v2EnergySeconds,
      ),
    );

    let cancelled = false;
    (async () => {
      try {
        if (care.allCompleted && care.cycleId) {
          await finishV2CareOnce(care.cycleId);
          if (cancelled) return;
          const pb = stateRef.current.game.pendingBaseReward ?? 0;
          const pbo = stateRef.current.game.pendingBonusReward ?? 0;
          // Restore «Уход» even when income rounded to 0₽.
          if (
            shouldRestoreCareShovelOnRecovery({
              allCompleted: true,
              hasUnclaimedPending: pb > 0 || pbo > 0,
            })
          ) {
            // F5: show final fills (no 0.9s replay), then short hold → «Уход».
            skipCareFillAnimationRef.current = true;
            dispatchCarePhase({ type: "all_done" });
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[v2 care F5 recovery]", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialDone]);

  function handleTutorialFinish() {
    // Tutorial exit only — never regular Care claimAll / XP queue.
    tutorialRewardActiveRef.current = false;
    tutorialRewardCollectRef.current = { apple: false, coin: false };
    setTutorialShowGrowthBadge(false);
    setTutorialShowAppleBadge(false);
    // Keep spent/muted activity cubes — do not flash them “active” under congrats.
    setTutorialActivitiesExhausted(true);
    clearCareRewardPresentationState({ keepSpentActivities: true });
    // Dismiss the "complete" intro card first
    setShowTutorialCompletionCard(false);
    // Show final congratulations window ("Начать играть" / enter game)
    setTimeout(() => setShowTutorialComplete(true), 300);
  }

  /**
   * After tutorial «Уход»: left growth timer (same as live Care) → +1 мм →
   * 1 apple + 1 coin → finish. No XP popup / claimAll; rewards stick into live play.
   */
  function handleTutorialCareRewards() {
    tutorialRewardActiveRef.current = true;
    tutorialRewardCollectRef.current = { apple: false, coin: false };
    tutorialDemoRewardRef.current = { mm: 0, apples: 0, money: 0 };
    setShowTutorialCompletionCard(false);
    setCareClicked(true);
    setTutorialShowAppleBadge(false);
    setShowActivityGhost(false);

    const fromMM = displayGrowthMMRef.current;
    const toMM = fromMM + 1;
    setSessionScores({
      water: 100,
      sun: 100,
      fert: 100,
      xp: 0,
      base: 1,
      bonus: 0,
      mm: 1,
    });

    // After a short pause: smoothly split «Уход» → inactive activity cubes.
    const ghostTimer = setTimeout(() => {
      if (!tutorialRewardActiveRef.current) return;
      beginCareShovelDiverge();
    }, TUTORIAL_CARE_GHOST_DELAY_MS);
    growthTimeoutsRef.current.push(ghostTimer);

    // Same layout as live Care: countdown left → +N мм left; badge on the right.
    setTutorialShowGrowthBadge(true);
    setShowApples(false);
    setShowGrowthAnim(true);
    triggerTreeAnim();
    const timerSecs = Math.max(5, 1);
    setGrowthTimerTotal(timerSecs);
    setGrowthCountdown(timerSecs);
    let countVal = timerSecs - 1;
    const growthInterval = setInterval(() => {
      if (!tutorialRewardActiveRef.current) {
        clearInterval(growthInterval);
        growthIntervalRef.current = null;
        return;
      }
      if (countVal >= 0) {
        setGrowthCountdown(countVal--);
        return;
      }
      clearInterval(growthInterval);
      growthIntervalRef.current = null;
      setGrowthCountdown(null);

      tutorialDemoRewardRef.current.mm = toMM;
      // Persist +1 мм into live state (tutorial/complete keeps it on the server).
      {
        const cur = stateRef.current;
        commitState({
          ...cur,
          game: { ...cur.game, treeGrowthMM: toMM },
        });
      }
      animateGrowth(fromMM, toMM);
      // Same left-of-tree +N мм accrual as live Care (after growth timer).
      setMmPopupAmount(1);
      setShowMmPopup(true);
      const hideMm = setTimeout(() => {
        setShowMmPopup(false);
        setMmPopupAmount(0);
      }, 1400);
      growthTimeoutsRef.current.push(hideMm);

      const appleTimer = setTimeout(() => {
        if (!tutorialRewardActiveRef.current) return;
        setShowGrowthAnim(false);
        setTutorialShowAppleBadge(true);
        setAppleCount(2);
        appleCountRef.current = 2;
        collectedAppleIndicesRef.current = [];
        setCollectedAppleIndices([]);
        setFlyingAppleIndices([]);
        setShowApples(true);
      }, 1800);
      growthTimeoutsRef.current.push(appleTimer);
    }, 1000);
    growthIntervalRef.current = growthInterval;
  }

  function maybeFinishTutorialRewards() {
    const c = tutorialRewardCollectRef.current;
    if (!tutorialRewardActiveRef.current || !c.apple || !c.coin) return;
    if (appleAutoCollectTimerRef.current) {
      clearTimeout(appleAutoCollectTimerRef.current);
      appleAutoCollectTimerRef.current = null;
    }
    // Let coin fly + chest float settle; longer hold before congrats / chrome reset.
    const doneTimer = setTimeout(() => {
      setShowApples(false);
      collectedAppleIndicesRef.current = [];
      setCollectedAppleIndices([]);
      setFlyingAppleIndices([]);
      handleTutorialFinish();
    }, Math.max(TUTORIAL_REWARD_TO_FINISH_MS, INCOME_CHEST_FLOAT_MS + 400));
    growthTimeoutsRef.current.push(doneTimer);
  }

  function handleTutorialDismiss() {
    setShowTutorialComplete(false);
    setTimeout(() => {
      void (async () => {
        // Clear all tutorial UI leftovers so Care returns to normal unlock rules.
        // Must also idle reward presentation (no deferred XP/growth/apples replay).
        setTutorialActivitiesExhausted(false);
        clearCareRewardPresentationState();
        setTutorialStep(null);
        setShowTutorialCompletionCard(false);
        waterScoreRef.current = 0;
        sunScoreRef.current = 0;
        fertilizerScoreRef.current = 0;
        skillScoreRef.current = 0;
        const storedWait = loadTutorialWaitClock();
        const generationAnchorAt = resolveTutorialGenerationAnchorAt({
          startedAtMs:
            tutorialWaitStartedAtRef.current ?? storedWait?.startedAtMs,
          waitDeadlineMs:
            tutorialWaitDeadlineMsRef.current ?? storedWait?.deadlineMs,
        });
        try {
          // Continue live root generation from the tutorial 12:00 wait start
          // (e.g. 9:54 remaining → same clock in the main game).
          await api.tutorialComplete({ generationAnchorAt });
          // Server owns the cycle after a successful handoff.
          clearTutorialWaitClock();
        } catch {
          // Still unlock local UI; next getState will reconcile.
        }
        // Keep deadline seed for V3RootWaitTimer; clear start after handoff.
        tutorialWaitStartedAtRef.current = null;
        // Fresh server snapshot: v3 generation continues from tutorial wait.
        try {
          // Capture before clear — server `0` must not clobber local tutorial collectibles
          // (`??` does not treat 0 as missing).
          const localBefore = stateRef.current;
          const demoKeep = tutorialDemoRewardRef.current;
          const data = await api.getState();
          tutorialDemoRewardRef.current = { mm: 0, apples: 0, money: 0 };
          if (data.exists && data.game) {
            // Keep tutorial +1 мм / +1 яблоко / +1₽ (server grant or local collect).
            const keptMm = Math.max(
              Number(data.game.treeGrowthMM) || 0,
              Number(localBefore.game.treeGrowthMM) || 0,
              Number(demoKeep.mm) || 0,
              1,
            );
            const keptApples = Math.max(
              Number(data.game.totalApples) || 0,
              Number(localBefore.game.totalApples) || 0,
              Number(demoKeep.apples) || 0,
              1,
            );
            const keptEarned = Math.max(
              Number(data.balances?.earned) || 0,
              Number(localBefore.balances.earned) || 0,
              Number(demoKeep.money) || 0,
              1,
            );
            const keptBalance = Math.max(
              Number(data.balances?.balance) || 0,
              Number(localBefore.balances.balance) || 0,
              (Number(localBefore.balances.balance) || 0) +
                Math.max(0, keptEarned - (Number(localBefore.balances.earned) || 0)),
            );
            let next: UserState = {
              ...localBefore,
              balances: {
                ...localBefore.balances,
                balance: keptBalance,
                earned: keptEarned,
                ...(data.balances?.startDate != null
                  ? { startDate: data.balances.startDate }
                  : {}),
              },
              history:
                data.history && data.history.length > 0
                  ? data.history
                  : localBefore.history,
              game: {
                ...localBefore.game,
                tutorialDone: true,
                treeGrowthMM: keptMm,
                treeGrowthRemainder: data.game.treeGrowthRemainder ?? 0,
                totalApples: keptApples,
                playerXP: data.game.playerXP ?? 0,
                playerLevel: data.game.playerLevel ?? 1,
                xpHistory: data.game.xpHistory ?? [],
                pendingBaseReward: 0,
                pendingBonusReward: 0,
                streakDays: data.game.streakDays ?? 0,
                v2Care: emptyV2CareState(),
                v2Roots: emptyV2RootsState(),
                v2EnergySeconds: 0,
                v2EnergyAnchorAt: data.game.v2EnergyAnchorAt ?? null,
                v2Excess: normalizeV2Excess(data.game.v2Excess),
              },
            };
            next = applyEconomyV3FromServerGame(next, data.game);
            // Drop tutorial Care checkmarks so cards show "0 с" again.
            next = applyEconomyV3RootsToState(
              next,
              clearV3CareUiAfterTutorial(next.game.v3Roots),
            );
            // applyEconomyV3 must not drop tutorial collectibles from the merge above.
            next = {
              ...next,
              balances: {
                ...next.balances,
                balance: Math.max(Number(next.balances.balance) || 0, keptBalance),
                earned: Math.max(Number(next.balances.earned) || 0, keptEarned),
              },
              game: {
                ...next.game,
                treeGrowthMM: Math.max(Number(next.game.treeGrowthMM) || 0, keptMm),
                totalApples: Math.max(Number(next.game.totalApples) || 0, keptApples),
              },
            };
            if (!isEconomyV3GameCycleEnabled(data.game.v3Roots)) {
              next = applyV2CareSnapshotToState(
                next,
                data.game.v2Care,
                data.game.v2EnergySeconds,
              );
            }
            setTotalApples(next.game.totalApples ?? keptApples);
            displayGrowthMMRef.current = next.game.treeGrowthMM ?? keptMm;
            setDisplayGrowthMM(next.game.treeGrowthMM ?? keptMm);
            setTutorialDone(true);
            commitState(next);
          } else {
            // Offline fallback: keep counters already applied during the reward beat.
            setTutorialDone(true);
            commitState(
              applyEconomyV3RootsToState(
                {
                  ...stateRef.current,
                  game: {
                    ...stateRef.current.game,
                    tutorialDone: true,
                    pendingBaseReward: 0,
                    pendingBonusReward: 0,
                  },
                },
                clearV3CareUiAfterTutorial(stateRef.current.game.v3Roots),
              ),
            );
          }
        } catch {
          // Keep local tutorial collectibles if refresh fails.
          setTutorialDone(true);
          commitState(
            applyEconomyV3RootsToState(
              {
                ...stateRef.current,
                game: {
                  ...stateRef.current.game,
                  tutorialDone: true,
                  pendingBaseReward: 0,
                  pendingBonusReward: 0,
                },
              },
              clearV3CareUiAfterTutorial(stateRef.current.game.v3Roots),
            ),
          );
        }
        // Only open streak widget if it's not the first day
        const todayStr = new Date().toISOString().slice(0, 10);
        const accountStartStr = new Date(stateRef.current.balances.startDate)
          .toISOString()
          .slice(0, 10);
        if (accountStartStr !== todayStr) {
          localStorage.removeItem("streak_widget_date");
          setShowStreakWidget(true);
        }
      })();
    }, 400);
  }

  useEffect(() => {
    if (!autoClaimedOnLoadRef.current && hasPendingInit && !midCareInit) {
      // Never auto-claim while tutorial is active — pending must stay empty there;
      // if any leaked, tutorial/complete clears it on the server.
      if (!tutorialDone) {
        autoClaimedOnLoadRef.current = true;
        return;
      }
      autoClaimedOnLoadRef.current = true;
      const total = (state.game.pendingBaseReward ?? 0) + (state.game.pendingBonusReward ?? 0);
      setTimeout(() => {
        if (total > 0) {
          setLastIncomeAmount(total);
          // На перезагрузке показываем только доход (без яблок — количество неизвестно)
          setApplePopupCount(0);
          setShowIncomePopup(true);
          setTimeout(() => setShowIncomePopup(false), 1500);
        }
        void handleClaimAll();
      }, 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Removed legacy showCompletionStage → 2.2s merge → shovel timers (caused remount flash).

  const { balances, game } = state;
  const totalBalance = balances.balance;
  const excessCleaning = isExcessCleaningMode(game.v2Excess);
  const excessResultPending = isExcessResultAvailable(game.v2Excess);

  // Eye toggle is hidden during cleaning — keep roots visible.
  useEffect(() => {
    if (excessCleaning) setUndergroundRootsMasked(false);
  }, [excessCleaning]);

  const [excessAckBusy, setExcessAckBusy] = useState(false);
  const [incomeChestFeedback, setIncomeChestFeedback] =
    useState<IncomeChestFeedback | null>(null);
  const [metelkaRewardFloats, setMetelkaRewardFloats] = useState<
    ExcessRewardFloat[]
  >([]);
  const metelkaFloatTimersRef = useRef<Map<string, number>>(new Map());

  function pushMetelkaRewardFloats(floats: ExcessRewardFloat[]) {
    if (floats.length === 0) return;
    setMetelkaRewardFloats((prev) => [...prev, ...floats]);
    for (const f of floats) {
      const prevTimer = metelkaFloatTimersRef.current.get(f.id);
      if (prevTimer != null) window.clearTimeout(prevTimer);
      const timer = window.setTimeout(() => {
        metelkaFloatTimersRef.current.delete(f.id);
        setMetelkaRewardFloats((prev) => prev.filter((x) => x.id !== f.id));
      }, EXCESS_REWARD_FLOAT_MS);
      metelkaFloatTimersRef.current.set(f.id, timer);
    }
  }

  useEffect(() => {
    return () => {
      for (const t of metelkaFloatTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      metelkaFloatTimersRef.current.clear();
    };
  }, []);

  const [metelkaFinishError, setMetelkaFinishError] = useState<string | null>(
    null,
  );

  const excessFinishGuardRef = useRef(
    createExcessFinishGuard(async (sessionKey) => {
      const liveKey = excessSessionFinishKey(
        stateRef.current.game.v2Excess?.session,
      );
      // Debug reset / superseded session — ignore without locking.
      if (liveKey !== sessionKey) return;

      const applyFinishSuccess = (input: {
        excess: ReturnType<typeof normalizeV2Excess>;
        metelkaPendingReward?: Parameters<
          typeof normalizeMetelkaPendingReward
        >[0];
        balances?: { balance: number; earned: number };
      }) => {
        // Re-check after await: stale finish must not restore overlay.
        if (
          excessSessionFinishKey(stateRef.current.game.v2Excess?.session) !==
          sessionKey
        ) {
          return;
        }
        if (input.excess.session?.active === true) {
          throw new Error(
            "Сессия Метёлки ещё активна после finish — повторная попытка",
          );
        }
        const pending = normalizeMetelkaPendingReward(input.metelkaPendingReward);
        const prev = stateRef.current;
        const nextState = applyEconomyV2ExcessDebugToState(prev, {
          v2Excess: input.excess,
        });
        commitState({
          ...nextState,
          balances: {
            ...prev.balances,
            balance:
              input.balances?.balance ?? prev.balances.balance,
            earned: input.balances?.earned ?? prev.balances.earned,
          },
          game: {
            ...nextState.game,
            metelkaPendingReward: pending,
          },
        });
        setMetelkaClaimError(null);
        setMetelkaFinishError(null);
      };

      try {
        const res = await api.finishEconomyV2ExcessSession();
        if (
          excessSessionFinishKey(stateRef.current.game.v2Excess?.session) !==
          sessionKey
        ) {
          return;
        }
        applyFinishSuccess({
          excess: normalizeV2Excess(res.excess),
          metelkaPendingReward: res.metelkaPendingReward,
          balances: res.balances,
        });
      } catch (err) {
        // Stale after debug — swallow.
        if (
          excessSessionFinishKey(stateRef.current.game.v2Excess?.session) !==
          sessionKey
        ) {
          return;
        }
        // Resync: backend may already have closed the session.
        try {
          const data = await api.getState();
          if (
            excessSessionFinishKey(stateRef.current.game.v2Excess?.session) !==
            sessionKey
          ) {
            return;
          }
          if (data.game?.v2Excess) {
            const synced = normalizeV2Excess(data.game.v2Excess);
            if (synced.session?.active !== true) {
              applyFinishSuccess({
                excess: synced,
                metelkaPendingReward: data.game.metelkaPendingReward,
                balances: data.balances
                  ? {
                      balance: data.balances.balance,
                      earned: data.balances.earned,
                    }
                  : undefined,
              });
              return;
            }
          }
        } catch {
          // keep original finish error
        }
        throw err instanceof Error
          ? err
          : new Error("Не удалось завершить Метёлку");
      }
    }),
  );

  // Bind guard to session identity; reset when idle (not on every tick).
  const excessSessionActive = game.v2Excess?.session?.active === true;
  const excessSessionKey = excessSessionFinishKey(game.v2Excess?.session);
  useEffect(() => {
    if (excessSessionActive && excessSessionKey != null) {
      setMetelkaFinishError(null);
      return;
    }
    if (!excessSessionActive && !excessResultPending) {
      excessFinishGuardRef.current.reset();
    }
  }, [excessSessionActive, excessSessionKey, excessResultPending]);

  function requestMetelkaFinishFromState(
    excess: typeof game.v2Excess,
  ): void {
    if (!shouldRequestExcessFinish(excess)) return;
    const key = excessSessionFinishKey(excess?.session);
    if (key == null) return;
    excessFinishGuardRef.current.requestFinish({
      sessionKey: key,
      force: shouldForceExcessFinish(excess),
    });
  }

  // Auto-finish: deadline (remainingMs) or all webs cleared — including reload.
  useEffect(() => {
    requestMetelkaFinishFromState(game.v2Excess);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional session fields
  }, [
    excessSessionActive,
    excessResultPending,
    game.v2Excess?.session?.startedAt,
    game.v2Excess?.session?.presetSeconds,
    game.v2Excess?.session?.remainingWebCount,
    game.v2Excess?.session?.clearedWebCount,
    game.v2Excess?.result?.available,
  ]);

  // Tick while cleaning so timer-0 finish is not stuck on a stale render.
  useEffect(() => {
    if (!excessSessionActive || excessResultPending) return;
    const id = window.setInterval(() => {
      const excess = stateRef.current.game.v2Excess;
      requestMetelkaFinishFromState(excess);
      const key = excessSessionFinishKey(excess?.session);
      const err = excessFinishGuardRef.current.getLastError();
      if (err && key && !excessFinishGuardRef.current.getFinished(key)) {
        setMetelkaFinishError(err);
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excessSessionActive, excessResultPending]);

  // One finish XP animation per claimToken. Visual only — does not mutate playerXP.
  // Uses the same field XP path as Care (showXpPopup), then LevelWidget float.
  const metelkaPending = game.metelkaPendingReward;
  const metelkaPendingActive = isMetelkaPendingRewardActive(metelkaPending);
  useEffect(() => {
    if (!shouldShowMetelkaFinishXpAnimation(metelkaPending)) return;
    const token = metelkaPendingClaimToken(metelkaPending);
    if (token == null) return;
    if (metelkaXpAnimTokenRef.current === token) return;
    const xp = Math.floor(Number(metelkaPending?.xpAmount) || 0);
    if (xp <= 0) return;

    let cancelled = false;
    metelkaXpAnimTokenRef.current = token;
    setXpFlashAmount(xp);
    setShowXpPopup(true);
    setXpGainAmount(xp);

    // Mark only after the effect survives Strict Mode's immediate cleanup.
    const markTimer = window.setTimeout(() => {
      if (cancelled) return;
      markMetelkaXpAnimationShown(token);
    }, 0);

    const hideTimer = window.setTimeout(() => {
      if (cancelled) return;
      setShowXpPopup(false);
      setXpFlashAmount(null);
    }, 1400);

    return () => {
      cancelled = true;
      window.clearTimeout(markTimer);
      window.clearTimeout(hideTimer);
      if (!hasMetelkaXpAnimationShown(token)) {
        metelkaXpAnimTokenRef.current = null;
        unmarkMetelkaXpAnimationShown(token);
      }
    };
  }, [
    metelkaPending?.active,
    metelkaPending?.claimToken,
    metelkaPending?.xpAmount,
  ]);

  // Finish v2 settles immediately (no result card). Legacy may leave pending result.

  async function handleClaimMetelkaPendingReward() {
    const pending = stateRef.current.game.metelkaPendingReward;
    const token = metelkaPendingClaimToken(pending);
    if (!token || metelkaClaimBusy) return;
    setMetelkaClaimBusy(true);
    setMetelkaClaimError(null);
    try {
      const res = await api.claimMetelkaPendingReward(token);
      const cur = stateRef.current;
      const prevLevel = cur.game.playerLevel ?? 1;
      const today = new Date().toLocaleDateString("ru-RU");
      const moneyGained = res.moneyGained > 0 ? res.moneyGained : 0;
      const nextHistory =
        moneyGained > 0
          ? [{ date: today, amount: moneyGained, type: "metelka" as const }, ...cur.history].slice(
              0,
              30,
            )
          : cur.history;
      commitState({
        ...cur,
        balances: {
          ...cur.balances,
          balance: res.balances.balance,
          earned: res.balances.earned,
        },
        game: applyMetelkaClaimToGameState(cur.game, res),
        history: nextHistory,
      });
      // Clear finish flash so a later Metelka can re-trigger LevelWidget.
      setXpGainAmount(null);
      setShowXpPopup(false);
      setXpFlashAmount(null);
      if (moneyGained > 0) {
        setIncomeChestFeedback(createIncomeChestFeedback(moneyGained));
        setHistoryNotif(true);
      }
      if (res.playerLevel > prevLevel) {
        setLevelUpData({ level: res.playerLevel });
      }
      setMetelkaClaimError(null);
    } catch (err: any) {
      const code = err?.code != null ? String(err.code) : "";
      if (
        code === "metelka_pending_reward_already_claimed" ||
        code === "metelka_pending_reward_not_found"
      ) {
        try {
          const data = await api.getState();
          const synced = normalizeMetelkaPendingReward(
            data.game?.metelkaPendingReward,
          );
          const cur = stateRef.current;
          commitState({
            ...cur,
            ...(data.balances
              ? {
                  balances: {
                    ...cur.balances,
                    balance: data.balances.balance,
                    earned: data.balances.earned,
                  },
                }
              : {}),
            game: {
              ...cur.game,
              ...(data.game?.playerXP != null
                ? { playerXP: data.game.playerXP }
                : {}),
              ...(data.game?.playerLevel != null
                ? { playerLevel: data.game.playerLevel }
                : {}),
              metelkaPendingReward: synced,
            },
          });
          if (!isMetelkaPendingRewardActive(synced)) {
            setMetelkaClaimError(null);
            return;
          }
        } catch {
          // keep coin; show message below
        }
      }
      setMetelkaClaimError(metelkaClaimErrorMessage(err));
    } finally {
      setMetelkaClaimBusy(false);
    }
  }

  async function handleAcknowledgeExcessResult() {
    if (excessAckBusy) return;
    setExcessAckBusy(true);
    try {
      const pendingPaid =
        Number(
          game.v2Excess?.result?.income?.total?.paid ??
            game.v2Excess?.result?.income?.paid,
        ) || 0;
      const res = await api.acknowledgeEconomyV2ExcessResult();
      commitState({
        ...applyEconomyV2ExcessDebugToState(stateRef.current, {
          v2Excess: normalizeV2Excess(res.excess),
        }),
        balances: {
          ...stateRef.current.balances,
          balance: res.balances.balance,
          earned: res.balances.earned,
        },
      });
      excessFinishGuardRef.current.reset();
      if (res.paidIncomeApplied > 0) {
        setIncomeChestFeedback(
          createIncomeChestFeedback(res.paidIncomeApplied),
        );
      } else if (pendingPaid > 0 && res.paidIncomeApplied === 0) {
        // already applied — no replay
      }
    } catch {
      // ignore
    } finally {
      setExcessAckBusy(false);
    }
  }

  const apples = totalApples;

  useEffect(() => {
    const cur = game.playerLevel ?? 1;
    if (cur > prevLevelRef.current) {
      setLevelUpData({ level: cur });
    }
    prevLevelRef.current = cur;
  }, [game.playerLevel]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const mm = game.treeGrowthMM ?? 0;

    // Sync display counter (animates if different from current display)
    if (mm !== displayGrowthMMRef.current) {
      const from = displayGrowthMMRef.current;
      displayGrowthMMRef.current = mm;
      setDisplayGrowthMM(mm);
      if (mm > from) animateGrowth(from, mm);
    }

    // Stage transition
    const newStage = getTreeStage(mm) as 0|1|2|3|4;
    if (newStage !== currentStageRef.current) {
      currentStageRef.current = newStage;
      stageTransTimers.current.forEach(clearTimeout);
      setIsTransitioning(true);
      const t1 = setTimeout(() => setCurrentStage(newStage), 300);
      const t2 = setTimeout(() => setIsTransitioning(false), 900);
      stageTransTimers.current = [t1, t2];
    }
  }, [game.treeGrowthMM]);

  // Check for claimable achievements (dot on level diamond)
  function checkPendingAchievements() {
    api.getAchievements().then(data => {
      const counts = data.counts as Record<string, number>;
      const claimed = data.claimed;
      const hasPending = ACHIEVEMENTS.some(a => {
        if (claimed.includes(a.id)) return false;
        const prevOk = a.prevId === null || claimed.includes(a.prevId);
        if (!prevOk) return false;
        return (counts[a.countKey] ?? 0) >= a.threshold;
      });
      setHasPendingAchievements(hasPending);
    }).catch(() => {});
  }
  useEffect(() => { checkPendingAchievements(); }, [game.lastSessionTime]); // re-check on session complete or state reset

  const locked = isSessionLocked(game.lastSessionTime, now);

  /** Exclusive: when true, entire Care/session cycle is v3-only (v2 is fallback). */
  const useV3 = isEconomyV3GameCycleEnabled(game.v3Roots);
  const useLegacyCare = mayUseLegacyCareSessionFlow(game.v3Roots);
  /** Primary v3 roots UI — same gate as useV3. Never mount RootEnergyLayer / bank UI. */
  const useV3RootsUi = useV3;
  /** Legacy underground scene (soil lift) — shared by v3 roots layout + v2 fallback. */
  const useUndergroundRootsScene =
    useV3RootsUi ||
    ENABLE_ECONOMY_V2_ROOT_COLLECTION ||
    SHOW_ECONOMY_V2_MOCKS;

  const v3RootsRefreshAtRef = useRef(0);
  /** One-shot heal when local UI unlocked tutorial but server complete failed (42P08). */
  const tutorialCompleteHealRef = useRef(false);
  // Heal stuck tutorial_done=false so accumulating/countdown can start after UI unlock.
  useEffect(() => {
    if (!useV3RootsUi || !tutorialDone) return;
    if (tutorialCompleteHealRef.current) return;
    if (game.v3Roots?.generation?.accumulating === true) return;
    void syncRootsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot heal via syncRootsFromServer
  }, [useV3RootsUi, tutorialDone]);
  // Keep waiting/generate aligned with server clock (insurance unfreeze / accumulate).
  useEffect(() => {
    if (!useV3RootsUi) return;
    const decision = shouldRefreshV3RootsFromClock(
      game.v3Roots,
      now,
      v3RootsRefreshAtRef.current,
    );
    if (!decision.refresh) return;
    v3RootsRefreshAtRef.current = now;
    void syncRootsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncRootsFromServer uses stateRef
  }, [
    now,
    useV3RootsUi,
    game.v3Roots?.generation?.frozenAt,
    game.v3Roots?.generation?.insuranceDeadlineAt,
    game.v3Roots?.generation?.accumulating,
  ]);
  /** v2 MockLayer only — never under v3. */
  const useV2MockRootsLayer =
    !useV3RootsUi &&
    !ENABLE_ECONOMY_V2_ROOT_COLLECTION &&
    SHOW_ECONOMY_V2_MOCKS;

  // v3: never read the live energy bank for Care locks / allocation.
  const v2EnergySeconds = useLegacyCare
    ? floorV2EnergySeconds(game.v2EnergySeconds)
    : 0;

  const v2Care = useLegacyCare
    ? normalizeV2Care(game.v2Care)
    : emptyV2CareState();
  const v2CareActive =
    useLegacyCare && ENABLE_ECONOMY_V2_CARE && v2Care.inProgress;

  // Server snapshot during an active v2 Care cycle — never recompute from live energy.
  // Mock-only path may still use live allocation for preview when Care API is off.
  // When v3 owns the cycle: never allocate from v2 bank.
  const v2Alloc: ActivityEnergyAllocation | null = !useLegacyCare
    ? null
    : ENABLE_ECONOMY_V2_CARE
      ? v2CareActive
        ? {
            water: v2Care.allocation.waterSeconds,
            sun: v2Care.allocation.sunSeconds,
            fertilizer: v2Care.allocation.fertilizerSeconds,
          }
        : null
      : SHOW_ECONOMY_V2_MOCKS
        ? computeLiveAllocation(v2EnergySeconds, {
            water: !!game.water,
            sun: !!game.sun,
            fertilizer: !!game.fertilizer,
          })
        : null;

  const v2HasUnclaimedPending =
    (game.pendingBaseReward ?? 0) > 0 || (game.pendingBonusReward ?? 0) > 0;
  /** v2 Care: need 15 whole seconds and no unclaimed pending. Mid-cycle ignores this gate. */
  const v2CareStartBlocked =
    useLegacyCare &&
    ENABLE_ECONOMY_V2_CARE &&
    !v2CareActive &&
    (!canStartV2Care(v2EnergySeconds) || v2HasUnclaimedPending);
  /** Legacy mock gate (only when Care API is off). */
  const v2MockEnergyBlocked =
    useLegacyCare &&
    !ENABLE_ECONOMY_V2_CARE &&
    SHOW_ECONOMY_V2_MOCKS &&
    v2EnergySeconds < 1;
  const activitiesLocked = !useLegacyCare
    ? false
    : ENABLE_ECONOMY_V2_CARE
      ? v2CareStartBlocked
      : SHOW_ECONOMY_V2_MOCKS
        ? v2MockEnergyBlocked
        : locked;
  const nextTime = getNextSessionTime(game.lastSessionTime);
  const msLeft = nextTime ? Math.max(0, nextTime - now) : null;
  /**
   * Mid-session cube row is v2/v1 only.
   * v3 stays on the ready activity-card row (reserves / completed).
   */
  const careCycleActiveUi = !useLegacyCare
    ? false
    : ENABLE_ECONOMY_V2_CARE
      ? v2CareActive && !v2Care.allCompleted
      : !!game.sessionInProgress;
  const sessionUiActive = !useLegacyCare
    ? false
    : careCycleActiveUi ||
      (ENABLE_ECONOMY_V2_CARE && v2Care.allCompleted) ||
      (!ENABLE_ECONOMY_V2_CARE && !!game.sessionInProgress);

  /** v3 activity cards when server enables v3 (preview env unused). */
  const useV3ActivityCards = shouldUseV3ActivityCardUi(
    SHOW_ECONOMY_V3_ROOTS_PREVIEW,
    game.v3Roots,
  );

  /** Server preset for the open v3 Care minigame (if any). */
  const v3CarePresetSeconds = (() => {
    const s = game.v3Roots?.careSession;
    if (!s || s.activity == null) return null;
    if (s.status !== "active" && s.status !== "completed") return null;
    const n = Math.floor(Number(s.presetSeconds) || 0);
    return n >= 5 ? n : null;
  })();

  // F5 / reload: restore active minigame or completed→acknowledge without re-start.
  // Runs after Tutorial is done, or during v3 Tutorial live Care (server is SoT).
  useEffect(() => {
    if (!useV3RootsUi) return;
    if (!tutorialDone && !isV3TutorialLiveCareStep(tutorialStep)) return;
    const snap = game.v3Roots;
    if (!snap || snap.enabled !== true) return;
    const recovery = resolveV3CareRecovery(snap);
    if (recovery.type === "none") {
      v3RecoveredSessionRef.current = null;
      return;
    }
    const key = `${recovery.type}:${recovery.activity}:${snap.careSession.startedAt ?? ""}:${snap.careSession.status}:${snap.careSession.finishedAt ?? ""}`;
    if (v3RecoveredSessionRef.current === key) return;
    v3RecoveredSessionRef.current = key;

    if (recovery.type === "open-minigame") {
      setActiveMinigame((cur) => cur ?? recovery.activity);
      return;
    }
    if (recovery.type === "await-acknowledge") {
      const score =
        recovery.skill != null && Number.isFinite(recovery.skill)
          ? Math.round(recovery.skill * 100)
          : 50;
      const pct = activityResultFillPercent(score);
      const act = recovery.activity;
      lastCompletedActivityRef.current = act;
      if (act === "water") setWaterResultPct(pct);
      if (act === "sun") setLightResultPct(pct);
      if (act === "fertilizer") setFertilizerResultPct(pct);
      setDisplayFillHeights((d) => ({ ...d, [act]: pct }));
      setV3PendingAck(act);
    }
  }, [game.v3Roots, tutorialDone, tutorialStep]);

  // F5 / reload: Care cycle ready → shovel; finished → preview; claimed → ack (no re-claim).
  useEffect(() => {
    if (!useV3RootsUi) return;
    if (!tutorialDone && tutorialStep !== "complete") return;
    const snap = game.v3Roots;
    if (!snap || snap.enabled !== true) return;
    const recovery = resolveV3CareCycleRecovery(snap);
    if (recovery.type === "none") {
      v3CycleRecoveredRef.current = null;
      // Idle cycle: drop stale result overlays so a new reserve fill
      // does not paint white «done» shells over thematic colors.
      const acts = snap.careCycle?.activities;
      const anyDone =
        acts?.water?.completed === true ||
        acts?.sun?.completed === true ||
        acts?.fertilizer?.completed === true;
      if (!anyDone && !isV3CareSessionBlocking(snap)) {
        setWaterResultPct(null);
        setLightResultPct(null);
        setFertilizerResultPct(null);
        setDisplayFillHeights(zeroDisplayFills());
      }
      return;
    }
    const cycle = snap.careCycle;
    const key = `${recovery.type}:${cycle?.status ?? ""}:${cycle?.finishedAt ?? ""}:${cycle?.claim?.claimedAt ?? ""}:${cycle?.claim?.claimed ? 1 : 0}`;

    // Live trio→«Уход»: hold + merge owns the row. Do not stamp recovered or
    // call restore_shovel — that was skipping the converge after the pause.
    if (
      v3LiveConvergeRef.current &&
      (recovery.type === "show-shovel" ||
        recovery.type === "show-reward-preview")
    ) {
      return;
    }

    if (v3CycleRecoveredRef.current === key) return;
    v3CycleRecoveredRef.current = key;

    if (recovery.type === "acknowledge-cycle") {
      void acknowledgeV3CareCycleOnce();
      return;
    }
    if (recovery.type === "show-reward-preview") {
      applyV3RewardPreviewToUi(snap);
      enterV3CareShovelUi();
      return;
    }
    if (recovery.type === "show-shovel") {
      enterV3CareShovelUi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.v3Roots, tutorialDone, tutorialStep]);

  // F5: restore v3 Tutorial step from server snapshot.
  useEffect(() => {
    if (tutorialDone || !useV3) return;
    const next = resolveV3TutorialStepFromServer({
      tutorialDone: false,
      v3Roots: game.v3Roots,
    });
    if (next == null || next === "welcome") return;
    setTutorialStep((cur) => {
      if (cur === next) return cur;
      if (cur === "welcome" || cur === "intro" || cur == null) return next;
      return next;
    });
  }, [game.v3Roots, tutorialDone, useV3]);

  // v3 Tutorial intro (strict sequence, not simultaneous):
  // 5s timer (root empty) → quick root pop to 5s → next timer → next root…
  // then switch capsule straight to 12:00 (never flash 0).
  const [tutorialFillDeadlineMs, setTutorialFillDeadlineMs] = useState<
    number | null
  >(null);
  const [tutorialTimerKind, setTutorialTimerKind] =
    useState<TutorialV3TimerKind | null>(null);
  const tutorialTimerKindRef = useRef<TutorialV3TimerKind | null>(null);
  const tutorialFillRunRef = useRef(0);
  const tutorialWaitStartedRef = useRef(false);
  /** Absolute start of the tutorial 12:00 wait — handed to tutorial/complete. */
  const tutorialWaitStartedAtRef = useRef<number | null>(null);
  /** Absolute wait deadline — seeds live V3RootWaitTimer after dismiss. */
  const tutorialWaitDeadlineMsRef = useRef<number | null>(null);
  // F5 during tutorial wait: restore clock before any re-arm can invent a new 12:00.
  if (
    tutorialWaitStartedAtRef.current == null ||
    tutorialWaitDeadlineMsRef.current == null
  ) {
    const stored = loadTutorialWaitClock();
    if (stored) {
      tutorialWaitStartedAtRef.current = stored.startedAtMs;
      tutorialWaitDeadlineMsRef.current = stored.deadlineMs;
      tutorialWaitStartedRef.current = true;
    }
  }
  useEffect(() => {
    tutorialTimerKindRef.current = tutorialTimerKind;
  }, [tutorialTimerKind]);

  const startTutorialWaitCountdown = () => {
    // Idempotent + F5-safe: restore sessionStorage clock; never re-arm a fresh 12:00.
    let armedStartedAt: number | null = null;
    if (!tutorialWaitStartedRef.current) {
      tutorialWaitStartedRef.current = true;
      const clock = armTutorialWaitClock(Date.now());
      tutorialWaitStartedAtRef.current = clock.startedAtMs;
      tutorialWaitDeadlineMsRef.current = clock.deadlineMs;
      armedStartedAt = clock.startedAtMs;
      setTutorialTimerKind("wait");
      setTutorialFillDeadlineMs(clock.deadlineMs);
    } else if (tutorialTimerKindRef.current !== "wait") {
      // Stuck on expired fill "1" after step raced away from intro.
      const clock =
        loadTutorialWaitClock() ??
        (() => {
          const startedAt =
            tutorialWaitStartedAtRef.current ?? Date.now();
          const next = {
            startedAtMs: startedAt,
            deadlineMs: startedAt + TUTORIAL_V3_WAIT_MS,
          };
          persistTutorialWaitClock(next);
          return next;
        })();
      tutorialWaitStartedAtRef.current = clock.startedAtMs;
      tutorialWaitDeadlineMsRef.current = clock.deadlineMs;
      armedStartedAt = clock.startedAtMs;
      setTutorialTimerKind("wait");
      setTutorialFillDeadlineMs(clock.deadlineMs);
    } else {
      armedStartedAt = tutorialWaitStartedAtRef.current;
    }
    // Persist wait start as generation anchor (main-game settle after 12:00).
    if (armedStartedAt != null) {
      void api.armTutorialV3Wait(armedStartedAt).catch((err) => {
        if (import.meta.env.DEV) {
          console.warn("[v3 tutorial] arm-wait failed", err);
        }
      });
    }
    setTutorialStep((s) =>
      s === "intro" || s == null || s === "welcome" ? "v3-root-water" : s,
    );
  };

  const tutorialWaitEnergySyncRef = useRef(false);

  // When tutorial 12:00 hits 0 — fill root energy cells like main settle.
  useEffect(() => {
    if (tutorialDone || !useV3) return;
    if (tutorialTimerKind !== "wait" || tutorialFillDeadlineMs == null) return;

    const tick = () => {
      if (Date.now() < tutorialFillDeadlineMs) return;
      if (tutorialWaitEnergySyncRef.current) return;
      tutorialWaitEnergySyncRef.current = true;
      const startedAt = tutorialWaitStartedAtRef.current;
      void (async () => {
        try {
          const res = await api.syncTutorialV3WaitEnergy(startedAt);
          const cur = stateRef.current;
          if (res.v3Roots) {
            commitState(applyEconomyV3RootsToState(cur, res.v3Roots));
          }
          // Tutorial public state keeps accumulating=false; next cycle = full T.
          const nextAtRaw = res.v3Roots?.generation?.nextWholeSecondAt;
          const parsedNext = nextAtRaw ? Date.parse(nextAtRaw) : NaN;
          const cycleSec =
            res.v3Roots?.generation?.cycleDurationSeconds ??
            TUTORIAL_V3_WAIT_SECONDS;
          const nextAt =
            Number.isFinite(parsedNext) && parsedNext > Date.now() - 2000
              ? parsedNext
              : Date.now() +
                Math.max(1, Number(cycleSec) || TUTORIAL_V3_WAIT_SECONDS) *
                  1000;
          tutorialWaitDeadlineMsRef.current = nextAt;
          setTutorialFillDeadlineMs(nextAt);
          if (startedAt != null) {
            persistTutorialWaitClock({
              startedAtMs: startedAt,
              deadlineMs: nextAt,
            });
          }
          tutorialWaitEnergySyncRef.current = false;
        } catch (err) {
          tutorialWaitEnergySyncRef.current = false;
          if (import.meta.env.DEV) {
            console.warn("[v3 tutorial] sync-wait-energy failed", err);
          }
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialDone, useV3, tutorialTimerKind, tutorialFillDeadlineMs]);

  // Repair: F5 / step advance can cancel the intro loop before 12:00 starts.
  useEffect(() => {
    if (tutorialDone || !useV3) {
      tutorialWaitStartedRef.current = false;
      // Keep tutorialWaitStartedAtRef until dismiss sends it to tutorial/complete.
      setTutorialFillDeadlineMs(null);
      setTutorialTimerKind(null);
      return;
    }
    if (!areV3TutorialRootsEnergyReady(game.v3Roots)) return;
    if (
      tutorialWaitStartedRef.current &&
      tutorialTimerKind === "wait" &&
      tutorialFillDeadlineMs != null
    ) {
      return;
    }
    startTutorialWaitCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialDone, useV3, game.v3Roots, tutorialTimerKind]);

  useEffect(() => {
    if (tutorialDone || !useV3) return;
    // After intro, keep the 12:00 wait capsule through collect / Care.
    if (tutorialStep !== "intro") return;

    const runId = ++tutorialFillRunRef.current;
    let cancelled = false;
    const stillActive = () =>
      !cancelled && tutorialFillRunRef.current === runId;

    const sleepUntil = (deadlineMs: number) =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (!stillActive() || Date.now() >= deadlineMs) {
            resolve();
            return;
          }
          window.setTimeout(tick, 50);
        };
        tick();
      });

    const sleepMs = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    const applyLocalRootFill = (kind: EconomyV3RootKind, seconds: number) => {
      const cur = stateRef.current;
      const snap = cur.game.v3Roots;
      if (!snap || snap.enabled !== true) return;
      commitState(
        applyEconomyV3RootsToState(
          cur,
          withTutorialRootSeconds(snap, kind, seconds),
        ),
      );
    };

    /** Fast 0 → 5s pop after the wait (not during the timer). */
    const popRootFill = async (kind: EconomyV3RootKind) => {
      const animStart = Date.now();
      const end = animStart + TUTORIAL_V3_ROOT_POP_MS;
      while (stillActive() && Date.now() < end) {
        const t = Math.min(
          1,
          (Date.now() - animStart) / TUTORIAL_V3_ROOT_POP_MS,
        );
        applyLocalRootFill(kind, TUTORIAL_V3_ROOT_SECONDS * t);
        await sleepMs(32);
      }
      if (!stillActive()) return;
      applyLocalRootFill(kind, TUTORIAL_V3_ROOT_SECONDS);
    };

    (async () => {
      try {
        if (areV3TutorialRootsEnergyReady(stateRef.current.game.v3Roots)) {
          startTutorialWaitCountdown();
          return;
        }
        // Phase A: 5s timer (root stays empty). Phase B: quick fill. Repeat.
        while (stillActive()) {
          const kind = nextV3TutorialFillKind(stateRef.current.game.v3Roots);
          if (kind == null) {
            startTutorialWaitCountdown();
            return;
          }
          const deadline = Date.now() + TUTORIAL_V3_FILL_MS;
          setTutorialTimerKind("fill");
          setTutorialFillDeadlineMs(deadline);
          await sleepUntil(deadline);
          if (!stillActive()) return;
          await popRootFill(kind);
          // Arm 12:00 as soon as the last root pops — before prepare/step races.
          if (nextV3TutorialFillKind(stateRef.current.game.v3Roots) == null) {
            startTutorialWaitCountdown();
          }
          if (!stillActive() && tutorialWaitStartedRef.current) {
            // Intro effect cancelled by step advance; wait capsule already armed.
            try {
              await api.prepareTutorialV3({ kind });
            } catch {
              /* best-effort persist */
            }
            return;
          }
          if (!stillActive()) return;
          const prepared = await api.prepareTutorialV3({ kind });
          if (!stillActive() && !tutorialWaitStartedRef.current) return;
          const local = stateRef.current.game.v3Roots;
          if (local && prepared.v3Roots) {
            commitState(
              applyEconomyV3RootsToState(
                stateRef.current,
                mergeStagedTutorialPrepare(local, kind, prepared.v3Roots),
              ),
            );
          }
          if (nextV3TutorialFillKind(stateRef.current.game.v3Roots) == null) {
            startTutorialWaitCountdown();
            return;
          }
        }
      } catch (err) {
        if (
          !tutorialWaitStartedRef.current &&
          tutorialTimerKindRef.current !== "wait"
        ) {
          setTutorialFillDeadlineMs(null);
          setTutorialTimerKind(null);
        }
        if (import.meta.env.DEV) console.warn("[v3 tutorial fill]", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialDone, useV3, tutorialStep]);

  /** Excess must not replace Care while mid-cycle or awaiting «Уход». */
  const metelkaBlockedByCare = useV3
    ? v3CareBlocksMetelka(game.v3Roots) ||
      !!activeMinigame ||
      !!v3PendingAck ||
      v3CareBusy ||
      showCompletionStage ||
      showCareButton ||
      showActivityGhost
    : careCycleBlocksMetelka({
        careInProgress: ENABLE_ECONOMY_V2_CARE
          ? v2Care.inProgress
          : !!game.sessionInProgress,
        allActivitiesDone: ENABLE_ECONOMY_V2_CARE
          ? v2Care.allCompleted || allActivitiesDone(v2Care.completed)
          : !!(game.water && game.sun && game.fertilizer && game.sessionInProgress),
        showCompletionStage,
        showCareButton,
        showActivityGhost,
        hasUnclaimedPending: v2HasUnclaimedPending,
      }) ||
      !!activeMinigame;

  /**
   * Server Care cycle already ready/finished. Used to keep Metelka / activity
   * cards from stealing the row — «Уход» itself only mounts after care_button
   * (live trio must hold → converge first; F5 uses restore_shovel).
   */
  const v3ServerWantsCareShovel =
    useV3 &&
    (shouldShowV3CareShovel(game.v3Roots) ||
      shouldShowV3RewardPreview(game.v3Roots) ||
      shouldAcknowledgeV3CareCycle(game.v3Roots));
  const showCareShovelUi = showCareButton;
  /** Muted spent cubes (ghost) — sticky in tutorial after «Уход» diverge. */
  const showSpentActivityGhost =
    showActivityGhost || tutorialActivitiesExhausted;

  const sessionMax = balances.balance * 0.15 / 365 / 3;
  const actionsLeft = !useLegacyCare
    ? 0
    : ENABLE_ECONOMY_V2_CARE
      ? v2CareActionsLeft(v2Care)
      : getSessionActionsLeft(game);

  // Compute stored sessions dynamically (missed sessions accumulate until played)
  // When lastSessionTime is null (never played) fall back to startDate — mirrors server logic.
  // v3 cycle does not use missed/stored sessions for Care gating.
  const computedMissed = (() => {
    if (useV3) return 0;
    if (game.sessionInProgress) return game.missedSessions ?? 0;
    const referenceTime = game.lastSessionTime ?? balances.startDate ?? null;
    if (!referenceTime) return game.missedSessions ?? 0;
    const elapsed = now - referenceTime;
    const additionalMissed = Math.max(0, Math.floor(elapsed / SESSION_COOLDOWN_MS) - 1);
    return (game.missedSessions ?? 0) + additionalMissed;
  })();
  const storedSessions = useV3 ? 0 : 1 + computedMissed;
  const pendingStoredSessions = useV3 ? 0 : (game.pendingStoredSessions ?? 1);

  useEffect(() => {
    if (!import.meta.env.DEV || useV3) return;
    console.log("[Dev] /game/state session fields", {
      missedSessions: game.missedSessions,
      lastSessionTime: game.lastSessionTime,
      sessionInProgress: game.sessionInProgress,
      pendingStoredSessions,
      water: game.water,
      sun: game.sun,
      fertilizer: game.fertilizer,
      computedMissed,
      storedSessions,
      locked: isSessionLocked(game.lastSessionTime, Date.now()),
    });
  }, [
    useV3,
    game.missedSessions,
    game.lastSessionTime,
    game.sessionInProgress,
    game.water,
    game.sun,
    game.fertilizer,
    pendingStoredSessions,
    computedMissed,
    storedSessions,
  ]);

  const stage = getTreeStage(game.treeGrowthMM ?? 0);

  const pendingBase = game.pendingBaseReward ?? 0;
  const pendingBonus = game.pendingBonusReward ?? 0;

  function addFloater(label: string, x: number, y: number, opts?: { big?: boolean; gold?: boolean }) {
    const id = ++floaterRef.current;
    setFloaters(f => [...f, { id, x, y, label, ...opts }]);
    setTimeout(() => setFloaters(f => f.filter(fl => fl.id !== id)), 1200);
  }

  function animateGrowth(fromMM: number, toMM: number) {
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    if (fromMM === toMM) return;
    const start = performance.now();
    const duration = 750;
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(fromMM + (toMM - fromMM) * eased);
      displayGrowthMMRef.current = current;
      setDisplayGrowthMM(current);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        animFrameRef.current = null;
      }
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  function triggerTreeAnim() {
    void treeControls.start({
      scale: [1, 1.13, 1],
      y: [0, -12, 0],
      filter: [
        "drop-shadow(0 0 0px rgba(34,197,94,0))",
        "drop-shadow(0 0 14px rgba(34,197,94,0.85))",
        "drop-shadow(0 0 0px rgba(34,197,94,0))",
      ],
      transition: { duration: 0.75, times: [0, 0.38, 1], ease: "easeOut" },
    });
  }

  function playCoinIncomeFeedback(amount: number) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    setLastIncomeAmount(n);
    setShowIncomePopup(true);
    setIncomeChestFeedback(createIncomeChestFeedback(n));
    const hidePopup = setTimeout(() => setShowIncomePopup(false), 1500);
    growthTimeoutsRef.current.push(hidePopup);
  }

  function claimApplesAndIncome(remaining: number) {
    if (appleAutoCollectTimerRef.current) {
      clearTimeout(appleAutoCollectTimerRef.current);
      appleAutoCollectTimerRef.current = null;
    }
    // Coin (index = appleCount-1) never counts toward red apple counter
    const coinIdx = appleCountRef.current - 1;
    const coinUncollected = !collectedAppleIndicesRef.current.includes(coinIdx);
    const redRemaining = coinUncollected ? Math.max(0, remaining - 1) : remaining;
    const cur = stateRef.current;
    const total = (cur.game.pendingBaseReward ?? 0) + (cur.game.pendingBonusReward ?? 0);
    // Same chest float as Metelka / care income — not only the static +₽ chip.
    if (total > 0) playCoinIncomeFeedback(total);
    else setShowIncomePopup(true);
    if (redRemaining > 0) {
      setApplePopupCount(redRemaining);
      setShowApplePopup(true);
    }
    setTimeout(() => { setShowIncomePopup(false); setShowApplePopup(false); }, 1500);
    setTotalApples(t => t + redRemaining);
    setHistoryHighlight(true);
    setTimeout(() => setHistoryHighlight(false), 2800);
    // Only enter rewards-hide if still in post-care UI (not already returned to new-care buttons).
    if (showActivityGhost || showCareButton || showCompletionStage) {
      setShowRewards(true);
    }
    // Save only red apples (coin excluded from lifetime counter)
    void handleClaimAll(appleCountRef.current - 1);
    // Hide overlay only when all apples are collected
    const allCollected = collectedAppleIndicesRef.current.length >= appleCountRef.current;
    if (allCollected) {
      setTimeout(() => {
        setShowApples(false);
        collectedAppleIndicesRef.current = [];
        setCollectedAppleIndices([]);
        setFlyingAppleIndices([]);
      }, 600);
    } else {
      // Red apples still remain — restart 60s auto-clean timer (no income, just count reds)
      appleAutoCollectTimerRef.current = setTimeout(() => {
        appleAutoCollectTimerRef.current = null;
        const uncollectedReds = (appleCountRef.current - 1) -
          collectedAppleIndicesRef.current.filter(i => i < appleCountRef.current - 1).length;
        if (uncollectedReds > 0) {
          // Анимируем оставшиеся красные кружки исчезновением (монетка уже собрана)
          const allIdx = Array.from({ length: appleCountRef.current }, (_, i) => i);
          collectedAppleIndicesRef.current = allIdx;
          setCollectedAppleIndices(allIdx);
          setApplePopupCount(uncollectedReds);
          setShowApplePopup(true);
          setTimeout(() => setShowApplePopup(false), 1500);
          setTotalApples(t => t + uncollectedReds);
          setTimeout(() => {
            setShowApples(false);
            collectedAppleIndicesRef.current = [];
            setCollectedAppleIndices([]);
            setFlyingAppleIndices([]);
          }, 320);
        } else {
          setShowApples(false);
          collectedAppleIndicesRef.current = [];
          setCollectedAppleIndices([]);
          setFlyingAppleIndices([]);
        }
      }, 60000);
    }
  }

  function handleAppleClick(appleIdx: number) {
    if (collectedAppleIndicesRef.current.includes(appleIdx)) return;
    // Mark as manually clicked so exit animation flies toward resources
    setFlyingAppleIndices(f => [...f, appleIdx]);
    const next = [...collectedAppleIndicesRef.current, appleIdx];
    collectedAppleIndicesRef.current = next;
    setCollectedAppleIndices(next);

    const isCoin = appleIdx === appleCountRef.current - 1;

    // Tutorial reward beat: +1 apple / +1₽ into real counters, then finish card.
    if (tutorialRewardActiveRef.current) {
      if (isCoin) {
        tutorialRewardCollectRef.current.coin = true;
        tutorialDemoRewardRef.current.money = 1;
        {
          const cur = stateRef.current;
          const today = new Date().toLocaleDateString("ru-RU");
          commitState({
            ...cur,
            balances: {
              ...cur.balances,
              balance: cur.balances.balance + 1,
              earned: cur.balances.earned + 1,
            },
            history: [
              { date: today, amount: 1, type: "base" as const },
              ...cur.history,
            ].slice(0, 30),
          });
        }
        playCoinIncomeFeedback(1);
      } else {
        tutorialRewardCollectRef.current.apple = true;
        tutorialDemoRewardRef.current.apples = 1;
        {
          const cur = stateRef.current;
          const nextApples = (cur.game.totalApples ?? 0) + 1;
          setTotalApples(nextApples);
          commitState({
            ...cur,
            game: { ...cur.game, totalApples: nextApples },
          });
        }
        setApplePopupCount(1);
        setShowApplePopup(true);
        const hideApple = setTimeout(() => setShowApplePopup(false), 1200);
        growthTimeoutsRef.current.push(hideApple);
      }
      maybeFinishTutorialRewards();
      return;
    }

    if (isCoin) {
      claimApplesAndIncome(0);
    } else {
      setTotalApples(t => t + 1);
      setApplePopupCount(1);
      setShowApplePopup(true);
      setTimeout(() => setShowApplePopup(false), 1200);
      // If all apples now collected (golden was clicked first), hide overlay
      if (next.length === appleCountRef.current) {
        if (appleAutoCollectTimerRef.current) {
          clearTimeout(appleAutoCollectTimerRef.current);
          appleAutoCollectTimerRef.current = null;
        }
        setTimeout(() => {
          setShowApples(false);
          collectedAppleIndicesRef.current = [];
          setCollectedAppleIndices([]);
          setFlyingAppleIndices([]);
        }, 600);
      }
    }
  }

  function addTreeGrowthMm(mm: number) {
    const currentMM = game.treeGrowthMM ?? 0;
    const newMM = currentMM + mm;
    commitState({ ...state, game: { ...game, treeGrowthMM: newMM } });
    animateGrowth(displayGrowthMMRef.current, newMM);
  }

  function resetCareUiChrome(opts?: { keepSpentActivities?: boolean }) {
    waterScoreRef.current = 40;
    sunScoreRef.current = 40;
    fertilizerScoreRef.current = 40;
    skillScoreRef.current = 40;
    setWaterResultPct(null);
    setLightResultPct(null);
    setFertilizerResultPct(null);
    setDisplayFillHeights(zeroDisplayFills());
    dispatchCarePhase({ type: "reset" });
    setShowRewards(false);
    clearCareDivergeTimer();
    // Tutorial spent cubes stay muted until dismiss — never flash active.
    if (opts?.keepSpentActivities || tutorialActivitiesExhausted) {
      setShowActivityGhost(true);
    } else {
      setShowActivityGhost(false);
    }
    setFadeActivities(false);
    setCareSyncError(null);
    setPendingActivitySync(null);
    if (growthIntervalRef.current) {
      clearInterval(growthIntervalRef.current);
      growthIntervalRef.current = null;
    }
    growthTimeoutsRef.current.forEach(clearTimeout);
    growthTimeoutsRef.current = [];
    setShowGrowthAnim(false);
    setGrowthCountdown(null);
    setShowApples(false);
    collectedAppleIndicesRef.current = [];
    setCollectedAppleIndices([]);
    setFlyingAppleIndices([]);
    if (appleAutoCollectTimerRef.current) {
      clearTimeout(appleAutoCollectTimerRef.current);
      appleAutoCollectTimerRef.current = null;
    }
  }

  /**
   * Stop reward presentation (XP / growth / apples / income).
   * Used when leaving Tutorial — must never leave a running Care reward queue.
   */
  function clearCareRewardPresentationState(opts?: {
    keepSpentActivities?: boolean;
  }) {
    pendingXpRef.current = null;
    setSessionScores(null);
    setCareClicked(false);
    setShowXpPopup(false);
    setShowMmPopup(false);
    setMmPopupAmount(0);
    setShowIncomePopup(false);
    setShowApplePopup(false);
    setIncomeChestFeedback(null);
    setXpGainAmount(null);
    setLevelUpData(null);
    tutorialRewardActiveRef.current = false;
    tutorialRewardCollectRef.current = { apple: false, coin: false };
    setTutorialShowGrowthBadge(false);
    setTutorialShowAppleBadge(false);
    resetCareUiChrome({
      keepSpentActivities: opts?.keepSpentActivities === true,
    });
  }

  async function recoverCareFromServer() {
    try {
      const excessSeqAtStart = readEconomyV2ExcessDebugMutationSeq();
      const data = await api.getState();
      if (!data.exists || !data.game) return;
      const keepLocalExcess =
        excessSeqAtStart !== readEconomyV2ExcessDebugMutationSeq();
      const nextExcess = keepLocalExcess
        ? stateRef.current.game.v2Excess
        : normalizeV2Excess(data.game.v2Excess);
      // v3 exclusive: apply v3Roots + excess (Metelka). Skip v2Care / v1 session.
      if (
        isEconomyV3GameCycleEnabled(data.game.v3Roots) ||
        isEconomyV3GameCycleEnabled(stateRef.current.game.v3Roots)
      ) {
        const next: UserState = {
          ...stateRef.current,
          game: {
            ...stateRef.current.game,
            v2Care: emptyV2CareState(),
            v2Roots: emptyV2RootsState(),
            v2EnergySeconds: 0,
            v2EnergyAnchorAt: null,
            v2Excess: nextExcess,
          },
        };
        commitState(applyEconomyV3FromServerGame(next, data.game));
        return;
      }
      let next = applyV2CareSnapshotToState(
        stateRef.current,
        data.game.v2Care,
        data.game.v2EnergySeconds,
      );
      next = {
        ...next,
        game: {
          ...next.game,
          v2EnergySeconds: data.game.v2EnergySeconds ?? next.game.v2EnergySeconds,
          v2Roots: normalizeV2Roots(data.game.v2Roots),
          v2Excess: nextExcess,
        },
      };
      commitState(applyEconomyV3FromServerGame(next, data.game));
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[care recover]", err);
    }
  }

  /** Sync root mask / timer after Care settle without resetting local UI chrome. */
  async function syncRootsFromServer() {
    try {
      const excessSeqAtStart = readEconomyV2ExcessDebugMutationSeq();
      let data = await api.getState();
      if (!data.exists || !data.game) return;
      // Client may have tutorialDone=true while server still has tutorial_done=false
      // (POST /tutorial/complete used to fail on bigint/timestamp $2). Retry once.
      if (
        !tutorialCompleteHealRef.current &&
        tutorialDone &&
        data.game.tutorialDone === false &&
        isEconomyV3GameCycleEnabled(data.game.v3Roots)
      ) {
        tutorialCompleteHealRef.current = true;
        try {
          const storedWait = loadTutorialWaitClock();
          await api.tutorialComplete({
            generationAnchorAt: resolveTutorialGenerationAnchorAt({
              startedAtMs:
                tutorialWaitStartedAtRef.current ?? storedWait?.startedAtMs,
              waitDeadlineMs:
                tutorialWaitDeadlineMsRef.current ?? storedWait?.deadlineMs,
            }),
          });
          clearTutorialWaitClock();
          data = await api.getState();
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("[v3 timer] tutorialComplete heal failed", err);
          }
        }
      }
      if (!data.exists || !data.game) return;
      const serverGame = data.game;
      // Debug reset/add won the race: keep local excess, still refresh v3 roots.
      const keepLocalExcess =
        excessSeqAtStart !== readEconomyV2ExcessDebugMutationSeq();
      const nextExcess = keepLocalExcess
        ? stateRef.current.game.v2Excess
        : normalizeV2Excess(serverGame.v2Excess);
      if (
        isEconomyV3GameCycleEnabled(serverGame.v3Roots) ||
        isEconomyV3GameCycleEnabled(stateRef.current.game.v3Roots)
      ) {
        const local = stateRef.current;
        // Never let a stale poll replace tutorial collectibles with zeros.
        const syncedMm = Math.max(
          Number(serverGame.treeGrowthMM) || 0,
          Number(local.game.treeGrowthMM) || 0,
        );
        const syncedApples = Math.max(
          Number(serverGame.totalApples) || 0,
          Number(local.game.totalApples) || 0,
        );
        const syncedEarned = Math.max(
          Number(data.balances?.earned) || 0,
          Number(local.balances.earned) || 0,
        );
        const syncedBalance = Math.max(
          Number(data.balances?.balance) || 0,
          Number(local.balances.balance) || 0,
        );
        const next: UserState = {
          ...local,
          balances: {
            ...local.balances,
            ...(data.balances
              ? {
                  balance: syncedBalance,
                  earned: syncedEarned,
                }
              : {}),
          },
          game: {
            ...local.game,
            tutorialDone:
              serverGame.tutorialDone !== false ? true : tutorialDone,
            treeGrowthMM: syncedMm,
            treeGrowthRemainder: serverGame.treeGrowthRemainder ?? 0,
            totalApples: syncedApples,
            playerXP: serverGame.playerXP ?? 0,
            playerLevel: serverGame.playerLevel ?? 1,
            v2Care: emptyV2CareState(),
            v2Roots: emptyV2RootsState(),
            v2EnergySeconds: 0,
            v2EnergyAnchorAt: null,
            v2Excess: nextExcess,
          },
        };
        if (serverGame.tutorialDone !== false) {
          setTutorialDone(true);
          setTotalApples(next.game.totalApples ?? 0);
          displayGrowthMMRef.current = next.game.treeGrowthMM ?? 0;
          setDisplayGrowthMM(next.game.treeGrowthMM ?? 0);
        }
        let synced = applyEconomyV3FromServerGame(next, serverGame);
        // Poll must not re-apply tutorial Care checkmarks and hide "0 с".
        if (
          (serverGame.tutorialDone !== false || tutorialDone) &&
          shouldClearStaleV3CareUiAfterTutorial(synced.game.v3Roots)
        ) {
          synced = applyEconomyV3RootsToState(
            synced,
            clearV3CareUiAfterTutorial(synced.game.v3Roots),
          );
        }
        commitState(synced);
        return;
      }
      if (!ENABLE_ECONOMY_V2_ROOT_COLLECTION) return;
      let next: UserState = {
        ...stateRef.current,
        game: {
          ...stateRef.current.game,
          v2EnergySeconds:
            serverGame.v2EnergySeconds ?? stateRef.current.game.v2EnergySeconds,
          v2Roots: normalizeV2Roots(serverGame.v2Roots),
          v2Excess: nextExcess,
        },
      };
      commitState(applyEconomyV3FromServerGame(next, serverGame));
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[roots sync]", err);
    }
  }

  async function finishV2CareOnce(cycleId: string | null | undefined) {
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) return;
    if (!ENABLE_ECONOMY_V2_CARE || !cycleId) return;
    if (v2CareFinishedCycleRef.current === cycleId) return;
    if (v2CareFinishInFlightRef.current) return;
    v2CareFinishInFlightRef.current = true;
    try {
      const result = await api.finishV2Care(cycleId);
      v2CareFinishedCycleRef.current = cycleId;
      commitState(
        applyV2CareFinishToState(stateRef.current, result.energySeconds),
      );
    } catch (err: any) {
      // Inactive cycle after success is fine (idempotent enough for UI).
      if (err?.status === 409) {
        v2CareFinishedCycleRef.current = cycleId;
        commitState(
          applyV2CareFinishToState(
            stateRef.current,
            Number(stateRef.current.game.v2EnergySeconds) || 0,
          ),
        );
        return;
      }
      setCareSyncError(careErrorMessage(err));
      await recoverCareFromServer();
      throw err;
    } finally {
      v2CareFinishInFlightRef.current = false;
    }
  }

  /**
   * Start excess Metelka session — POST /api/game/v2/excess/start.
   * Does not touch Care activities or energy spend.
   */
  async function handleStartMetelka() {
    if (!tutorialDone) return;
    if (actionLoading) return;
    const excess = stateRef.current.game.v2Excess;
    const v3Roots = stateRef.current.game.v3Roots;
    if (!shouldShowMetelkaCard(excess, v3Roots)) return;
    if (v3CareBlocksMetelka(v3Roots)) return;
    if (excess?.session?.active) return;
    setActionLoading(true);
    try {
      const res = await api.startEconomyV2ExcessSession();
      commitState(
        applyEconomyV2ExcessDebugToState(stateRef.current, {
          v2Excess: normalizeV2Excess(res.excess),
        }),
      );
    } catch (err: any) {
      const code = err?.code != null ? String(err.code) : "";
      if (
        code === "excess_not_available" ||
        code === "excess_session_already_active"
      ) {
        try {
          const data = await api.getState();
          if (data.game?.v2Excess) {
            let next = applyEconomyV2ExcessDebugToState(stateRef.current, {
              v2Excess: normalizeV2Excess(data.game.v2Excess),
            });
            commitState(applyEconomyV3FromServerGame(next, data.game));
          }
        } catch {
          // keep previous display
        }
      }
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * Economy v3 Care start — only /v3/care/start-activity.
   * Does not call v2 Care / session start or spend v2 energy.
   */
  async function handleStartV3CareActivity(activity: EconomyV3RootKind) {
    const liveTutorial =
      !tutorialDone &&
      useV3 &&
      isV3TutorialLiveCareStep(tutorialStep);
    if (!tutorialDone && !liveTutorial) return;
    if (v3CareBusy || actionLoading || activeMinigame) return;
    const snap = stateRef.current.game.v3Roots;
    const excessSnap = stateRef.current.game.v2Excess;
    if (!snap || snap.enabled !== true) return;
    if (careBlockedByMetelka({ excess: excessSnap, v3Roots: snap })) {
      // UI: Care buttons hidden + gray roots; no hint status text.
      return;
    }
    if (
      !canStartV3CareActivity({
        activity,
        v3Roots: snap,
        excess: excessSnap,
        busy: v3CareBusy || actionLoading,
      })
    ) {
      return;
    }
    const presetSeconds = resolveV3CareStartPresetSeconds(activity, snap);
    if (presetSeconds == null) return;

    setV3CareBusy(true);
    setCareSyncError(null);
    setV3PendingFinish(null);
    setV3PendingAck(null);
    try {
      const started = await api.startV3CareActivity(activity, presetSeconds);
      commitState(
        applyEconomyV3RootsToState(
          stateRef.current,
          started.v3Roots,
        ),
      );
      const serverPreset =
        started.v3Roots?.careSession?.presetSeconds ??
        started.presetSeconds ??
        presetSeconds;
      setActiveMinigame(activity);
      // Duration comes from server session after apply (minigame reads careSession).
      void serverPreset;
    } catch (err) {
      const friendly = formatV3CareError(err);
      setCareSyncError(friendly);
      // Do not open minigame; reserves stay as before (no local spend).
    } finally {
      setV3CareBusy(false);
    }
  }

  async function finishV3CareActivityWithSkill(
    activity: EconomyV3RootKind,
    skill: number,
    scoreForFill: number,
  ): Promise<boolean> {
    setV3CareBusy(true);
    try {
      const finished = await api.finishV3CareActivity(activity, skill);
      const cur = stateRef.current;
      let next: UserState = applyEconomyV3RootsToState(cur, finished.v3Roots);
      // Income is pending until coin claimAll — do not bump balance / history here.
      if (
        typeof finished.pendingBaseReward === "number" ||
        typeof finished.pendingBonusReward === "number"
      ) {
        next = {
          ...next,
          game: {
            ...next.game,
            pendingBaseReward:
              typeof finished.pendingBaseReward === "number"
                ? finished.pendingBaseReward
                : next.game.pendingBaseReward ?? 0,
            pendingBonusReward:
              typeof finished.pendingBonusReward === "number"
                ? finished.pendingBonusReward
                : next.game.pendingBonusReward ?? 0,
          },
        };
      }
      commitState(next);
      setV3PendingFinish(null);
      const pct = activityResultFillPercent(scoreForFill);
      lastCompletedActivityRef.current = activity;
      if (activity === "water") setWaterResultPct(pct);
      if (activity === "sun") setLightResultPct(pct);
      if (activity === "fertilizer") setFertilizerResultPct(pct);
      setDisplayFillHeights((d) => ({ ...d, [activity]: 0 }));
      fillRevealCancelRef.current?.();
      fillRevealCancelRef.current = scheduleFillHeightReveal(() => {
        setDisplayFillHeights((d) => ({ ...d, [activity]: pct }));
        fillRevealCancelRef.current = null;
      });
      setV3PendingAck(activity);
      // Fallback if CSS height transition does not fire (reduced motion).
      window.setTimeout(() => {
        void acknowledgeV3CareActivityOnce(activity);
      }, 1000);
      return true;
    } catch (err) {
      const friendly = formatV3CareError(err);
      setCareSyncError(friendly);
      setV3PendingFinish({ activity, skill, score: scoreForFill });
      // Do not keep a completed local fill / do not acknowledge.
      if (activity === "water") setWaterResultPct(null);
      if (activity === "sun") setLightResultPct(null);
      if (activity === "fertilizer") setFertilizerResultPct(null);
      setDisplayFillHeights((d) => ({ ...d, [activity]: 0 }));
      setV3PendingAck(null);
      return false;
    } finally {
      setV3CareBusy(false);
    }
  }

  async function acknowledgeV3CareActivityOnce(activity: EconomyV3RootKind) {
    if (v3AckInFlightRef.current) return;
    const session = stateRef.current.game.v3Roots?.careSession;
    if (session?.status !== "completed" || session.activity !== activity) {
      // Already acknowledged (session cleared) or mismatched.
      if (session?.status == null || session?.activity == null) {
        setV3PendingAck(null);
      }
      return;
    }
    v3AckInFlightRef.current = true;
    setV3CareBusy(true);
    try {
      const ack = await api.acknowledgeV3CareActivity(activity);
      commitState(
        applyEconomyV3RootsToState(stateRef.current, ack.v3Roots),
      );
      setV3PendingAck(null);
      // After last activity ack: hold trio → converge → «Уход» (same as main game).
      if (shouldShowV3CareShovel(ack.v3Roots)) {
        if (!tutorialDone && useV3) {
          setTutorialStep("complete");
        }
        beginV3CareTrioConverge();
      } else if (!tutorialDone && useV3) {
        // Free order: next step from completed set, not last activity kind.
        const next = nextV3TutorialStepFromCompletedActivities(
          getV3CareActivitiesCompleted(ack.v3Roots),
        );
        setTutorialStep(next);
        if (next === "complete") {
          setShowTutorialCompletionCard(true);
        }
      }
    } catch (err) {
      const friendly = formatV3CareError(err);
      setCareSyncError(friendly);
      // Keep pending ack — do not start next activity until sync succeeds.
      setV3PendingAck(activity);
    } finally {
      v3AckInFlightRef.current = false;
      setV3CareBusy(false);
    }
  }

  /**
   * Live path after third activity: keep filled trio visible, short hold, then
   * converge into «Уход». Do not jump straight to care_button.
   */
  function beginV3CareTrioConverge() {
    // Arm before all_done so the v3Roots recovery effect cannot steal with restore_shovel.
    v3LiveConvergeRef.current = true;
    // Third fill already played on the activity card — skip replaying 0→target.
    skipCareFillAnimationRef.current = true;
    dispatchCarePhase({ type: "all_done" });
  }

  /** F5 / recovery only — server already ready/finished; skip converge. */
  function enterV3CareShovelUi() {
    skipCareFillAnimationRef.current = true;
    dispatchCarePhase({ type: "restore_shovel" });
  }

  function applyV3RewardPreviewToUi(v3Roots: NonNullable<typeof game.v3Roots>) {
    // Only after finish-cycle (finished + available). Never invent a zero line
    // from ready/in_progress or unavailable preview.
    if (!shouldShowV3RewardPreview(v3Roots)) {
      return;
    }
    const scores = sessionScoresFromV3RewardPreview(v3Roots.careCycle?.rewardPreview);
    if (!scores) {
      return;
    }
    setSessionScores(scores);
  }

  async function finishV3CareCycleOnce(): Promise<"ok" | "conflict" | "error"> {
    if (v3FinishCycleInFlightRef.current || v3ClaimCycleInFlightRef.current) {
      return "error";
    }
    const snap = stateRef.current.game.v3Roots;
    if (!shouldShowV3CareShovel(snap)) return "error";
    v3FinishCycleInFlightRef.current = true;
    setV3CareBusy(true);
    try {
      const finished = await api.finishV3CareCycle();
      const normalized =
        normalizeEconomyV3RootsSnapshot(finished.v3Roots) ?? finished.v3Roots;
      commitState(
        applyEconomyV3RootsToState(stateRef.current, normalized),
      );
      // Preview status is applied by recovery / claim-retry paths only.
      // Happy path continues to claim in the same shovel gesture (no zero flash).
      enterV3CareShovelUi();
      return "ok";
    } catch (err) {
      setCareClicked(false);
      if (isV3CareStateConflict(err)) {
        // Stale cycle snapshot — refresh quietly; shovel click retries.
        setCareSyncError(null);
        await recoverCareFromServer();
        return "conflict";
      }
      setCareSyncError(formatV3CareError(err));
      return "error";
    } finally {
      v3FinishCycleInFlightRef.current = false;
      setV3CareBusy(false);
    }
  }

  /**
   * Clear finished Care cycle on the server.
   * @param opts.skipUiExit — keep post-care chrome so {@link handleGoToRewards}
   *   can run the existing XP → growth → apples → income queue. UI exits later
   *   via shouldExitPostCareUi after claimAll.
   */
  async function acknowledgeV3CareCycleOnce(opts?: {
    skipUiExit?: boolean;
  }): Promise<boolean> {
    if (v3AckCycleInFlightRef.current) return false;
    if (!shouldAcknowledgeV3CareCycle(stateRef.current.game.v3Roots)) return false;
    v3AckCycleInFlightRef.current = true;
    setV3CareBusy(true);
    try {
      const ack = await api.acknowledgeV3CareCycle();
      const normalized =
        normalizeEconomyV3RootsSnapshot(ack.v3Roots) ?? ack.v3Roots;
      commitState(
        applyEconomyV3RootsToState(stateRef.current, normalized),
      );
      if (opts?.skipUiExit) {
        // Keep sessionScores / fills for handleGoToRewards apple-count & timers.
        if (!tutorialDone && useV3) {
          setTutorialStep("complete");
        }
        return true;
      }
      setSessionScores(null);
      setWaterResultPct(null);
      setLightResultPct(null);
      setFertilizerResultPct(null);
      setDisplayFillHeights(zeroDisplayFills());
      exitPostCareUiForNextCycle();
      if (!tutorialDone && useV3) {
        setTutorialStep("complete");
        setShowTutorialCompletionCard(true);
        setCareClicked(false);
      }
      return true;
    } catch (err) {
      const friendly = formatV3CareError(err);
      setCareSyncError(friendly);
      setCareClicked(false);
      return false;
    } finally {
      v3AckCycleInFlightRef.current = false;
      setV3CareBusy(false);
    }
  }

  /**
   * Claim cycle → server awards → existing handleGoToRewards animation queue.
   * Pending income uses the chest / apple-coin path (claimAll); no new animations.
   */
  async function claimV3CareCycleOnce(): Promise<"ok" | "conflict" | "error"> {
    // In-flight refs only — do not gate on React `v3CareBusy` (stale after finish→claim chain).
    if (v3ClaimCycleInFlightRef.current || v3FinishCycleInFlightRef.current) {
      return "error";
    }
    const snap = stateRef.current.game.v3Roots;
    if (!shouldShowV3RewardPreview(snap)) return "error";
    v3ClaimCycleInFlightRef.current = true;
    setV3CareBusy(true);
    try {
      const claimed = await api.claimV3CareCycle();
      const scores = sessionScoresFromV3Claim(claimed);
      setSessionScores(scores);
      const cur = stateRef.current;
      const prevLevel = cur.game.playerLevel ?? 1;
      // Money stays in pending_* until the coin → claimAll; claim grants XP only.
      // treeGrowthMm on the claim response is the CURRENT absolute (not +delta) —
      // live mm is applied with money (same formula as claimAll). Preview treeGrowth=0.
      const pendingMoney =
        Math.max(0, Number(claimed.pendingBaseReward) || 0) +
        Math.max(0, Number(claimed.pendingBonusReward) || 0);
      const rewardForMm =
        pendingMoney > 0
          ? pendingMoney
          : Math.max(0, Number(claimed.income?.total) || 0);
      const { newMM: growthMM, newRemainder: growthRem } = applyTreeGrowth(
        rewardForMm,
        cur.game.treeGrowthMM ?? 0,
        cur.game.treeGrowthRemainder ?? 0,
      );
      const scoresForQueue = {
        ...scores,
        mm: Math.max(
          scores.mm,
          Math.max(0, growthMM - (cur.game.treeGrowthMM ?? 0)),
        ),
      };
      setSessionScores(scoresForQueue);
      const normalized =
        normalizeEconomyV3RootsSnapshot(claimed.v3Roots) ?? claimed.v3Roots;
      // Defer treeGrowthMM until the growth-timer → +N мм spectacle so the badge
      // does not jump during XP / together with apples.
      commitState(
        applyEconomyV3RootsToState(
          {
            ...cur,
            game: {
              ...cur.game,
              playerXP: claimed.playerXp,
              playerLevel: claimed.playerLevel,
              pendingBaseReward: claimed.pendingBaseReward,
              pendingBonusReward: claimed.pendingBonusReward,
            },
          },
          normalized,
        ),
      );

      // Tutorial Care claim: ack, then demo reward beat (growth → +1мм → apple+coin).
      // No claimAll / XP queue — finish card only after both collectables clicked.
      if (!tutorialDone) {
        await acknowledgeV3CareCycleOnce({ skipUiExit: true });
        const curAfter = stateRef.current;
        // Keep pending income clear; +1 мм is applied in handleTutorialCareRewards.
        commitState({
          ...curAfter,
          game: {
            ...curAfter.game,
            pendingBaseReward: 0,
            pendingBonusReward: 0,
          },
        });
        pendingXpRef.current = null;
        setCareSyncError(null);
        if (useV3) {
          setTutorialStep("complete");
          handleTutorialCareRewards();
        } else {
          handleTutorialFinish();
        }
        return "ok"; // claim applied even if ack failed (retry via shovel ack path)
      }

      // Feed the legacy reward queue (same as v1/v2 shovel → handleGoToRewards).
      // newMM matches claimAll's tree growth from pending income.
      pendingXpRef.current = {
        xpGained: scoresForQueue.xp,
        playerXpAbsolute: claimed.playerXp,
        newLevel: claimed.playerLevel,
        levelUp: claimed.playerLevel > prevLevel,
        newMM: growthMM,
        newRemainder: growthRem,
      };

      // Clear cycle journal; keep care_button chrome for the animation queue.
      const acked = await acknowledgeV3CareCycleOnce({ skipUiExit: true });
      if (!acked) {
        setCareClicked(false);
        setCareSyncError(null);
        return "ok"; // claim already applied
      }

      // Existing project sequence: XP → growth timer → mm → apples → income coin.
      // Only after confirmed regular Care claim — never from Tutorial "enter game".
      handleGoToRewards(scoresForQueue);
      setCareSyncError(null);
      return "ok";
    } catch (err) {
      setCareClicked(false);
      if (isV3CareStateConflict(err)) {
        setCareSyncError(null);
        await recoverCareFromServer();
        return "conflict";
      }
      setCareSyncError(formatV3CareError(err));
      return "error";
    } finally {
      v3ClaimCycleInFlightRef.current = false;
      setV3CareBusy(false);
    }
  }

  /**
   * Shovel «Уход» for Economy v3 Care cycle.
   * One press after the trio: finish-cycle → claim-cycle → acknowledge-cycle.
   * Retry path: if already finished, claim; if already claimed, acknowledge.
   * State conflicts refresh once and continue — no blocking toast.
   */
  async function handleV3CareShovelClick() {
    const liveTutorial =
      !tutorialDone && useV3 && tutorialStep === "complete";
    if ((!tutorialDone && !liveTutorial) || careClicked) return;
    if (
      v3FinishCycleInFlightRef.current ||
      v3ClaimCycleInFlightRef.current ||
      v3AckCycleInFlightRef.current
    ) {
      return;
    }
    setCareSyncError(null);

    const run = async (retried: boolean): Promise<void> => {
      const snap = stateRef.current.game.v3Roots;
      if (!snap || snap.enabled !== true) return;
      const action = resolveV3CareShovelAction(snap);

      if (action === "finish-cycle") {
        const finished = await finishV3CareCycleOnce();
        if (finished === "conflict" && !retried) {
          await run(true);
          return;
        }
        if (finished !== "ok") return;
        const after = stateRef.current.game.v3Roots;
        if (shouldShowV3RewardPreview(after)) {
          const claimed = await claimV3CareCycleOnce();
          if (claimed === "conflict" && !retried) {
            await run(true);
            return;
          }
          if (claimed !== "ok") {
            const retrySnap = stateRef.current.game.v3Roots;
            if (retrySnap) applyV3RewardPreviewToUi(retrySnap);
          }
        } else if (!retried) {
          // Finish ok but preview not ready yet — refresh and continue to claim.
          await recoverCareFromServer();
          await run(true);
        }
        return;
      }
      if (action === "claim-cycle") {
        const claimed = await claimV3CareCycleOnce();
        if (claimed === "conflict" && !retried) await run(true);
        return;
      }
      if (action === "acknowledge-cycle") {
        await acknowledgeV3CareCycleOnce();
      }
    };

    await run(false);
  }

  /**
   * Economy v2 Care start — only /v2/care/start. No session/start bridge.
   */
  async function handleStartV2Care(openMinigame?: "water" | "sun" | "fertilizer") {
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) return;
    if (!tutorialDone) return;
    if (actionLoading || v2CareActive || showCompletionStage || showRewards) return;
    const pendingBaseNow = stateRef.current.game.pendingBaseReward ?? 0;
    const pendingBonusNow = stateRef.current.game.pendingBonusReward ?? 0;
    if (pendingBaseNow > 0 || pendingBonusNow > 0) {
      setCareSyncError("Сначала заберите награду за прошлый уход.");
      return;
    }
    if (!canStartV2Care(stateRef.current.game.v2EnergySeconds)) {
      setCareSyncError(
        `Нужно не меньше ${V2_CARE_MIN_START_SECONDS} сек. энергии для ухода.`,
      );
      return;
    }
    setActionLoading(true);
    setCareSyncError(null);
    try {
      const started = await api.startV2Care();
      v2CareFinishedCycleRef.current = null;
      resetCareUiChrome();
      commitState(applyV2CareStartToState(stateRef.current, started));
      // Settle inside start may mature roots — sync mask/timer.
      await syncRootsFromServer();
      pendingSpendRef.current = {};
      waterScoreRef.current = 0;
      sunScoreRef.current = 0;
      fertilizerScoreRef.current = 0;
      setWaterResultPct(null);
      setLightResultPct(null);
      setFertilizerResultPct(null);

      if (openMinigame) {
        const secs = durationFromServerAllocation(started.allocation, openMinigame);
        if (secs >= 5 && !started.completed[openMinigame]) {
          setActiveMinigame(openMinigame);
        }
      }
    } catch (err) {
      setCareSyncError(careErrorMessage(err));
      await recoverCareFromServer();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStartSession(openMinigame?: "water" | "sun" | "fertilizer") {
    // v3 owns the cycle — never session/start or v2 Care start.
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) return;
    if (ENABLE_ECONOMY_V2_CARE) {
      return handleStartV2Care(openMinigame);
    }
    if (activitiesLocked || game.sessionInProgress || actionLoading) return;
    console.log("[Session] Start button clicked, locked:", locked, "v2Energy:", v2EnergySeconds, "inProgress:", game.sessionInProgress);
    setActionLoading(true);
    try {
      await api.startSession();
      console.log("[Session] Started successfully");
      resetCareUiChrome();
      commitState({
        ...stateRef.current,
        game: { ...stateRef.current.game, sessionInProgress: true, water: false, sun: false, fertilizer: false },
      });
      pendingSpendRef.current = {};
      if (openMinigame) {
        const energy = Math.max(0, Math.floor(Number(stateRef.current.game.v2EnergySeconds) || 0));
        const alloc = computeLiveAllocation(energy, {
          water: false,
          sun: false,
          fertilizer: false,
        });
        armSpendForActivity(openMinigame, alloc);
        setActiveMinigame(openMinigame);
      }
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (status === 429) {
        console.warn("[Session] Still on cooldown (429) — try Debug > Сброс сессии");
      } else {
        console.error("[Session] Failed to start:", err);
      }
    } finally {
      setActionLoading(false);
    }
  }

  /**
   * Atomic v2 Care activity: spend + score + XP (+ pending rewards on 3rd).
   * Does not call session/action. Idempotent repeats are OK (spentSeconds=0).
   */
  async function syncV2CareActivity(
    type: CareActivity,
    skillScore: number,
    collected?: number,
  ): Promise<
    | {
        ok: true;
        allCompleted: boolean;
        cycleId: string;
        sessionComplete: boolean;
        result: Awaited<ReturnType<typeof api.completeV2CareActivity>>;
      }
    | { ok: false }
  > {
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) {
      return { ok: false };
    }
    const cycleId = stateRef.current.game.v2Care?.cycleId;
    if (!cycleId) {
      setCareSyncError("Цикл ухода не найден. Обновляем состояние…");
      await recoverCareFromServer();
      return { ok: false };
    }
    try {
      const result = await api.completeV2CareActivity(cycleId, type, {
        skillScore,
        collected,
      });
      commitState(applyV2CareActivityToState(stateRef.current, result));
      await syncRootsFromServer();
      setPendingActivitySync(null);
      setCareSyncError(null);
      return {
        ok: true,
        allCompleted: !!result.allCompleted,
        cycleId: result.cycleId,
        sessionComplete: !!result.sessionComplete,
        result,
      };
    } catch (err) {
      setPendingActivitySync(type);
      setCareSyncError(careErrorMessage(err));
      await recoverCareFromServer();
      return { ok: false };
    }
  }

  /** Apply sessionComplete UI from atomic v2 activity response (server money only). */
  function applyV2CareSessionCompleteUi(
    result: Awaited<ReturnType<typeof api.completeV2CareActivity>>,
  ) {
    const curGame = stateRef.current.game;
    // Money comes only from server — never recompute base/bonus on the client.
    const base = result.baseReward ?? 0;
    const bonus = result.bonusReward ?? 0;
    const totalReward = base + bonus;
    const rewardForMm =
      totalReward > 0
        ? totalReward
        : (result.pendingBaseReward ?? 0) + (result.pendingBonusReward ?? 0);
    if (result.scores?.water != null) waterScoreRef.current = result.scores.water;
    if (result.scores?.sun != null) sunScoreRef.current = result.scores.sun;
    if (result.scores?.fertilizer != null) {
      fertilizerScoreRef.current = result.scores.fertilizer;
    }
    // Keep cube fills from saved skill scores (do not clear on sessionComplete).
    if (result.scores?.water != null) {
      setWaterResultPct((prev) =>
        mergeActivityFillPercent(prev, activityResultFillPercent(result.scores.water)),
      );
    }
    if (result.scores?.sun != null) {
      setLightResultPct((prev) =>
        mergeActivityFillPercent(prev, activityResultFillPercent(result.scores.sun)),
      );
    }
    if (result.scores?.fertilizer != null) {
      setFertilizerResultPct((prev) =>
        mergeActivityFillPercent(
          prev,
          activityResultFillPercent(result.scores.fertilizer),
        ),
      );
    }
    const wPct = activityResultFillPercent(waterScoreRef.current);
    const sPct = activityResultFillPercent(sunScoreRef.current);
    const fPct = activityResultFillPercent(fertilizerScoreRef.current);
    const { newMM: mmAfter, newRemainder: remAfter } = applyTreeGrowth(
      rewardForMm,
      curGame.treeGrowthMM ?? 0,
      curGame.treeGrowthRemainder ?? 0,
    );
    const xpForUi = result.xpGained ?? result.totalCycleXp ?? 0;
    const mmGained = Math.max(0, mmAfter - (curGame.treeGrowthMM ?? 0));
    setSessionScores({
      water: wPct,
      sun: sPct,
      fert: fPct,
      xp: xpForUi,
      base,
      bonus,
      mm: mmGained,
    });
    pendingXpRef.current = {
      xpGained: xpForUi,
      newLevel: result.newLevel,
      xpHistory: result.xpHistory,
      levelUp: result.levelUp,
      newMM: mmAfter,
      newRemainder: remAfter,
      playerXpAbsolute: result.playerXp,
    };
    // Fill percentages already merged above — then enter completed phase (never skip fill on live play).
    skipCareFillAnimationRef.current = false;
    dispatchCarePhase({ type: "all_done" });
    checkPendingAchievements();
  }

  /**
   * Final Care reward presentation (XP → tree growth → apples → income).
   * @param scoresOverride — required when called from async v3 claim before re-render.
   */
  function handleGoToRewards(
    scoresOverride?: {
      water: number;
      sun: number;
      fert: number;
      xp: number;
      base: number;
      bonus: number;
      mm: number;
    } | null,
  ) {
    // Hard gate: Tutorial exit / completion must never start this queue.
    if (!tutorialDone) return;
    const px = pendingXpRef.current;
    pendingXpRef.current = null;
    const scores = scoresOverride ?? sessionScores;

    // Step 1 — immediately freeze care button, show XP popup, apply XP
    setCareClicked(true);
    if (scores && scores.xp > 0) setShowXpPopup(true);
    const xpTimer = setTimeout(() => {
      if (px) {
        const cur = stateRef.current;
        commitState({
          ...cur,
          game: {
            ...cur.game,
            playerXP:
              px.playerXpAbsolute !== undefined
                ? px.playerXpAbsolute
                : (cur.game.playerXP ?? 0) + px.xpGained,
            playerLevel: px.newLevel ?? cur.game.playerLevel,
            xpHistory: (px.xpHistory as typeof cur.game.xpHistory) ?? cur.game.xpHistory,
          },
        });
        if (scores) setXpGainAmount(scores.xp);
        if (px.levelUp && px.newLevel) setLevelUpData({ level: px.newLevel });
      }
      setShowXpPopup(false);
    }, 1400);
    growthTimeoutsRef.current.push(xpTimer);

    // Step 2 — smoothly split «Уход» → inactive activity cubes after 800ms
    const ghostTimer = setTimeout(() => beginCareShovelDiverge(), 800);
    growthTimeoutsRef.current.push(ghostTimer);

    // Step 3 — countdown timer (1s per mm, min 5s, no upper cap)
    const timerSecs = Math.max(5, scores?.mm ?? 9);
    const avgPct = careShovelFillPercent(
      waterResultPct,
      lightResultPct,
      fertilizerResultPct,
    );
    const newAppleCount = (avgPct >= 90 ? 3 : avgPct >= 70 ? 2 : 1) + 1;
    setAppleCount(newAppleCount);
    appleCountRef.current = newAppleCount;
    setShowApples(false);
    setShowGrowthAnim(true);
    setGrowthTimerTotal(timerSecs);
    setGrowthCountdown(timerSecs);
    let countVal = timerSecs - 1;
    const growthInterval = setInterval(() => {
      if (countVal >= 0) {
        setGrowthCountdown(countVal--);
      } else {
        clearInterval(growthInterval);
        growthIntervalRef.current = null;
        setGrowthCountdown(null);

        // Step 5 — after growth timer: apply мм + left-of-tree +N мм accrual
        // (same beat as tutorial; not on coin/claimAll).
        const fromMM = displayGrowthMMRef.current;
        const mmAmt = Math.max(0, scores?.mm ?? 0);
        const toMM =
          px != null && Number(px.newMM) > fromMM
            ? Number(px.newMM)
            : fromMM + mmAmt;
        const toRem =
          px != null && Number(px.newMM) > fromMM
            ? px.newRemainder
            : (stateRef.current.game.treeGrowthRemainder ?? 0);
        if (toMM > fromMM) {
          const cur = stateRef.current;
          commitState({
            ...cur,
            game: {
              ...cur.game,
              treeGrowthMM: toMM,
              treeGrowthRemainder: toRem,
            },
          });
          animateGrowth(fromMM, toMM);
        }
        const showAmt = mmAmt > 0 ? mmAmt : Math.max(0, toMM - fromMM);
        if (showAmt > 0) {
          setMmPopupAmount(showAmt);
          setShowMmPopup(true);
          const mmPopupTimer = setTimeout(() => {
            setShowMmPopup(false);
            setMmPopupAmount(0);
          }, 1400);
          growthTimeoutsRef.current.push(mmPopupTimer);
        }

        // Step 6 — яблоки через 1800ms после вспышки (доход — при сборе последнего яблока)
        const appleTimer = setTimeout(() => {
          setShowGrowthAnim(false);
          collectedAppleIndicesRef.current = [];
          setCollectedAppleIndices([]);
          setShowApples(true);
          // Автосбор через 60 секунд если пользователь не собрал
          appleAutoCollectTimerRef.current = setTimeout(() => {
            appleAutoCollectTimerRef.current = null;
            const total = appleCountRef.current;
            const collected = collectedAppleIndicesRef.current.length;
            const remaining = total - collected;
            if (remaining > 0) {
              // Считаем сколько красных ДО пометки всех как собранных
              const coinIdx = total - 1;
              const coinWasUncollected = !collectedAppleIndicesRef.current.includes(coinIdx);
              const redRemaining = coinWasUncollected ? remaining - 1 : remaining;
              // Анимируем все оставшиеся кружки одновременно (как при ручном сборе)
              const allIdx = Array.from({ length: total }, (_, i) => i);
              collectedAppleIndicesRef.current = allIdx;
              setCollectedAppleIndices(allIdx);
              // Передаём скорректированное кол-во: без монетки
              setTimeout(() => claimApplesAndIncome(redRemaining), 320);
            }
          }, 60000);
        }, 1800);
        growthTimeoutsRef.current.push(appleTimer);
      }
    }, 1000);
    growthIntervalRef.current = growthInterval;
  }

  /**
   * Legacy mock path only. Production Care (ENABLE_ECONOMY_V2_CARE) must never
   * call the debug energy endpoint for activity completion.
   */
  async function spendV2EnergyAfterAction(type: GameType) {
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) return;
    if (ENABLE_ECONOMY_V2_CARE) return;
    if (!SHOW_ECONOMY_V2_MOCKS) return;
    const spendSec = Math.max(0, pendingSpendRef.current[type] ?? 0);
    delete pendingSpendRef.current[type];
    if (spendSec <= 0) {
      return;
    }
    const id = ++energyMutationIdRef.current;
    try {
      const res = await api.debugEconomyV2Energy({ deltaSeconds: -spendSec });
      // Drop stale responses superseded by a newer fill/reset from the debug panel.
      if (id !== energyMutationIdRef.current) {
        return;
      }
      const next = applyEconomyV2EnergyToState(stateRef.current, {
        v2EnergySeconds: res.game.v2EnergySeconds,
        v2EnergyAnchorAt: res.game.v2EnergyAnchorAt,
        lastSessionTime: res.game.lastSessionTime,
        missedSessions: res.game.missedSessions,
        v2Roots: res.game.v2Roots,
      });
      commitState(next);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[v2 energy spend]", err);
    }
  }

  async function handleMinigameComplete(type: GameType, skillScore: number, count: number) {
    setActiveMinigame(null);
    const safe = typeof skillScore === "number" && !isNaN(skillScore) ? skillScore : 40;
    if (type === "water")      waterScoreRef.current = safe;
    if (type === "sun")        sunScoreRef.current = safe;
    if (type === "fertilizer") fertilizerScoreRef.current = safe;
    const pct = activityResultFillPercent(safe);
    lastCompletedActivityRef.current = type;
    if (type === "water")      setWaterResultPct(pct);
    if (type === "sun")        setLightResultPct(pct);
    if (type === "fertilizer") setFertilizerResultPct(pct);
    // Mid-cycle: keep same fill node — paint 0% then target% (not mount-at-target).
    setDisplayFillHeights((d) => ({ ...d, [type]: 0 }));
    fillRevealCancelRef.current?.();
    fillRevealCancelRef.current = scheduleFillHeightReveal(() => {
      setDisplayFillHeights((d) => ({ ...d, [type]: pct }));
      fillRevealCancelRef.current = null;
    });

    animParticlesRef.current = [14, 22, 31, 40, 50, 60, 69, 78];
    setActiveAnim(type);
    void treeControls.start({
      filter: ["brightness(1)", "brightness(1.35)", "brightness(1)"],
      scale: [1, 1.04, 1],
      transition: { duration: 0.38, ease: "easeInOut" },
    });
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setActiveAnim(null), 2800);

    const waterScore      = waterScoreRef.current || 0;
    const sunScore        = sunScoreRef.current || 0;
    const fertilizerScore = fertilizerScoreRef.current || 0;
    // Combined score 0-80: average of three normalized scores
    const combined = Math.min(100, Math.round((waterScore + sunScore + fertilizerScore) / 3));
    skillScoreRef.current = combined;

    console.log({ waterScore, sunScore, fertilizerScore, skillScore: combined });

    // Tutorial: legacy = local-only; v3 = real Care finish/ack (fall through).
    if (!tutorialDone) {
      if (!(useV3RootsUi && isV3TutorialLiveCareStep(tutorialStep))) {
        if (type === "water") {
          setTutorialStep("sun-intro");
          setActiveMinigame(null);
        } else if (type === "sun") {
          setTutorialStep("fertilizer-intro");
          setActiveMinigame(null);
        } else {
          setActiveMinigame(null);
          setTutorialStep("complete");
          setShowTutorialCompletionCard(true);
          skipCareFillAnimationRef.current = false;
          dispatchCarePhase({ type: "all_done" });
        }
        return;
      }
      // v3 tutorial continues into finishV3CareActivity below.
    }

    // Economy v3 Care activity: finish → fill → acknowledge.
    // Never call v2 Care / session / energy spend on this path.
    if (useV3RootsUi) {
      const session = stateRef.current.game.v3Roots?.careSession;
      const isV3Activity =
        session != null &&
        session.activity === type &&
        (session.status === "active" || session.status === "completed");
      if (isV3Activity) {
        if (session.status === "completed") {
          // F5 recovery: finish already applied — show fill then ack.
          const skillForFill =
            session.skill != null && Number.isFinite(session.skill)
              ? Math.round(session.skill * 100)
              : safe;
          const pct = activityResultFillPercent(skillForFill);
          lastCompletedActivityRef.current = type;
          if (type === "water") setWaterResultPct(pct);
          if (type === "sun") setLightResultPct(pct);
          if (type === "fertilizer") setFertilizerResultPct(pct);
          setDisplayFillHeights((d) => ({ ...d, [type]: 0 }));
          fillRevealCancelRef.current?.();
          fillRevealCancelRef.current = scheduleFillHeightReveal(() => {
            setDisplayFillHeights((d) => ({ ...d, [type]: pct }));
            fillRevealCancelRef.current = null;
          });
          setV3PendingAck(type);
          return;
        }
        const skill = minigameScoreToV3Skill(safe);
        await finishV3CareActivityWithSkill(type, skill, safe);
        return;
      }
      // v3 exclusive: no fallthrough to v2 Care / session/action.
      if (import.meta.env.DEV) {
        console.warn(
          "[v3] minigame complete without matching careSession — ignoring",
          type,
        );
      }
      return;
    }

    const rect = gameAreaRef.current?.getBoundingClientRect();
    const x = (rect?.width ?? 200) / 2;
    const y = (rect?.height ?? 200) / 2;

    if (ENABLE_ECONOMY_V2_CARE) {
      // Single atomic call: spend + score + XP (+ pending rewards on 3rd).
      // Never call session/action or debug energy spend in this path.
      // finishV2Care clears snapshot after UI has the sessionComplete payload.
      const spent = await syncV2CareActivity(type, safe, count);
      if (!spent.ok) return;
      // Prefer sessionComplete; also honor allCompleted so shovel UI cannot be skipped.
      if (spent.sessionComplete || spent.allCompleted) {
        applyV2CareSessionCompleteUi(spent.result);
        await finishV2CareOnce(spent.cycleId);
      }
      return;
    }

    // Persist session action first, then spend energy — avoids racing two onStateChange writes.
    const ok = await doAction(type, x, y, safe, count);
    if (ok) await spendV2EnergyAfterAction(type);
  }

  async function retryPendingCareSync() {
    if (!pendingActivitySync || actionLoading) return;
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) return;
    const type = pendingActivitySync;
    setActionLoading(true);
    try {
      if (ENABLE_ECONOMY_V2_CARE) {
        const score =
          type === "water"
            ? waterScoreRef.current
            : type === "sun"
              ? sunScoreRef.current
              : fertilizerScoreRef.current;
        const spent = await syncV2CareActivity(type, score);
        if (!spent.ok) return;
        if (spent.sessionComplete || spent.allCompleted) {
          applyV2CareSessionCompleteUi(spent.result);
          await finishV2CareOnce(spent.cycleId);
        }
        setPendingActivitySync(null);
        setCareSyncError(null);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAction(action: "water" | "sun" | "fertilizer", e: React.MouseEvent) {
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) return;
    if (game[action] || actionLoading) return;
    const rect = gameAreaRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);
    const y = e.clientY - (rect?.top ?? 0);
    doAction(action, x, y);
  }

  async function doAction(action: "water" | "sun" | "fertilizer", x: number, y: number, scoreOverride?: number, count?: number): Promise<boolean> {
    // Prefer stateRef so overlapping Care sync cannot race a stale render snapshot.
    if (!mayUseLegacyCareSessionFlow(stateRef.current.game.v3Roots)) return false;
    if (stateRef.current.game[action] || actionLoading) return false;

    setActionLoading(true);
    try {
      const result = await api.doAction(action, scoreOverride ?? skillScoreRef.current, count);
      const labels: Record<string, string> = { water: "💧", sun: "☀️", fertilizer: "🫘" };
      addFloater(labels[action], x, y);

      // Используем stateRef.current чтобы избежать stale closure после await
      const curState = stateRef.current;
      const curGame = curState.game;

      let nextGame = { ...curGame, [action]: true };

      if (result.sessionComplete) {
        const finishedTime = Date.now();
        nextGame = {
          ...nextGame,
          water: true, sun: true, fertilizer: true,
          sessionInProgress: false,
          lastSessionTime: finishedTime,
          missedSessions: 0,
          pendingBaseReward: (curGame.pendingBaseReward ?? 0) + (result.baseReward ?? 0),
          pendingBonusReward: (curGame.pendingBonusReward ?? 0) + (result.bonusReward ?? 0),
          pendingStoredSessions: result.storedSessions ?? 1,
          // XP/level applied later in handleGoToRewards
        };
        console.log(`[Session complete] base=${result.baseReward} bonus=${result.bonusReward} xp=+${result.xpGained} level=${result.newLevel}`);
        const wPct = Math.round((waterScoreRef.current / 100) * 100);
        const sPct = Math.round((sunScoreRef.current / 100) * 100);
        const fPct = Math.round((fertilizerScoreRef.current / 100) * 100);
        const totalReward = (result.baseReward ?? 0) + (result.bonusReward ?? 0);
        const { newMM: mmAfter, newRemainder: remAfter } = applyTreeGrowth(totalReward, curGame.treeGrowthMM ?? 0, curGame.treeGrowthRemainder ?? 0);
        const mmGained = mmAfter - (curGame.treeGrowthMM ?? 0);
        setSessionScores({ water: wPct, sun: sPct, fert: fPct, xp: result.xpGained ?? 0, base: result.baseReward ?? 0, bonus: result.bonusReward ?? 0, mm: mmGained });
        // Save XP/level/MM to apply on "Ухаживать" click
        pendingXpRef.current = {
          xpGained: result.xpGained ?? 0,
          newLevel: result.newLevel,
          xpHistory: result.xpHistory,
          levelUp: result.levelUp,
          newMM: mmAfter,
          newRemainder: remAfter,
        };
        skipCareFillAnimationRef.current = false;
        dispatchCarePhase({ type: "all_done" });
        commitState({ ...curState, game: nextGame });
        checkPendingAchievements();
      } else {
        // Явно ставим sessionInProgress: true — защита от устаревшего stateRef
        commitState({ ...curState, game: { ...nextGame, sessionInProgress: true } });
        // Mid-session: stay on activities phase (never re-enter shovel chrome).
        dispatchCarePhase({ type: "reset" });
      }
      return true;
    } catch {
      return false;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaimAll(applesCollected = 0) {
    // Read pending from stateRef — not render closure (tutorial quiet settle
    // runs in the same turn as claim commit, before re-render).
    const pendingNow = stateRef.current.game;
    const pbNow = pendingNow.pendingBaseReward ?? 0;
    const pbonNow = pendingNow.pendingBonusReward ?? 0;
    if (claiming || (pbNow <= 0 && pbonNow <= 0)) return;
    setClaiming(true);
    try {
      const result = await api.claimAll(applesCollected);
      const total = result.totalAmount ?? 0;
      const cur = stateRef.current;
      const today = new Date().toLocaleDateString("ru-RU");
      // Вставляем новые записи в НАЧАЛО массива (поддерживаем DESC-порядок как в БД).
      // Бонус идёт первым — у него выше id в таблице (вставляется после base).
      const newEntries: { date: string; amount: number; type: "base" | "bonus" }[] = [];
      if ((result.bonusAmount ?? 0) > 0)
        newEntries.push({ date: today, amount: result.bonusAmount, type: "bonus" });
      if ((result.baseAmount ?? 0) > 0)
        newEntries.push({ date: today, amount: result.baseAmount, type: "base" });
      const newHistory = [...newEntries, ...cur.history];
      const curMM = stateRef.current.game.treeGrowthMM ?? 0;
      commitState({
        ...cur,
        balances: {
          ...cur.balances,
          balance: cur.balances.balance + total,
          earned: cur.balances.earned + total,
        },
        game: {
          ...cur.game,
          pendingBaseReward: 0,
          pendingBonusReward: 0,
          treeGrowthMM: Math.max(result.treeGrowthMM ?? 0, curMM),
          treeGrowthRemainder: result.treeGrowthRemainder ?? cur.game.treeGrowthRemainder,
        },
        history: newHistory.slice(0, 30),
      });
      setHistoryNotif(true);
      api.getLeaderboard()
        .then(r => setLeaderboard(r.players))
        .catch(() => {});
    } catch (err) {
      console.error("[Claim all] failed:", err);
    } finally {
      setClaiming(false);
    }
  }

  function formatPercent(value: number) {
    return value.toFixed(2) + " %";
  }

  /** Accrual history: Care base/bonus sessions + excess / Metelka payouts. */
  const sessionHistory = (() => {
    const items = [...state.history].reverse();
    const sessions: {
      date: string;
      base: number;
      bonus: number;
      total: number;
      kind: "activity" | "excess" | "metelka";
    }[] = [];
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      const next = items[i + 1];
      const type = String(item.type);
      const nextType = next ? String(next.type) : "";

      const isCarePair =
        (type === "base" || type === "bonus") &&
        (nextType === "base" || nextType === "bonus") &&
        nextType !== type;
      if (isCarePair && next) {
        sessions.push({
          date: item.date,
          base: type === "base" ? item.amount : next.amount,
          bonus: type === "bonus" ? item.amount : next.amount,
          total: item.amount + next.amount,
          kind: "activity",
        });
        i += 2;
        continue;
      }

      const isExcessPair =
        (type === "excess_base" || type === "excess_bonus") &&
        (nextType === "excess_base" || nextType === "excess_bonus") &&
        nextType !== type;
      if (isExcessPair && next) {
        sessions.push({
          date: item.date,
          base: type === "excess_base" ? item.amount : next.amount,
          bonus: type === "excess_bonus" ? item.amount : next.amount,
          total: item.amount + next.amount,
          kind: "excess",
        });
        i += 2;
        continue;
      }

      if (type === "base" || type === "bonus") {
        sessions.push({
          date: item.date,
          base: type === "base" ? item.amount : 0,
          bonus: type === "bonus" ? item.amount : 0,
          total: item.amount,
          kind: "activity",
        });
      } else if (type === "metelka") {
        sessions.push({
          date: item.date,
          base: 0,
          bonus: 0,
          total: item.amount,
          kind: "metelka",
        });
      } else {
        sessions.push({
          date: item.date,
          base: type === "excess_base" ? item.amount : 0,
          bonus: type === "excess_bonus" ? item.amount : 0,
          total: item.amount,
          kind: "excess",
        });
      }
      i += 1;
    }
    return sessions;
  })();

  const avgPercent =
    sessionHistory.length > 0
      ? sessionHistory.reduce(
          (sum, s) => sum + (s.base > 0 ? (s.total / s.base) * 12 : 12),
          0,
        ) / sessionHistory.length
      : 0;

  return (
    <div className={`game-page${!tutorialDone ? " game-page-tutorial" : ""}`}>
      {/* PLAY FIELD — full-bleed sky; gear floats top-right (no top nav bar) */}
      <div
        className={`game-area${
          useUndergroundRootsScene ? " game-area--v2-mocks" : ""
        }${useV3RootsUi ? " game-area--v3-roots" : ""}${
          undergroundRootsMasked ? " game-area--underground-masked" : ""
        }`}
        ref={gameAreaRef}
        data-v3-roots-scene={useV3RootsUi ? "true" : undefined}
        data-underground-masked={
          undergroundRootsMasked ? "true" : undefined
        }
      >
        {/* Settings gear: same as eye — only after tutorial is done. */}
        {tutorialDone && (
        <div className="game-top-controls" data-field-settings="true">
          <div ref={settingsRef} className="game-gear-wrap">
            <button
              type="button"
              className="game-gear-btn"
              data-settings-gear="true"
              onClick={() => setShowSettings(s => !s)}
              title="Настройки"
            >
              <Settings size={14} strokeWidth={2.6} />
            </button>
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  className="game-settings-dropdown"
                  data-settings-dropdown="true"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <SettingsWidget
                    onClose={() => setShowSettings(false)}
                    onOpenDailyReward={() => { setShowSettings(false); setShowStreakWidget(true); }}
                    dailyAvailable={localStorage.getItem("streak_widget_date") !== new Date().toISOString().slice(0, 10)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        )}
        {tutorialDone && <span className="game-beta-floating">{APP_VERSION}</span>}
        <GameAreaBg purchasedItems={purchasedItems} />
        {/* Level badge: hidden in tutorial until growth anim finishes (same beat as apple basket). */}
        {(tutorialDone || tutorialShowAppleBadge) && (
        <div className="field-level-host" data-field-level-host="true">
          <LevelWidget
            level={game.playerLevel ?? 1}
            totalXP={game.playerXP ?? 0}
            xpGain={xpGainAmount}
            pendingAchievements={hasPendingAchievements}
            onClick={() => setShowLevelModal(true)}
          />
          <AnimatePresence>
            {showXpPopup &&
              ((sessionScores != null && sessionScores.xp > 0) ||
                (xpFlashAmount != null && xpFlashAmount > 0)) && (
              <motion.div
                className="field-level-xp-popup topbar-reward-popup-xp"
                data-field-level-xp-popup="true"
                initial={{ opacity: 0, y: -6, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.7 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <motion.span
                  className="xp-popup-icon"
                  initial={{ scale: 0.5, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                >
                  <Star size={16} strokeWidth={2.2} fill="currentColor" />
                </motion.span>
                <span className="xp-popup-label">
                  +{(sessionScores?.xp ?? xpFlashAmount) ?? 0} оп
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        )}
        {(tutorialDone || tutorialShowAppleBadge) && (
          <AppleBasket
            apples={apples}
            onClick={() => setShowShop(true)}
            popup={
              <div className="apple-basket-popup-slot" aria-hidden={!showApplePopup}>
                <AnimatePresence>
                  {showApplePopup && applePopupCount > 0 && (
                    <motion.div
                      className="apple-basket-popup"
                      data-apple-basket-popup="true"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <span className="apple-popup-icon" aria-hidden="true">
                        <svg width="14" height="16" viewBox="-1 -1 15 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6.5 4C6.5 4 7 2 9 1" />
                          <path d="M6.5 4.5C3.5 4.5 1 7 1 10C1 12.5 2.5 14 4.5 14C5.5 14 6 13.5 6.5 13.5C7 13.5 7.5 14 8.5 14C10.5 14 12 12.5 12 10C12 7 9.5 4.5 6.5 4.5Z" fill="currentColor" />
                        </svg>
                      </span>
                      <span className="apple-popup-label">+{applePopupCount} ябл</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            }
          />
        )}
        {useUndergroundRootsScene && tutorialDone && !excessCleaning && (
          <button
            type="button"
            className="field-visibility-btn"
            data-field-visibility-btn="true"
            data-field-visibility-masked={
              undergroundRootsMasked ? "true" : "false"
            }
            aria-label={
              undergroundRootsMasked
                ? "Показать корневую систему"
                : "Скрыть корневую систему"
            }
            aria-pressed={undergroundRootsMasked}
            onClick={() => setUndergroundRootsMasked((v) => !v)}
          >
            {undergroundRootsMasked ? (
              <Eye size={18} strokeWidth={2.25} aria-hidden="true" />
            ) : (
              <EyeOff size={18} strokeWidth={2.25} aria-hidden="true" />
            )}
          </button>
        )}
        {excessCleaning && (
          <>
            <ExcessCleaningWebLayer
              session={game.v2Excess?.session}
              clearsEnabled={!excessResultPending && !metelkaFinishError}
              onClearInFlightChange={(count) => {
                excessFinishGuardRef.current.setClearInFlight(count);
              }}
              onRewardFloats={(floats) => {
                pushMetelkaRewardFloats(floats);
              }}
              onWebReward={(reward) => {
                // Record-only clear (v2): progress only — no XP/money UI or local credit.
                if (
                  reward.rewardDelta?.kind === "progress" ||
                  reward.kind === "progress"
                ) {
                  return;
                }
                // Legacy clear paths may still sync XP / balances.
                const next = applyEconomyV2ExcessDebugToState(stateRef.current, {
                  playerXp: reward.playerXp,
                  playerLevel: reward.playerLevel,
                });
                commitState({
                  ...next,
                  balances: {
                    ...stateRef.current.balances,
                    balance: reward.balances.balance,
                    earned: reward.balances.earned,
                  },
                });
                if (reward.xpGained > 0) {
                  setXpGainAmount(reward.xpGained);
                }
                const credited = asPositiveRewardAmount(
                  reward.moneyGained ||
                    reward.rewardDelta?.baseIncomeAmount ||
                    0,
                );
                if (credited > 0) {
                  setIncomeChestFeedback(createIncomeChestFeedback(credited));
                }
              }}
              onExcessApplied={(excess) => {
                const normalized = normalizeV2Excess(excess);
                commitState(
                  applyEconomyV2ExcessDebugToState(stateRef.current, {
                    v2Excess: normalized,
                  }),
                );
                if (normalized.session?.active !== true) {
                  excessFinishGuardRef.current.reset();
                  setMetelkaFinishError(null);
                  return;
                }
                requestMetelkaFinishFromState(normalized);
              }}
            />
            <ExcessCleaningTimer session={game.v2Excess?.session} />
            {metelkaFinishError ? (
              <div
                data-metelka-finish-error="true"
                style={{
                  position: "absolute",
                  left: 12,
                  right: 12,
                  bottom: 72,
                  zIndex: 40,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(30, 10, 10, 0.92)",
                  color: "#f38ba8",
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              >
                {metelkaFinishError}
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    data-metelka-finish-retry="true"
                    onClick={() => {
                      setMetelkaFinishError(null);
                      excessFinishGuardRef.current.clearLastError();
                      requestMetelkaFinishFromState(
                        stateRef.current.game.v2Excess,
                      );
                    }}
                    style={{
                      border: "1px solid #f38ba8",
                      background: "transparent",
                      color: "#f38ba8",
                      borderRadius: 6,
                      padding: "4px 8px",
                      cursor: "pointer",
                    }}
                  >
                    Повторить завершение
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
        <MetelkaRewardFloatHost floats={metelkaRewardFloats} />
        {useUndergroundRootsScene && (
          <div className="v2-underground-zone" aria-hidden="true">
            <UndergroundSoilArt />
          </div>
        )}
        {/*
          v3 roots sit between underground soil and the grass/earth surface so crowns
          tuck under the ground layer (unified earth — not a mask over the roots).
        */}
        {/*
          v3 underground column: roots → capital-hourglass+chest (gap 6px).
          Timer nests inside the chest host (tall hourglass tucked into the lid).
        */}
        {useV3RootsUi && (
          <div
            className="v3-underground-stack"
            data-v3-underground-stack="true"
            data-v3-underground-masked={
              undergroundRootsMasked ? "true" : "false"
            }
          >
            <MotionConfig reducedMotion="never">
            {/*
              Wrap roots sit in their own full-height wipe host (not the short
              flex column) so clip-path cannot crop the crown under the trunk.
            */}
            <motion.div
              className="v3-underground-wrap-wipe"
              data-v3-underground-wrap-wipe="true"
              initial={false}
              animate={undergroundWrapRootsWipeAnimate(undergroundRootsMasked)}
              transition={UNDERGROUND_ROOTS_WIPE_TRANSITION}
              aria-hidden="true"
            >
              <V3UndergroundWrapRoots treeStage={currentStage} />
            </motion.div>
            <motion.div
              className="v3-underground-wipe-layer"
              data-v3-underground-wipe="true"
              initial={false}
              animate={undergroundRootsWipeAnimate(undergroundRootsMasked)}
              transition={UNDERGROUND_ROOTS_WIPE_TRANSITION}
              style={{
                pointerEvents: undergroundRootsMasked ? "none" : undefined,
              }}
            >
            <div
              className="v3-root-anchor"
              data-v3-roots-primary="true"
              data-v3-roots-present="true"
              data-anchor-ready="true"
            >
              <EconomyV3RootSystem
                v3Roots={game.v3Roots}
                metelkaLocked={careBlockedByMetelka({
                  excess: game.v2Excess,
                  v3Roots: game.v3Roots,
                })}
                transferEnabled={
                  (tutorialDone || isV3TutorialRootStep(tutorialStep)) &&
                  game.v3Roots?.metelkaCycle?.transferLocked !== true &&
                  !careBlockedByMetelka({
                    excess: game.v2Excess,
                    v3Roots: game.v3Roots,
                  })
                }
                tutorialHighlightRoot={
                  !tutorialDone ? tutorialHighlightRoot(tutorialStep) : null
                }
                onTransferred={(v3Roots) => {
                  commitState(
                    applyEconomyV3RootsToState(stateRef.current, v3Roots),
                  );
                  // ordinaryFull may flip Metelka; refresh excess from server SoT.
                  if (shouldRefreshV3ExcessAfterTransfer(v3Roots)) {
                    void syncRootsFromServer();
                  }
                  if (!tutorialDone && useV3) {
                    const transferred =
                      v3Roots.generation?.firstTransferredRoot ??
                      v3Roots.generation?.transferredRoots?.[
                        (v3Roots.generation?.transferredRoots?.length ?? 1) - 1
                      ];
                    const kind =
                      (["water", "sun", "fertilizer"] as const).find(
                        (k) => tutorialHighlightRoot(tutorialStep) === k,
                      ) ?? null;
                    if (kind) {
                      setTutorialStep(nextV3TutorialStepAfterRootTransfer(kind));
                    } else if (transferred) {
                      setTutorialStep(
                        nextV3TutorialStepAfterRootTransfer(transferred),
                      );
                    }
                  }
                }}
              />
            </div>
            <div
              className="v3-capital-chest-host v3-capital-chest-host--with-hourglass"
              data-v3-capital-chest-host="true"
            >
              <AnimatePresence>
                {showIncomePopup && (
                  <motion.div
                    className="field-income-popup"
                    data-field-income-popup="true"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <motion.span
                      className="income-popup-icon"
                      initial={{ scale: 0.5, rotate: 15 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
                    >
                      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="16" height="11" rx="2" fill="currentColor" fillOpacity="0.15"/>
                        <path d="M2 8h16"/><circle cx="14.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
                      </svg>
                    </motion.span>
                    <span className="income-popup-label">
                      +{lastIncomeAmount >= 1
                        ? Math.floor(lastIncomeAmount).toLocaleString("ru-RU")
                        : lastIncomeAmount.toLocaleString("ru-RU", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}{" "}
                      ₽
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              <CapitalChestUnderRoots
                capital={balances.balance}
                incomeChestFeedback={incomeChestFeedback}
                onIncomeChestFeedbackComplete={(id) => {
                  setIncomeChestFeedback((prev) =>
                    prev?.id === id ? null : prev,
                  );
                }}
                onCapitalClick={() => setShowDepositInfo(true)}
              >
                {tutorialFillDeadlineMs != null && tutorialTimerKind != null ? (
                  <V3TutorialFillTimer
                    deadlineMs={tutorialFillDeadlineMs}
                    kind={tutorialTimerKind}
                    durationMs={
                      tutorialTimerKind === "wait"
                        ? TUTORIAL_V3_WAIT_MS
                        : TUTORIAL_V3_FILL_MS
                    }
                  />
                ) : (
                  <V3RootWaitTimer
                    v3Roots={game.v3Roots}
                    capital={balances.balance}
                    tutorialDone={tutorialDone}
                    nowMs={now}
                    frozen={excessCleaning}
                    handoffDeadlineAtMs={tutorialWaitDeadlineMsRef.current}
                    handoffTotalSeconds={TUTORIAL_V3_WAIT_SECONDS}
                    onRefreshState={syncRootsFromServer}
                  />
                )}
              </CapitalChestUnderRoots>
            </div>
            </motion.div>
            </MotionConfig>
          </div>
        )}
        {useV2MockRootsLayer && <EconomyV2MockLayer />}

        {/* Tutorial welcome screen — shown before anything starts */}
        {!tutorialDone && tutorialStep === "welcome" && (
          <div className="tutorial-welcome-overlay">
            <div className="tutorial-welcome-card">
              <span className="tutorial-welcome-icon" aria-hidden="true">🌳</span>
              <h3 className="tutorial-welcome-title">Ухаживайте за деревом</h3>
              <p className="tutorial-welcome-desc">
                Чем больше капитал, тем быстрее таймер. Дождитесь энергии в корнях, соберите её и пройдите активности.
              </p>
              <p className="tutorial-welcome-desc tutorial-welcome-desc--sub">
                Три вида активности
              </p>
              <div className="tutorial-welcome-games">
                <div className="tutorial-welcome-game-row">
                  <span className="tutorial-welcome-game-icon" aria-hidden="true">
                    <Droplets size={22} strokeWidth={2.25} color={V3_ACTIVITY_ACCENT_COLORS.water} />
                  </span>
                  <span className="tutorial-welcome-game-label">
                    Полив — ловить капли
                  </span>
                </div>
                <div className="tutorial-welcome-game-row">
                  <span className="tutorial-welcome-game-icon" aria-hidden="true">
                    <Sun size={22} strokeWidth={2.25} color={V3_ACTIVITY_ACCENT_COLORS.sun} />
                  </span>
                  <span className="tutorial-welcome-game-label">
                    Освещение — собирать лучи
                  </span>
                </div>
                <div className="tutorial-welcome-game-row">
                  <span className="tutorial-welcome-game-icon" aria-hidden="true">
                    <FertilizerIcon size={22} filled={false} color={V3_ACTIVITY_ACCENT_COLORS.fertilizer} />
                  </span>
                  <span className="tutorial-welcome-game-label">
                    Удобрение — собирать гранулы в ряд
                  </span>
                </div>
              </div>
              <button
                className="tutorial-welcome-btn"
                onClick={() => setTutorialStep("intro")}
              >
                Начать обучение
              </button>
            </div>
          </div>
        )}

        {/* Tutorial step overlay — shown between minigames / root steps */}
        {!tutorialDone && (() => {
          const v3Recommended =
            useV3 && tutorialStep === "v3-activities-intro"
              ? tutorialRecommendedV3Activity(
                  getV3CareActivitiesCompleted(game.v3Roots),
                )
              : null;
          const v3Cfg = useV3
            ? v3TutorialOverlayConfig(tutorialStep, {
                recommendedActivity: v3Recommended,
              })
            : null;
          const legacyCfg =
            !useV3 &&
            (tutorialStep === "intro" ||
              tutorialStep === "sun-intro" ||
              tutorialStep === "fertilizer-intro")
              ? tutorialStep === "intro"
                ? { icon: "water" as const, text: "Нужно ухаживать\nза деревом", hint: "Нажмите на кнопку 💧" }
                : tutorialStep === "sun-intro"
                ? { icon: "sun" as const, text: "Теперь добавьте\nсолнечного света!", hint: "Нажмите на кнопку ☀️" }
                : { icon: "fertilizer" as const, text: "Собирай гранулы\nв ряд!", hint: "Нажмите на кнопку удобрения" }
              : null;
          const cfg = v3Cfg ?? legacyCfg;
          if (!cfg) return null;
          return (
            <div className="tutorial-intro-overlay">
              <div className="tutorial-intro-card">
                <span className="tutorial-intro-tree" aria-hidden="true">
                  {cfg.icon === "fertilizer" ? (
                    <FertilizerIcon size={48} color={V3_ACTIVITY_ACCENT_COLORS.fertilizer} filled={false} />
                  ) : cfg.icon === "sun" ? (
                    <Sun size={48} strokeWidth={2.25} color={V3_ACTIVITY_ACCENT_COLORS.sun} />
                  ) : cfg.icon === "wait" ? (
                    <Clock size={48} strokeWidth={2.25} color="#166534" />
                  ) : (
                    <Droplets size={48} strokeWidth={2.25} color={V3_ACTIVITY_ACCENT_COLORS.water} />
                  )}
                </span>
                <p className="tutorial-intro-text">{cfg.text}</p>
                {cfg.hint ? (
                  <span className="tutorial-intro-hint">{cfg.hint}</span>
                ) : null}
              </div>
            </div>
          );
        })()}

        {/* Tutorial "complete" card — fades out when care button is pressed */}
        <AnimatePresence>
          {!tutorialDone && showTutorialCompletionCard && (
            <motion.div
              className="tutorial-intro-overlay"
              key="tutorial-complete-card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="tutorial-intro-card">
                <span className="tutorial-intro-tree">🌱</span>
                <p className="tutorial-intro-text">
                  <span>Отлично! Все три</span><br/><span>этапа пройдены!</span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tutorial: collect reward — same layout as water/sun/fertilizer intros */}
        <AnimatePresence>
          {!tutorialDone && tutorialShowAppleBadge && showApples && (
            <motion.div
              className="tutorial-intro-overlay"
              key="tutorial-collect-hint"
              data-tutorial-collect-hint="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              <div className="tutorial-intro-card">
                <span className="tutorial-intro-tree" aria-hidden="true">
                  <Gift size={48} strokeWidth={2.25} color="#ca8a04" />
                </span>
                <p className="tutorial-intro-text">Соберите награду</p>
                <span className="tutorial-intro-hint">
                  Перенесите яблоки и монетки.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tutorial completion congratulations window */}
        <AnimatePresence>
          {showTutorialComplete && (
            <motion.div
              className="tutorial-complete-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <motion.div
                className="tutorial-complete-card"
                initial={{ opacity: 0, scale: 0.82, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 16 }}
                transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.05 }}
              >
                <button className="tutorial-complete-close" onClick={handleTutorialDismiss}>✕</button>
                <span className="tutorial-complete-icon">🌳</span>
                <h3 className="tutorial-complete-title">Обучение пройдено!</h3>
                <p className="tutorial-complete-desc">Ухаживайте за деревом каждый день — оно будет расти, а ваш вклад приносить доход.</p>
                <button className="tutorial-welcome-btn" onClick={handleTutorialDismiss}>Начать играть</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {floaters.map(fl => (
          <div
            key={fl.id}
            className={`game-floater${fl.big ? " game-floater-big" : ""}${fl.gold ? " game-floater-gold" : ""}`}
            style={{ left: fl.x, top: fl.y }}
          >
            {fl.label}
          </div>
        ))}

        <AnimatePresence>
          {levelUpData && (
            <LevelUpAnimation
              newLevel={levelUpData.level}
              onComplete={() => setLevelUpData(null)}
            />
          )}
        </AnimatePresence>

        <div className={`game-tree-wrap${showGrowthAnim ? " tree-growing" : ""}`}>
          <motion.div animate={treeControls} style={{ display: "inline-block" }}>
            <button
              type="button"
              className={`tree-wrapper tree-wrapper--hit${isTransitioning ? " transitioning" : ""}`}
              data-tree-stages-hit="true"
              aria-label="Стадии роста дерева"
              onClick={() => {
                // While collecting apples/coin (or Metelka reward coin), don't open stages.
                if (showApples || metelkaPendingActive) return;
                setShowTreeInfo(true);
              }}
            >
              {isTransitioning && <div className="tree-cloud" />}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStage}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.08, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 180, damping: 18 }}
                >
                  <TreeSVG stage={currentStage} size={110} />
                </motion.div>
              </AnimatePresence>
            </button>
          </motion.div>
          {(tutorialDone || tutorialShowGrowthBadge) && (
            <TreeGrowthBadge
              growthMM={displayGrowthMM}
              onClick={() => setShowXpHistory(true)}
            />
          )}
          {/* 8G: exclusive roots — v3 mounts beside underground (above); fallback → RootEnergyLayer only. */}
          {!useV3RootsUi &&
            ENABLE_ECONOMY_V2_ROOT_COLLECTION && (
              <MotionConfig reducedMotion="never">
              <motion.div
                className="v2-root-layer-wipe"
                data-v2-roots-masked={
                  undergroundRootsMasked ? "true" : "false"
                }
                initial={false}
                animate={undergroundRootsWipeAnimate(undergroundRootsMasked)}
                transition={UNDERGROUND_ROOTS_WIPE_TRANSITION}
                style={{
                  pointerEvents: undergroundRootsMasked ? "none" : undefined,
                }}
              >
                <RootEnergyLayer
                  roots={game.v2Roots}
                  energySeconds={Number(game.v2EnergySeconds) || 0}
                  capital={balances.balance}
                  tutorialDone={tutorialDone}
                  hideEnergyTimer={excessCleaning}
                  incomeChestFeedback={incomeChestFeedback}
                  onIncomeChestFeedbackComplete={(id) => {
                    setIncomeChestFeedback((prev) =>
                      prev?.id === id ? null : prev,
                    );
                  }}
                  onRootsChange={(roots, energySeconds) => {
                    commitState({
                      ...stateRef.current,
                      game: {
                        ...stateRef.current.game,
                        v2Roots: roots,
                        v2EnergySeconds: energySeconds,
                      },
                    });
                  }}
                  onRefreshState={recoverCareFromServer}
                  onError={(msg) => setCareSyncError(msg)}
                />
              </motion.div>
              </MotionConfig>
            )}
          {activeAnim && (
            <div className="tree-anim-layer">
              {activeAnim === "water" && (
                <>
                  {animParticlesRef.current.map((left, i) => (
                    <div key={i} className="water-drop" style={{ left: `${left}%`, animationDelay: `${i * 0.09}s` }} />
                  ))}
                  <div className="water-ripple" />
                </>
              )}
              {activeAnim === "sun" && (
                <>
                  <div className="light-glow" />
                  <div className="light-rays" />
                </>
              )}
              {activeAnim === "fertilizer" && animParticlesRef.current.map((left, i) => (
                <div key={i} className="fertilizer-particle" style={{ left: `${left}%`, animationDelay: `${i * 0.09}s` }} />
              ))}
            </div>
          )}
          <AnimatePresence>
            {showApples && (
              <div
                className="tree-apples-overlay tree-apples-overlay-active"
                style={{ width: STAGE_DIMS[currentStage][0], height: STAGE_DIMS[currentStage][1] }}
              >
                <AnimatePresence>
                  {Array.from({ length: appleCount }, (_, i) => {
                    if (collectedAppleIndices.includes(i)) return null;
                    const isCoin = i === appleCount - 1;
                    const posIdx = isCoin ? 3 : i;
                    const [xPct, yPct] = APPLE_POSITIONS[currentStage][posIdx];
                    const baseR = APPLE_SIZES[currentStage];
                    const r = isCoin ? Math.round(baseR * 1.3) : baseR;
                    return (
                      <motion.div
                        key={i}
                        className={`tree-apple tree-apple-pending${isCoin ? " tree-apple-coin" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAppleClick(i);
                        }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        custom={{
                          manual: flyingAppleIndices.includes(i),
                          coin: isCoin,
                        }}
                        variants={{
                          // Apple → basket (left); coin → capital chest (down).
                          exit: ({
                            manual,
                            coin,
                          }: {
                            manual: boolean;
                            coin: boolean;
                          }) =>
                            manual
                              ? coin
                                ? {
                                    opacity: 0,
                                    scale: 0.2,
                                    y: 120,
                                    x: 0,
                                    transition: { duration: 0.42, ease: "easeIn" },
                                  }
                                : {
                                    opacity: 0,
                                    scale: 0.25,
                                    y: 90,
                                    x: -40,
                                    transition: { duration: 0.38, ease: "easeIn" },
                                  }
                              : { opacity: 0, scale: 0, transition: { duration: 0.22 } },
                        }}
                        exit="exit"
                        transition={{ delay: i * 0.35, duration: 0.5, type: "spring", stiffness: 220, damping: 15 }}
                        style={{ width: r * 2, height: r * 2, left: `${xPct}%`, top: `${yPct}%`, marginLeft: -r, marginTop: -r }}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {metelkaPendingActive ? (
              <MetelkaRewardCoin
                key="metelka-reward-coin"
                overlayWidth={STAGE_DIMS[currentStage][0]}
                overlayHeight={STAGE_DIMS[currentStage][1]}
                xPct={APPLE_POSITIONS[currentStage][3][0]}
                yPct={APPLE_POSITIONS[currentStage][3][1]}
                radius={Math.round(APPLE_SIZES[currentStage] * 1.3)}
                claiming={metelkaClaimBusy}
                error={metelkaClaimError}
                onClaim={handleClaimMetelkaPendingReward}
              />
            ) : null}
          </AnimatePresence>

          {/* Left of tree: one fixed host — timer and +N мм swap in the same spot. */}
          {(growthCountdown !== null || (showMmPopup && mmPopupAmount > 0)) && (
            <div className="growth-side-host" data-growth-side-host="true">
              <AnimatePresence mode="wait" initial={false}>
                {growthCountdown !== null ? (
                  <motion.div
                    key="growth-timer"
                    className="growth-timer-row"
                    data-growth-timer="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div
                      className="growth-timer-bar"
                      style={{
                        width: `${((growthTimerTotal - growthCountdown) / growthTimerTotal) * 100}%`,
                      }}
                    />
                    <span className="growth-timer-leaf" aria-hidden="true">
                      <TreePine size={13} strokeWidth={2.2} fill="currentColor" />
                    </span>
                    <span className="growth-timer-time field-caption-value">
                      {String(Math.floor(growthCountdown / 60)).padStart(2, "0")}:
                      {String(growthCountdown % 60).padStart(2, "0")}
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="growth-mm-accrual"
                    className="growth-timer-row growth-mm-accrual"
                    data-tree-growth-mm-popup="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <span className="growth-timer-leaf" aria-hidden="true">
                      <TreePine size={13} strokeWidth={2.2} fill="currentColor" />
                    </span>
                    <span className="growth-mm-accrual-label growth-timer-time">
                      +{mmPopupAmount} мм
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>


        <div
          className={`session-actions-wrap${
            excessCleaning ? " session-actions-wrap--cleaning" : ""
          }`}
          data-session-actions-cleaning={excessCleaning ? "true" : undefined}
        >
        <MotionConfig reducedMotion="never">
        <motion.div
          className="session-actions-wipe-layer"
          data-session-actions-wipe={useV3RootsUi ? "true" : undefined}
          initial={false}
          animate={
            useV3RootsUi
              ? undergroundRootsWipeAnimate(undergroundRootsMasked)
              : { opacity: 1, clipPath: "none" }
          }
          transition={UNDERGROUND_ROOTS_WIPE_TRANSITION}
          style={{
            pointerEvents:
              useV3RootsUi && undergroundRootsMasked ? "none" : undefined,
          }}
        >
        {careSyncError && tutorialDone && (
          <div className="v2-care-sync-error" role="alert">
            <span>{careSyncError}</span>
            {pendingActivitySync && (
              <button
                type="button"
                className="v2-care-sync-retry"
                disabled={actionLoading}
                onClick={() => void retryPendingCareSync()}
              >
                Повторить синхронизацию
              </button>
            )}
            <button
              type="button"
              className="v2-care-sync-retry"
              disabled={actionLoading}
              onClick={() => {
                setCareSyncError(null);
                void recoverCareFromServer();
              }}
            >
              Обновить
            </button>
          </div>
        )}

        {!sessionUiActive &&
        !showCompletionStage &&
        !showRewards &&
        !showSpentActivityGhost &&
        !showCareShovelUi &&
        !v3ServerWantsCareShovel &&
        tutorialStep !== "complete" ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={activitiesLocked ? "cooldown" : "ready"}
              className="session-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CareActionsRow
                excess={game.v2Excess}
                v3Roots={game.v3Roots}
                careActivitiesLocked={activitiesLocked && tutorialDone}
                careBlocksMetelka={metelkaBlockedByCare}
                metelkaDisabled={actionLoading}
                onMetelkaClick={() => void handleStartMetelka()}
                resultContinueBusy={excessAckBusy}
                onResultContinue={() => void handleAcknowledgeExcessResult()}
              >
                {([
                  { key: "water" as const, label: "Вода", color: V3_ACTIVITY_ACCENT_COLORS.water },
                  { key: "sun" as const, label: "Свет", color: V3_ACTIVITY_ACCENT_COLORS.sun },
                  { key: "fertilizer" as const, label: "Удобрение", color: V3_ACTIVITY_ACCENT_COLORS.fertilizer },
                ]).map(btn => {
                  // Legacy tutorial: one forced button. V3: free order after roots —
                  // pulse is recommendation only and never strips onClick/disabled.
                  const v3Completed = useV3
                    ? getV3CareActivitiesCompleted(game.v3Roots)
                    : null;
                  // Welcome / intro / root steps: activities stay grey & non-interactive.
                  const tutorialActivitiesLocked =
                    useV3 &&
                    isV3TutorialActivitiesInteractionLocked(
                      tutorialStep,
                      tutorialDone,
                    );
                  // Live: same gate as tutorial — finish the transfer trio first.
                  const rootsCollectionLocked =
                    useV3 &&
                    tutorialDone &&
                    isV3RootCollectionIncomplete(game.v3Roots);
                  const activitiesInteractionLocked =
                    tutorialActivitiesLocked || rootsCollectionLocked;
                  // Pulse recommended Care button (tutorial + live after roots).
                  const v3RecommendBtn =
                    useV3 &&
                    v3Completed != null &&
                    !areAllV3CareActivitiesCompleted(v3Completed) &&
                    !activitiesInteractionLocked &&
                    (tutorialDone || isV3TutorialLiveCareStep(tutorialStep))
                      ? tutorialRecommendedV3Activity(v3Completed)
                      : null;
                  const tutorialActiveBtn =
                    useV3
                      ? v3RecommendBtn
                      : tutorialStep === "intro"
                        ? "water"
                        : tutorialStep === "sun-intro"
                          ? "sun"
                          : tutorialStep === "fertilizer-intro"
                            ? "fertilizer"
                            : null;
                  const isTutorialPhase =
                    !tutorialDone && !useV3 && tutorialActiveBtn !== null;
                  const isPulsing =
                    tutorialActiveBtn != null &&
                    btn.key === tutorialActiveBtn &&
                    !activitiesInteractionLocked;
                  // v3: after roots, all playable activities stay clickable (no sibling suppress).
                  const isSuppressed =
                    activitiesInteractionLocked ||
                    (!useV3 && isTutorialPhase && btn.key !== tutorialActiveBtn);
                  // Legacy tutorial required step still needs real reserve (no fake unlock).
                  const tutorialRequiresThis =
                    !useV3 && isTutorialPhase && isPulsing;
                  const btnLockedByGameRules = !tutorialRequiresThis && activitiesLocked;
                  // Always resolve from server snapshot when v3 is on (incl. welcome).
                  const v3Card =
                    useV3ActivityCards && game.v3Roots
                      ? resolveV3ActivityCard(btn.key, game.v3Roots)
                      : null;
                  const metelkaBlocksCare = careBlockedByMetelka({
                    excess: game.v2Excess,
                    v3Roots: game.v3Roots,
                  });
                  const v3CanStart =
                    !activitiesInteractionLocked &&
                    !metelkaBlocksCare &&
                    v3Card != null &&
                    game.v3Roots != null &&
                    canStartV3CareActivity({
                      activity: btn.key,
                      v3Roots: game.v3Roots,
                      excess: game.v2Excess,
                      busy: v3CareBusy || actionLoading || !!v3PendingAck,
                    });
                  const v3FillPct =
                    btn.key === "water"
                      ? waterResultPct
                      : btn.key === "sun"
                        ? lightResultPct
                        : fertilizerResultPct;
                  const v3DisplayPct = displayFillHeights[btn.key];
                  // Result overlay only while this activity is pending ack/finish
                  // or marked completed — never from stale pct after a new fill.
                  const v3ShowResultFill =
                    v3Card != null &&
                    v3FillPct != null &&
                    (v3Card.uiState === "completed" ||
                      v3PendingAck === btn.key ||
                      v3PendingFinish?.activity === btn.key);
                  const v3ShowFill = v3ShowResultFill;
                  // Metelka lock must not grey Care buttons while Care holds the
                  // row (mid-cycle / «Уход»). When Metelka owns the row, children
                  // are not mounted anyway.
                  // Visual chrome: tutorial teaching lock only. Live collection
                  // blocks clicks via activitiesInteractionLocked / canStart, but
                  // playable cards keep the same --ac accents as tutorial.
                  const v3VisuallyLocked = useV3
                    ? isV3ActivityButtonVisuallyLocked(
                        v3Card,
                        tutorialActivitiesLocked,
                      )
                    : false;
                  const v3Themed =
                    useV3 &&
                    !tutorialActivitiesLocked &&
                    shouldThemeV3ActivityButton(v3Card);
                  const allowLegacyStart = mayStartLegacyCareFromActivityCard({
                    previewEnabled: SHOW_ECONOMY_V3_ROOTS_PREVIEW,
                    v3Roots: game.v3Roots,
                    tutorialOverride: !useV3 && tutorialRequiresThis,
                  });
                  const icon =
                    btn.key === "water" ? (
                      <Droplets size={16} strokeWidth={2.25} />
                    ) : btn.key === "sun" ? (
                      <Sun size={16} strokeWidth={2.25} />
                    ) : (
                      // Same weight as Zap on the energy timer; color via --ac.
                      <FertilizerIcon size={16} className="fertilizer-icon-lg" filled={false} />
                    );
                  const activityDisabled =
                    isSuppressed ||
                    actionLoading ||
                    v3CareBusy ||
                    activitiesInteractionLocked ||
                    (v3Card
                      ? !(
                          v3CanStart ||
                          v3PendingFinish?.activity === btn.key ||
                          v3PendingAck === btn.key
                        )
                      : btnLockedByGameRules);
                  return (
                    <button
                      key={btn.key}
                      className={`action-btn-bank${isPulsing && v3Themed ? " tutorial-water-pulse" : ""}${
                        v3Card?.uiState === "completed" || v3ShowResultFill
                          ? " action-btn-done"
                          : ""
                      }${v3Card ? " action-btn-bank--v3-reserve" : ""}${
                        v3VisuallyLocked ? " action-btn-bank--v3-locked" : ""
                      }`}
                      style={
                        v3Themed ||
                        (!useV3 && !isSuppressed && !btnLockedByGameRules)
                          ? ({ "--ac": btn.color } as React.CSSProperties)
                          : undefined
                      }
                      onClick={
                        activitiesInteractionLocked || activityDisabled
                          ? undefined
                          : useV3 || v3Card
                          ? v3CanStart
                            ? () => {
                                void handleStartV3CareActivity(btn.key);
                                if (!tutorialDone && useV3) {
                                  if (btn.key === "water") setTutorialStep("water");
                                  if (btn.key === "sun") setTutorialStep("sun");
                                  if (btn.key === "fertilizer") {
                                    setTutorialStep("fertilizer");
                                  }
                                }
                              }
                            : v3PendingFinish?.activity === btn.key
                              ? () => {
                                  void finishV3CareActivityWithSkill(
                                    v3PendingFinish.activity,
                                    v3PendingFinish.skill,
                                    v3PendingFinish.score,
                                  );
                                }
                              : v3PendingAck === btn.key
                                ? () => {
                                    void acknowledgeV3CareActivityOnce(btn.key);
                                  }
                                : undefined
                          : isTutorialPhase
                            ? isPulsing
                              ? () => {
                                  setTutorialStep(btn.key);
                                  setActiveMinigame(btn.key);
                                }
                              : undefined
                            : btnLockedByGameRules
                              ? undefined
                              : () => handleStartSession(btn.key)
                      }
                      disabled={activityDisabled}
                      aria-disabled={activityDisabled ? true : undefined}
                      title={
                        v3Card
                          ? metelkaBlocksCare
                            ? undefined
                            : activitiesInteractionLocked
                            ? ROOTS_COLLECTION_INCOMPLETE_HINT
                            : v3PendingFinish?.activity === btn.key
                            ? "Повторить отправку результата (finish)"
                            : v3PendingAck === btn.key
                              ? "Повторить acknowledge"
                              : v3CanStart
                                ? "Запуск v3 Care activity"
                                : v3Card.uiState === "completed"
                                  ? "Завершено в текущем v3 Care cycle"
                                  : v3Card.uiState === "session-locked"
                                    ? "Другая v3 активность уже активна"
                                    : `Нужно ≥ ${5} сек. запаса`
                          : !tutorialRequiresThis && v2CareStartBlocked
                            ? `Нужно ≥ ${V2_CARE_MIN_START_SECONDS} сек. энергии`
                            : undefined
                      }
                      aria-label={btn.label}
                      data-v3-activity-card={v3Card ? btn.key : undefined}
                      data-v3-activity-state={
                        tutorialActivitiesLocked
                          ? "disabled"
                          : rootsCollectionLocked &&
                              v3Card?.uiState === "available"
                            ? "available"
                            : v3Card?.uiState
                      }
                      data-v3-activity-locked={
                        v3VisuallyLocked ? "true" : undefined
                      }
                      data-v3-activity-legacy-start={
                        allowLegacyStart ? "true" : "false"
                      }
                      data-v3-activity-can-start={v3CanStart ? "true" : "false"}
                    >
                      {v3Card ? (
                        <V3ActivityReserveFill
                          kind={btn.key}
                          fillPercent={v3ActivityReserveFillPercent(
                            v3Card.reserveSeconds,
                            v3Card.dailyCapSeconds,
                          )}
                          muted={
                            v3Card.uiState === "disabled" ||
                            v3Card.uiState === "session-locked"
                          }
                        />
                      ) : null}
                      {v3ShowFill && (
                        <div
                          className="action-btn-fill"
                          data-care-fill-layer="true"
                          data-v3-activity-fill={btn.key}
                          style={{ height: `${v3DisplayPct}%` }}
                          onTransitionEnd={(e) => {
                            if (e.propertyName !== "height") return;
                            if (v3PendingAck !== btn.key) return;
                            if (btn.key !== lastCompletedActivityRef.current) return;
                            void acknowledgeV3CareActivityOnce(btn.key);
                          }}
                        />
                      )}
                      <div className="action-btn-content">
                        {v3Card?.uiState === "completed" && !v3Card.sessionActiveHere ? (
                          <CheckCircle2 size={16} strokeWidth={2.25} />
                        ) : (
                          icon
                        )}
                        {/* Completed = checkmark only; seconds return after «Уход» diverge. */}
                        {v3Card &&
                        !(
                          v3Card.uiState === "completed" &&
                          !v3Card.sessionActiveHere
                        ) ? (
                          <span
                            className="v3-activity-reserve-seconds"
                            data-v3-activity-seconds-label="true"
                            data-v3-activity-seconds={String(v3Card.reserveSeconds)}
                          >
                            {v3Card.reserveSeconds} с
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </CareActionsRow>
            </motion.div>
          </AnimatePresence>
        ) : (
          <>
              {showSpentActivityGhost && !careDiverging ? (
                <div
                  className="session-actions"
                  data-care-phase="rewards-ghost"
                  data-tutorial-activities-exhausted={
                    tutorialActivitiesExhausted ? "true" : undefined
                  }
                >
                  <div className="action-buttons-row activities-disabled">
                    {([
                      { key: "water" as const, icon: <Droplets size={16} strokeWidth={2.25} /> },
                      { key: "sun" as const, icon: <Sun size={16} strokeWidth={2.25} /> },
                      { key: "fertilizer" as const, icon: <FertilizerIcon size={16} className="fertilizer-icon-lg" filled={false} /> },
                    ]).map((btn) => {
                      const ghostSeconds =
                        useV3 && game.v3Roots
                          ? Math.max(
                              0,
                              Math.floor(
                                Number(game.v3Roots.reserves?.[btn.key]?.seconds) ||
                                  0,
                              ),
                            )
                          : null;
                      return (
                      <div
                        key={btn.key}
                        className={`action-btn-bank${
                          ghostSeconds != null ? " action-btn-bank--v3-reserve" : ""
                        } action-btn-bank--v3-locked`}
                      >
                        <div className="action-btn-content">
                          {btn.icon}
                          {ghostSeconds != null ? (
                            <span
                              className="v3-activity-reserve-seconds"
                              data-v3-activity-seconds-label="true"
                              data-v3-activity-seconds={String(ghostSeconds)}
                            >
                              {ghostSeconds} с
                            </span>
                          ) : null}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ) : showRewards ? null : (
                <div
                  className={`session-actions ${fadeActivities ? "activities-fade" : ""}${
                    showCompletionStage && !merging && !careDiverging && !showCareShovelUi
                      ? " session-actions-ready"
                      : ""
                  }${merging ? " session-actions--converging" : ""}${
                    careDiverging ? " session-actions--diverging" : ""
                  }`}
                  data-care-phase={carePhase}
                  data-care-diverging={careDiverging ? "true" : undefined}
                >
                  {/* Merge: shovel fades in. Diverge: shovel fades out while trio splits. */}
                  {(showCareShovelUi || merging || careDiverging) && (
                    <div
                      className="session-actions-care-shovel-slot"
                      data-care-shovel-slot="true"
                    >
                      <div className="action-buttons-row action-buttons-row--care-shovel">
                        {/* Spacers always on — avoids layout jerk when merge ends. */}
                        <div className="action-btn-bank" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
                        <motion.button
                          type="button"
                          className={`care-btn${careClicked ? " care-btn-clicked" : ""}`}
                          data-care-shovel="true"
                          data-care-shovel-converge={merging ? "true" : undefined}
                          data-care-shovel-diverge={careDiverging ? "true" : undefined}
                          initial={careShovelConvergeInitial(merging)}
                          animate={careShovelConvergeAnimate(
                            merging,
                            careDiverging,
                            showCareShovelUi || merging || careDiverging,
                          )}
                          transition={careShovelConvergeTransition(
                            merging,
                            careDiverging,
                          )}
                          disabled={merging || careDiverging || careClicked}
                          onClick={
                            careClicked || merging || careDiverging
                              ? undefined
                              : !tutorialDone &&
                                  tutorialStep === "complete" &&
                                  useV3 &&
                                  (shouldShowV3CareShovel(game.v3Roots) ||
                                    shouldShowV3RewardPreview(game.v3Roots) ||
                                    shouldAcknowledgeV3CareCycle(game.v3Roots))
                                ? () => {
                                    void handleV3CareShovelClick();
                                  }
                                : !tutorialDone && tutorialStep === "complete"
                                ? handleTutorialFinish
                                : useV3
                                  ? () => {
                                      void handleV3CareShovelClick();
                                    }
                                  : () => {
                                      handleGoToRewards();
                                    }
                          }
                        >
                          {!careClicked ? (
                            <div
                              className="action-btn-fill"
                              style={{
                                height: `${careShovelFillPercent(
                                  waterResultPct,
                                  lightResultPct,
                                  fertilizerResultPct,
                                )}%`,
                              }}
                            />
                          ) : null}
                          <Shovel size={16} strokeWidth={2.25} />
                        </motion.button>
                        <div className="action-btn-bank" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
                      </div>
                    </div>
                  )}
                  {/* Trio: merge together, or diverge from «Уход» back to three cubes. */}
                  {(!showCareShovelUi || merging || careDiverging) && (
                    <div
                      className={`action-buttons-row${
                        merging ? " action-buttons-row--converging" : ""
                      }${
                        careDiverging
                          ? " action-buttons-row--diverging activities-disabled"
                          : ""
                      }`}
                      data-care-converge={merging ? "true" : undefined}
                      data-care-diverge={careDiverging ? "true" : undefined}
                    >
                      {([
                        { key: "water" as const, icon: <Droplets size={16} strokeWidth={2.25} />, label: "Вода", color: V3_ACTIVITY_ACCENT_COLORS.water, done: game.water, pct: waterResultPct },
                        { key: "sun" as const, icon: <Sun size={16} strokeWidth={2.25} />, label: "Свет", color: V3_ACTIVITY_ACCENT_COLORS.sun, done: game.sun, pct: lightResultPct },
                        {
                          key: "fertilizer" as const,
                          icon: <FertilizerIcon size={16} className="fertilizer-icon-lg" filled={false} />,
                          label: "Удобрение",
                          color: V3_ACTIVITY_ACCENT_COLORS.fertilizer,
                          done: game.fertilizer,
                          pct: fertilizerResultPct,
                        },
                      ] as const).map((btn, btnIndex) => {
                        const v3Completed =
                          useV3 &&
                          game.v3Roots?.careCycle?.activities?.[btn.key]
                            ?.completed === true;
                        const completedFlag = useV3
                          ? v3Completed || btn.pct != null
                          : ENABLE_ECONOMY_V2_CARE
                            ? !!(v2Care.completed[btn.key] || btn.done)
                            : !!btn.done;
                        const careDone = isCareActivityCubeDone({
                          fillPercent: btn.pct,
                          completedFlag:
                            completedFlag ||
                            (!tutorialDone &&
                              tutorialStep === "complete" &&
                              btn.pct != null),
                        });
                        const fillTarget = btn.pct;
                        const displayPct = displayFillHeights[btn.key];
                        const energyLocked =
                          !useV3 &&
                          !careDone &&
                          (ENABLE_ECONOMY_V2_CARE
                            ? v2Care.allCompleted ||
                              (v2CareActive &&
                                durationFromServerAllocation(v2Care.allocation, btn.key) < 5)
                            : SHOW_ECONOMY_V2_MOCKS && (v2Alloc?.[btn.key] ?? 0) <= 0);
                        // Diverge = already-used cubes (same muted ghost shell), never “fresh” colored.
                        const showFillLayer =
                          !careDiverging && (careDone || fillTarget != null);
                        const convergeAxis = useV3RootsUi ? "x" : "y";
                        const slot = careConvergeSlotForIndex(btnIndex);
                        const divergeReserveSeconds =
                          careDiverging && useV3 && game.v3Roots
                            ? Math.max(
                                0,
                                Math.floor(
                                  Number(
                                    game.v3Roots.reserves?.[btn.key]?.seconds,
                                  ) || 0,
                                ),
                              )
                            : null;
                        return (
                          <motion.button
                            type="button"
                            key={btn.key}
                            className={`action-btn-bank${
                              !careDiverging && careDone ? " action-btn-done" : ""
                            }${
                              !careDiverging && energyLocked
                                ? " action-btn-energy-locked"
                                : ""
                            }${
                              divergeReserveSeconds != null
                                ? " action-btn-bank--v3-reserve action-btn-bank--v3-locked"
                                : ""
                            }`}
                            style={
                              (careDiverging
                                ? { pointerEvents: "none" as const }
                                : {
                                    "--ac": btn.color,
                                    ...(showCompletionStage ||
                                    energyLocked ||
                                    careDone
                                      ? { pointerEvents: "none" as const }
                                      : {}),
                                  }) as React.CSSProperties
                            }
                            initial={
                              careDiverging
                                ? careTrioDivergeInitial(slot, convergeAxis)
                                : false
                            }
                            animate={careTrioConvergeAnimate(
                              merging,
                              slot,
                              convergeAxis,
                            )}
                            transition={
                              careDiverging
                                ? careTrioDivergeTransition()
                                : careTrioConvergeTransition()
                            }
                            onClick={
                              !careDiverging &&
                              !careDone &&
                              !energyLocked &&
                              !useV3
                                ? () => {
                                    if (!ENABLE_ECONOMY_V2_CARE && v2Alloc) {
                                      armSpendForActivity(btn.key, v2Alloc);
                                    }
                                    setActiveMinigame(btn.key);
                                  }
                                : undefined
                            }
                            disabled={
                              careDiverging ||
                              !!careDone ||
                              actionLoading ||
                              energyLocked ||
                              !!pendingActivitySync ||
                              useV3
                            }
                            data-care-activity={btn.key}
                            data-care-done={
                              careDiverging || careDone ? "true" : "false"
                            }
                            data-care-fill-target={
                              !careDiverging && fillTarget != null
                                ? String(fillTarget)
                                : undefined
                            }
                            data-care-fill={String(
                              careDiverging ? 0 : displayPct,
                            )}
                          >
                            {showFillLayer && (
                              <div
                                className="action-btn-fill"
                                data-care-fill-layer="true"
                                data-care-fill-activity={btn.key}
                                style={{ height: `${displayPct}%` }}
                                onTransitionEnd={(e) => {
                                  if (e.propertyName !== "height") return;
                                  if (carePhase !== "activities_completed") return;
                                  if (btn.key !== lastCompletedActivityRef.current) return;
                                  // Last (third) cube fill finished — unlock hold → converge.
                                  markAllResultsPresented();
                                }}
                              />
                            )}
                            {careDiverging ? (
                              <div className="action-btn-content">
                                {btn.icon}
                                {divergeReserveSeconds != null ? (
                                  <span
                                    className="v3-activity-reserve-seconds"
                                    data-v3-activity-seconds-label="true"
                                    data-v3-activity-seconds={String(
                                      divergeReserveSeconds,
                                    )}
                                  >
                                    {divergeReserveSeconds} с
                                  </span>
                                ) : null}
                              </div>
                            ) : careDone ? (
                              <div className="action-btn-top">
                                <CheckCircle2 size={16} strokeWidth={2.25} />
                              </div>
                            ) : (
                              <div className="action-btn-content">
                                {btn.icon}
                              </div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
          </>
        )}
        </motion.div>
        </MotionConfig>
        </div>

      </div>



      {false && showCompletionStage && !showRewards && (
        <button
          className="transition-btn"
          onClick={() => {
            handleGoToRewards();
          }}
        >
          Перейти к начислениям
        </button>
      )}


      {/* Streak widget — first visit today */}
      <AnimatePresence>
        {showStreakWidget && (
          <motion.div
            className="help-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismissStreakWidget}
          >
            <motion.div
              className="help-modal streak-widget-modal"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="streak-widget-header">
                <span className="streak-widget-title">Награды посещений</span>
                <button className="help-modal-close" onClick={dismissStreakWidget}>✕</button>
              </div>
              <p className="streak-widget-sub">Заходите каждый день, чтобы получать бонусы</p>

              {(() => {
                // Single SoT with Economy v3: prefer server currentVisitDay, else streak mapping.
                const visitDay =
                  state.game.v3Roots?.currentVisitDay != null &&
                  Number.isFinite(state.game.v3Roots.currentVisitDay)
                    ? Math.max(1, Math.floor(state.game.v3Roots.currentVisitDay))
                    : resolveCurrentVisitDay(state.game.streakDays);
                const { allMaxed, activeIndex } =
                  getVisitRewardCalendarState(visitDay);
                // Visit reward = daily preset bonus (+1…+5 с), not bank game-seconds.
                const days = [1, 2, 3, 4, 5].map((day) => ({
                  label: `День ${day}`,
                  reward: `+${getStreakBonusSeconds(day)} сек`,
                }));
                return (
                  <div className="streak-days-row">
                    {days.map((d, i) => {
                      const done = allMaxed || i < activeIndex;
                      const active = !allMaxed && i === activeIndex;
                      return (
                        <div key={i} className={`streak-day-slot${done ? " streak-day-done" : active ? " streak-day-active" : " streak-day-upcoming"}`}>
                          <div className="streak-day-icon">
                            {done ? "✓" : active ? "⭐" : "🔒"}
                          </div>
                          <div className="streak-day-label">{d.label}</div>
                          <div className="streak-day-reward">{d.reward}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="streak-widget-streak">
                {(() => {
                  const visitDay =
                    state.game.v3Roots?.currentVisitDay != null &&
                    Number.isFinite(state.game.v3Roots.currentVisitDay)
                      ? Math.max(1, Math.floor(state.game.v3Roots.currentVisitDay))
                      : resolveCurrentVisitDay(state.game.streakDays);
                  return `Текущая серия: ${visitDay} ${visitDay === 1 ? "день" : visitDay < 5 ? "дня" : "дней"}`;
                })()}
              </div>
              <button className="streak-widget-btn" onClick={dismissStreakWidget}>
                Забрать
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen mini-game modal — outside game-area to avoid clipping */}
      {activeMinigame && (
        <div className="water-game-overlay">
          {!tutorialDone && (
            <div className="tutorial-minigame-banner">
              {activeMinigame === "water" ? "Ловите воду! 💧"
               : activeMinigame === "sun" ? "Ловите солнце! ☀️"
               : "Собирай гранулы в ряд!"}
            </div>
          )}
          {activeMinigame === "sun" ? (
            <ClickGameSun
              key={`sun-${!tutorialDone ? "tut" : useV3 ? `v3-${v3CarePresetSeconds ?? 5}` : (v2Alloc?.sun ?? v2Care.allocation.sunSeconds ?? 15)}`}
              onComplete={(score, count) => handleMinigameComplete("sun", score, count)}
              bonusSeconds={
                !tutorialDone || useV3 || ENABLE_ECONOMY_V2_CARE || v3CarePresetSeconds != null
                  ? 0
                  : getStreakBonusSeconds(game.streakDays)
              }
              durationSec={
                !tutorialDone
                  ? TUTORIAL_ACTIVITY_DURATION_SEC
                  : useV3
                    ? Math.max(5, v3CarePresetSeconds ?? 5)
                  : v3CarePresetSeconds != null
                    ? v3CarePresetSeconds
                  : ENABLE_ECONOMY_V2_CARE
                    ? Math.max(
                        5,
                        durationFromServerAllocation(v2Care.allocation, "sun"),
                      )
                    : SHOW_ECONOMY_V2_MOCKS
                      ? Math.max(1, (v2Alloc?.sun ?? 0) || 1)
                      : undefined
              }
            />
          ) : activeMinigame === "fertilizer" ? (
            <FertilizerMatchGame
              key={`fert-${!tutorialDone ? "tut" : useV3 ? `v3-${v3CarePresetSeconds ?? 5}` : (v2Alloc?.fertilizer ?? v2Care.allocation.fertilizerSeconds ?? 15)}`}
              onComplete={(score, count) => handleMinigameComplete("fertilizer", score, count)}
              bonusSeconds={
                !tutorialDone || useV3 || ENABLE_ECONOMY_V2_CARE || v3CarePresetSeconds != null
                  ? 0
                  : getStreakBonusSeconds(game.streakDays)
              }
              durationSec={
                !tutorialDone
                  ? TUTORIAL_ACTIVITY_DURATION_SEC
                  : useV3
                    ? Math.max(5, v3CarePresetSeconds ?? 5)
                  : v3CarePresetSeconds != null
                    ? v3CarePresetSeconds
                  : ENABLE_ECONOMY_V2_CARE
                    ? Math.max(
                        5,
                        durationFromServerAllocation(v2Care.allocation, "fertilizer"),
                      )
                    : SHOW_ECONOMY_V2_MOCKS
                      ? Math.max(1, (v2Alloc?.fertilizer ?? 0) || 1)
                      : undefined
              }
            />
          ) : (
            <FallingGameWater
              key={`water-${!tutorialDone ? "tut" : useV3 ? `v3-${v3CarePresetSeconds ?? 5}` : (v2Alloc?.water ?? v2Care.allocation.waterSeconds ?? 15)}`}
              type={activeMinigame}
              preset={
                !tutorialDone
                  ? buildWaterPreset(TUTORIAL_ACTIVITY_DURATION_SEC)
                  : useV3
                    ? buildWaterPreset(Math.max(5, v3CarePresetSeconds ?? 5))
                  : v3CarePresetSeconds != null
                    ? buildWaterPreset(v3CarePresetSeconds)
                  : ENABLE_ECONOMY_V2_CARE
                    ? buildWaterPreset(
                        Math.max(
                          5,
                          durationFromServerAllocation(v2Care.allocation, "water"),
                        ),
                      )
                    : SHOW_ECONOMY_V2_MOCKS
                      ? buildWaterPreset(Math.max(1, (v2Alloc?.water ?? 0) || 1))
                      : resolveWaterPresetV1(getStreakBonusSeconds(game.streakDays))
              }
              onComplete={(score, count) => handleMinigameComplete(activeMinigame, score, count)}
            />
          )}
        </div>
      )}
      <AnimatePresence>
        {showXpHistory && (
          <motion.div
            className="help-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowXpHistory(false)}
          >
            <motion.div
              className="help-modal xp-history-modal"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="help-modal-header">
                <h3 className="help-modal-title">🏆 Рейтинг</h3>
                <button className="help-modal-close" onClick={() => setShowXpHistory(false)}>✕</button>
              </div>

              <div className="xp-modal-tabs">
                {(["days", "xp", "growth"] as const).map(tab => (
                  <button
                    key={tab}
                    className={`xp-modal-tab${lbTab === tab ? " xp-modal-tab-active" : ""}`}
                    onClick={() => setLbTab(tab)}
                  >
                    {tab === "days" ? "Дней" : tab === "xp" ? "Опыта" : "Роста"}
                  </button>
                ))}
              </div>

              {leaderboardLoading ? (
                <p className="xp-history-empty">Загрузка...</p>
              ) : leaderboard.length === 0 ? (
                <p className="xp-history-empty">Пока нет игроков</p>
              ) : (() => {
                const sorted = [...leaderboard].sort((a, b) =>
                  lbTab === "days"   ? b.loginDays - a.loginDays :
                  lbTab === "growth" ? b.treeGrowthMM - a.treeGrowthMM :
                                       b.xp - a.xp
                );
                return (
                  <div className="xp-leaderboard-list">
                    {sorted.map((p, i) => (
                      <div key={p.rank} className={`xp-lb-row${p.isMe ? " xp-lb-row-me" : ""}`}>
                        <span className="xp-lb-rank">
                          #{i + 1}
                        </span>
                        <div className="xp-lb-info">
                          <span className="xp-lb-nick">{p.nickname}{p.isMe ? " (я)" : ""}</span>
                          <span className="xp-lb-meta">Ур.{p.level}</span>
                        </div>
                        <div className="xp-lb-right">
                          {lbTab === "days" ? (
                            <span className="xp-lb-xp">{formatLbLoginDays(p.loginDays)}</span>
                          ) : lbTab === "xp" ? (
                            <>
                              <span className="xp-lb-xp">{p.xp} оп.</span>
                            </>
                          ) : (
                            <span className="xp-lb-xp">{formatLbGrowth(p.treeGrowthMM)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShop && (
          <ShopModal
            onClose={() => setShowShop(false)}
            totalApples={totalApples}
            purchasedItems={purchasedItems}
            onPurchase={(_, newApples, newItems) => {
              setTotalApples(newApples);
              setPurchasedItems(newItems);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLevelModal && (
          <motion.div
            className="help-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setShowLevelModal(false);
              checkPendingAchievements();
            }}
          >
            <motion.div
              className="help-modal xp-history-modal xp-level-modal"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="xp-history-modal-topbar">
                {editingNick ? (
                  <div className="xp-nick-edit-row">
                    <input
                      className="xp-nick-input"
                      value={nickVal}
                      onChange={e => { setNickVal(e.target.value); setNickErr(""); }}
                      placeholder="Новый ник"
                      maxLength={50}
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") saveNick(); if (e.key === "Escape") setEditingNick(false); }}
                    />
                    <button className="xp-nick-confirm" onClick={saveNick} disabled={nickBusy || !nickVal.trim()}>
                      <Check size={13} />
                    </button>
                    <button className="xp-nick-cancel" onClick={() => { setEditingNick(false); setNickErr(""); }}>
                      <X size={13} />
                    </button>
                    {nickErr && <span className="xp-nick-error">{nickErr}</span>}
                  </div>
                ) : (
                  <div className="xp-nick-row">
                    <button className="xp-nick-pencil" onClick={() => { setNickVal(user?.nickname ?? user?.username ?? ""); setEditingNick(true); }} title="Изменить ник">
                      <Pencil size={13} />
                    </button>
                    <span className="xp-history-modal-nick">{user?.nickname ?? user?.username}</span>
                  </div>
                )}
                <button
                  className="help-modal-close"
                  onClick={() => {
                    setShowLevelModal(false);
                    checkPendingAchievements();
                  }}
                >
                  ✕
                </button>
              </div>
              {(() => {
                const prog = getLevelProgress(game.playerXP ?? 0);
                const pct = prog.isMax ? 100 : prog.xpNeeded ? Math.min(100, Math.round(prog.xpInLevel / prog.xpNeeded * 100)) : 100;
                return (
                  <div className="xp-level-progress">
                    <div className="xp-level-progress-header">
                      <span className="xp-level-name">{prog.name}</span>
                      <span className="xp-level-num">Уровень {prog.level}</span>
                    </div>
                    <div className="xp-level-bar-track">
                      <div className="xp-level-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="xp-level-points">
                      {prog.isMax
                        ? <span>{prog.xpInLevel} опыт · MAX</span>
                        : <><span>{prog.xpInLevel} / {prog.xpNeeded} опыт</span><span>{pct}%</span></>
                      }
                    </div>
                  </div>
                );
              })()}
              <div className="xp-level-achievements">
                <h4 className="xp-level-achievements-title">🏅 Достижения</h4>
                <AchievementsPanel
                  onApplesClaimed={(newTotal) => {
                    setTotalApples(newTotal);
                    checkPendingAchievements();
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTreeInfo && (
          <motion.div
            className="help-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowTreeInfo(false)}
          >
            <motion.div
              className="help-modal"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="help-modal-header">
                <h3 className="help-modal-title">🌳 Стадии роста дерева</h3>
                <button className="help-modal-close" onClick={() => setShowTreeInfo(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="tree-stages-list">
                {TREE_STAGE_DATA.map((stage, i) => {
                  const isCurrent = getTreeStage(displayGrowthMM) === i;
                  const nextFrom = TREE_STAGE_DATA[i + 1]?.from ?? null;
                  const isDone = nextFrom !== null && displayGrowthMM >= nextFrom;
                  const hasProgress = isCurrent && nextFrom !== null;
                  const progressPct = hasProgress
                    ? Math.min(100, ((displayGrowthMM - stage.from) / (nextFrom - stage.from)) * 100)
                    : 0;
                  return (
                    <div key={i} className={`tree-stage-row${isCurrent ? " tree-stage-row-current" : ""}${!isCurrent && isDone ? " tree-stage-row-done" : ""}`}>
                      <span className="tree-stage-emoji">{stage.emoji}</span>
                      <div className="tree-stage-info">
                        <p className="tree-stage-name">{TREE_STAGE_NAMES[i]}</p>
                        <p className="tree-stage-range">
                          {stage.fromFmt}{stage.toFmt ? ` — ${stage.toFmt}` : " и выше"}
                        </p>
                        {hasProgress && (
                          <div className="tree-stage-progress-wrap">
                            <div
                              className="tree-stage-progress-bar"
                              style={{ width: `${progressPct.toFixed(1)}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {isCurrent && <span className="tree-stage-badge">Сейчас</span>}
                      {!isCurrent && isDone && <span className="tree-stage-badge tree-stage-badge-done">✓</span>}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDepositInfo && (
          <motion.div
            className="help-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowDepositInfo(false)}
          >
            <motion.div
              className="inc-modal"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="inc-modal-hero">
                <div className="inc-modal-brand">
                  <span className="inc-modal-brand-icon">🌳</span>
                  <div className="inc-modal-brand-text">
                    <span className="inc-modal-brand-name">История начислений</span>
                    <span className="inc-modal-brand-type">Активности и избыток</span>
                  </div>
                </div>
                <button className="inc-modal-close-btn" onClick={() => setShowDepositInfo(false)}>
                  <X size={14} />
                </button>
                <div className="inc-modal-balance-block">
                  <span className="inc-modal-balance-lbl">Текущий баланс</span>
                  <span className="inc-modal-balance-num">{formatRub(balances.balance)}</span>
                  <div className="inc-modal-earned-chip">
                    <span>Начислено за всё время</span>
                    <span className="inc-modal-earned-val">+{formatRub(balances.earned)}</span>
                  </div>
                </div>
              </div>

              <div className="inc-modal-stats">
                <div className="inc-modal-stat">
                  <span className="inc-modal-stat-val">12%</span>
                  <span className="inc-modal-stat-lbl">Базовая ставка</span>
                </div>
                <div className="inc-modal-stat">
                  <span className="inc-modal-stat-val">{sessionHistory.length}</span>
                  <span className="inc-modal-stat-lbl">Операций</span>
                </div>
                <div className="inc-modal-stat">
                  <span className="inc-modal-stat-val">
                    {sessionHistory.length > 0 ? formatPercent(avgPercent) : "—"}
                  </span>
                  <span className="inc-modal-stat-lbl">Средний %</span>
                </div>
              </div>

              <div className="inc-modal-body">
                {sessionHistory.length === 0 ? (
                  <p className="inc-modal-empty">Начисления появятся после первой сессии</p>
                ) : (
                  <>
                    <div className="inc-modal-section-lbl">Операции</div>
                    <div className="inc-modal-txns">
                      {sessionHistory.map((s, idx) => {
                        const pct = s.base > 0 ? (s.total / s.base) * 12 : 12;
                        const isLast = idx === sessionHistory.length - 1;
                        return (
                          <div key={idx} className="inc-txn">
                            <div className="inc-txn-timeline">
                              <div className="inc-txn-dot" />
                              {!isLast && <div className="inc-txn-line" />}
                            </div>
                            <div className="inc-txn-body">
                              <div className="inc-txn-main-row">
                                <span className="inc-txn-date">{s.date}</span>
                                <span className="inc-txn-amount">+{formatRub(s.total)}</span>
                              </div>
                              <div className="inc-txn-meta">
                                {s.kind === "metelka" && (
                                  <span className="inc-txn-tag inc-txn-tag-bonus">Метелка</span>
                                )}
                                {s.kind === "excess" && s.base <= 0 && s.bonus <= 0 && (
                                  <span className="inc-txn-tag inc-txn-tag-bonus">Избыток</span>
                                )}
                                {s.base > 0 && (
                                  <span className="inc-txn-tag inc-txn-tag-base">
                                    База {formatRub(s.base)}
                                  </span>
                                )}
                                {s.bonus > 0 && (
                                  <span className="inc-txn-tag inc-txn-tag-bonus">
                                    Бонус +{formatRub(s.bonus)}
                                  </span>
                                )}
                                {s.kind === "activity" && (
                                  <span className="inc-txn-rate">{formatPercent(pct)} год.</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
