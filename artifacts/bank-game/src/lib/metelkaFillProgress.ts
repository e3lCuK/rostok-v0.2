/**
 * Metelka icon fill — visual only from economy Metelka preset T_excess(n).
 *
 * T ∈ [5,25] comes from backend excessPresetSeconds (or locked session.presetSeconds).
 * Never use floor(excessSeconds): the ledger is unlimited game-seconds; T is derived from n.
 *
 * presetIndex = clamp(T - 4, 1, 21)
 * fillProgress = presetIndex / 22
 */

/** Visual divisions; last slot unreachable so the icon never looks 100% full. */
export const METELKA_FILL_DIVISIONS = 22;

export const METELKA_PRESET_MIN_SECONDS = 5;
export const METELKA_PRESET_MAX_SECONDS = 25;

/** Max reachable fill = 21/22 (preset 25). */
export const METELKA_FILL_MAX_VISUAL =
  (METELKA_PRESET_MAX_SECONDS - 4) / METELKA_FILL_DIVISIONS;

/**
 * Clamp a Metelka duration preset into the visual 5…25 band.
 * Returns null when missing / below unlock.
 */
export function metelkaVisualPresetSeconds(
  presetSeconds: number,
): number | null {
  const n = Number(presetSeconds);
  if (!Number.isFinite(n) || n < METELKA_PRESET_MIN_SECONDS) return null;
  return Math.min(
    METELKA_PRESET_MAX_SECONDS,
    Math.max(METELKA_PRESET_MIN_SECONDS, Math.round(n)),
  );
}

/** presetIndex for T in 5…25 → 1…21. Invalid → 0. */
export function metelkaPresetIndex(presetSeconds: number): number {
  const visual = metelkaVisualPresetSeconds(presetSeconds);
  if (visual == null) return 0;
  return visual - 4;
}

/**
 * Soft fill for the Metelka button from economy preset T (not excess ledger).
 */
export function metelkaFillProgress(presetSeconds: number): number {
  const index = metelkaPresetIndex(presetSeconds);
  if (index <= 0) return 0;
  return index / METELKA_FILL_DIVISIONS;
}

export const getMetelkaFillProgress = metelkaFillProgress;
