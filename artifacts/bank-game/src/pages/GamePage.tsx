import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import {
  UserState,
  formatRub,
  formatTimer,
  formatLbSessions,
  formatLbGrowth,
  formatTreeGrowth,
  applyTreeGrowth,
  isSessionLocked,
  getNextSessionTime,
  getTreeStage,
  TREE_STAGE_NAMES,
  getSessionActionsLeft,
  getStreakBonusSeconds,
  SESSION_COOLDOWN_MS,
} from "@/lib/engine";
import { api, type LeaderboardPlayer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import TreeSVG, { STAGE_DIMS } from "@/components/TreeSVG";
import FallingGameWater, { GameType } from "@/components/FallingGameWater";
import ClickGameSun from "@/components/ClickGameSun";
import FertilizerMatchGame from "@/components/FertilizerMatchGame";
import AchievementsModal, { ACHIEVEMENTS } from "@/components/AchievementsModal";
import { Droplets, Sun, Leaf, Clock, Play, CheckCircle2, Shovel, Lock, X, TreePine, Wallet, Pencil, Check, Settings, Trophy, Medal, ShoppingCart, ScrollText, Star } from "lucide-react";
import LevelWidget from "@/components/LevelWidget";
import LevelUpAnimation from "@/components/LevelUpAnimation";
import { getLevelProgress } from "@/lib/levels";
import GameAreaBg from "@/components/GameAreaBg";
import SettingsWidget from "@/components/SettingsWidget";
import DebugPanel from "@/components/DebugPanel";
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
  const hasPendingInit = (state.game.pendingBaseReward ?? 0) > 0 || (state.game.pendingBonusReward ?? 0) > 0;
  const notInSessionInit = !state.game.sessionInProgress;
  const [showCompletionStage, setShowCompletionStage] = useState(hasPendingInit && notInSessionInit);
  const [showRewards, setShowRewards] = useState(hasPendingInit && notInSessionInit);
  const [merging, setMerging] = useState(false);
  const [showCareButton, setShowCareButton] = useState(false);
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
  const [showMmPopup, setShowMmPopup] = useState(false);
  const [careClicked, setCareClicked] = useState(false);
  const [showActivityGhost, setShowActivityGhost] = useState(false);
  const [showGrowthAnim, setShowGrowthAnim] = useState(false);
  const [growthCountdown, setGrowthCountdown] = useState<number | null>(null);
  const [growthTimerTotal, setGrowthTimerTotal] = useState(9);
  const [showApples, setShowApples] = useState(false);
  const [appleCount, setAppleCount] = useState(1);
  const [collectedAppleIndices, setCollectedAppleIndices] = useState<number[]>([]);
  const [showApplePopup, setShowApplePopup] = useState(false);
  const [applePopupCount, setApplePopupCount] = useState(1);
  const [showIncomePopup, setShowIncomePopup] = useState(false);
  const [lastIncomeAmount, setLastIncomeAmount] = useState(0);
  const [totalApples, setTotalApples] = useState(state.game.totalApples ?? 0);
  const [activeAnim, setActiveAnim] = useState<GameType | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animParticlesRef = useRef<number[]>([]);
  const [showTreeInfo, setShowTreeInfo] = useState(false);
  const [showDepositInfo, setShowDepositInfo] = useState(false);
  const [showXpHistory, setShowXpHistory] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [hasPendingAchievements, setHasPendingAchievements] = useState(false);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [showStreakWidget, setShowStreakWidget] = useState(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const seen = localStorage.getItem("streak_widget_date");
    const notMidSession = !state.game.sessionInProgress;
    const noPending = (state.game.pendingBaseReward ?? 0) === 0 && (state.game.pendingBonusReward ?? 0) === 0;
    return seen !== todayStr && notMidSession && noPending;
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
  const appleAutoCollectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectedAppleIndicesRef = useRef<number[]>([]);
  const appleCountRef = useRef(1);
  useEffect(() => { stateRef.current = state; }, [state]);
  const pendingXpRef = useRef<{ xpGained: number; newLevel?: number; xpHistory?: unknown[]; levelUp?: boolean; newMM: number; newRemainder: number } | null>(null);
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

  useEffect(() => {
    const pb = state.game.pendingBaseReward ?? 0;
    const pbo = state.game.pendingBonusReward ?? 0;
    if (pb === 0 && pbo === 0 && showCompletionStage) {
      setShowCompletionStage(false);
      setShowRewards(false);
      setFadeActivities(false);
    }
  }, [state.game.pendingBaseReward, state.game.pendingBonusReward, showCompletionStage]);

  useEffect(() => {
    if (!autoClaimedOnLoadRef.current && hasPendingInit && notInSessionInit) {
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

  useEffect(() => {
    if (!showCompletionStage) {
      setMerging(false);
      setShowCareButton(false);
      setCareClicked(false);
      return;
    }
    const t1 = setTimeout(() => setMerging(true), 2200);
    const t2 = setTimeout(() => setShowCareButton(true), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [showCompletionStage]);

  const { balances, game } = state;
  const totalBalance = balances.balance;

  const apples = totalApples;
  const pluralApples = () => "ябл";

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

  // Check for claimable achievements (show fire dot on Medal button)
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
  const nextTime = getNextSessionTime(game.lastSessionTime);
  const msLeft = nextTime ? Math.max(0, nextTime - now) : null;

  const sessionMax = balances.balance * 0.15 / 365 / 3;
  const actionsLeft = getSessionActionsLeft(game);

  // Compute stored sessions dynamically (missed sessions accumulate until played)
  // When lastSessionTime is null (never played) fall back to startDate — mirrors server logic.
  const computedMissed = (() => {
    if (game.sessionInProgress) return game.missedSessions ?? 0;
    const referenceTime = game.lastSessionTime ?? balances.startDate ?? null;
    if (!referenceTime) return game.missedSessions ?? 0;
    const elapsed = now - referenceTime;
    const additionalMissed = Math.max(0, Math.floor(elapsed / SESSION_COOLDOWN_MS) - 1);
    return (game.missedSessions ?? 0) + additionalMissed;
  })();
  const storedSessions = 1 + computedMissed;
  const pendingStoredSessions = game.pendingStoredSessions ?? 1;

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
    setShowRewards(true);
    // Save only red apples (coin excluded from lifetime counter)
    void handleClaimAll(appleCountRef.current - 1);
    // Hide overlay only when all apples are collected
    const allCollected = collectedAppleIndicesRef.current.length >= appleCountRef.current;
    if (allCollected) {
      setTimeout(() => {
        setShowApples(false);
        collectedAppleIndicesRef.current = [];
        setCollectedAppleIndices([]);
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
          }, 320);
        } else {
          setShowApples(false);
          collectedAppleIndicesRef.current = [];
          setCollectedAppleIndices([]);
        }
      }, 60000);
    }
  }

  function handleAppleClick(appleIdx: number) {
    if (collectedAppleIndicesRef.current.includes(appleIdx)) return;
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
        }, 600);
      }
    }
  }

  function addTreeGrowthMm(mm: number) {
    const currentMM = game.treeGrowthMM ?? 0;
    const newMM = currentMM + mm;
    onStateChange({ ...state, game: { ...game, treeGrowthMM: newMM } });
    animateGrowth(displayGrowthMMRef.current, newMM);
  }

  async function handleStartSession(openMinigame?: "water" | "sun" | "fertilizer") {
    if (locked || game.sessionInProgress || actionLoading) return;
    console.log("[Session] Start button clicked, locked:", locked, "inProgress:", game.sessionInProgress);
    setActionLoading(true);
    try {
      await api.startSession();
      console.log("[Session] Started successfully");
      // reset per-session scores and result display
      waterScoreRef.current = 40;
      sunScoreRef.current = 40;
      fertilizerScoreRef.current = 40;
      skillScoreRef.current = 40;
      setWaterResultPct(null);
      setLightResultPct(null);
      setFertilizerResultPct(null);
      setShowCompletionStage(false);
      setShowRewards(false);
      setShowActivityGhost(false);
      setFadeActivities(false);
      if (growthIntervalRef.current) { clearInterval(growthIntervalRef.current); growthIntervalRef.current = null; }
      growthTimeoutsRef.current.forEach(clearTimeout);
      growthTimeoutsRef.current = [];
      setShowGrowthAnim(false);
      setGrowthCountdown(null);
      setShowApples(false);
      collectedAppleIndicesRef.current = [];
      setCollectedAppleIndices([]);
      if (appleAutoCollectTimerRef.current) {
        clearTimeout(appleAutoCollectTimerRef.current);
        appleAutoCollectTimerRef.current = null;
      }
      onStateChange({
        ...state,
        game: { ...game, sessionInProgress: true, water: false, sun: false, fertilizer: false },
      });
      if (openMinigame) setActiveMinigame(openMinigame);
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

  function handleGoToRewards() {
    const px = pendingXpRef.current;
    pendingXpRef.current = null;
    const scores = sessionScores;

    // Step 1 — immediately freeze care button, show XP popup, apply XP
    setCareClicked(true);
    if (scores && scores.xp > 0) setShowXpPopup(true);
    const xpTimer = setTimeout(() => {
      if (px) {
        const cur = stateRef.current;
        onStateChange({
          ...cur,
          game: {
            ...cur.game,
            playerXP: (cur.game.playerXP ?? 0) + px.xpGained,
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
          onStateChange({
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

  function handleMinigameComplete(type: GameType, skillScore: number) {
    setActiveMinigame(null);
    const safe = typeof skillScore === "number" && !isNaN(skillScore) ? skillScore : 40;
    if (type === "water")      waterScoreRef.current = safe;
    if (type === "sun")        sunScoreRef.current = safe;
    if (type === "fertilizer") fertilizerScoreRef.current = safe;
    const pct = Math.min(100, Math.max(0, Math.round((safe / 100) * 100)));
    if (type === "water")      setWaterResultPct(pct);
    if (type === "sun")        setLightResultPct(pct);
    if (type === "fertilizer") setFertilizerResultPct(pct);

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
    const rect = gameAreaRef.current?.getBoundingClientRect();
    const x = (rect?.width ?? 200) / 2;
    const y = (rect?.height ?? 200) / 2;
    doAction(type, x, y, safe);
  }

  async function handleDebugCompleteAll() {
    if (actionLoading) return;
    setActionLoading(true);
    if (!stateRef.current.game.sessionInProgress) {
      try {
        await api.startSession();
        onStateChange({
          ...stateRef.current,
          game: { ...stateRef.current.game, sessionInProgress: true, water: false, sun: false, fertilizer: false },
        });
      } catch {
        setActionLoading(false);
        return;
      }
    }
    waterScoreRef.current = 100;
    sunScoreRef.current = 100;
    fertilizerScoreRef.current = 100;
    skillScoreRef.current = 100;
    const rect = gameAreaRef.current?.getBoundingClientRect();
    const x = (rect?.width ?? 200) / 2;
    const y = (rect?.height ?? 200) / 2;
    const labels: Record<string, string> = { water: "💧", sun: "☀️", fertilizer: "🌱" };
    let trackedGame = { ...stateRef.current.game };
    try {
      const toComplete = (["water", "sun", "fertilizer"] as const).filter(a => !trackedGame[a]);
      for (const action of toComplete) {
        const result = await api.doAction(action, 100);
        addFloater(labels[action], x, y);
        animParticlesRef.current = [14, 22, 31, 40, 50, 60, 69, 78];
        setActiveAnim(action);
        void treeControls.start({
          filter: ["brightness(1)", "brightness(1.35)", "brightness(1)"],
          scale: [1, 1.04, 1],
          transition: { duration: 0.38, ease: "easeInOut" },
        });
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => setActiveAnim(null), 2800);
        const cur = stateRef.current;
        trackedGame = { ...trackedGame, [action]: true };
        onStateChange({ ...cur, game: trackedGame });
        if (!result.sessionComplete) {
          await new Promise(r => setTimeout(r, 620));
        }
        if (result.sessionComplete) {
          const finishedTime = Date.now();
          trackedGame = {
            ...trackedGame,
            water: true, sun: true, fertilizer: true,
            sessionInProgress: false,
            lastSessionTime: finishedTime,
            missedSessions: 0,
            pendingBaseReward: (cur.game.pendingBaseReward ?? 0) + (result.baseReward ?? 0),
            pendingBonusReward: (cur.game.pendingBonusReward ?? 0) + (result.bonusReward ?? 0),
            pendingStoredSessions: result.storedSessions ?? 1,
          };
          setWaterResultPct(100);
          setLightResultPct(100);
          setFertilizerResultPct(100);
          checkPendingAchievements();
          const totalReward = (result.baseReward ?? 0) + (result.bonusReward ?? 0);
          const { newMM: mmAfter, newRemainder: remAfter } = applyTreeGrowth(
            totalReward, cur.game.treeGrowthMM ?? 0, cur.game.treeGrowthRemainder ?? 0
          );
          const mmGained = mmAfter - (cur.game.treeGrowthMM ?? 0);
          setSessionScores({ water: 100, sun: 100, fert: 100, xp: result.xpGained ?? 0, base: result.baseReward ?? 0, bonus: result.bonusReward ?? 0, mm: mmGained });
          pendingXpRef.current = {
            xpGained: result.xpGained ?? 0,
            newLevel: result.newLevel,
            xpHistory: result.xpHistory,
            levelUp: result.levelUp,
            newMM: mmAfter,
            newRemainder: remAfter,
          };
          setShowCompletionStage(true);
          onStateChange({ ...cur, game: trackedGame });
        }
      }
    } catch (err) {
      console.error("[Debug] Complete all failed:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAction(action: "water" | "sun" | "fertilizer", e: React.MouseEvent) {
    if (game[action] || actionLoading) return;
    const rect = gameAreaRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);
    const y = e.clientY - (rect?.top ?? 0);
    doAction(action, x, y);
  }

  async function doAction(action: "water" | "sun" | "fertilizer", x: number, y: number, scoreOverride?: number) {
    if (game[action] || actionLoading) return;

    setActionLoading(true);
    try {
      const result = await api.doAction(action, scoreOverride ?? skillScoreRef.current);
      const labels: Record<string, string> = { water: "💧", sun: "☀️", fertilizer: "🌱" };
      addFloater(labels[action], x, y);

      let nextGame = { ...game, [action]: true };

      if (result.sessionComplete) {
        const finishedTime = Date.now();
        nextGame = {
          ...nextGame,
          water: true, sun: true, fertilizer: true,
          sessionInProgress: false,
          lastSessionTime: finishedTime,
          missedSessions: 0,
          pendingBaseReward: (game.pendingBaseReward ?? 0) + (result.baseReward ?? 0),
          pendingBonusReward: (game.pendingBonusReward ?? 0) + (result.bonusReward ?? 0),
          pendingStoredSessions: result.storedSessions ?? 1,
          // XP/level applied later in handleGoToRewards
        };
        console.log(`[Session complete] base=${result.baseReward} bonus=${result.bonusReward} xp=+${result.xpGained} level=${result.newLevel}`);
        const wPct = Math.round((waterScoreRef.current / 100) * 100);
        const sPct = Math.round((sunScoreRef.current / 100) * 100);
        const fPct = Math.round((fertilizerScoreRef.current / 100) * 100);
        const totalReward = (result.baseReward ?? 0) + (result.bonusReward ?? 0);
        const { newMM: mmAfter, newRemainder: remAfter } = applyTreeGrowth(totalReward, game.treeGrowthMM ?? 0, game.treeGrowthRemainder ?? 0);
        const mmGained = mmAfter - (game.treeGrowthMM ?? 0);
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
        setShowCompletionStage(true);
        onStateChange({ ...state, game: nextGame });
        checkPendingAchievements();
      } else {
        onStateChange({ ...state, game: nextGame });
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaimAll(applesCollected = 0) {
    if (claiming || (pendingBase <= 0 && pendingBonus <= 0)) return;
    setClaiming(true);
    try {
      const result = await api.claimAll(applesCollected);
      const total = result.totalAmount ?? 0;
      const cur = stateRef.current;
      const today = new Date().toLocaleDateString("ru-RU");
      const newHistory = [...cur.history];
      if ((result.baseAmount ?? 0) > 0)
        newHistory.push({ date: today, amount: result.baseAmount, type: "base" as const });
      if ((result.bonusAmount ?? 0) > 0)
        newHistory.push({ date: today, amount: result.bonusAmount, type: "bonus" as const });
      const curMM = stateRef.current.game.treeGrowthMM ?? 0;
      onStateChange({
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
        history: newHistory.slice(-30),
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

  const sessionHistory = (() => {
    const activeItems = [...state.history].reverse().filter(h => h.type === "base" || h.type === "bonus");
    const sessions: { date: string; base: number; bonus: number; total: number }[] = [];
    let i = 0;
    while (i < activeItems.length) {
      const item = activeItems[i];
      const next = activeItems[i + 1];
      if (next && next.type !== item.type) {
        sessions.push({
          date: item.date,
          base: item.type === "base" ? item.amount : next.amount,
          bonus: item.type === "bonus" ? item.amount : next.amount,
          total: item.amount + next.amount,
        });
        i += 2;
      } else {
        sessions.push({
          date: item.date,
          base: item.type === "base" ? item.amount : 0,
          bonus: item.type === "bonus" ? item.amount : 0,
          total: item.amount,
        });
        i += 1;
      }
    }
    return sessions;
  })();

  const avgPercent = sessionHistory.length > 0
    ? sessionHistory.reduce((sum, s) => sum + (s.base > 0 ? (s.total / s.base) * 12 : 12), 0) / sessionHistory.length
    : 0;

  return (
    <div className="game-page">
      {/* TOP BAR — 3 equal columns: Ресурсы / Уровень / Энергия */}
      <div className="game-top-bar">

        {/* Col 1: Ресурсы */}
        <div className="game-topbar-col">
          <div className="growth-label-wrap">
            <div className="progress-widget">
              {(() => {
                const splitVal = (s: string): [string, string] => {
                  const i = s.lastIndexOf(' ');
                  return i === -1 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
                };
                const rubNum = Math.floor(balances.balance).toLocaleString("ru-RU");
                const rubUnit = "₽";
                const [treeNum, treeUnit] = splitVal(formatTreeGrowth(displayGrowthMM));
                return <>
                  <div className="progress-row progress-row-deposit">
                    <span className="progress-row-icon"><Wallet size={13} strokeWidth={2.2} fill="currentColor" /></span>
                    <span className="progress-val-num">{rubNum}</span>
                    <span className="progress-val-unit">{rubUnit}</span>
                    <button className="growth-info-btn" onClick={() => setShowDepositInfo(true)}>?</button>
                  </div>
                  <div className="progress-row">
                    <span className="progress-row-icon"><TreePine size={16} strokeWidth={2.2} fill="currentColor" /></span>
                    <span className="progress-val-num">{treeNum}</span>
                    <span className="progress-val-unit">{treeUnit}</span>
                    <button className="growth-info-btn" onClick={() => setShowTreeInfo(true)}>?</button>
                  </div>
                  <div className="progress-row progress-row-apples">
                    <span className="progress-row-icon">
                      <svg width="15" height="17" viewBox="-1 -1 15 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6.5 4C6.5 4 7 2 9 1" />
                        <path d="M6.5 4.5C3.5 4.5 1 7 1 10C1 12.5 2.5 14 4.5 14C5.5 14 6 13.5 6.5 13.5C7 13.5 7.5 14 8.5 14C10.5 14 12 12.5 12 10C12 7 9.5 4.5 6.5 4.5Z" fill="currentColor" />
                      </svg>
                    </span>
                    <span className="progress-val-num">{apples}</span>
                    <span className="progress-val-unit">{pluralApples()}</span>
                    <button className="growth-info-btn growth-info-btn-plus">+</button>
                  </div>
                </>;
              })()}
            </div>
          </div>
          <AnimatePresence>
            {showMmPopup && sessionScores && sessionScores.mm > 0 && (
              <motion.div
                className="topbar-reward-popup topbar-reward-popup-mm"
                initial={{ opacity: 0, y: -6, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.7 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <motion.span
                  className="mm-popup-icon"
                  initial={{ scale: 0.5, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                >
                  <TreePine size={18} strokeWidth={2.2} fill="currentColor" />
                </motion.span>
                <span className="mm-popup-label">+{sessionScores.mm} мм</span>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showApplePopup && !showIncomePopup && (
              <motion.div
                className="topbar-reward-popup topbar-reward-popup-apple"
                initial={{ opacity: 0, y: -6, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.7 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <motion.span
                  className="apple-popup-icon"
                  initial={{ scale: 0.5, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                >
                  <svg width="18" height="20" viewBox="-1 -1 15 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6.5 4C6.5 4 7 2 9 1" />
                    <path d="M6.5 4.5C3.5 4.5 1 7 1 10C1 12.5 2.5 14 4.5 14C5.5 14 6 13.5 6.5 13.5C7 13.5 7.5 14 8.5 14C10.5 14 12 12.5 12 10C12 7 9.5 4.5 6.5 4.5Z" fill="currentColor" />
                  </svg>
                </motion.span>
                <span className="apple-popup-label">+{applePopupCount} ябл</span>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showIncomePopup && (
              <motion.div
                className="topbar-reward-popup topbar-reward-popup-income-wrap"
                initial={{ opacity: 0, y: -6, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.7 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <motion.span
                    className="income-popup-icon"
                    initial={{ scale: 0.5, rotate: 15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="16" height="11" rx="2" fill="currentColor" fillOpacity="0.15"/>
                      <path d="M2 8h16"/>
                      <circle cx="14.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
                    </svg>
                  </motion.span>
                  <span className="income-popup-label">+{Math.floor(lastIncomeAmount).toLocaleString("ru-RU")} ₽</span>
                </div>
                {showApplePopup && applePopupCount > 0 && (
                  <motion.div
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <motion.span
                      className="apple-popup-icon"
                      initial={{ scale: 0.5, rotate: -15 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                    >
                      <svg width="18" height="20" viewBox="-1 -1 15 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6.5 4C6.5 4 7 2 9 1" />
                        <path d="M6.5 4.5C3.5 4.5 1 7 1 10C1 12.5 2.5 14 4.5 14C5.5 14 6 13.5 6.5 13.5C7 13.5 7.5 14 8.5 14C10.5 14 12 12.5 12 10C12 7 9.5 4.5 6.5 4.5Z" fill="currentColor" />
                      </svg>
                    </motion.span>
                    <span className="apple-popup-label">+{applePopupCount} ябл</span>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Col 2: Уровень */}
        <div className="game-topbar-col">
          <div className="game-left-widgets">
            <LevelWidget level={game.playerLevel ?? 1} totalXP={game.playerXP ?? 0} xpGain={xpGainAmount} onClick={() => setShowLevelModal(true)} />
          </div>
          <AnimatePresence>
            {showXpPopup && sessionScores && (
              <motion.div
                className="topbar-reward-popup topbar-reward-popup-xp"
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
                <span className="xp-popup-label">+{sessionScores.xp} оп</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Col 3: Энергия */}
        <div className="game-topbar-col">
          <div className="game-top-controls">
            <div ref={settingsRef} className="game-gear-wrap">
              <button className="game-gear-btn" onClick={() => setShowSettings(s => !s)} title="Настройки">
                <Settings size={14} />
              </button>
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, x: 6, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: "absolute", right: "calc(100% + 4px)", top: 0, zIndex: 100 }}
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
          <div className="game-session-status">
            <div className={`session-status-badge ${showCompletionStage && !showRewards ? "session-status-ready" : locked ? "session-status-locked" : "session-status-ready"}`}>
              {game.sessionInProgress || (showCompletionStage && !showRewards) ? "В процессе" : locked ? "Перезарядка" : "Готова"}
            </div>
            <div className="game-session-detail">
              {showCompletionStage && !showRewards ? (
                <span>Осталось: 0</span>
              ) : locked && msLeft !== null && msLeft > 0 ? (
                <div className="session-timer">
                  <Clock size={12} />
                  <span>{formatTimer(msLeft)}</span>
                </div>
              ) : !game.sessionInProgress ? (
                <span>
                  <span style={{ fontWeight: 700 }}>×{storedSessions}</span>
                  {' '}<span style={{ fontWeight: 700 }}>{
                    storedSessions % 100 >= 11 && storedSessions % 100 <= 19 ? "сессий"
                    : storedSessions % 10 === 1 ? "сессия"
                    : storedSessions % 10 >= 2 && storedSessions % 10 <= 4 ? "сессии"
                    : "сессий"
                  }</span>
                </span>
              ) : (
                <span>Осталось: {actionsLeft}</span>
              )}
            </div>
            {(() => {
              const charge = locked && msLeft !== null
                ? Math.max(0, Math.min(1, 1 - msLeft / SESSION_COOLDOWN_MS))
                : game.sessionInProgress ? 1 : 1;
              const fillW = Math.max(0, Math.round(34 * charge));
              const fillColor = "#888";
              return (
                <svg className="battery-svg" width="46" height="16" viewBox="0 0 46 16" fill="none">
                  <rect x="1" y="2" width="38" height="12" rx="2.5" fill="transparent" stroke="#111" strokeWidth="1.5"/>
                  <rect x="40" y="6" width="4" height="4" rx="1" fill="#111"/>
                  {fillW > 0 && (
                    <rect x="3" y="4" width={fillW} height="8" rx="1.5" fill={fillColor}/>
                  )}
                </svg>
              );
            })()}
          </div>
        </div>
      </div>

      {/* PLAY FIELD — pure game area, bounded by top-bar and bottom-nav */}
      <div className="game-area" ref={gameAreaRef}>
        <span className="game-beta-floating">{APP_VERSION}</span>
        <GameAreaBg />

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
            <div className={`tree-wrapper${isTransitioning ? " transitioning" : ""}`}>
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
            </div>
          </motion.div>
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
                        onClick={() => handleAppleClick(i)}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0, transition: { duration: 0.25 } }}
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
            {growthCountdown !== null && (
              <motion.div
                className="growth-timer"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.3 }}
              >
                <div className="growth-timer-row">
                  <div
                    className="growth-timer-bar"
                    style={{ width: `${((growthTimerTotal - growthCountdown) / growthTimerTotal) * 100}%` }}
                  />
                  <span className="growth-timer-leaf"><TreePine size={13} /></span>
                  <span className="growth-timer-time">
                    {String(Math.floor(growthCountdown / 60)).padStart(2, '0')}:{String(growthCountdown % 60).padStart(2, '0')}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        <div className="session-actions-wrap">
        {!game.sessionInProgress && !showCompletionStage && !showRewards && !showActivityGhost ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={locked ? "cooldown" : "ready"}
              className="session-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`action-buttons-row${locked ? " activities-disabled" : ""}`}>
                {([
                  { key: "water", icon: <Droplets size={22} />, label: "Вода", color: "#3b82f6" },
                  { key: "sun",   icon: <Sun size={22} />,      label: "Свет", color: "#f59e0b" },
                  { key: "fertilizer", icon: <Leaf size={22} />, label: "Листики", color: "#22c55e" },
                ] as const).map(btn => (
                  <button
                    key={btn.key}
                    className="action-btn-bank"
                    style={locked ? undefined : { "--ac": btn.color } as React.CSSProperties}
                    onClick={locked ? undefined : () => handleStartSession(btn.key)}
                    disabled={locked || actionLoading}
                  >
                    <div className="action-btn-content">
                      {btn.icon}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <AnimatePresence mode="wait">
              {showActivityGhost ? (
                <motion.div
                  key="activity-ghost"
                  className="session-actions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="action-buttons-row activities-disabled">
                    {([
                      { key: "water",       icon: <Droplets size={22} />, iy: 66  },
                      { key: "sun",         icon: <Sun size={22} />,      iy: 0   },
                      { key: "fertilizer",  icon: <Leaf size={22} />,     iy: -66 },
                    ]).map((btn, i) => (
                      <motion.div
                        key={btn.key}
                        className="action-btn-bank"
                        initial={{ opacity: 0, y: btn.iy, scale: 0 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20, delay: i * 0.06 }}
                      >
                        <div className="action-btn-content">
                          {btn.icon}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ) : showCareButton && !showRewards ? (
                <motion.div
                  key="care-btn"
                  className="session-actions"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={{ type: "spring", stiffness: 340, damping: 22 }}
                >
                  <div className="action-buttons-row">
                    <div className="action-btn-bank" style={{ opacity: 0, pointerEvents: "none" }} />
                    <button
                      className={`care-btn${careClicked ? " care-btn-clicked" : ""}`}
                      onClick={careClicked ? undefined : handleGoToRewards}
                    >
                      {!careClicked && (() => {
                        const pts = [waterResultPct, lightResultPct, fertilizerResultPct];
                        const avg = Math.round(pts.reduce<number>((s, p) => s + (p ?? 0), 0) / 3);
                        return <div className="action-btn-fill" style={{ height: `${avg}%`, background: "#92400e" }} />;
                      })()}
                      <Shovel size={20} />
                    </button>
                    <div className="action-btn-bank" style={{ opacity: 0, pointerEvents: "none" }} />
                  </div>
                </motion.div>
              ) : showRewards ? null : (
                <motion.div
                  key="activity-btns"
                  className={`session-actions ${fadeActivities ? "activities-fade" : ""}${showCompletionStage && !merging ? " session-actions-ready" : ""}`}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="action-buttons-row">
                    {([
                      { key: "water" as const, icon: <Droplets size={22} />, label: "Вода", color: "#3b82f6", done: game.water, pct: waterResultPct },
                      { key: "sun" as const, icon: <Sun size={22} />, label: "Свет", color: "#f59e0b", done: game.sun, pct: lightResultPct },
                      { key: "fertilizer" as const, icon: <Leaf size={22} />, label: "Листики", color: "#22c55e", done: game.fertilizer, pct: fertilizerResultPct },
                    ] as const).map((btn, i) => {
                      const mergeY = [80, 0, -80][i];
                      return (
                        <motion.button
                          key={btn.key}
                          className={`action-btn-bank ${btn.done ? "action-btn-done" : ""}`}
                          style={{ "--ac": btn.color, ...(showCompletionStage ? { pointerEvents: "none" } : {}) } as React.CSSProperties}
                          onClick={!btn.done ? () => setActiveMinigame(btn.key) : undefined}
                          disabled={!!btn.done || actionLoading}
                          whileTap={!btn.done ? { scale: 0.91 } : {}}
                          animate={merging ? { y: mergeY, opacity: 0, scale: 0.1 } : { y: 0, opacity: 1, scale: 1 }}
                          transition={merging ? { duration: 0.45, ease: "easeInOut" } : { duration: 0.2 }}
                        >
                          {btn.done ? (
                            <>
                              {btn.pct !== null && (
                                <div className="action-btn-fill" style={{ height: `${btn.pct}%` }} />
                              )}
                              <div className="action-btn-top">
                                <CheckCircle2 size={20} />
                              </div>
                            </>
                          ) : (
                            <div className="action-btn-content">
                              {btn.icon}
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
        )}
        </div>

      </div>

      <div className="game-nav-h-divider" />
      <nav className="game-bottom-nav">
        <button className="game-bottom-nav-btn" onClick={() => setShowXpHistory(true)}>
          <Trophy size={18} strokeWidth={2.5} />
        </button>
        <div className="game-bottom-nav-divider" />
        <button className="game-bottom-nav-btn" onClick={() => setShowAchievements(true)}>
          <span className="ach-medal-btn">
            <Medal size={18} strokeWidth={2.5} />
            {hasPendingAchievements && <span className="ach-fire-dot">🔥</span>}
          </span>
        </button>
        <div className="game-bottom-nav-divider" />
        <button className="game-bottom-nav-btn" onClick={() => {}}>
          <ShoppingCart size={18} strokeWidth={2.5} fill="none" />
        </button>
      </nav>

      {false && showCompletionStage && !showRewards && (
        <button className="transition-btn" onClick={handleGoToRewards}>
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
                const sd = state.game.streakDays;
                const allMaxed = sd >= 5;
                const cycleDay = Math.min(sd, 4);
                const days = [
                  { label: "День 1", reward: "+1 сек" },
                  { label: "День 2", reward: "+2 сек" },
                  { label: "День 3", reward: "+3 сек" },
                  { label: "День 4", reward: "+4 сек" },
                  { label: "День 5", reward: "20 сек" },
                ];
                return (
                  <div className="streak-days-row">
                    {days.map((d, i) => {
                      const done = allMaxed || i < cycleDay;
                      const active = !allMaxed && i === cycleDay;
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
                {state.game.streakDays > 0
                  ? `Текущая серия: ${state.game.streakDays} ${state.game.streakDays === 1 ? "день" : state.game.streakDays < 5 ? "дня" : "дней"}`
                  : "Начните ухаживать сегодня!"}
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
          {activeMinigame === "sun" ? (
            <ClickGameSun
              onComplete={(score) => handleMinigameComplete("sun", score)}
              bonusSeconds={getStreakBonusSeconds(game.streakDays)}
            />
          ) : activeMinigame === "fertilizer" ? (
            <FertilizerMatchGame
              onComplete={(score) => handleMinigameComplete("fertilizer", score)}
              bonusSeconds={getStreakBonusSeconds(game.streakDays)}
            />
          ) : (
            <FallingGameWater
              type={activeMinigame}
              onComplete={(score) => handleMinigameComplete(activeMinigame, score)}
              bonusSeconds={getStreakBonusSeconds(game.streakDays)}
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
        {showAchievements && (
          <AchievementsModal
            onClose={() => { setShowAchievements(false); checkPendingAchievements(); }}
            onApplesClaimed={(newTotal) => { setTotalApples(newTotal); checkPendingAchievements(); }}
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
            onClick={() => setShowLevelModal(false)}
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
                <button className="help-modal-close" onClick={() => setShowLevelModal(false)}>✕</button>
              </div>
              {(() => {
                const prog = getLevelProgress(game.playerXP ?? 0);
                const pct = prog.isMax ? 100 : prog.xpNeeded ? Math.min(100, Math.round(prog.xpInLevel / prog.xpNeeded * 100)) : 100;
                return (
                  <div className="xp-level-progress xp-level-progress-only">
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

              <p className="tree-stage-hint">1 мм роста = 1 ₽ дохода</p>
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
              className="help-modal"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="help-modal-header">
                <h3 className="help-modal-title">История начислений</h3>
                <button className="help-modal-close" onClick={() => setShowDepositInfo(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="deposit-modal-summary">
                <div className="deposit-modal-row">
                  <span className="deposit-modal-label">Счёт</span>
                  <span className="deposit-modal-value">{formatRub(balances.balance)}</span>
                </div>
                <div className="deposit-modal-row">
                  <span className="deposit-modal-label">Заработано всего</span>
                  <span className="deposit-modal-value deposit-modal-earned">+{formatRub(balances.earned)}</span>
                </div>
              </div>

              {sessionHistory.length === 0 ? (
                <p className="history-empty" style={{ padding: "16px 0 8px" }}>Начисления появятся после первой сессии</p>
              ) : (
                <div className="deposit-modal-history">
                  {sessionHistory.map((s, idx) => {
                    const pct = s.base > 0 ? (s.total / s.base) * 12 : 12;
                    return (
                      <div key={idx} className="session-item">
                        <p className="session-title">{s.date}</p>
                        {s.base > 0 && (
                          <div className="session-row">
                            <span>База</span>
                            <span>+{formatRub(s.base)}</span>
                          </div>
                        )}
                        {s.bonus > 0 && (
                          <div className="session-row session-row-bonus">
                            <span>Бонус</span>
                            <span>+{formatRub(s.bonus)}</span>
                          </div>
                        )}
                        <div className="session-total">
                          <span>Итого</span>
                          <span>+{formatRub(s.total)} · {formatPercent(pct)} год.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <DebugPanel
        state={state}
        onStateChange={onStateChange}
        onResetAccount={onResetAccount ?? (() => {})}
        onSignOut={logout}
        onCompleteAll={handleDebugCompleteAll}
        onDebugSessionAdded={() => {
          setShowCompletionStage(false);
          setShowRewards(false);
          setShowActivityGhost(false);
          setFadeActivities(false);
          setCareClicked(false);
          setShowApples(false);
          collectedAppleIndicesRef.current = [];
          setCollectedAppleIndices([]);
          if (appleAutoCollectTimerRef.current) {
            clearTimeout(appleAutoCollectTimerRef.current);
            appleAutoCollectTimerRef.current = null;
          }
        }}
        onAddStreakDay={async () => {
          try {
            const res = await api.debugAddStreakDay();
            onStateChange({
              ...state,
              game: { ...state.game, streakDays: res.streakDays },
            });
            setShowStreakWidget(true);
          } catch (e) {
            console.warn("[Debug] add-streak-day failed", e);
          }
        }}
      />
    </div>
  );
}
