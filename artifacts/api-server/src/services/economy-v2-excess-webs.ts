/**
 * Economy v2 excess Metelka webs (GDD §19.7).
 * N_webs(T) = round(2.4 × T), T = locked session preset ∈ [5, 25].
 * Layout is deterministic from a stored seed — never Math.random() on read.
 *
 * Version 2 adds one extra red base-income web (id=base-income-web) that is
 * not counted in white webCount / Skill / XP.
 */

import { randomBytes } from "node:crypto";
import {
  V2_EXCESS_PRESET_MAX,
  V2_EXCESS_PRESET_MIN,
} from "./economy-v2-excess";
import {
  EXCESS_BASE_INCOME_WEB_ID,
  EXCESS_SPECIAL_WEB_ID,
  isBaseIncomeWebId,
  isExcessSpecialWebId,
} from "./economy-v2-excess-rewards";

/** GDD coefficient: N_webs(T) = round(2.4 × T). */
export const V2_EXCESS_WEB_COUNT_FACTOR = 2.4;

export type ExcessWebKind = "regular" | "base_income" | "special";

export type ExcessWebPlacement = {
  id: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  /** Preferred public discriminator (version=2 uses regular | base_income). */
  type?: ExcessWebKind;
  /** Alias of type — kept for older clients / tests. */
  kind?: ExcessWebKind;
  /** Present in public snapshots when session is active. */
  cleared?: boolean;
};

/** Normalized AABB — point is inside if center is strictly within. */
export type ExcessWebExclusionZone = {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/** Playable garden band inside `.game-area` (normalized). */
export const EXCESS_WEB_PLAYABLE = {
  x0: 0.05,
  x1: 0.95,
  y0: 0.16,
  y1: 0.78,
} as const;

export const EXCESS_WEB_SIZE_MIN = 0.75;
export const EXCESS_WEB_SIZE_MAX = 1.15;
export const EXCESS_WEB_ROTATION_MIN = -20;
export const EXCESS_WEB_ROTATION_MAX = 20;
/** Visual size multiplier for the red base-income / special web (server `size`). */
export const EXCESS_SPECIAL_WEB_SIZE = 1.85;
export const EXCESS_SPECIAL_WEB_ROTATION = -6;
export const EXCESS_BASE_INCOME_WEB_SIZE = EXCESS_SPECIAL_WEB_SIZE;
export const EXCESS_BASE_INCOME_WEB_ROTATION = EXCESS_SPECIAL_WEB_ROTATION;

/**
 * Soft exclusion zones (normalized). Web centers must stay outside.
 * Partial edge overlap is allowed by design.
 */
export const EXCESS_WEB_EXCLUSION_ZONES: readonly ExcessWebExclusionZone[] = [
  // A. Cleaning timer (top center)
  { id: "timer", x0: 0.34, y0: 0.0, x1: 0.66, y1: 0.14 },
  // B. Tree trunk + crown
  { id: "tree", x0: 0.34, y0: 0.18, x1: 0.66, y1: 0.52 },
  // C. Roots + capital chest
  { id: "roots_chest", x0: 0.28, y0: 0.52, x1: 0.72, y1: 0.78 },
  // D. Bottom nav (safety — playable already ends at 0.78)
  { id: "nav", x0: 0.0, y0: 0.86, x1: 1.0, y1: 1.0 },
];

const PLACE_ATTEMPTS = 32;
const WEB_ID_RE = /^web-(\d+)$/;

export { EXCESS_BASE_INCOME_WEB_ID, EXCESS_SPECIAL_WEB_ID };

/** Clamp preset to [5, 25], then N = round(2.4 × T). */
export function computeExcessWebCount(presetSeconds: number): number {
  const t = Number.isFinite(presetSeconds)
    ? Math.min(
        V2_EXCESS_PRESET_MAX,
        Math.max(V2_EXCESS_PRESET_MIN, Math.round(presetSeconds)),
      )
    : V2_EXCESS_PRESET_MIN;
  return Math.round(V2_EXCESS_WEB_COUNT_FACTOR * t);
}

/**
 * Accept `web-N` (0 <= N < webCount), `base-income-web`, or legacy `web-special`.
 * Returns regular index, "base_income", "special", or null.
 */
export function validateExcessWebId(
  webId: unknown,
  webCount: number,
): number | "base_income" | "special" | null {
  if (typeof webId !== "string") return null;
  if (isBaseIncomeWebId(webId)) return "base_income";
  if (webId === EXCESS_SPECIAL_WEB_ID) return "special";
  const m = WEB_ID_RE.exec(webId);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isInteger(n) || n < 0) return null;
  const count = Math.floor(Number(webCount));
  if (!Number.isFinite(count) || count <= 0 || n >= count) return null;
  return n;
}

export function isExcessWebCleared(
  webId: string,
  clearedIds: readonly string[],
): boolean {
  return clearedIds.includes(webId);
}

/** Append without duplicates; returns a new array. */
export function appendClearedExcessWebId(
  clearedIds: readonly string[],
  webId: string,
): string[] {
  if (clearedIds.includes(webId)) return [...clearedIds];
  return [...clearedIds, webId];
}

/** Parse TEXT[] / JSON / pg array-ish values into unique web-* / red-web ids. */
export function parseClearedExcessWebIds(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.length > 0) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      list = trimmed
        .slice(1, -1)
        .split(",")
        .map((s) => s.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
    } else {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        // ignore
      }
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const id = String(item);
    const ok =
      WEB_ID_RE.test(id) ||
      isBaseIncomeWebId(id) ||
      id === EXCESS_SPECIAL_WEB_ID;
    if (!ok || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function excessSessionEndAtMs(
  startedAt: number | null | undefined,
  presetSeconds: number | null | undefined,
): number | null {
  const started = Number(startedAt);
  const preset = Number(presetSeconds);
  if (!Number.isFinite(started) || !Number.isFinite(preset)) return null;
  return started + preset * 1000;
}

export function isExcessSessionTimeExpired(
  startedAt: number | null | undefined,
  presetSeconds: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const endAt = excessSessionEndAtMs(startedAt, presetSeconds);
  if (endAt == null) return true;
  return nowMs >= endAt;
}

/**
 * Finish-only skew window: client clocks slightly ahead of the server must not
 * leave gameplay stuck at display 0 with 409 not_finishable.
 * Does not apply to web-clear expiry (clears stay strict).
 */
/** Enough for typical client/server clock drift; well below shortest T=5s. */
export const EXCESS_FINISH_CLIENT_SKEW_MS = 2_000;

export function isExcessSessionFinishableByTime(
  startedAt: number | null | undefined,
  presetSeconds: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return isExcessSessionTimeExpired(
    startedAt,
    presetSeconds,
    nowMs + EXCESS_FINISH_CLIENT_SKEW_MS,
  );
}

/** Mulberry32 — compact seeded PRNG (deterministic). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointInExclusionZone(
  x: number,
  y: number,
  zone: ExcessWebExclusionZone,
): boolean {
  return x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1;
}

export function isCenterInAnyExclusion(x: number, y: number): boolean {
  for (const z of EXCESS_WEB_EXCLUSION_ZONES) {
    if (pointInExclusionZone(x, y, z)) return true;
  }
  return false;
}

function softMinDistance(webCount: number): number {
  const base = 0.07;
  const scaled = base * Math.sqrt(12 / Math.max(12, webCount));
  return Math.max(0.018, scaled);
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Deterministic web layout from stored seed + webCount.
 * Same inputs → same placements. Never uses Math.random().
 */
export function generateExcessWebLayout(input: {
  seed: number;
  webCount: number;
  presetSeconds?: number;
}): ExcessWebPlacement[] {
  const seed = Number(input.seed) >>> 0;
  const webCount = Math.max(
    0,
    Math.min(60, Math.floor(Number(input.webCount) || 0)),
  );
  if (webCount === 0) return [];

  const rand = mulberry32(seed);
  const minDist = softMinDistance(webCount);
  const minDist2 = minDist * minDist;
  const { x0, x1, y0, y1 } = EXCESS_WEB_PLAYABLE;
  const placed: ExcessWebPlacement[] = [];

  for (let i = 0; i < webCount; i++) {
    let best: { x: number; y: number; score: number } | null = null;

    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const x = x0 + rand() * (x1 - x0);
      const y = y0 + rand() * (y1 - y0);
      if (isCenterInAnyExclusion(x, y)) continue;

      let nearest = Infinity;
      for (const p of placed) {
        nearest = Math.min(nearest, dist2(x, y, p.x, p.y));
      }
      const okSpacing = placed.length === 0 || nearest >= minDist2;
      const score = nearest;
      if (okSpacing) {
        best = { x, y, score };
        break;
      }
      if (!best || score > best.score) {
        best = { x, y, score };
      }
    }

    if (!best) {
      for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
        const x = x0 + rand() * (x1 - x0);
        const y = y0 + rand() * (y1 - y0);
        if (!isCenterInAnyExclusion(x, y)) {
          best = { x, y, score: 0 };
          break;
        }
      }
    }
    if (!best) {
      const x = x0 + ((i * 0.137) % (x1 - x0));
      const y = y0 + ((i * 0.097) % (y1 - y0));
      best = {
        x: isCenterInAnyExclusion(x, y) ? x0 + 0.02 : x,
        y: isCenterInAnyExclusion(x, y) ? y1 - 0.02 : y,
        score: 0,
      };
      if (isCenterInAnyExclusion(best.x, best.y)) {
        best = { x: 0.12, y: 0.22, score: 0 };
      }
    }

    const size =
      EXCESS_WEB_SIZE_MIN +
      rand() * (EXCESS_WEB_SIZE_MAX - EXCESS_WEB_SIZE_MIN);
    const rotation =
      EXCESS_WEB_ROTATION_MIN +
      rand() * (EXCESS_WEB_ROTATION_MAX - EXCESS_WEB_ROTATION_MIN);

    placed.push({
      id: `web-${i}`,
      x: round4(best.x),
      y: round4(best.y),
      size: round4(size),
      rotation: round4(rotation),
      type: "regular",
      kind: "regular",
      cleared: false,
    });
  }

  return placed;
}

function placeRedWebAwayFromRegular(input: {
  seed: number;
  regular: readonly ExcessWebPlacement[];
  id: string;
  type: ExcessWebKind;
}): ExcessWebPlacement {
  const rand = mulberry32((Number(input.seed) >>> 0) ^ 0xa5a5a5a5);
  const minDist = 0.12;
  const minDist2 = minDist * minDist;
  const { x0, x1, y0, y1 } = EXCESS_WEB_PLAYABLE;
  let best: { x: number; y: number; score: number } | null = null;

  for (let attempt = 0; attempt < PLACE_ATTEMPTS * 2; attempt++) {
    const x = x0 + rand() * (x1 - x0);
    const y = y0 + rand() * (y1 - y0);
    if (isCenterInAnyExclusion(x, y)) continue;
    let nearest = Infinity;
    for (const p of input.regular) {
      nearest = Math.min(nearest, dist2(x, y, p.x, p.y));
    }
    const ok = input.regular.length === 0 || nearest >= minDist2;
    if (ok) {
      best = { x, y, score: nearest };
      break;
    }
    if (!best || nearest > best.score) best = { x, y, score: nearest };
  }

  if (!best) {
    best = { x: 0.18, y: 0.28, score: 0 };
    if (isCenterInAnyExclusion(best.x, best.y)) {
      best = { x: 0.82, y: 0.3, score: 0 };
    }
  }

  return {
    id: input.id,
    x: round4(best.x),
    y: round4(best.y),
    size: EXCESS_BASE_INCOME_WEB_SIZE,
    rotation: EXCESS_BASE_INCOME_WEB_ROTATION,
    type: input.type,
    kind: input.type,
    cleared: false,
  };
}

/**
 * Place the version-2 red base-income web away from regular webs (deterministic).
 * Does not change regular layout positions.
 */
export function placeBaseIncomeWeb(input: {
  seed: number;
  regular: readonly ExcessWebPlacement[];
}): ExcessWebPlacement {
  return placeRedWebAwayFromRegular({
    seed: input.seed,
    regular: input.regular,
    id: EXCESS_BASE_INCOME_WEB_ID,
    type: "base_income",
  });
}

/**
 * Legacy special red web (`web-special`). Prefer placeBaseIncomeWeb for new sessions.
 */
export function placeSpecialExcessWeb(input: {
  seed: number;
  regular: readonly ExcessWebPlacement[];
}): ExcessWebPlacement {
  return placeRedWebAwayFromRegular({
    seed: input.seed,
    regular: input.regular,
    id: EXCESS_SPECIAL_WEB_ID,
    type: "special",
  });
}

/** Regular layout + one base-income red web (version=2 default). */
export function generateExcessWebLayoutWithBaseIncome(input: {
  seed: number;
  webCount: number;
  presetSeconds?: number;
}): ExcessWebPlacement[] {
  const regular = generateExcessWebLayout(input);
  const red = placeBaseIncomeWeb({
    seed: input.seed,
    regular,
  });
  return [...regular, red];
}

/**
 * Regular layout + one red web.
 * New gens use base_income; `special` maps to base_income for new layouts.
 */
export function generateExcessWebLayoutWithSpecial(input: {
  seed: number;
  webCount: number;
  presetSeconds?: number;
  /** When true (default), emit base-income-web. Legacy sessions may pass false. */
  useBaseIncome?: boolean;
}): ExcessWebPlacement[] {
  if (input.useBaseIncome === false) {
    const regular = generateExcessWebLayout(input);
    const special = placeSpecialExcessWeb({
      seed: input.seed,
      regular,
    });
    return [...regular, special];
  }
  return generateExcessWebLayoutWithBaseIncome(input);
}

/** Attach cleared flags from session cleared ids (+ optional base-web flag). */
export function applyClearedFlagsToWebs(
  webs: ExcessWebPlacement[],
  clearedIds: readonly string[],
  options?: { baseWebCleared?: boolean },
): ExcessWebPlacement[] {
  const set = new Set(clearedIds);
  const baseCleared = options?.baseWebCleared === true;
  return webs.map((w) => {
    const isBase =
      w.type === "base_income" ||
      w.kind === "base_income" ||
      isBaseIncomeWebId(w.id) ||
      isExcessSpecialWebId(w.id);
    return {
      ...w,
      cleared: isBase ? baseCleared || set.has(w.id) : set.has(w.id),
    };
  });
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Create a one-shot layout seed for session start (not used on GET). */
export function createExcessWebLayoutSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}
