import { useState } from "react";
import { motion } from "framer-motion";
import { X, Bell } from "lucide-react";
import { api } from "@/lib/api";

const DAILY_REWARDS = [
  { day: 1, xp: 10,  emoji: "🌱" },
  { day: 2, xp: 20,  emoji: "💧" },
  { day: 3, xp: 35,  emoji: "☀️" },
  { day: 4, xp: 50,  emoji: "🌿" },
  { day: 5, xp: 75,  emoji: "🌳" },
  { day: 6, xp: 100, emoji: "⭐" },
  { day: 7, xp: 200, emoji: "🎯" },
];

interface Props {
  status: { claimedToday: boolean; streak: number; dayIndex: number } | null;
  onClose: () => void;
  onClaim: (xpGained: number) => void;
}

export default function DailyRewardModal({ status, onClose, onClaim }: Props) {
  const [claiming, setClaiming] = useState(false);
  const [claimDone, setClaimDone] = useState(false);
  const [claimedXp, setClaimedXp] = useState(0);
  const [localStatus, setLocalStatus] = useState(status);

  const dayIndex = localStatus?.dayIndex ?? 0;
  const claimedToday = localStatus?.claimedToday ?? false;

  async function handleClaim() {
    if (claiming || claimedToday || claimDone) return;
    setClaiming(true);
    try {
      const result = await api.claimDailyReward();
      setClaimedXp(result.xpGained);
      setClaimDone(true);
      setLocalStatus({ claimedToday: true, streak: result.newStreak, dayIndex: result.dayIndex });
      onClaim(result.xpGained);
    } catch {}
    finally { setClaiming(false); }
  }

  const isDone = claimDone || claimedToday;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="daily-reward-modal"
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button className="daily-reward-close" onClick={onClose}><X size={13} /></button>
        <div className="daily-reward-header">
          <Bell size={14} />
          <span>Ежедневные награды</span>
        </div>

        <div className="daily-reward-grid">
          {DAILY_REWARDS.map((r, i) => {
            const isClaimed = isDone ? i <= dayIndex : i < dayIndex;
            const isCurrent = !isDone && i === dayIndex;
            const isFuture = isDone ? i > dayIndex : i > dayIndex;
            return (
              <div
                key={r.day}
                className={`daily-reward-day${isClaimed ? " day-claimed" : ""}${isCurrent ? " day-current" : ""}${isFuture ? " day-future" : ""}`}
              >
                <span className="day-num">День {r.day}</span>
                <span className="day-emoji">{r.emoji}</span>
                <span className="day-xp">+{r.xp} оп.</span>
                {isClaimed && <span className="day-check">✓</span>}
              </div>
            );
          })}
        </div>

        {claimDone ? (
          <div className="daily-reward-msg daily-reward-msg-ok">+{claimedXp} опыта получено! 🎉</div>
        ) : claimedToday ? (
          <div className="daily-reward-msg">Уже получено. Возвращайтесь завтра!</div>
        ) : (
          <button className="daily-reward-claim-btn" onClick={handleClaim} disabled={claiming}>
            {claiming ? "…" : `Забрать +${DAILY_REWARDS[dayIndex].xp} оп.`}
          </button>
        )}
      </motion.div>
    </div>
  );
}
