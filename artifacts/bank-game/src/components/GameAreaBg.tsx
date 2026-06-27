interface Props {
  purchasedItems?: string[];
}

export default function GameAreaBg({ purchasedItems = [] }: Props) {
  const has = (id: string) => purchasedItems.includes(id);

  return (
    <div className="game-area-bg-wrap">
      {/* Sky layer */}
      <svg
        className="game-area-bg-sky"
        viewBox="0 0 340 600"
        preserveAspectRatio="xMidYMin slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Sun */}
        <g opacity="0.35" className="bg-sun">
          <circle cx="298" cy="28" r="9" fill="#fde68a" />
          <line x1="310" y1="28"  x2="316" y2="28"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="307" y1="37"  x2="311" y2="41"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="298" y1="40"  x2="298" y2="46"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="290" y1="37"  x2="286" y2="41"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="286" y1="28"  x2="280" y2="28"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="290" y1="19"  x2="286" y2="15"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="298" y1="16"  x2="298" y2="10"  stroke="#f59e0b" strokeWidth="1.5" />
          <line x1="307" y1="19"  x2="311" y2="15"  stroke="#f59e0b" strokeWidth="1.5" />
        </g>

        {/* Rainbow (purchased) */}
        {has("rainbow") && (
          <g className="bg-rainbow" opacity="0.55">
            <path d="M30,320 Q170,140 310,320" stroke="#ef4444" strokeWidth="5" fill="none" />
            <path d="M42,320 Q170,155 298,320" stroke="#f97316" strokeWidth="5" fill="none" />
            <path d="M54,320 Q170,170 286,320" stroke="#eab308" strokeWidth="5" fill="none" />
            <path d="M66,320 Q170,185 274,320" stroke="#22c55e" strokeWidth="5" fill="none" />
            <path d="M78,320 Q170,200 262,320" stroke="#3b82f6" strokeWidth="5" fill="none" />
            <path d="M90,320 Q170,215 250,320" stroke="#8b5cf6" strokeWidth="5" fill="none" />
          </g>
        )}

        {/* Clouds */}
        <g opacity="0.55" className="bg-cloud-left">
          <ellipse cx="55" cy="65" rx="22" ry="13" fill="#fff" />
          <ellipse cx="39" cy="71" rx="14" ry="10" fill="#fff" />
          <ellipse cx="72" cy="71" rx="13" ry="9"  fill="#fff" />
        </g>
        <g opacity="0.45" className="bg-cloud-right">
          <ellipse cx="200" cy="55" rx="18" ry="10" fill="#fff" />
          <ellipse cx="186" cy="60" rx="11" ry="8"  fill="#fff" />
          <ellipse cx="214" cy="60" rx="10" ry="7"  fill="#fff" />
        </g>

        {/* Birds (purchased) */}
        {has("birds") && (
          <g stroke="#365314" strokeWidth="1.3" fill="none" opacity="0.45" className="bg-birds">
            <path d="M120 140 Q123 136 126 140" />
            <path d="M132 134 Q135 130 138 134" />
            <path d="M145 142 Q148 138 151 142" />
          </g>
        )}

        {/* Butterfly (purchased) */}
        {has("butterfly") && (
          <g transform="translate(250,370)">
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

      {/* Ground layer */}
      <svg
        className="game-area-bg-ground"
        viewBox="0 0 430 90"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M0,90 L0,45 Q215,20 430,45 L430,90 Z" fill="#8dc63f" opacity="0.35" />

        {/* Grass tufts left */}
        <g fill="#5a9e1e" opacity="0.55">
          <ellipse cx="22" cy="57" rx="12" ry="7" />
          <ellipse cx="36" cy="54" rx="9"  ry="6" />
          <ellipse cx="10" cy="54" rx="7"  ry="5" />
        </g>

        {/* Grass tufts right */}
        <g fill="#5a9e1e" opacity="0.55">
          <ellipse cx="408" cy="57" rx="12" ry="7" />
          <ellipse cx="394" cy="54" rx="9"  ry="6" />
          <ellipse cx="420" cy="54" rx="7"  ry="5" />
        </g>

        {/* Bush left */}
        <g className="bg-bush-left">
          <ellipse cx="55" cy="54" rx="26" ry="10" fill="#6ab22a" />
          <circle  cx="55" cy="42" r="14"           fill="#4a8f12" />
          <circle  cx="44" cy="46" r="10"           fill="#5aab1a" />
          <circle  cx="66" cy="47" r="10"           fill="#5aab1a" />
        </g>

        {/* Bush right */}
        <g className="bg-bush-right">
          <ellipse cx="375" cy="54" rx="26" ry="10" fill="#6ab22a" />
          <circle  cx="375" cy="42" r="14"           fill="#4a8f12" />
          <circle  cx="364" cy="46" r="10"           fill="#5aab1a" />
          <circle  cx="386" cy="47" r="10"           fill="#5aab1a" />
        </g>

        {/* Hedgehog (purchased) */}
        {has("hedgehog") && (
          <g transform="translate(190,60)" className="bg-hedgehog">
            <ellipse cx="0" cy="4" rx="14" ry="9" fill="#78716c" />
            <ellipse cx="-3" cy="5" rx="9"  ry="6" fill="#a8a29e" />
            <circle cx="-10" cy="4" r="4"   fill="#a8a29e" />
            {[-8,-4,0,4,-6,2].map((x,i) => (
              <line key={i} x1={x} y1={i < 3 ? -2 : 0} x2={x + (i%2===0?-1:1)} y2={i < 3 ? -8 : -6}
                stroke="#57534e" strokeWidth="1.2" strokeLinecap="round" />
            ))}
            <circle cx="-13" cy="3" r="1.5" fill="#1c1917" />
            <circle cx="-14" cy="1" r="1"   fill="#1c1917" />
          </g>
        )}

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

        {/* Stones */}
        <ellipse cx="145" cy="62" rx="7" ry="4" fill="#a8a29e" opacity="0.3" />
        <ellipse cx="285" cy="63" rx="5" ry="3" fill="#a8a29e" opacity="0.25" />
      </svg>
    </div>
  );
}
