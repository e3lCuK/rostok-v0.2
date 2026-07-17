import { useCallback, useState } from "react";

interface Props {
  onComplete?: () => void;
  onWebCollect?: (index: 0 | 1 | 2) => void;
}

const WEB_SLOTS: { index: 0 | 1 | 2; className: string }[] = [
  { index: 0, className: "v2-web-slot--left" },
  { index: 1, className: "v2-web-slot--center" },
  { index: 2, className: "v2-web-slot--right" },
];

function WebSvg() {
  return (
    <svg className="v2-web-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="3" fill="rgba(255,255,255,0.85)" />
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={`spoke-${deg}`}
          x1="32"
          y1="32"
          x2={32 + 28 * Math.cos((deg * Math.PI) / 180)}
          y2={32 + 28 * Math.sin((deg * Math.PI) / 180)}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.8"
        />
      ))}
      {[10, 18, 26].map((r) => (
        <circle
          key={`ring-${r}`}
          cx="32"
          cy="32"
          r={r}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="0.6"
        />
      ))}
    </svg>
  );
}

export default function ExcessWebs({ onComplete, onWebCollect }: Props) {
  const [hidden, setHidden] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [collecting, setCollecting] = useState<number | null>(null);

  const handleCollect = useCallback(
    (index: 0 | 1 | 2) => {
      if (hidden[index] || collecting !== null) return;
      setCollecting(index);
      window.setTimeout(() => {
        setHidden((prev) => {
          const next: [boolean, boolean, boolean] = [...prev];
          next[index] = true;
          if (next.every(Boolean)) {
            window.setTimeout(() => onComplete?.(), 120);
          }
          return next;
        });
        setCollecting(null);
        onWebCollect?.(index);
      }, 380);
    },
    [collecting, hidden, onComplete, onWebCollect],
  );

  const visibleCount = hidden.filter((h) => !h).length;
  if (visibleCount === 0) return null;

  return (
    <div className="v2-web-layer" aria-hidden="true">
      {WEB_SLOTS.map(({ index, className }) => {
        if (hidden[index]) return null;
        const isCollecting = collecting === index;
        return (
          <button
            key={index}
            type="button"
            className={`v2-web-slot ${className}${isCollecting ? " v2-web-slot--collecting" : ""}`}
            onClick={() => handleCollect(index)}
            tabIndex={-1}
          >
            <WebSvg />
          </button>
        );
      })}
    </div>
  );
}
