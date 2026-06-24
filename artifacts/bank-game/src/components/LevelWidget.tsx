import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  totalXP: number;
  level: number;
  xpGain?: number | null;
  onClick?: () => void;
}

const COLOR = "#4d7c0f";
const SW = 2;

// Diamond: cx=32, cy=22, r=18 — leaves gap at bottom for label
const TOP:   [number, number] = [32,  4];
const RIGHT: [number, number] = [50, 22];
const LEFT:  [number, number] = [14, 22];
// Gap endpoints (bottom sides stop ~10px before meeting at bottom point 32,40)
const GAP_D = 10 / Math.SQRT2; // ≈7.07
const GAP_R: [number, number] = [32 + GAP_D, 40 - GAP_D]; // right side ends here
const GAP_L: [number, number] = [32 - GAP_D, 40 - GAP_D]; // left side ends here

function pt(p: [number, number]) { return p.join(","); }

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
              scale: [1, 1.15, 1],
              filter: [
                "drop-shadow(0 0 3px rgba(77,124,15,0.3))",
                "drop-shadow(0 0 10px rgba(77,124,15,0.75))",
                "drop-shadow(0 0 3px rgba(77,124,15,0.3))",
              ],
            }
          : { scale: 1, filter: "drop-shadow(0 0 3px rgba(77,124,15,0.28))" }
        }
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <svg width="64" height="56" viewBox="0 0 64 56" fill="none">
          {/* Open diamond frame: right-gap → right → top → left → left-gap */}
          <polyline
            points={`${pt(GAP_R)} ${pt(RIGHT)} ${pt(TOP)} ${pt(LEFT)} ${pt(GAP_L)}`}
            stroke={COLOR} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
          />
          {/* Level number centered in diamond */}
          <text
            x="32" y="23"
            textAnchor="middle" dominantBaseline="central"
            fontSize="20" fontWeight="900"
            fill={COLOR}
            style={{ fontFamily: "inherit" }}
          >
            {level}
          </text>
          {/* УРОВЕНЬ label — sits in the gap at bottom */}
          <text
            x="32" y="47"
            textAnchor="middle" dominantBaseline="central"
            fontSize="6" fontWeight="700"
            fill={COLOR}
            letterSpacing="1.5"
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
