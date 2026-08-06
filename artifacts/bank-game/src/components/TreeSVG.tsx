type Stage = 0 | 1 | 2 | 3 | 4;

interface TreeSVGProps {
  stage: Stage;
  size?: number;
}

/**
 * Pixel size for size={110}. Heights keep the same on-screen scale as before
 * after cropping each viewBox flush to the trunk base (no empty air below).
 */
export const STAGE_DIMS: [number, number][] = [
  [100, 84],
  [115, 139],
  [148, 173],
  [168, 210],
  [188, 222],
];

/** Trunk fill per stage — keep in sync with `.tree-trunk` rects below. */
export const TREE_TRUNK_COLORS: readonly string[] = [
  "#9B7A52",
  "#8B6340",
  "#7a5330",
  "#6b4423",
  "#5a3a1a",
] as const;

export function getTreeTrunkColor(stage: number): string {
  const i = Math.min(4, Math.max(0, Math.trunc(Number(stage) || 0)));
  return TREE_TRUNK_COLORS[i] ?? TREE_TRUNK_COLORS[0];
}

export default function TreeSVG({ stage, size = 160 }: TreeSVGProps) {
  const [w, h] = size === 110 ? STAGE_DIMS[stage] : [size, size];

  const trees = [
    // Stage 0 — tiny sprout (viewBox bottom = trunk bottom 228)
    <svg key={0} viewBox="55 153 90 75" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" width={w} height={h}>
      <rect className="tree-trunk" x="97" y="188" width="6" height="40" rx="3" fill="#9B7A52" />
      <ellipse cx="100" cy="180" rx="18" ry="18" fill="#6dbf67" />
      <ellipse cx="90" cy="188" rx="11" ry="11" fill="#5aac54" />
      <ellipse cx="110" cy="185" rx="9" ry="9" fill="#7acc74" />
      <ellipse cx="100" cy="172" rx="10" ry="10" fill="#83c97d" />
    </svg>,
    // Stage 1 — small tree
    <svg key={1} viewBox="52 115 96 116" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" width={w} height={h}>
      <g transform="translate(25, 56) scale(0.75)">
        <rect className="tree-trunk" x="95" y="165" width="10" height="68" rx="4" fill="#8B6340" />
        <ellipse cx="100" cy="150" rx="34" ry="34" fill="#5aac54" />
        <ellipse cx="78" cy="162" rx="22" ry="22" fill="#4d9c47" />
        <ellipse cx="122" cy="158" rx="20" ry="20" fill="#62b95c" />
        <ellipse cx="100" cy="132" rx="26" ry="26" fill="#6dbf67" />
        <ellipse cx="86" cy="144" rx="16" ry="16" fill="#5aac54" />
      </g>
    </svg>,
    // Stage 2 — medium tree
    <svg key={2} viewBox="28 65 144 168" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" width={w} height={h}>
      <g transform="translate(25, 56) scale(0.75)">
        <rect className="tree-trunk" x="92" y="130" width="16" height="106" rx="5" fill="#7a5330" />
        <rect x="92" y="168" width="9" height="5" rx="2" fill="#9a6b40" transform="rotate(-22 92 168)" />
        <rect x="108" y="178" width="9" height="5" rx="2" fill="#9a6b40" transform="rotate(22 108 178)" />
        <ellipse cx="100" cy="112" rx="52" ry="44" fill="#4d9c47" />
        <ellipse cx="68" cy="128" rx="36" ry="32" fill="#449040" />
        <ellipse cx="132" cy="124" rx="32" ry="30" fill="#56a850" />
        <ellipse cx="100" cy="94" rx="40" ry="36" fill="#5aac54" />
        <ellipse cx="80" cy="108" rx="24" ry="22" fill="#4d9c47" />
        <ellipse cx="120" cy="102" rx="22" ry="20" fill="#6dbf67" />
        <ellipse cx="100" cy="82" rx="26" ry="23" fill="#7acc74" />
      </g>
    </svg>,
    // Stage 3 — tall tree
    <svg key={3} viewBox="18 30 164 205" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" width={w} height={h}>
      <g transform="translate(25, 56) scale(0.75)">
        <rect className="tree-trunk" x="89" y="98" width="22" height="140" rx="6" fill="#6b4423" />
        <rect x="89" y="140" width="11" height="7" rx="3" fill="#8a5a2e" transform="rotate(-26 89 140)" />
        <rect x="111" y="154" width="13" height="7" rx="3" fill="#8a5a2e" transform="rotate(26 111 154)" />
        <rect x="89" y="182" width="9" height="6" rx="3" fill="#8a5a2e" transform="rotate(-16 89 182)" />
        <ellipse cx="100" cy="78" rx="64" ry="54" fill="#3d8c38" />
        <ellipse cx="58" cy="98" rx="44" ry="40" fill="#368030" />
        <ellipse cx="144" cy="92" rx="40" ry="36" fill="#449040" />
        <ellipse cx="100" cy="60" rx="50" ry="44" fill="#4d9c47" />
        <ellipse cx="72" cy="76" rx="32" ry="28" fill="#3d8c38" />
        <ellipse cx="130" cy="70" rx="28" ry="26" fill="#56a850" />
        <ellipse cx="100" cy="46" rx="34" ry="30" fill="#5aac54" />
        <ellipse cx="85" cy="58" rx="20" ry="18" fill="#4d9c47" />
        <ellipse cx="116" cy="52" rx="18" ry="16" fill="#6dbf67" />
        <ellipse cx="100" cy="34" rx="20" ry="18" fill="#7acc74" />
      </g>
    </svg>,
    // Stage 4 — mighty tree (surface strokes end at trunk base; viewBox flush)
    <svg key={4} viewBox="8 13 184 217" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" width={w} height={h}>
      <g transform="translate(25, 56) scale(0.75)">
        <path d="M90 226 Q76 230 56 232" stroke="#5a3a1a" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
        <path d="M110 226 Q124 230 144 232" stroke="#5a3a1a" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
        <path d="M95 228 Q88 230 80 232" stroke="#5a3a1a" strokeWidth="3" strokeLinecap="round" fill="none"/>
        <rect className="tree-trunk" x="85" y="72" width="30" height="160" rx="8" fill="#5a3a1a" />
        <rect x="85" y="96" width="14" height="9" rx="3" fill="#7a5330" transform="rotate(-28 85 96)" />
        <rect x="115" y="112" width="16" height="9" rx="3" fill="#7a5330" transform="rotate(28 115 112)" />
        <rect x="85" y="144" width="13" height="7" rx="3" fill="#7a5330" transform="rotate(-18 85 144)" />
        <rect x="115" y="158" width="13" height="7" rx="3" fill="#7a5330" transform="rotate(18 115 158)" />
        <rect x="89" y="186" width="9" height="6" rx="3" fill="#7a5330" transform="rotate(-12 89 186)" />
        <ellipse cx="100" cy="52" rx="80" ry="66" fill="#2d7028" />
        <ellipse cx="50" cy="76" rx="50" ry="46" fill="#286623" />
        <ellipse cx="152" cy="70" rx="46" ry="42" fill="#307a2b" />
        <ellipse cx="100" cy="34" rx="62" ry="54" fill="#3d8c38" />
        <ellipse cx="62" cy="54" rx="40" ry="36" fill="#2d7028" />
        <ellipse cx="140" cy="48" rx="36" ry="32" fill="#368030" />
        <ellipse cx="100" cy="18" rx="48" ry="40" fill="#449040" />
        <ellipse cx="76" cy="32" rx="28" ry="26" fill="#3d8c38" />
        <ellipse cx="126" cy="26" rx="26" ry="24" fill="#4d9c47" />
        <ellipse cx="100" cy="6" rx="30" ry="24" fill="#5aac54" />
      </g>
    </svg>
  ];

  return (
    <div style={{ width: w, height: h }}>
      {trees[stage]}
    </div>
  );
}
