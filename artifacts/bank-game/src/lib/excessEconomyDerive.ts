/**
 * Derive Metelka / excess economy readouts from the game ledger.
 *
 * Source of truth for live (pre-session) values:
 *   excessSeconds  →  n  →  T(n), r_excess(n)
 *
 * excessPresetSeconds is NEVER independent state — always T(n).
 * Financial t_excess is excessElapsedMs (wall-clock) — not derived here.
 *
 * Formulas match api-server economy-v2-excess.ts (do not drift).
 */

export const V2_EXCESS_CYCLE_SECONDS = 60;
export const V2_EXCESS_MIN_AVAILABLE_SECONDS = 5;
export const V2_EXCESS_PRESET_MIN = 5;
export const V2_EXCESS_PRESET_MAX = 25;

export function normalizeExcessSeconds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** n = excessSeconds / 60 */
export function excessCycleFromSeconds(excessSeconds: number): number {
  return normalizeExcessSeconds(excessSeconds) / V2_EXCESS_CYCLE_SECONDS;
}

/** r_excess(n) = 0.005 + 0.01 × exp(−0.06 × n) */
export function excessBonusRate(cycleCount: number): number {
  const n = Number.isFinite(cycleCount) ? Math.max(0, cycleCount) : 0;
  return 0.005 + 0.01 * Math.exp(-0.06 * n);
}

/**
 * T_excess(n) = 5 + round(20 × (1 − exp(−0.06 × n))), clamped to [5, 25].
 * This is the only definition of live excessPresetSeconds.
 */
export function excessPresetSecondsFromCycle(cycleCount: number): number {
  const n = Number.isFinite(cycleCount) ? Math.max(0, cycleCount) : 0;
  const raw = 5 + Math.round(20 * (1 - Math.exp(-0.06 * n)));
  return Math.min(V2_EXCESS_PRESET_MAX, Math.max(V2_EXCESS_PRESET_MIN, raw));
}

/** Derive live Metelka duration T from the unlimited game ledger. */
export function deriveExcessPresetSeconds(excessSeconds: number): number {
  return excessPresetSecondsFromCycle(excessCycleFromSeconds(excessSeconds));
}

/**
 * Search step (game-seconds) for inverse T → min ledger.
 * Must match api-server economy-v2-excess.MIN_LEDGER_SEARCH_STEP.
 */
export const MIN_LEDGER_SEARCH_STEP = 0.01;

/**
 * Minimal playable ledger that yields target Metelka preset T via production T(n).
 * Same algorithm as api-server minExcessSecondsForPreset — keep in sync.
 * Never sets excessSeconds = T directly.
 */
export function minExcessSecondsForPreset(targetPresetSeconds: number): number {
  const T = Math.min(
    V2_EXCESS_PRESET_MAX,
    Math.max(
      V2_EXCESS_PRESET_MIN,
      Math.round(Number(targetPresetSeconds) || V2_EXCESS_PRESET_MIN),
    ),
  );

  if (T === V2_EXCESS_PRESET_MIN) {
    return V2_EXCESS_MIN_AVAILABLE_SECONDS;
  }

  const k = T - V2_EXCESS_PRESET_MIN;
  const xLow = k - 0.5;
  const ratio = xLow / 20;
  const nApprox =
    ratio > 0 && ratio < 1 ? -Math.log(1 - ratio) / 0.06 : 0;
  let s = Math.max(0, nApprox * V2_EXCESS_CYCLE_SECONDS - 1);

  const maxScan = 100_000;
  while (s <= maxScan) {
    if (deriveExcessPresetSeconds(s) === T) {
      let min = s;
      while (
        min - MIN_LEDGER_SEARCH_STEP >= 0 &&
        deriveExcessPresetSeconds(min - MIN_LEDGER_SEARCH_STEP) === T
      ) {
        min -= MIN_LEDGER_SEARCH_STEP;
      }
      // Quantize to 0.01 grid: smallest grid point that still yields T.
      let out = Math.ceil(min * 100 - 1e-12) / 100;
      while (deriveExcessPresetSeconds(out) < T) {
        out = Math.round((out + MIN_LEDGER_SEARCH_STEP) * 100) / 100;
      }
      while (
        out - MIN_LEDGER_SEARCH_STEP >= 0 &&
        deriveExcessPresetSeconds(out - MIN_LEDGER_SEARCH_STEP) === T
      ) {
        out = Math.round((out - MIN_LEDGER_SEARCH_STEP) * 100) / 100;
      }
      return out;
    }
    s += MIN_LEDGER_SEARCH_STEP;
  }

  return 3688.88;
}

export function isExcessAvailable(excessSeconds: number): boolean {
  return (
    normalizeExcessSeconds(excessSeconds) >= V2_EXCESS_MIN_AVAILABLE_SECONDS
  );
}

/** All live derived fields from ledger seconds (ignore any stale preset). */
export function deriveExcessLiveFields(excessSecondsRaw: unknown): {
  excessSeconds: number;
  excessCycle: number;
  excessAvailable: boolean;
  excessPresetSeconds: number;
  excessRate: number;
} {
  const excessSeconds = normalizeExcessSeconds(excessSecondsRaw);
  const excessCycle = excessCycleFromSeconds(excessSeconds);
  return {
    excessSeconds,
    excessCycle,
    excessAvailable: isExcessAvailable(excessSeconds),
    excessPresetSeconds: excessPresetSecondsFromCycle(excessCycle),
    excessRate: excessBonusRate(excessCycle),
  };
}
