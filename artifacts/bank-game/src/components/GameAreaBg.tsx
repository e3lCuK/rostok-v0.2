interface Props {
  purchasedItems?: string[];
}

/**
 * Field bush — classic 3-lobe mound planted on the grass↔soil join.
 * Flat fills + thin outline (basket/chest language).
 */
function BgBush({
  cx,
  className,
}: {
  cx: number;
  className: string;
}) {
  const LEAF = "#5aab1a";
  const LEAF_DEEP = "#458f12";
  const LEAF_EDGE = "#2f5c0e";
  /** Contact line with surface earth — slightly above the soil lip. */
  const GY = 76;

  return (
    // Outer translate stays put; CSS sway animates the inner group only.
    <g transform={`translate(${cx}, 0)`}>
      <g className={className}>
        {/* Ground mound — lobes sit on this, not mid-air */}
        <ellipse cx="0" cy={GY - 2} rx="20" ry="6" fill={LEAF_DEEP} />

        {/* Three lobes (back → front) */}
        <circle
          cx="-10"
          cy={GY - 13}
          r="12"
          fill={LEAF}
          stroke={LEAF_EDGE}
          strokeWidth="1.05"
        />
        <circle
          cx="10"
          cy={GY - 13}
          r="12"
          fill={LEAF}
          stroke={LEAF_EDGE}
          strokeWidth="1.05"
        />
        <circle
          cx="0"
          cy={GY - 18}
          r="13"
          fill={LEAF}
          stroke={LEAF_EDGE}
          strokeWidth="1.05"
        />
      </g>
    </g>
  );
}

/**
 * Shop flower — flat petals + thin outline, stem planted on the soil lip.
 */
function BgFlower({
  cx,
  petal,
  className,
}: {
  cx: number;
  petal: string;
  className: string;
}) {
  const CENTER = "#f0b429";
  const EDGE = "#5c3a1a";
  const STEM = "#3f7a10";
  /** Same ground contact as bushes. */
  const GY = 76;
  const HEAD_Y = GY - 22;

  return (
    <g transform={`translate(${cx}, 0)`}>
      {/* Soft ground oval — same warm tone as basket / bush shadows */}
      <ellipse
        cx="0"
        cy={GY + 1.2}
        rx="6"
        ry="1.9"
        fill="#b8956a"
        opacity="0.72"
      />
      <g className={className}>
        {/* Stem — grounded */}
        <path
          d={`M0 ${HEAD_Y + 4} L0 ${GY}`}
          fill="none"
          stroke={STEM}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {/* Small leaf */}
        <path
          d={`M0 ${GY - 10}
             C3 ${GY - 12} 6 ${GY - 10} 5 ${GY - 7}
             C3 ${GY - 8} 1 ${GY - 8} 0 ${GY - 10}Z`}
          fill={STEM}
          stroke={EDGE}
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* Four petals */}
        <circle
          cx="0"
          cy={HEAD_Y - 4.2}
          r="3.4"
          fill={petal}
          stroke={EDGE}
          strokeWidth="0.9"
        />
        <circle
          cx="4.2"
          cy={HEAD_Y}
          r="3.4"
          fill={petal}
          stroke={EDGE}
          strokeWidth="0.9"
        />
        <circle
          cx="0"
          cy={HEAD_Y + 4.2}
          r="3.4"
          fill={petal}
          stroke={EDGE}
          strokeWidth="0.9"
        />
        <circle
          cx="-4.2"
          cy={HEAD_Y}
          r="3.4"
          fill={petal}
          stroke={EDGE}
          strokeWidth="0.9"
        />
        {/* Center */}
        <circle
          cx="0"
          cy={HEAD_Y}
          r="2.6"
          fill={CENTER}
          stroke={EDGE}
          strokeWidth="0.85"
        />
      </g>
    </g>
  );
}

/**
 * Shop butterfly — flat wing fills + thin outline (same language as bush / basket).
 */
function BgButterfly({
  x,
  y,
  className,
}: {
  x: number;
  y: number;
  className: string;
}) {
  const WING = "#f0a14a";
  const WING_DEEP = "#d97706";
  const EDGE = "#78350f";
  const BODY = "#5c3a1a";

  return (
    <g transform={`translate(${x}, ${y})`}>
      <g className={className}>
        {/* Upper wings */}
        <path
          d="M0 0
             C-3 -2 -9 -8 -12 -3
             C-13 1 -7 3 0 0Z"
          fill={WING}
          stroke={EDGE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M0 0
             C3 -2 9 -8 12 -3
             C13 1 7 3 0 0Z"
          fill={WING}
          stroke={EDGE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Lower wings */}
        <path
          d="M0 1
             C-2 2 -7 6 -9 3
             C-9 0 -4 0 0 1Z"
          fill={WING_DEEP}
          stroke={EDGE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M0 1
             C2 2 7 6 9 3
             C9 0 4 0 0 1Z"
          fill={WING_DEEP}
          stroke={EDGE}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Body */}
        <ellipse
          cx="0"
          cy="0.2"
          rx="1.15"
          ry="3.4"
          fill={BODY}
          stroke={EDGE}
          strokeWidth="0.7"
        />
        {/* Antennae */}
        <path
          d="M0 -3 Q-2 -6 -3.2 -5.5"
          fill="none"
          stroke={EDGE}
          strokeWidth="0.75"
          strokeLinecap="round"
        />
        <path
          d="M0 -3 Q2 -6 3.2 -5.5"
          fill="none"
          stroke={EDGE}
          strokeWidth="0.75"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

/**
 * Single shop bird — flat body + wing, thin outline (same language as bush).
 * Local origin = body center; flies facing right.
 */
function BgBird({ x, y }: { x: number; y: number }) {
  // Warm brown (not leaf-green) — reads on sky, matches basket/chest wood.
  const BODY = "#8b623e";
  const WING = "#a67845";
  const EDGE = "#5c3a1a";

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Wing (behind) */}
      <path
        d="M-1 0
           C-3 -4 -7 -5 -9 -2
           C-7 0 -3 1 -1 0Z"
        fill={WING}
        stroke={EDGE}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* Body */}
      <ellipse
        cx="0.5"
        cy="0.4"
        rx="3.2"
        ry="1.9"
        fill={BODY}
        stroke={EDGE}
        strokeWidth="0.9"
      />
      {/* Head */}
      <circle
        cx="3.4"
        cy="-0.2"
        r="1.55"
        fill={BODY}
        stroke={EDGE}
        strokeWidth="0.85"
      />
      {/* Beak */}
      <path
        d="M4.7 -0.2 L7 0.15 L4.7 0.55Z"
        fill="#c4a35a"
        stroke={EDGE}
        strokeWidth="0.55"
        strokeLinejoin="round"
      />
      {/* Eye */}
      <circle cx="3.7" cy="-0.45" r="0.35" fill={EDGE} />
    </g>
  );
}

/** Flock — right sky; CSS float animates the outer group. */
function BgBirds({ className }: { className: string }) {
  return (
    <g className={className}>
      <BgBird x={268} y={140} />
      <BgBird x={282} y={132} />
      <BgBird x={295} y={142} />
    </g>
  );
}

/**
 * Sun — flat disc + separate ray capsules (gap from the disc).
 * Local origin = disc center.
 */
function BgSun({
  cx,
  cy,
  className,
}: {
  cx: number;
  cy: number;
  className: string;
}) {
  const DISC = "#f0c14a";
  const RAY_FILL = "#f0c14a";
  const EDGE = "#b45309";
  const R = 9;
  const SW = 1.1;
  /** Gap between disc rim and ray start. */
  const GAP = 2.4;
  const RAY_LEN = 4.2;
  const RAY_W = 1.35;

  const rays = [0, 45, 90, 135, 180, 225, 270, 315] as const;

  return (
    // Outer translate stays put; CSS pulse animates the inner group only.
    <g transform={`translate(${cx}, ${cy})`} opacity="0.72">
      <g className={className}>
        {rays.map((deg) => {
          const mid = R + GAP + RAY_LEN / 2;
          return (
            <g key={deg} transform={`rotate(${deg})`}>
              {/* Standalone capsule ray — not attached to the disc */}
              <rect
                x={mid - RAY_LEN / 2}
                y={-RAY_W}
                width={RAY_LEN}
                height={RAY_W * 2}
                rx={RAY_W}
                ry={RAY_W}
                fill={RAY_FILL}
                stroke={EDGE}
                strokeWidth={SW}
              />
            </g>
          );
        })}
        <circle
          cx="0"
          cy="0"
          r={R}
          fill={DISC}
          stroke={EDGE}
          strokeWidth={SW}
        />
      </g>
    </g>
  );
}

/**
 * Cloud — 3 solid lobes + thin outline (same as bush mounds).
 * `ox/oy` = center of the main lobe.
 */
function BgCloud({
  ox,
  oy,
  className,
}: {
  ox: number;
  oy: number;
  className: string;
}) {
  const FILL = "#ffffff";
  const EDGE = "#7a8fa0";
  const SW = 1.1;

  return (
    // Outer translate stays put; CSS drift animates the inner group only.
    <g transform={`translate(${ox}, ${oy})`} opacity="0.68">
      <g className={className}>
        <ellipse
          cx="-12"
          cy="4"
          rx="11"
          ry="7.5"
          fill={FILL}
          stroke={EDGE}
          strokeWidth={SW}
        />
        <ellipse
          cx="12"
          cy="4"
          rx="10"
          ry="7"
          fill={FILL}
          stroke={EDGE}
          strokeWidth={SW}
        />
        <ellipse
          cx="0"
          cy="0"
          rx="14"
          ry="9"
          fill={FILL}
          stroke={EDGE}
          strokeWidth={SW}
        />
      </g>
    </g>
  );
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
        <BgSun cx={292} cy={22} className="bg-sun" />

        {/* Clouds — clear of the top-left level badge along the whole drift path */}
        <BgCloud ox={130} oy={22} className="bg-cloud-left" />
        <BgCloud ox={220} oy={20} className="bg-cloud-right" />

        {/* Birds (purchased) — right sky, clear of sun / gear */}
        {has("birds") && <BgBirds className="bg-birds" />}

        {/* Butterfly (purchased) — upper-left sky, clear of level badge. */}
        {has("butterfly") && (
          <BgButterfly x={72} y={168} className="bg-butterfly" />
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
          {/* Earth reads clearly; short soft blend at the horizon only. */}
          <linearGradient id="bg-surface-earth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c5e08a" stopOpacity="0.18" />
            <stop offset="14%" stopColor="#b0d060" stopOpacity="0.78" />
            <stop offset="32%" stopColor="#a8c858" stopOpacity="1" />
            <stop offset="100%" stopColor="#a0c250" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/*
          Surface earth behind bushes — solid to y=90 (trunk join).
          A wavy bottom left gaps where underground soil peeked past the stroke.
        */}
        <path
          className="bg-surface-earth"
          d="M0,12 Q215,8 430,12 L430,90 L0,90 Z"
          fill="url(#bg-surface-earth)"
        />

        {/* Bushes — far left / far right; basket sits right of the left bush */}
        <BgBush cx={36} className="bg-bush-left" />
        <BgBush cx={375} className="bg-bush-right" />

        {/* Flowers (purchased) — left toward trunk, right of left bush / left of right bush */}
        {has("flowers") && (
          <>
            <BgFlower
              cx={130}
              petal="#f4a4c8"
              className="bg-flower-left"
            />
            <BgFlower
              cx={335}
              petal="#b8a4f0"
              className="bg-flower-right"
            />
          </>
        )}

      </svg>

      {/*
        Grass↔soil join — short SVG (height ≈ viewBox Y) so stroke stays
        thin and even; not inside the tall stretched ground SVG.
      */}
      <svg
        className="bg-soil-join"
        width="100%"
        height="3"
        viewBox="0 0 430 3"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/*
          Butt caps + path flush to viewBox X so .game-area overflow:hidden
          does not clip round end-caps (looked like the line stopped short).
        */}
        <path
          className="bg-soil-join-line"
          d="M0,1.5
             C70,0.55 160,2.35 210,0.85
             S300,2.1 350,0.7
             S390,2.45 430,1.5"
          fill="none"
          stroke="#2f5c0e"
          strokeWidth="1"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}
