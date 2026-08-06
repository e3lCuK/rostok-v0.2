interface Props {
  purchasedItems?: string[];
}

export default function GameAreaBg({ purchasedItems = [] }: Props) {
  const has = (id: string) => purchasedItems.includes(id);

  return (
    <>
      <div className="game-area-bg-wrap">
        {/* Sky layer */}
        <svg
          className="game-area-bg-sky"
          viewBox="0 0 340 600"
          preserveAspectRatio="xMidYMin slice"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
        {/* Soft sky wash — fills the top after topbar removal */}
        <defs>
          <linearGradient id="bg-sky-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b7dff5" stopOpacity="0.55" />
            <stop offset="28%" stopColor="#cfe9c0" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#d4edaa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="340" height="280" fill="url(#bg-sky-wash)" />

        {/* Sun — high right; short rays stay clear of the gear */}
        <g opacity="0.4" className="bg-sun">
          <circle cx="292" cy="22" r="9" fill="#fde68a" />
          <line x1="303" y1="22"  x2="308" y2="22"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="300" y1="31"  x2="304" y2="35"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="292" y1="34"  x2="292" y2="39"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="284" y1="31"  x2="280" y2="35"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="281" y1="22"  x2="276" y2="22"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="284" y1="13"  x2="280" y2="10"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="292" y1="11"  x2="292" y2="7"   stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="300" y1="13"  x2="304" y2="10"  stroke="#f59e0b" strokeWidth="1.5" />
        </g>

        {/* Clouds — clear of the top-left level badge along the whole drift path */}
        <g opacity="0.55" className="bg-cloud-left">
          <ellipse cx="130" cy="20" rx="20" ry="11" fill="#fff" />
          <ellipse cx="116" cy="25" rx="12" ry="8"  fill="#fff" />
          <ellipse cx="145" cy="25" rx="11" ry="7"  fill="#fff" />
        </g>
        <g opacity="0.45" className="bg-cloud-right">
          <ellipse cx="220" cy="18" rx="18" ry="10" fill="#fff" />
          <ellipse cx="206" cy="23" rx="11" ry="8"  fill="#fff" />
          <ellipse cx="234" cy="23" rx="10" ry="7"  fill="#fff" />
        </g>

        {/* Birds (purchased) */}
        {has("birds") && (
          <g stroke="#365314" strokeWidth="1.3" fill="none" opacity="0.45" className="bg-birds">
            <path d="M120 140 Q123 136 126 140" />
            <path d="M132 134 Q135 130 138 134" />
            <path d="M145 142 Q148 138 151 142" />
          </g>
        )}

        {/* Butterfly (purchased) — right of tree, mid-height above bushes */}
        {has("butterfly") && (
          <g transform="translate(262, 245)">
            <g className="bg-butterfly">
              <path d="M0,0 Q-6,-7 -11,-2 Q-6,2 0,0" fill="#fb923c" />
              <path d="M0,0 Q6,-7 11,-2 Q6,2 0,0"    fill="#fb923c" />
              <path d="M0,0 Q-5,5 -8,2 Q-5,0 0,0"    fill="#fdba74" />
              <path d="M0,0 Q5,5 8,2 Q5,0 0,0"        fill="#fdba74" />
              <line x1="0" y1="-2" x2="-2" y2="-6" stroke="#78350f" strokeWidth="0.7" />
              <line x1="0" y1="-2" x2="2"  y2="-6" stroke="#78350f" strokeWidth="0.7" />
            </g>
          </g>
        )}
      </svg>
      </div>

      {/* Ground layer — sibling of sky wrap for v2 root layering (z-index above underground) */}
      <svg
        className="game-area-bg-ground"
        width="100%"
        height="90"
        viewBox="0 0 430 90"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="bg-grass-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8dc63f" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#8dc63f" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {/* Soft grass lip — gentle, nearly flat horizon */}
        <path
          d="M0,44 Q215,40 430,44 L430,86 C390,87 350,85 300,86 S210,85 160,86 S70,85 0,86 Z"
          fill="url(#bg-grass-fade)"
        />

        {/* Bush left — nudged right so the apple basket sits clearly to its left */}
        <g className="bg-bush-left">
          <ellipse cx="78" cy="54" rx="26" ry="10" fill="#6ab22a" />
          <circle  cx="78" cy="42" r="14"           fill="#4a8f12" />
          <circle  cx="67" cy="46" r="10"           fill="#5aab1a" />
          <circle  cx="89" cy="47" r="10"           fill="#5aab1a" />
        </g>

        {/* Bush right */}
        <g className="bg-bush-right">
          <ellipse cx="375" cy="54" rx="26" ry="10" fill="#6ab22a" />
          <circle  cx="375" cy="42" r="14"           fill="#4a8f12" />
          <circle  cx="364" cy="46" r="10"           fill="#5aab1a" />
          <circle  cx="386" cy="47" r="10"           fill="#5aab1a" />
        </g>

        {/* Flowers (purchased) */}
        {has("flowers") && (
          <>
            <g opacity="0.7" className="bg-flower-left">
              <circle cx="95" cy="50" r="3"   fill="#fbbf24" />
              <circle cx="95" cy="45" r="2.5" fill="#f9a8d4" />
              <circle cx="100" cy="48" r="2.5" fill="#f9a8d4" />
              <circle cx="90"  cy="48" r="2.5" fill="#f9a8d4" />
              <circle cx="95"  cy="53" r="2.5" fill="#f9a8d4" />
              <line x1="95" y1="55" x2="95" y2="63" stroke="#4d7c0f" strokeWidth="1.2" />
            </g>
            <g opacity="0.7" className="bg-flower-right">
              <circle cx="335" cy="50" r="3"   fill="#fbbf24" />
              <circle cx="335" cy="45" r="2.5" fill="#c4b5fd" />
              <circle cx="340" cy="48" r="2.5" fill="#c4b5fd" />
              <circle cx="330" cy="48" r="2.5" fill="#c4b5fd" />
              <circle cx="335" cy="53" r="2.5" fill="#c4b5fd" />
              <line x1="335" y1="55" x2="335" y2="63" stroke="#4d7c0f" strokeWidth="1.2" />
            </g>
          </>
        )}

      </svg>
    </>
  );
}
