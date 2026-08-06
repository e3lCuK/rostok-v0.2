export interface FertilizerPreset {
  id: string;
  durationSec: number;
  /**
   * Legacy match-3 row budget (kept for compatibility with older UI).
   * Rising-granule catcher uses `totalDrops` instead.
   */
  maxRows: number;
  /** Number of fertilizer granules spawned during the run. */
  totalDrops: number;
  spawnIntervalMs: number;
}

const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 25;
const ROWS_AT_15_SEC = 12;
const GRANULES_PER_SEC = 2;

/** Linear scale: 12 rows at 15 s, proportional for other durations. */
function maxRowsForDuration(durationSec: number): number {
  return Math.round((ROWS_AT_15_SEC * durationSec) / 15);
}

function buildFertilizerPreset(durationSec: number): FertilizerPreset {
  const safe = Math.max(1, Math.floor(durationSec));
  const totalDrops = safe * GRANULES_PER_SEC;
  return {
    id: `fertilizer-${safe}`,
    durationSec: safe,
    maxRows: maxRowsForDuration(safe),
    totalDrops,
    spawnIntervalMs: Math.round((safe * 1000) / totalDrops),
  };
}

/** Economy v2 fertilizer: 5–25 s inclusive, 2 granules/sec rising toward roots. */
export const FERTILIZER_PRESETS: readonly FertilizerPreset[] = Array.from(
  { length: MAX_DURATION_SEC - MIN_DURATION_SEC + 1 },
  (_, index) => buildFertilizerPreset(MIN_DURATION_SEC + index),
);

/** Default production preset (15 s) — used when no override is selected. */
export const FERTILIZER_DEFAULT_PRESET =
  FERTILIZER_PRESETS.find((p) => p.durationSec === 15) ?? FERTILIZER_PRESETS[10];

/** Build fertilizer preset for any positive whole-second duration (Economy v2). */
export function buildFertilizerPresetForDuration(durationSec: number): FertilizerPreset {
  return buildFertilizerPreset(durationSec);
}

export function buildFertilizerV1LegacyPreset(bonusSeconds: number): FertilizerPreset {
  const durationSec = 15 + bonusSeconds;
  const totalDrops = 35;
  return {
    id: "fertilizer-v1-legacy",
    durationSec,
    maxRows: maxRowsForDuration(15),
    totalDrops,
    spawnIntervalMs: (15 * 1000) / totalDrops,
  };
}
