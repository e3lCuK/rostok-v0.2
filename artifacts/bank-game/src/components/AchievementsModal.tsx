import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  onClose: () => void;
  onApplesClaimed: (newTotal: number) => void;
}

type Counts = {
  total_sessions: number;
  total_login_days: number;
  total_water_drops: number;
  total_sun_catches: number;
  total_leaf_picks: number;
};

interface AchievementDef {
  id: string;
  label: string;
  icon: string;
  family: "sessions" | "days" | "water" | "sun" | "leaf";
  tier: 1 | 2 | 3;
  threshold: number;
  reward: number;
  countKey: keyof Counts;
  prevId: string | null;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Tier 1 — 1 яблоко
  { id: "sessions_1",  label: "Завершил 3 сессии",    icon: "⚡", family: "sessions", tier: 1, threshold: 3,     reward: 1,   countKey: "total_sessions",    prevId: null },
  { id: "days_1",      label: "Зашёл в игру 3 дня",   icon: "🎯", family: "days",     tier: 1, threshold: 3,     reward: 1,   countKey: "total_login_days",  prevId: null },
  { id: "water_100",   label: "Собрал 100 капель",     icon: "💧", family: "water",    tier: 1, threshold: 100,   reward: 1,   countKey: "total_water_drops", prevId: null },
  { id: "sun_100",     label: "Поймал 100 солнышек",   icon: "☀️", family: "sun",      tier: 1, threshold: 100,   reward: 1,   countKey: "total_sun_catches", prevId: null },
  { id: "leaf_100",    label: "Собрал 100 листиков",   icon: "🍃", family: "leaf",     tier: 1, threshold: 100,   reward: 1,   countKey: "total_leaf_picks",  prevId: null },
  // Tier 2 — 30 яблок
  { id: "sessions_10", label: "Завершил 10 сессий",   icon: "⚡", family: "sessions", tier: 2, threshold: 10,    reward: 30,  countKey: "total_sessions",    prevId: "sessions_1" },
  { id: "days_10",     label: "Зашёл в игру 10 дней", icon: "🎯", family: "days",     tier: 2, threshold: 10,    reward: 30,  countKey: "total_login_days",  prevId: "days_1" },
  { id: "water_1000",  label: "Собрал 1 000 капель",    icon: "💧", family: "water",    tier: 2, threshold: 1000,  reward: 30,  countKey: "total_water_drops", prevId: "water_100" },
  { id: "sun_1000",    label: "Поймал 1 000 солнышек",  icon: "☀️", family: "sun",      tier: 2, threshold: 1000,  reward: 30,  countKey: "total_sun_catches", prevId: "sun_100" },
  { id: "leaf_1000",   label: "Собрал 1 000 листиков",  icon: "🍃", family: "leaf",     tier: 2, threshold: 1000,  reward: 30,  countKey: "total_leaf_picks",  prevId: "leaf_100" },
  // Tier 3 — 100 яблок
  { id: "sessions_100",label: "Завершил 100 сессий",  icon: "⚡", family: "sessions", tier: 3, threshold: 100,   reward: 100, countKey: "total_sessions",    prevId: "sessions_10" },
  { id: "days_100",    label: "Зашёл в игру 100 дней",icon: "🎯", family: "days",     tier: 3, threshold: 100,   reward: 100, countKey: "total_login_days",  prevId: "days_10" },
  { id: "water_10000", label: "Собрал 10 000 капель",   icon: "💧", family: "water",    tier: 3, threshold: 10000, reward: 100, countKey: "total_water_drops", prevId: "water_1000" },
  { id: "sun_10000",   label: "Поймал 10 000 солнышек", icon: "☀️", family: "sun",      tier: 3, threshold: 10000, reward: 100, countKey: "total_sun_catches", prevId: "sun_1000" },
  { id: "leaf_10000",  label: "Собрал 10 000 листиков", icon: "🍃", family: "leaf",     tier: 3, threshold: 10000, reward: 100, countKey: "total_leaf_picks",  prevId: "leaf_1000" },
];

const TIER_LABELS: Record<number, string> = { 1: "Простые", 2: "Средние", 3: "Сложные" };

export default function AchievementsModal({ onClose, onApplesClaimed }: Props) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [totalApples, setTotalApples] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    api.getAchievements()
      .then(data => {
        setCounts(data.counts as Counts);
        setClaimed(data.claimed);
        setTotalApples(data.totalApples);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleClaim(id: string) {
    if (claiming) return;
    setClaiming(id);
    try {
      const res = await api.claimAchievement(id);
      setClaimed(prev => [...prev, id]);
      setTotalApples(res.totalApples);
      onApplesClaimed(res.totalApples);
    } catch {}
    setClaiming(null);
  }

  function getProgress(a: AchievementDef): { pct: number; frozen: boolean; done: boolean } {
    const isClaimed = claimed.includes(a.id);
    if (isClaimed) return { pct: 100, frozen: false, done: true };

    const prevClaimed = a.prevId === null || claimed.includes(a.prevId);
    if (!prevClaimed) return { pct: 0, frozen: true, done: false };

    const val = counts ? counts[a.countKey] : 0;
    const pct = Math.min(100, Math.round((val / a.threshold) * 100));
    return { pct, frozen: false, done: false };
  }

  const tiers: (1 | 2 | 3)[] = [1, 2, 3];

  return (
    <motion.div
      className="help-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="help-modal ach-modal"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="help-modal-header">
          <h3 className="help-modal-title">🏅 Достижения</h3>
          <button className="help-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="ach-apples-row">
          <span className="ach-apples-icon">🍎</span>
          <span className="ach-apples-count">{loading ? "…" : totalApples}</span>
          <span className="ach-apples-label">яблок всего</span>
        </div>

        {loading ? (
          <p className="xp-history-empty">Загрузка…</p>
        ) : (
          <div className="ach-tiers">
            {tiers.map(tier => (
              <div key={tier} className="ach-tier-group">
                <div className="ach-tier-header">
                  <span className="ach-tier-label">{TIER_LABELS[tier]}</span>
                  <span className="ach-tier-reward">+{tier === 1 ? 1 : tier === 2 ? 30 : 100} 🍎</span>
                </div>
                <div className="ach-list">
                  {ACHIEVEMENTS.filter(a => a.tier === tier).map(a => {
                    const { pct, frozen, done } = getProgress(a);
                    const val = counts ? counts[a.countKey] : 0;
                    const canClaim = !done && !frozen && pct >= 100;
                    return (
                      <div key={a.id} className={`ach-item${done ? " ach-item-done" : frozen ? " ach-item-frozen" : ""}`}>
                        <div className="ach-item-top">
                          <span className="ach-item-icon">{a.icon}</span>
                          <span className="ach-item-label">{a.label}</span>
                          {done ? (
                            <span className="ach-item-check">✓</span>
                          ) : canClaim ? (
                            <button
                              className="ach-claim-btn"
                              onClick={() => handleClaim(a.id)}
                              disabled={claiming === a.id}
                            >
                              {claiming === a.id ? "…" : `+${a.reward} 🍎`}
                            </button>
                          ) : frozen ? (
                            <span className="ach-item-lock">🔒</span>
                          ) : null}
                        </div>
                        <div className="ach-bar-track">
                          {frozen ? (
                            <div className="ach-bar-frozen" />
                          ) : (
                            <div
                              className={`ach-bar-fill${done ? " ach-bar-done" : ""}`}
                              style={{ width: `${done ? 100 : pct}%` }}
                            />
                          )}
                        </div>
                        {!done && !frozen && (
                          <div className="ach-bar-count">{val.toLocaleString("ru-RU")} / {a.threshold.toLocaleString("ru-RU")}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
