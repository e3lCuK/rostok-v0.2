/**
 * Build a filled tapered ribbon along a cubic centerline.
 * Centerline control points are never altered — only half-width varies with t.
 */

export type Point = { x: number; y: number };

/** Full width at t=0 matches the previous uniform stroke (8px). */
export const MAJOR_ROOT_BASE_WIDTH = 8;

/** Soft taper: wide at trunk (t=0), thin tip (t=1) — v2 majors. */
const WIDTH_KEYS_TRUNK_WIDE: readonly { t: number; w: number }[] = [
  { t: 0, w: 1.0 },
  { t: 0.25, w: 0.935 },
  { t: 0.5, w: 0.825 },
  { t: 0.75, w: 0.675 },
  { t: 1, w: 0.5 },
] as const;

/**
 * Emerge from trunk: hair-thin at t=0, swell smoothly, soft tip.
 * Used by v3 wrap roots so the fork is not a blunt stump.
 */
const WIDTH_KEYS_EMERGE: readonly { t: number; w: number }[] = [
  { t: 0, w: 0.1 },
  { t: 0.12, w: 0.35 },
  { t: 0.35, w: 0.85 },
  { t: 0.6, w: 1.0 },
  { t: 0.85, w: 0.72 },
  { t: 1, w: 0.42 },
] as const;

/** Continuation after an emerge segment — already full width at start. */
const WIDTH_KEYS_CONTINUE: readonly { t: number; w: number }[] = [
  { t: 0, w: 1.0 },
  { t: 0.4, w: 0.9 },
  { t: 0.75, w: 0.65 },
  { t: 1, w: 0.4 },
] as const;

export type RootTaperProfile = "trunk-wide" | "emerge" | "continue";

const SAMPLE_COUNT = 32;

function lerp(a: number, b: number, u: number) {
  return a + (b - a) * u;
}

function smoothstep(u: number) {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

function widthKeysFor(profile: RootTaperProfile) {
  if (profile === "emerge") return WIDTH_KEYS_EMERGE;
  if (profile === "continue") return WIDTH_KEYS_CONTINUE;
  return WIDTH_KEYS_TRUNK_WIDE;
}

/** Continuous soft width factor for t ∈ [0, 1]. */
export function taperWidthFactor(
  t: number,
  profile: RootTaperProfile = "trunk-wide",
): number {
  const keys = widthKeysFor(profile);
  const x = Math.min(1, Math.max(0, t));
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (x <= b.t) {
      const u = smoothstep((x - a.t) / (b.t - a.t || 1));
      return lerp(a.w, b.w, u);
    }
  }
  return keys[keys.length - 1].w;
}

/** Parse a single cubic: `M x y C c1x c1y, c2x c2y, ex ey`. */
export function parseCubicCenterline(d: string): {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
} | null {
  const m = d
    .trim()
    .match(
      /^M\s*([-\d.]+)\s+([-\d.]+)\s+C\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s+([-\d.]+)\s*$/i,
    );
  if (!m) return null;
  return {
    p0: { x: +m[1], y: +m[2] },
    p1: { x: +m[3], y: +m[4] },
    p2: { x: +m[5], y: +m[6] },
    p3: { x: +m[7], y: +m[8] },
  };
}

function cubicPoint(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function cubicTangent(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point {
  const u = 1 - t;
  return {
    x:
      3 * u * u * (p1.x - p0.x) +
      6 * u * t * (p2.x - p1.x) +
      3 * t * t * (p3.x - p2.x),
    y:
      3 * u * u * (p1.y - p0.y) +
      6 * u * t * (p2.y - p1.y) +
      3 * t * t * (p3.y - p2.y),
  };
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Closed filled path along a cubic centerline.
 * Default `trunk-wide`: wide at t=0, thin tip.
 * `emerge`: thin at t=0 (trunk exit), swells, soft tip.
 * Returns null if `d` is not a single cubic centerline.
 */
export function buildTaperedRootFill(
  centerlineD: string,
  baseWidth: number = MAJOR_ROOT_BASE_WIDTH,
  profile: RootTaperProfile = "trunk-wide",
): string | null {
  const cub = parseCubicCenterline(centerlineD);
  if (!cub) return null;
  const { p0, p1, p2, p3 } = cub;
  const half0 = baseWidth / 2;

  const centers: Point[] = [];
  const tangents: Point[] = [];
  const halfWidths: number[] = [];

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    centers.push(cubicPoint(p0, p1, p2, p3, t));
    tangents.push(normalize(cubicTangent(p0, p1, p2, p3, t)));
    halfWidths.push(half0 * taperWidthFactor(t, profile));
  }

  // Smooth normals once so the ribbon doesn't twist on shallow bends.
  const normals: Point[] = tangents.map((tan) => ({ x: -tan.y, y: tan.x }));
  for (let i = 1; i < normals.length - 1; i++) {
    normals[i] = normalize({
      x: normals[i - 1].x + normals[i].x + normals[i + 1].x,
      y: normals[i - 1].y + normals[i].y + normals[i + 1].y,
    });
  }

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < centers.length; i++) {
    const n = normals[i];
    const hw = halfWidths[i];
    const c = centers[i];
    left.push({ x: c.x + n.x * hw, y: c.y + n.y * hw });
    right.push({ x: c.x - n.x * hw, y: c.y - n.y * hw });
  }

  const tip = centers[centers.length - 1];
  const tipTan = tangents[tangents.length - 1];
  const tipHw = halfWidths[halfWidths.length - 1];
  const tipCap = {
    x: tip.x + tipTan.x * tipHw,
    y: tip.y + tipTan.y * tipHw,
  };

  const baseTan = tangents[0];
  const baseHw = halfWidths[0];
  const baseCap = {
    x: centers[0].x - baseTan.x * baseHw,
    y: centers[0].y - baseTan.y * baseHw,
  };

  const parts: string[] = [`M ${fmt(left[0].x)} ${fmt(left[0].y)}`];
  for (let i = 1; i < left.length; i++) {
    parts.push(`L ${fmt(left[i].x)} ${fmt(left[i].y)}`);
  }
  parts.push(
    `Q ${fmt(tipCap.x)} ${fmt(tipCap.y)} ${fmt(right[right.length - 1].x)} ${fmt(right[right.length - 1].y)}`,
  );
  for (let i = right.length - 2; i >= 0; i--) {
    parts.push(`L ${fmt(right[i].x)} ${fmt(right[i].y)}`);
  }
  parts.push(
    `Q ${fmt(baseCap.x)} ${fmt(baseCap.y)} ${fmt(left[0].x)} ${fmt(left[0].y)}`,
  );
  parts.push("Z");
  return parts.join(" ");
}
