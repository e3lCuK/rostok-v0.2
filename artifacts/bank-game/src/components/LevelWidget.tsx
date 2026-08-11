import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";

interface Props {
  totalXP: number;
  level: number;
  xpGain?: number | null;
  /** Claimable achievements — green dot on the diamond. */
  pendingAchievements?: boolean;
  onClick?: () => void;
}

/** Leaf-edge ink — same outline family as tree / flask rim weight. */
const COLOR = "#2f5c0e";
const SW = 1.05;
/** Cream shell — matches activity buttons / field captions. */
const SHELL = "rgba(255, 248, 236, 0.92)";
/** Light wash under rim (timer / activity contrast). */
const FILL_WASH = "rgba(134, 239, 172, 0.42)";

const TOP:   [number, number] = [30,  5];
const RIGHT: [number, number] = [55, 30];
const LEFT:  [number, number] = [ 5, 30];
const GAP_R: [number, number] = [36, 49];
const GAP_L: [number, number] = [24, 49];

// Ромб: от y=5 (вершина) до y=49 (нижний зазор), высота=44
const DIAMOND_TOP_Y = 5;
const DIAMOND_BOT_Y = 49;
const DIAMOND_H = DIAMOND_BOT_Y - DIAMOND_TOP_Y; // 44

const XP_THRESHOLDS = [0, 300, 1000, 2500, 5000];

function getLevelProgress(totalXP: number, level: number): number {
  if (level >= 5) return 1;
  const start = XP_THRESHOLDS[level - 1] ?? 0;
  const end   = XP_THRESHOLDS[level]     ?? 5000;
  return Math.min(1, Math.max(0, (totalXP - start) / (end - start)));
}

function pt(p: [number, number]) { return p.join(","); }

export default function LevelWidget({
  totalXP,
  level,
  xpGain,
  pendingAchievements = false,
  onClick,
}: Props) {
  const [showGain, setShowGain] = useState(false);
  const [gainVal, setGainVal] = useState(0);

  const progress = getLevelProgress(totalXP, level);
  const fillH = progress * DIAMOND_H;
  const fillY = DIAMOND_BOT_Y - fillH;

  const springY = useSpring(useMotionValue(fillY), { stiffness: 60, damping: 18 });
  const springH = useSpring(useMotionValue(fillH), { stiffness: 60, damping: 18 });

  useEffect(() => {
    springY.set(fillY);
    springH.set(fillH);
  }, [fillY, fillH, springY, springH]);

  useEffect(() => {
    if (xpGain != null && xpGain > 0) {
      setGainVal(xpGain);
      setShowGain(true);
      const t = setTimeout(() => setShowGain(false), 1400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [xpGain]);

  return (
    <div className="lvl-badge-wrap" data-level-widget="true" onClick={onClick}>
      {pendingAchievements ? (
        <span className="ach-fire-dot lvl-badge-ach-dot" aria-hidden="true" />
      ) : null}
      <motion.div
        className="lvl-badge"
        animate={showGain ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <svg width="72" height="77" viewBox="0 0 60 64" fill="none">
          <defs>
            <clipPath id="diamond-clip">
              <polygon points={`${pt(TOP)} ${pt(RIGHT)} ${pt(GAP_R)} ${pt(GAP_L)} ${pt(LEFT)}`} />
            </clipPath>
          </defs>

          {/* Cream shell */}
          <polygon
            points={`${pt(TOP)} ${pt(RIGHT)} ${pt(GAP_R)} ${pt(GAP_L)} ${pt(LEFT)}`}
            fill={SHELL}
          />

          {/* Progress wash — bottom → top */}
          <motion.rect
            x="0" width="60"
            y={springY}
            height={springH}
            fill={FILL_WASH}
            clipPath="url(#diamond-clip)"
          />

          {/* Thin flask-style rim */}
          <polyline
            points={`${pt(GAP_R)} ${pt(RIGHT)} ${pt(TOP)} ${pt(LEFT)} ${pt(GAP_L)}`}
            stroke={COLOR}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Level digit */}
          <text
            x="30" y="30"
            textAnchor="middle" dominantBaseline="central"
            fontSize="20" fontWeight="900"
            fill={COLOR}
            style={{ fontFamily: "inherit" }}
          >
            {level}
          </text>

          {/* УРОВЕНЬ */}
          <text
            x="30" y="57"
            textAnchor="middle" dominantBaseline="central"
            fontSize="8" fontWeight="700"
            fill={COLOR}
            letterSpacing="1.8"
            style={{ fontFamily: "inherit" }}
          >
            УРОВЕНЬ
          </text>
        </svg>
      </motion.div>

      <AnimatePresence>
        {showGain && (
          <motion.div
            key={gainVal}
            className="lvl-gain-popup"
            initial={{ opacity: 1, y: 0, x: "-50%" }}
            animate={{ opacity: 0, y: -26, x: "-50%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            +{gainVal} оп.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
