export default function GameAreaBg() {
  return (
    <div className="game-area-bg-wrap">
      {/* Sky layer — preserved aspect ratio, nature elements never distort */}
      <svg
        className="game-area-bg-sky"
        viewBox="0 0 340 600"
        preserveAspectRatio="xMidYMin slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Sun — very top */}
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

        {/* Clouds — below sun */}
        <g opacity="0.55" className="bg-cloud-left">
          <ellipse cx="55" cy="65" rx="22" ry="13" fill="#fff" />
          <ellipse cx="39" cy="71" rx="14" ry="10" fill="#fff" />
          <ellipse cx="72" cy="71" rx="13" ry="9" fill="#fff" />
        </g>
        <g opacity="0.45" className="bg-cloud-right">
          <ellipse cx="200" cy="55" rx="18" ry="10" fill="#fff" />
          <ellipse cx="186" cy="60" rx="11" ry="8" fill="#fff" />
          <ellipse cx="214" cy="60" rx="10" ry="7" fill="#fff" />
        </g>

        {/* Birds — below clouds */}
        <g stroke="#365314" strokeWidth="1.3" fill="none" opacity="0.45" className="bg-birds">
          <path d="M120 90 Q123 86 126 90" />
          <path d="M132 84 Q135 80 138 84" />
          <path d="M145 92 Q148 88 151 92" />
        </g>

        {/* Butterfly — upper area, stays in sky regardless of container height */}
        <g transform="translate(250,200)">
          <g className="bg-butterfly">
            <path d="M0,0 Q-10,-12 -18,-4 Q-10,4 0,0" fill="#fb923c" />
            <path d="M0,0 Q10,-12 18,-4 Q10,4 0,0" fill="#fb923c" />
            <path d="M0,0 Q-8,8 -14,4 Q-8,0 0,0" fill="#fdba74" />
            <path d="M0,0 Q8,8 14,4 Q8,0 0,0" fill="#fdba74" />
            <line x1="0" y1="-3" x2="-4" y2="-10" stroke="#78350f" strokeWidth="0.8" />
            <line x1="0" y1="-3" x2="4" y2="-10" stroke="#78350f" strokeWidth="0.8" />
          </g>
        </g>
      </svg>

      {/* Ground layer — stretches full width, minor distortion unnoticeable on a hill curve */}
      <svg
        className="game-area-bg-ground"
        viewBox="0 0 430 90"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Hill fills corner-to-corner: x=0→430, both edges at y=45, peak at y=20 */}
        <path d="M0,90 L0,45 Q215,20 430,45 L430,90 Z" fill="#8dc63f" opacity="0.35" />

        {/* Grass tufts left */}
        <g fill="#5a9e1e" opacity="0.55">
          <ellipse cx="22" cy="57" rx="12" ry="7" />
          <ellipse cx="36" cy="54" rx="9" ry="6" />
          <ellipse cx="10" cy="54" rx="7" ry="5" />
        </g>

        {/* Grass tufts right */}
        <g fill="#5a9e1e" opacity="0.55">
          <ellipse cx="408" cy="57" rx="12" ry="7" />
          <ellipse cx="394" cy="54" rx="9" ry="6" />
          <ellipse cx="420" cy="54" rx="7" ry="5" />
        </g>

        {/* Bush left */}
        <g opacity="0.45" className="bg-bush-left">
          <circle cx="55" cy="42" r="14" fill="#4a8f12" />
          <circle cx="44" cy="46" r="10" fill="#5aab1a" />
          <circle cx="66" cy="47" r="10" fill="#5aab1a" />
        </g>

        {/* Bush right — mirrors left at ~87% of width */}
        <g opacity="0.45" className="bg-bush-right">
          <circle cx="375" cy="42" r="14" fill="#4a8f12" />
          <circle cx="364" cy="46" r="10" fill="#5aab1a" />
          <circle cx="386" cy="47" r="10" fill="#5aab1a" />
        </g>

        {/* Flower left */}
        <g opacity="0.7" className="bg-flower-left">
          <circle cx="82" cy="50" r="3" fill="#fbbf24" />
          <circle cx="82" cy="45" r="2.5" fill="#f9a8d4" />
          <circle cx="87" cy="48" r="2.5" fill="#f9a8d4" />
          <circle cx="77" cy="48" r="2.5" fill="#f9a8d4" />
          <circle cx="82" cy="53" r="2.5" fill="#f9a8d4" />
          <line x1="82" y1="55" x2="82" y2="63" stroke="#4d7c0f" strokeWidth="1.2" />
        </g>

        {/* Flower right */}
        <g opacity="0.7" className="bg-flower-right">
          <circle cx="348" cy="50" r="3" fill="#fbbf24" />
          <circle cx="348" cy="45" r="2.5" fill="#c4b5fd" />
          <circle cx="353" cy="48" r="2.5" fill="#c4b5fd" />
          <circle cx="343" cy="48" r="2.5" fill="#c4b5fd" />
          <circle cx="348" cy="53" r="2.5" fill="#c4b5fd" />
          <line x1="348" y1="55" x2="348" y2="63" stroke="#4d7c0f" strokeWidth="1.2" />
        </g>

        {/* Mushroom */}
        <g opacity="0.5" className="bg-mushroom">
          <rect x="96" y="54" width="5" height="8" rx="1" fill="#e5c07b" />
          <ellipse cx="98.5" cy="54" rx="9" ry="5" fill="#e06c75" />
          <ellipse cx="96" cy="53" rx="2" ry="1.2" fill="#fff" opacity="0.6" />
        </g>

        {/* Stones */}
        <ellipse cx="145" cy="62" rx="7" ry="4" fill="#a8a29e" opacity="0.3" />
        <ellipse cx="285" cy="63" rx="5" ry="3" fill="#a8a29e" opacity="0.25" />
      </svg>
    </div>
  );
}
