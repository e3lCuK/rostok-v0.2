import type { EconomyV2ExcessWeb } from "@/lib/api";

export const EXCESS_WEB_EXIT_MS = 240;

/** Prefer reduced motion → skip timed exit animation. */
export function excessWebExitDurationMs(
  prefersReducedMotion: boolean,
): number {
  return prefersReducedMotion ? 0 : EXCESS_WEB_EXIT_MS;
}

/**
 * Webs visible in the cleaning layer:
 * - uncleared webs
 * - cleared webs that are mid exit-animation
 */
export function filterVisibleExcessWebs(
  webs: EconomyV2ExcessWeb[],
  exitingIds: ReadonlySet<string>,
): EconomyV2ExcessWeb[] {
  return webs.filter((w) => !w.cleared || exitingIds.has(w.id));
}

export function canClickExcessWeb(input: {
  remainingSeconds: number;
  cleared?: boolean;
  inFlight: boolean;
  exiting: boolean;
}): boolean {
  if (input.remainingSeconds <= 0) return false;
  if (input.cleared) return false;
  if (input.inFlight) return false;
  if (input.exiting) return false;
  return true;
}

/** Parse stable index from `web-N` for aria labels. */
export function excessWebIndexLabel(webId: string): number | null {
  const m = /^web-(\d+)$/.exec(webId);
  if (!m) return null;
  return parseInt(m[1], 10);
}
