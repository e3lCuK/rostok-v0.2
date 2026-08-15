import type { EconomyV2RootsState } from "./api";

export const V2_ROOT_SECTION_COUNT = 60;
export const V2_ROOT_COUNT = 4;
export const V2_SECTIONS_PER_ROOT = 15;

export function emptyV2RootsState(): EconomyV2RootsState {
  return {
    readyMask: "0",
    readyCount: 0,
    generationProgress: 0,
    secondsPerSection: 720,
    secondsUntilNextSection: null,
    isFull: false,
    storageFull: false,
    storageOccupied: 0,
    storageFree: 60,
    storageOverCapacity: false,
  };
}

export function normalizeV2Roots(
  raw: EconomyV2RootsState | null | undefined,
): EconomyV2RootsState {
  if (!raw) return emptyV2RootsState();
  return {
    readyMask: String(raw.readyMask ?? "0"),
    readyCount: Number(raw.readyCount) || 0,
    generationProgress: Number(raw.generationProgress) || 0,
    secondsPerSection: Number(raw.secondsPerSection) || 0,
    secondsUntilNextSection:
      raw.secondsUntilNextSection == null
        ? null
        : Number(raw.secondsUntilNextSection),
    isFull: !!raw.isFull,
    storageFull: !!raw.storageFull,
    storageOccupied:
      raw.storageOccupied == null ? undefined : Number(raw.storageOccupied),
    storageFree: raw.storageFree == null ? undefined : Number(raw.storageFree),
    storageOverCapacity: !!raw.storageOverCapacity,
  };
}

export function parseReadyMask(mask: string | null | undefined): bigint {
  try {
    const n = BigInt(String(mask ?? "0"));
    return n < 0n ? 0n : n;
  } catch {
    return 0n;
  }
}

export function isSectionReady(mask: bigint, sectionIndex: number): boolean {
  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= V2_ROOT_SECTION_COUNT
  ) {
    return false;
  }
  return ((mask >> BigInt(sectionIndex)) & 1n) === 1n;
}

/**
 * First empty section in 0..59 order — same order as backend placeMaturedSections.
 * Returns null when all 60 bits are ready.
 */
export function findGeneratingSectionIndex(
  mask: bigint | string | null | undefined,
): number | null {
  const m = typeof mask === "bigint" ? mask : parseReadyMask(mask);
  for (let i = 0; i < V2_ROOT_SECTION_COUNT; i++) {
    if (!isSectionReady(m, i)) return i;
  }
  return null;
}

export type RootSectionVisualState =
  | "empty"
  | "generating"
  | "ready"
  | "collecting";

export function resolveSectionVisualState(input: {
  sectionIndex: number;
  readyMask: bigint;
  generatingSectionIndex: number | null;
  collectingSectionIndex?: number | null;
  collectingSectionIndices?: ReadonlySet<number> | null;
}): RootSectionVisualState {
  const collecting =
    input.collectingSectionIndices?.has(input.sectionIndex) === true ||
    input.collectingSectionIndex === input.sectionIndex;
  if (collecting) return "collecting";
  if (isSectionReady(input.readyMask, input.sectionIndex)) return "ready";
  if (input.generatingSectionIndex === input.sectionIndex) return "generating";
  return "empty";
}

/** Clamp visual progress to the closed unit interval. */
export function clampUnitProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

/**
 * Central timer/bar fill: progress = 1 - remaining / total (clamped 0..1).
 * Single source for countdown bar and generating-section fill.
 */
export function resolveCountdownProgress(
  remainingSeconds: number | null | undefined,
  totalSeconds: number,
): number {
  if (!(totalSeconds > 0) || !Number.isFinite(totalSeconds)) return 0;
  if (remainingSeconds == null || !Number.isFinite(remainingSeconds)) return 0;
  return clampUnitProgress(1 - remainingSeconds / totalSeconds);
}

/** Local fill 0..1 for the generating section (prefer timer-derived when available). */
export function resolveGeneratingProgress(input: {
  generationProgress: number;
  secondsUntilNextSection: number | null;
  secondsPerSection: number;
}): number {
  const server = clampUnitProgress(
    Number.isFinite(input.generationProgress) ? input.generationProgress : 0,
  );
  const until = input.secondsUntilNextSection;
  const per = input.secondsPerSection;
  if (until == null || !(per > 0) || !Number.isFinite(until)) return server;
  return resolveCountdownProgress(until, per);
}

/**
 * Ceiling countdown label (m:ss).
 * Optional `cycleCapSeconds` clamps the display so a fresh full cycle never
 * shows past the cycle length (e.g. 720.01 → "12:00", not ceil → "12:01").
 */
export function formatRootTimer(
  totalSeconds: number,
  cycleCapSeconds?: number,
): string {
  let s = Math.max(0, Math.ceil(totalSeconds));
  if (
    cycleCapSeconds != null &&
    Number.isFinite(cycleCapSeconds) &&
    cycleCapSeconds > 0
  ) {
    s = Math.min(s, Math.max(1, Math.round(cycleCapSeconds)));
  }
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function rootIndexForSection(sectionIndex: number): number {
  return Math.floor(sectionIndex / V2_SECTIONS_PER_ROOT);
}

export function sectionInRoot(sectionIndex: number): number {
  return sectionIndex % V2_SECTIONS_PER_ROOT;
}

export function sectionIndexForRoot(
  rootIndex: number,
  sectionInRootIndex: number,
): number {
  return rootIndex * V2_SECTIONS_PER_ROOT + sectionInRootIndex;
}

/** True when the root (0–3) has at least one ready bit. */
export function rootHasReadySection(
  rootIndex: number,
  readyMask: bigint | string | null | undefined,
): boolean {
  return getNextCollectableSectionIndex(rootIndex, readyMask) != null;
}

/**
 * Next section to collect on a root — tip → trunk base (14 → 0).
 * Generation order (0 → 59) is unchanged; only collect preference.
 */
export function getNextCollectableSectionIndex(
  rootIndex: number,
  readyMask: bigint | string | null | undefined,
): number | null {
  if (
    !Number.isInteger(rootIndex) ||
    rootIndex < 0 ||
    rootIndex >= V2_ROOT_COUNT
  ) {
    return null;
  }
  const mask = typeof readyMask === "bigint" ? readyMask : parseReadyMask(readyMask);
  for (let sectionInRootIndex = V2_SECTIONS_PER_ROOT - 1; sectionInRootIndex >= 0; sectionInRootIndex--) {
    const sectionIndex = sectionIndexForRoot(rootIndex, sectionInRootIndex);
    if (isSectionReady(mask, sectionIndex)) return sectionIndex;
  }
  return null;
}

export type RootTimerDisplay =
  | {
      kind: "countdown";
      seconds: number;
      timeLabel: string;
      barProgress: number;
      pulse: boolean;
    }
  | { kind: "hidden" };

/**
 * Soft end-of-cycle pulse: last ≤10% of the cycle, but never longer than 8s
 * (so a 12-minute cycle does not pulse through the whole final minute).
 */
export function shouldPulseRootTimerBar(input: {
  remainingSeconds: number;
  totalSeconds: number;
}): boolean {
  const rem = input.remainingSeconds;
  const total = input.totalSeconds;
  if (!(total > 0) || !Number.isFinite(total)) return false;
  if (!Number.isFinite(rem) || rem <= 0) return false;
  const threshold = Math.min(8, Math.max(1, total * 0.1));
  return rem <= threshold;
}

/**
 * Central gate for the oval countdown capsule.
 * Does not use floored bank — only server storageFull + countdown.
 */
export function shouldShowRootCountdown(input: {
  capital: number;
  storageFull?: boolean;
  secondsUntilNext: number | null | undefined;
  /** When false, Economy v2 countdown stays hidden (Tutorial). Default true. */
  tutorialDone?: boolean;
}): boolean {
  if (input.tutorialDone === false) return false;
  return (
    input.capital > 0 &&
    !input.storageFull &&
    input.secondsUntilNext != null
  );
}

/**
 * Visual projection of server countdown — not an independent clock source.
 * When storage is full, capital≤0, or Tutorial is active: hide the indicator.
 */
export function resolveRootTimerDisplay(input: {
  isFull: boolean;
  storageFull?: boolean;
  capital: number;
  secondsUntilNext: number | null | undefined;
  secondsPerSection?: number | null;
  tutorialDone?: boolean;
}): RootTimerDisplay {
  if (input.isFull) {
    return { kind: "hidden" };
  }
  if (
    !shouldShowRootCountdown({
      capital: input.capital,
      storageFull: input.storageFull,
      secondsUntilNext: input.secondsUntilNext,
      tutorialDone: input.tutorialDone,
    })
  ) {
    return { kind: "hidden" };
  }
  const seconds = Math.max(0, input.secondsUntilNext as number);
  const total =
    input.secondsPerSection != null &&
    Number.isFinite(input.secondsPerSection) &&
    input.secondsPerSection > 0
      ? input.secondsPerSection
      : 0;
  const cycleCap = total > 0 ? Math.max(1, Math.round(total)) : undefined;
  const remaining =
    cycleCap != null ? Math.min(seconds, cycleCap) : seconds;
  return {
    kind: "countdown",
    seconds: remaining,
    timeLabel: formatRootTimer(remaining, cycleCap),
    barProgress: resolveCountdownProgress(remaining, total),
    pulse: shouldPulseRootTimerBar({
      remainingSeconds: remaining,
      totalSeconds: total,
    }),
  };
}

/** Dash geometry along pathLength=100 for 15 visible sections with gaps. */
export const ROOT_SECTION_PATH_LENGTH = 100;
export const ROOT_SECTION_SLOT =
  ROOT_SECTION_PATH_LENGTH / V2_SECTIONS_PER_ROOT; // ≈6.667
/**
 * Visible fraction of each slot. ~72% bead / ~28% gap so segments read at 100% zoom
 * even with strokeLinecap=round (caps eat into the gap).
 */
export const ROOT_SECTION_VISUAL_RATIO = 0.72;
export const ROOT_SECTION_VISUAL_LEN =
  ROOT_SECTION_SLOT * ROOT_SECTION_VISUAL_RATIO;

export function sectionDashOffset(sectionInRoot: number): number {
  return -(sectionInRoot * ROOT_SECTION_SLOT);
}

/**
 * Visual stroke-width factors for sections 1…15 (index 0…14).
 * Stronger base→tip taper; hit width stays independent.
 */
const SECTION_WIDTH_FACTORS: readonly number[] = [
  1.0, 0.98, 0.95, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6, 0.56,
  0.51, 0.46,
] as const;

export function sectionStrokeWidthFactor(sectionInRoot: number): number {
  const i = Math.min(
    SECTION_WIDTH_FACTORS.length - 1,
    Math.max(0, Math.floor(sectionInRoot)),
  );
  return SECTION_WIDTH_FACTORS[i];
}

/** Build a decimal readyMask string from section indices (DEV helpers). */
export function buildReadyMaskFromSections(sections: number[]): string {
  let mask = 0n;
  for (const i of sections) {
    if (i >= 0 && i < V2_ROOT_SECTION_COUNT) mask |= 1n << BigInt(i);
  }
  return mask.toString(10);
}

export function buildFullReadyMask(): string {
  let mask = 0n;
  for (let i = 0; i < V2_ROOT_SECTION_COUNT; i++) mask |= 1n << BigInt(i);
  return mask.toString(10);
}
