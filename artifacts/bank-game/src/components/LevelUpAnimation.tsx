import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Props {
  newLevel: number;
  onComplete: () => void;
}

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  angle: (i / 12) * 360,
  distance: 55 + Math.random() * 30,
  delay: Math.random() * 0.15,
}));

export default function LevelUpAnimation({ newLevel, onComplete }: Props) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    const t = setTimeout(() => onCompleteRef.current(), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="levelup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="levelup-particle"
          initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          animate={{
            opacity: 0,
            x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
            y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            scale: 0.4,
          }}
          transition={{ duration: 0.9, delay: p.delay, ease: "easeOut" }}
        />
      ))}

      <motion.div
        className="levelup-badge"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.18, 1], opacity: [0, 1, 1] }}
        transition={{ duration: 0.55, times: [0, 0.6, 1], ease: "easeOut" }}
      >
        <motion.div
          className="levelup-glow"
          animate={{ opacity: [0.6, 0.2, 0.6] }}
          transition={{ duration: 0.8, repeat: 1, ease: "easeInOut" }}
        />
        <span className="levelup-icon">🌳</span>
        <span className="levelup-title">Новый уровень!</span>
        <span className="levelup-number">УРОВЕНЬ {newLevel}</span>
      </motion.div>
    </motion.div>
  );
}
