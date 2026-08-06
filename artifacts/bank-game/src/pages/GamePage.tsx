import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import {
  UserState,
  formatRub,
  formatLbSessions,
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
import { Droplets, Sun, Play, CheckCircle2, Shovel, Lock, X, TreePine, Pencil, Check, Settings, ScrollText, Star } from "lucide-react";
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
  minigameScoreToV3Skill,
  resolveV3CareCycleRecovery,
  resolveV3CareRecovery,
  resolveV3CareStartPresetSeconds,
  resolveV3CareShovelAction,
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
  activityResultFillPercent,
  isCareActivityCubeDone,
  mergeActivityFillPercent,
  scheduleFillHeightReveal,
  zeroDisplayFills,
  type CareActivityFillKey,
  type CareDisplayFillMap,
} from "@/lib/careActivityResultFill";
import { TUTORIAL_ACTIVITY_DURATION_SEC, type TutorialStep } from "@/lib/tutorialFlow";
import {
  areAllV3CareActivitiesCompleted,
  getV3CareActivitiesCompleted,
  isV3TutorialActivitiesInteractionLocked,
  isV3TutorialLiveCareStep,
  isV3TutorialRootStep,
  nextV3TutorialStepFromCompletedActivities,
  nextV3TutorialStepAfterRootTransfer,
  resolveV3TutorialStepFromServer,
  tutorialHighlightRoot,
  tutorialRecommendedV3Activity,
  v3TutorialOverlayConfig,
} from "@/lib/tutorialFlow";

import { APP_VERSION } from "@/lib/engine";

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
  const [showDepositInfo, setShowDepositInfo] = useState(false);
  const [showXpHistory, setShowXpHistory] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showTutorialComplete, setShowTutorialComplete] = useState(false);
  const [showTutorialCompletionCard, setShowTutorialCompletionCard] = useState(false);
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
  const [lbTab, setLbTab] = useState<"sessions" | "xp" | "growth">("sessions");

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
    setCarePhase((prev) => reduceCareActionsPhase(prev, event));
  }

  function markAllResultsPresented() {
    if (fillPresentedFallbackRef.current != null) {
      clearTimeout(fillPresentedFallbackRef.current);
      fillPresentedFallbackRef.current = null;
    }
    setAllResultsPresented(true);
  }

  function exitPostCareUiForNextCycle() {
    if (!tutorialDone) return;
    // Keep growthTimeoutsRef (XP/mm popup hide timers). Ghost must not be
    // scheduled from v3 claim — only clear the flag if a legacy path set it.
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
      dispatchCarePhase({ type: "start_transition" });
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
    // Tutorial exit only — never Care claim / reward animation queue.
    clearCareRewardPresentationState();
    // Dismiss the "complete" intro card first
    setShowTutorialCompletionCard(false);
    // Show final congratulations window ("Начать играть" / enter game)
    setTimeout(() => setShowTutorialComplete(true), 300);
  }

  function handleTutorialDismiss() {
    setShowTutorialComplete(false);
    setTimeout(() => {
      void (async () => {
        // Clear all tutorial UI leftovers so Care returns to normal unlock rules.
        // Must also idle reward presentation (no deferred XP/growth/apples replay).
        clearCareRewardPresentationState();
        setTutorialStep(null);
        setShowTutorialCompletionCard(false);
        waterScoreRef.current = 0;
        sunScoreRef.current = 0;
        fertilizerScoreRef.current = 0;
        skillScoreRef.current = 0;
        try {
          await api.tutorialComplete();
        } catch {
          // Still unlock local UI; next getState will reconcile.
        }
        // Fresh server snapshot: Economy v2 anchor starts at tutorial completion.
        try {
          const data = await api.getState();
          if (data.exists && data.game) {
            let next: UserState;
            if (isEconomyV3GameCycleEnabled(data.game.v3Roots)) {
              next = {
                ...stateRef.current,
                game: {
                  ...stateRef.current.game,
                  tutorialDone: true,
                  v2Care: emptyV2CareState(),
                  v2Roots: emptyV2RootsState(),
                  v2EnergySeconds: 0,
                  v2EnergyAnchorAt: null,
                  v2Excess: normalizeV2Excess(data.game.v2Excess),
                },
              };
              next = applyEconomyV3FromServerGame(next, data.game);
            } else {
              next = applyV2CareSnapshotToState(
                stateRef.current,
                data.game.v2Care,
                data.game.v2EnergySeconds,
              );
              next = {
                ...next,
                game: {
                  ...next.game,
                  tutorialDone: true,
                  v2EnergySeconds:
                    data.game.v2EnergySeconds ?? next.game.v2EnergySeconds,
                  v2Roots: normalizeV2Roots(data.game.v2Roots),
                  v2Excess: normalizeV2Excess(data.game.v2Excess),
                },
              };
              next = applyEconomyV3FromServerGame(next, data.game);
            }
            setTutorialDone(true);
            commitState(next);
          } else {
            setTutorialDone(true);
            commitState({
              ...stateRef.current,
              game: { ...stateRef.current.game, tutorialDone: true },
            });
          }
        } catch {
          setTutorialDone(true);
          commitState({
            ...stateRef.current,
            game: { ...stateRef.current.game, tutorialDone: true },
          });
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

  // v3 Tutorial: prepare roots once when entering intro.
  const v3TutorialPrepareRef = useRef(false);
  useEffect(() => {
    if (tutorialDone || !useV3) return;
    if (tutorialStep !== "intro" && !isV3TutorialRootStep(tutorialStep)) return;
    if (v3TutorialPrepareRef.current && tutorialStep !== "intro") return;
    let cancelled = false;
    (async () => {
      try {
        const prepared = await api.prepareTutorialV3();
        if (cancelled) return;
        v3TutorialPrepareRef.current = true;
        commitState(
          applyEconomyV3RootsToState(stateRef.current, prepared.v3Roots),
        );
        if (tutorialStep === "intro") {
          setTutorialStep("v3-root-water");
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[v3 tutorial prepare]", err);
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
   * Server Care cycle already ready/finished — show «Уход», never the
   * completed+full-reserve activity cards (white shell over colored fill).
   */
  const v3ServerWantsCareShovel =
    useV3 &&
    (shouldShowV3CareShovel(game.v3Roots) ||
      shouldShowV3RewardPreview(game.v3Roots) ||
      shouldAcknowledgeV3CareCycle(game.v3Roots));
  const showCareShovelUi = showCareButton || v3ServerWantsCareShovel;

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
    if (total > 0) setLastIncomeAmount(total);
    setShowIncomePopup(true);
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
    const rect = gameAreaRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? 200) / 2;
    const cy = (rect?.height ?? 300) * 0.38;

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

  function resetCareUiChrome() {
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
    setShowActivityGhost(false);
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
  function clearCareRewardPresentationState() {
    pendingXpRef.current = null;
    setSessionScores(null);
    setCareClicked(false);
    setShowXpPopup(false);
    setShowMmPopup(false);
    setShowIncomePopup(false);
    setShowApplePopup(false);
    setXpGainAmount(null);
    setLevelUpData(null);
    resetCareUiChrome();
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
          await api.tutorialComplete();
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
        const next: UserState = {
          ...stateRef.current,
          game: {
            ...stateRef.current.game,
            tutorialDone:
              serverGame.tutorialDone !== false ? true : tutorialDone,
            v2Care: emptyV2CareState(),
            v2Roots: emptyV2RootsState(),
            v2EnergySeconds: 0,
            v2EnergyAnchorAt: null,
            v2Excess: nextExcess,
          },
        };
        if (serverGame.tutorialDone !== false) setTutorialDone(true);
        commitState(applyEconomyV3FromServerGame(next, serverGame));
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
      // After last activity ack: if server says ready → enter «Уход» shovel UI.
      if (shouldShowV3CareShovel(ack.v3Roots)) {
        if (!tutorialDone && useV3) {
          setTutorialStep("complete");
        }
        enterV3CareShovelUi();
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

  /** Enter care_button quickly (F5 / after trio) — server already says ready/finished. */
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
      const growthMM = claimed.treeGrowthMm;
      const growthRem = cur.game.treeGrowthRemainder ?? 0;
      const normalized =
        normalizeEconomyV3RootsSnapshot(claimed.v3Roots) ?? claimed.v3Roots;
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
              treeGrowthMM: growthMM,
              treeGrowthRemainder: growthRem,
            },
          },
          normalized,
        ),
      );

      // Tutorial Care claim: no real economy — ack + complete only (no claimAll).
      // Regular Care (tutorialDone): feed handleGoToRewards below.
      if (!tutorialDone) {
        await acknowledgeV3CareCycleOnce({ skipUiExit: true });
        const curAfter = stateRef.current;
        commitState({
          ...curAfter,
          game: {
            ...curAfter.game,
            treeGrowthMM: growthMM,
            treeGrowthRemainder: growthRem,
            pendingBaseReward: 0,
            pendingBonusReward: 0,
          },
        });
        displayGrowthMMRef.current = growthMM;
        setDisplayGrowthMM(growthMM);
        pendingXpRef.current = null;
        setSessionScores(null);
        clearCareRewardPresentationState();
        setCareSyncError(null);
        if (useV3) {
          setTutorialStep("complete");
          handleTutorialFinish();
        }
        return "ok"; // claim applied even if ack failed (retry via shovel ack path)
      }

      // Feed the legacy reward queue (same as v1/v2 shovel → handleGoToRewards).
      pendingXpRef.current = {
        xpGained: scores.xp,
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
      handleGoToRewards(scores);
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

    // Step 2 — ghost buttons split in after 800ms
    const ghostTimer = setTimeout(() => setShowActivityGhost(true), 800);
    growthTimeoutsRef.current.push(ghostTimer);

    // Step 3 — countdown timer (1s per mm, min 5s, no upper cap)
    const timerSecs = Math.max(5, scores?.mm ?? 9);
    const avgPct = ([waterResultPct, lightResultPct, fertilizerResultPct]
      .reduce<number>((s, p) => s + (p ?? 0), 0)) / 3;
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

        // Step 5 — начисление роста (мм) после вспышки + показ попапа мм
        if (px) {
          const cur = stateRef.current;
          commitState({
            ...cur,
            game: {
              ...cur.game,
              treeGrowthMM: px.newMM,
              treeGrowthRemainder: px.newRemainder,
            },
          });
          animateGrowth(displayGrowthMMRef.current, px.newMM);
        }
        if (scores && scores.mm > 0) setShowMmPopup(true);
        const mmPopupTimer = setTimeout(() => setShowMmPopup(false), 1400);
        growthTimeoutsRef.current.push(mmPopupTimer);

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
        }${useV3RootsUi ? " game-area--v3-roots" : ""}`}
        ref={gameAreaRef}
        data-v3-roots-scene={useV3RootsUi ? "true" : undefined}
      >
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
        {tutorialDone && <span className="game-beta-floating">{APP_VERSION}</span>}
        <GameAreaBg purchasedItems={purchasedItems} />
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
          v3 underground column: roots → timer → chest in one flex stack (gap 6px).
          Absolute math was leaving large voids; flex gap matches actions↔roots.
        */}
        {useV3RootsUi && (
          <div
            className="v3-underground-stack"
            data-v3-underground-stack="true"
          >
            <V3UndergroundWrapRoots treeStage={currentStage} />
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
              className="v3-root-wait-timer-host"
              data-v3-root-wait-timer-host="true"
            >
              <V3RootWaitTimer
                v3Roots={game.v3Roots}
                capital={balances.balance}
                tutorialDone={tutorialDone}
                nowMs={now}
                hideTimer={excessCleaning}
                onRefreshState={syncRootsFromServer}
              />
            </div>
            <div
              className="v3-capital-chest-host"
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
                    <span className="income-popup-label">+{Math.floor(lastIncomeAmount).toLocaleString("ru-RU")} ₽</span>
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
              />
            </div>
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
                Сначала соберите энергию корней,
                <br />
                затем пройдите активности ухода.
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
                : { icon: "fertilizer" as const, text: "Собирай гранулы\nудобрения в ряд!", hint: "Нажмите на кнопку удобрения" }
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
          <TreeGrowthBadge
            growthMM={displayGrowthMM}
            onClick={() => setShowXpHistory(true)}
            popup={
              <AnimatePresence>
                {showMmPopup && sessionScores && sessionScores.mm > 0 && (
                  <motion.div
                    className="tree-growth-badge-popup topbar-reward-popup-mm"
                    data-tree-growth-mm-popup="true"
                    initial={{ opacity: 0, y: 6, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.85 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <motion.span
                      className="mm-popup-icon"
                      initial={{ scale: 0.5, rotate: -15 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
                    >
                      <TreePine size={14} strokeWidth={2.2} fill="currentColor" />
                    </motion.span>
                    <span className="mm-popup-label">+{sessionScores.mm} мм</span>
                  </motion.div>
                )}
              </AnimatePresence>
            }
          />
          {/* 8G: exclusive roots — v3 mounts beside underground (above); fallback → RootEnergyLayer only. */}
          {!useV3RootsUi &&
            ENABLE_ECONOMY_V2_ROOT_COLLECTION && (
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
                        custom={flyingAppleIndices.includes(i)}
                        variants={{
                          // Manual collect flies toward the field basket (left of bush),
                          // without leaving the play-field left edge.
                          exit: (isManual: boolean) => isManual
                            ? { opacity: 0, scale: 0.25, y: 90, x: -40, transition: { duration: 0.38, ease: "easeIn" } }
                            : { opacity: 0, scale: 0, transition: { duration: 0.22 } }
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

          <AnimatePresence>
            {growthCountdown !== null && (
              <div className="growth-timer" data-growth-timer="true">
                <motion.div
                  className="growth-timer-row"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <div
                    className="growth-timer-bar"
                    style={{ width: `${((growthTimerTotal - growthCountdown) / growthTimerTotal) * 100}%` }}
                  />
                  <span className="growth-timer-leaf" aria-hidden="true">
                    <TreePine size={13} strokeWidth={2.2} fill="currentColor" />
                  </span>
                  <span className="growth-timer-time field-caption-value">
                    {String(Math.floor(growthCountdown / 60)).padStart(2, '0')}:{String(growthCountdown % 60).padStart(2, '0')}
                  </span>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>


        <div
          className={`session-actions-wrap${
            excessCleaning ? " session-actions-wrap--cleaning" : ""
          }`}
          data-session-actions-cleaning={excessCleaning ? "true" : undefined}
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
        !showActivityGhost &&
        !showCareShovelUi &&
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
                  const v3RecommendBtn =
                    useV3 &&
                    !tutorialDone &&
                    v3Completed != null &&
                    !areAllV3CareActivitiesCompleted(v3Completed) &&
                    isV3TutorialLiveCareStep(tutorialStep)
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
                  // Welcome / intro / root steps: activities stay grey & non-interactive.
                  const tutorialActivitiesLocked =
                    useV3 &&
                    isV3TutorialActivitiesInteractionLocked(
                      tutorialStep,
                      tutorialDone,
                    );
                  const isPulsing =
                    !tutorialDone &&
                    tutorialActiveBtn != null &&
                    btn.key === tutorialActiveBtn &&
                    !tutorialActivitiesLocked;
                  // v3: after roots, all playable activities stay clickable (no sibling suppress).
                  const isSuppressed =
                    tutorialActivitiesLocked ||
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
                    !tutorialActivitiesLocked &&
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
                  const v3VisuallyLocked = useV3
                    ? isV3ActivityButtonVisuallyLocked(
                        v3Card,
                        tutorialActivitiesLocked,
                      )
                    : false;
                  const v3Themed =
                    useV3 &&
                    !v3VisuallyLocked &&
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
                    tutorialActivitiesLocked ||
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
                        v3Themed || (!useV3 && !isSuppressed && !btnLockedByGameRules)
                          ? ({ "--ac": btn.color } as React.CSSProperties)
                          : undefined
                      }
                      onClick={
                        tutorialActivitiesLocked || activityDisabled
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
                            : tutorialActivitiesLocked
                            ? "Сначала соберите энергию корня"
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
                      </div>
                    </button>
                  );
                })}
              </CareActionsRow>
            </motion.div>
          </AnimatePresence>
        ) : (
          <>
              {showActivityGhost ? (
                <div className="session-actions" data-care-phase="rewards-ghost">
                  <div className="action-buttons-row activities-disabled">
                    {([
                      { key: "water",       icon: <Droplets size={16} strokeWidth={2.25} /> },
                      { key: "sun",         icon: <Sun size={16} strokeWidth={2.25} /> },
                      { key: "fertilizer",  icon: <FertilizerIcon size={16} className="fertilizer-icon-lg" filled={false} /> },
                    ]).map((btn) => (
                      <div key={btn.key} className="action-btn-bank">
                        <div className="action-btn-content">
                          {btn.icon}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : showRewards ? null : (
                <div
                  className={`session-actions ${fadeActivities ? "activities-fade" : ""}${
                    showCompletionStage && !merging && !showCareShovelUi
                      ? " session-actions-ready"
                      : ""
                  }${merging ? " session-actions--converging" : ""}`}
                  data-care-phase={carePhase}
                >
                  {showCareShovelUi ? (
                    <div
                      className="session-actions-care-shovel-slot"
                      data-care-shovel-slot="true"
                    >
                      <div className="action-buttons-row action-buttons-row--care-shovel">
                        <div className="action-btn-bank" style={{ opacity: 0, pointerEvents: "none" }} />
                        <button
                          type="button"
                          className={`care-btn care-btn--from-converge${careClicked ? " care-btn-clicked" : ""}`}
                          data-care-shovel="true"
                          onClick={
                            careClicked
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
                          {!careClicked && !tutorialDone && tutorialStep === "complete" ? null : (!careClicked && (() => {
                            const pts = [waterResultPct, lightResultPct, fertilizerResultPct];
                            const avg = Math.round(pts.reduce<number>((s, p) => s + (p ?? 0), 0) / 3);
                            return <div className="action-btn-fill" style={{ height: `${avg}%` }} />;
                          })())}
                          <Shovel size={16} strokeWidth={2.25} />
                        </button>
                        <div className="action-btn-bank" style={{ opacity: 0, pointerEvents: "none" }} />
                      </div>
                    </div>
                  ) : null}
                  {showCareShovelUi ? null : (
                    <div
                      className={`action-buttons-row${merging ? " action-buttons-row--converging" : ""}`}
                      data-care-converge={merging ? "true" : undefined}
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
                      ] as const).map((btn) => {
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
                        const showFillLayer = careDone || fillTarget != null;
                        return (
                          <button
                            type="button"
                            key={btn.key}
                            className={`action-btn-bank ${careDone ? "action-btn-done" : ""}${energyLocked ? " action-btn-energy-locked" : ""}`}
                            style={{
                              "--ac": btn.color,
                              ...(showCompletionStage || energyLocked || careDone
                                ? { pointerEvents: "none" }
                                : {}),
                            } as React.CSSProperties}
                            onClick={!careDone && !energyLocked && !useV3 ? () => {
                              if (!ENABLE_ECONOMY_V2_CARE && v2Alloc) {
                                armSpendForActivity(btn.key, v2Alloc);
                              }
                              setActiveMinigame(btn.key);
                            } : undefined}
                            disabled={!!careDone || actionLoading || energyLocked || !!pendingActivitySync || useV3}
                            data-care-activity={btn.key}
                            data-care-done={careDone ? "true" : "false"}
                            data-care-fill-target={fillTarget != null ? String(fillTarget) : undefined}
                            data-care-fill={String(displayPct)}
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
                            {careDone ? (
                              <div className="action-btn-top">
                                <CheckCircle2 size={16} strokeWidth={2.25} />
                              </div>
                            ) : (
                              <div className="action-btn-content">
                                {btn.icon}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
          </>
        )}
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
               : "Собирай гранулы удобрения в ряд!"}
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
                {(["sessions", "xp", "growth"] as const).map(tab => (
                  <button
                    key={tab}
                    className={`xp-modal-tab${lbTab === tab ? " xp-modal-tab-active" : ""}`}
                    onClick={() => setLbTab(tab)}
                  >
                    {tab === "sessions" ? "Сессий" : tab === "xp" ? "Опыта" : "Роста"}
                  </button>
                ))}
              </div>

              {leaderboardLoading ? (
                <p className="xp-history-empty">Загрузка...</p>
              ) : leaderboard.length === 0 ? (
                <p className="xp-history-empty">Пока нет игроков</p>
              ) : (() => {
                const sorted = [...leaderboard].sort((a, b) =>
                  lbTab === "sessions" ? b.streakDays - a.streakDays :
                  lbTab === "growth"   ? b.treeGrowthMM - a.treeGrowthMM :
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
                          {lbTab === "sessions" ? (
                            <span className="xp-lb-xp">{formatLbSessions(p.streakDays)}</span>
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
