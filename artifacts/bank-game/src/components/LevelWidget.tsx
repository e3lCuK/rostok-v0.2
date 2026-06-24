import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  totalXP: number;
  level: number;
  xpGain?: number | null;
  onClick?: () => void;
}

function LeafSvg({ flip, flipY }: { flip?: boolean; flipY?: boolean }) {
  return (
    <svg
      width="9" height="11" viewBox="0 0 9 11" fill="none"
      style={{ transform: `${flip ? "scaleX(-1)" : ""} ${flipY ? "scaleY(-1)" : ""}` }}
    >
      <path
        d="M4.5 1C4.5 1 1 3.2 1 6C1 8 2.5 9.5 4.5 9.5C6.5 9.5 8 8 8 6C8 3.2 4.5 1 4.5 1Z"
        fill="#4ade80" opacity="0.75"
      />
      <line x1="4.5" y1="9.5" x2="4.5" y2="4" stroke="#22c55e" strokeWidth="0.9" strokeLinecap="round"/>
    </svg>
  );
}

export default function LevelWidget({ level, xpGain, onClick }: Props) {
  const [showGain, setShowGain] = useState(false);
  const [gainVal, setGainVal] = useState(0);

  useEffect(() => {
    if (xpGain) {
      setGainVal(xpGain);
      setShowGain(true);
      const t = setTimeout(() => setShowGain(false), 1400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [xpGain]);

  return (
    <div className="lvl-badge-wrap" onClick={onClick}>
      <motion.div
        className="lvl-badge"
        animate={showGain
          ? {
              scale: [1, 1.18, 1],
              filter: [
                "drop-shadow(0 0 4px rgba(74,222,128,0.4))",
                "drop-shadow(0 0 14px rgba(74,222,128,0.9))",
                "drop-shadow(0 0 4px rgba(74,222,128,0.4))",
              ],
            }
          : {
              scale: 1,
              filter: "drop-shadow(0 0 4px rgba(74,222,128,0.38))",
            }
        }
        transition={{ duration: 0.75, ease: "easeOut" }}
      >
        <div className="lvl-leaves-top">
          <LeafSvg />
          <LeafSvg flip />
        </div>

        <div className="lvl-diamond">
          <div className="lvl-content">
            <span className="lvl-number">{level}</span>
            <span className="lvl-label">УРОВЕНЬ</span>
          </div>
        </div>

        <div className="lvl-leaves-bottom">
          <LeafSvg flipY />
          <LeafSvg flip flipY />
        </div>
      </motion.div>

      <AnimatePresence>
        {showGain && (
          <motion.div
            key={gainVal}
            className="lvl-gain-popup"
            initial={{ opacity: 1, y: 0, x: "-50%" }}
            animate={{ opacity: 0, y: -28, x: "-50%" }}
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
