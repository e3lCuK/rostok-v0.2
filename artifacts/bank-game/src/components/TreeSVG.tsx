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

/** Flat-fill + thin outline — same language as bushes / basket / flowers. */
const LEAF = "#5aab1a";
const LEAF_DEEP = "#458f12";
const LEAF_LIGHT = "#6dbf3a";
const LEAF_EDGE = "#2f5c0e";
const WOOD_EDGE = "#5c3a1a";
const BRANCH = "#9a6b40";
/** Hairline; non-scaling so scale(0.75) stages match bush weight. */
const STROKE = 1.05;

function LeafLobe({
  cx,
  cy,
  r,
  fill = LEAF,
}: {
  cx: number;
  cy: number;
  r: number;
  fill?: string;
}) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      stroke={LEAF_EDGE}
      strokeWidth={STROKE}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function BranchStub({
  x,
  y,
  w,
  h,
  rotate,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={h / 2}
      fill={BRANCH}
      stroke={WOOD_EDGE}
      strokeWidth={STROKE}
      vectorEffect="non-scaling-stroke"
      transform={`rotate(${rotate} ${x} ${y})`}
    />
  );
}

/**
 * Flat trunk fill + side-only wood strokes.
 * Open top (into canopy) and open bottom (into wrap-root collar) —
 * no end caps / “nozzle” plates.
 * `.tree-trunk` size stays exact for anchor measurement.
 */
function Trunk({
  x,
  y,
  width,
  height,
  fill,
  scaled = false,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  scaled?: boolean;
}) {
  const x2 = x + width;
  const y2 = y + height;
  const ve = scaled ? ("non-scaling-stroke" as const) : undefined;
  const strokeProps = {
    fill: "none" as const,
    stroke: WOOD_EDGE,
    strokeWidth: STROKE,
    strokeLinecap: "butt" as const,
    vectorEffect: ve,
  };
  return (
    <g data-tree-trunk-join="open-ends">
      {/* Fill extends into canopy so sides continue under the leaves */}
      <rect
        x={x}
        y={y - 8}
        width={width}
        height={8}
        fill={fill}
      />
      <rect
        className="tree-trunk"
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
      />
      {/*
        Left / right only — stop at trunk bottom (no overdraw into soil).
        Collar sits under the stump via layering; do not extend past the join.
      */}
      <path d={`M ${x} ${y2} L ${x} ${y - 8}`} {...strokeProps} />
      <path d={`M ${x2} ${y2} L ${x2} ${y - 8}`} {...strokeProps} />
    </g>
  );
}

export default function TreeSVG({ stage, size = 160 }: TreeSVGProps) {
  const [w, h] = size === 110 ? STAGE_DIMS[stage] : [size, size];

  const trees = [
    // Stage 0 — tiny sprout (viewBox bottom = trunk bottom 228)
    <svg
      key={0}
      viewBox="55 153 90 75"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMax meet"
      width={w}
      height={h}
      style={{ overflow: "visible" }}
    >
      <Trunk x={97} y={188} width={6} height={40} fill={TREE_TRUNK_COLORS[0]} />
      <LeafLobe cx={90} cy={188} r={11} fill={LEAF_DEEP} />
      <LeafLobe cx={110} cy={185} r={9} fill={LEAF_LIGHT} />
      <LeafLobe cx={100} cy={180} r={18} fill={LEAF} />
      <LeafLobe cx={100} cy={172} r={10} fill={LEAF_LIGHT} />
    </svg>,

    // Stage 1 — small tree
    <svg
      key={1}
      viewBox="52 115 96 116"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMax meet"
      width={w}
      height={h}
      style={{ overflow: "visible" }}
    >
      <g transform="translate(25, 56) scale(0.75)">
        {/*
          After translate(25,56) scale(0.75): trunk bottom must hit viewBox
          bottom 231 (56 + 0.75×233.333). Height 68 left a visible float gap.
        */}
        <Trunk
          x={95}
          y={165}
          width={10}
          height={68.35}
          fill={TREE_TRUNK_COLORS[1]}
          scaled
        />
        <LeafLobe cx={78} cy={162} r={22} fill={LEAF_DEEP} />
        <LeafLobe cx={122} cy={158} r={20} fill={LEAF} />
        <LeafLobe cx={100} cy={150} r={34} fill={LEAF} />
        <LeafLobe cx={86} cy={144} r={16} fill={LEAF_DEEP} />
        <LeafLobe cx={100} cy={132} r={26} fill={LEAF_LIGHT} />
      </g>
    </svg>,

    // Stage 2 — medium tree
    <svg
      key={2}
      viewBox="28 65 144 168"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMax meet"
      width={w}
      height={h}
      style={{ overflow: "visible" }}
    >
      <g transform="translate(25, 56) scale(0.75)">
        <Trunk
          x={92}
          y={130}
          width={16}
          height={106}
          fill={TREE_TRUNK_COLORS[2]}
          scaled
        />
        <BranchStub x={92} y={168} w={9} h={5} rotate={-22} />
        <BranchStub x={108} y={178} w={9} h={5} rotate={22} />
        <LeafLobe cx={68} cy={128} r={34} fill={LEAF_DEEP} />
        <LeafLobe cx={132} cy={124} r={30} fill={LEAF} />
        <LeafLobe cx={100} cy={112} r={48} fill={LEAF} />
        <LeafLobe cx={80} cy={108} r={22} fill={LEAF_DEEP} />
        <LeafLobe cx={120} cy={102} r={20} fill={LEAF_LIGHT} />
        <LeafLobe cx={100} cy={94} r={36} fill={LEAF} />
        <LeafLobe cx={100} cy={82} r={24} fill={LEAF_LIGHT} />
      </g>
    </svg>,

    // Stage 3 — tall tree
    <svg
      key={3}
      viewBox="18 30 164 205"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMax meet"
      width={w}
      height={h}
      style={{ overflow: "visible" }}
    >
      <g transform="translate(25, 56) scale(0.75)">
        <Trunk
          x={89}
          y={98}
          width={22}
          height={140}
          fill={TREE_TRUNK_COLORS[3]}
          scaled
        />
        <BranchStub x={89} y={140} w={11} h={7} rotate={-26} />
        <BranchStub x={111} y={154} w={13} h={7} rotate={26} />
        <BranchStub x={89} y={182} w={9} h={6} rotate={-16} />
        <LeafLobe cx={58} cy={98} r={42} fill={LEAF_DEEP} />
        <LeafLobe cx={144} cy={92} r={38} fill={LEAF} />
        <LeafLobe cx={100} cy={78} r={58} fill={LEAF} />
        <LeafLobe cx={72} cy={76} r={30} fill={LEAF_DEEP} />
        <LeafLobe cx={130} cy={70} r={26} fill={LEAF} />
        <LeafLobe cx={100} cy={60} r={46} fill={LEAF} />
        <LeafLobe cx={85} cy={58} r={18} fill={LEAF_DEEP} />
        <LeafLobe cx={116} cy={52} r={16} fill={LEAF_LIGHT} />
        <LeafLobe cx={100} cy={46} r={32} fill={LEAF_LIGHT} />
        <LeafLobe cx={100} cy={34} r={18} fill={LEAF_LIGHT} />
      </g>
    </svg>,

    // Stage 4 — mighty tree (viewBox flush; base roots are underground wrap art)
    <svg
      key={4}
      viewBox="8 13 184 217"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMax meet"
      width={w}
      height={h}
      style={{ overflow: "visible" }}
    >
      <g transform="translate(25, 56) scale(0.75)">
        <Trunk
          x={85}
          y={72}
          width={30}
          height={160}
          fill={TREE_TRUNK_COLORS[4]}
          scaled
        />
        <BranchStub x={85} y={96} w={14} h={9} rotate={-28} />
        <BranchStub x={115} y={112} w={16} h={9} rotate={28} />
        <BranchStub x={85} y={144} w={13} h={7} rotate={-18} />
        <BranchStub x={115} y={158} w={13} h={7} rotate={18} />
        <BranchStub x={89} y={186} w={9} h={6} rotate={-12} />
        <LeafLobe cx={50} cy={76} r={48} fill={LEAF_DEEP} />
        <LeafLobe cx={152} cy={70} r={44} fill={LEAF} />
        <LeafLobe cx={100} cy={52} r={72} fill={LEAF} />
        <LeafLobe cx={62} cy={54} r={38} fill={LEAF_DEEP} />
        <LeafLobe cx={140} cy={48} r={34} fill={LEAF} />
        <LeafLobe cx={100} cy={34} r={56} fill={LEAF} />
        <LeafLobe cx={76} cy={32} r={26} fill={LEAF_DEEP} />
        <LeafLobe cx={126} cy={26} r={24} fill={LEAF_LIGHT} />
        <LeafLobe cx={100} cy={18} r={42} fill={LEAF_LIGHT} />
        <LeafLobe cx={100} cy={6} r={26} fill={LEAF_LIGHT} />
      </g>
    </svg>,
  ];

  return (
    <div style={{ width: w, height: h, overflow: "visible" }}>
      {trees[stage]}
    </div>
  );
}
