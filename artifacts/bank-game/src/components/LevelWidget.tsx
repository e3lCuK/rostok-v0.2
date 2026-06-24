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

// Square diamond: cx=30, cy=30, r=26 (equal diagonals → true rhombus)
// SVG 60×72: diamond 4..56 vertically, label at y=65
const TOP:   [number, number] = [30,  4];
const RIGHT: [number, number] = [56, 30];
const LEFT:  [number, number] = [4,  30];
// Bottom=(30,56). Gap ~12px before bottom along 45° sides.
const GAP_R: [number, number] = [38, 48]; // right-bottom side stops here
const GAP_L: [number, number] = [22, 48]; // left-bottom side stops here

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
              scale: [1, 1.12, 1],
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
        <svg width="60" height="72" viewBox="0 0 60 72" fill="none">
          {/* Open diamond frame: right-gap → right → top → left → left-gap */}
          <polyline
            points={`${pt(GAP_R)} ${pt(RIGHT)} ${pt(TOP)} ${pt(LEFT)} ${pt(GAP_L)}`}
            stroke={COLOR} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
          />
          {/* Level number — centered in diamond */}
          <text
            x="30" y="31"
            textAnchor="middle" dominantBaseline="central"
            fontSize="22" fontWeight="900"
            fill={COLOR}
            style={{ fontFamily: "inherit" }}
          >
            {level}
          </text>
          {/* УРОВЕНЬ label — emerges from the open bottom gap */}
          <text
            x="30" y="62"
            textAnchor="middle" dominantBaseline="central"
            fontSize="6" fontWeight="700"
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
