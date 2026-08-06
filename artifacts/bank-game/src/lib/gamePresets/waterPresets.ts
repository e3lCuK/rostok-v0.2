export interface WaterPreset {
  id: string;
  durationSec: number;
  totalDrops: number;
  spawnIntervalMs: number;
}

const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 25;
const DROPS_PER_SEC = 2;

/** Build a water preset for any positive whole-second duration (Economy v2). */
export function buildWaterPreset(durationSec: number): WaterPreset {
  const safe = Math.max(1, Math.floor(durationSec));
  const totalDrops = safe * DROPS_PER_SEC;
  return {
    id: `water-${safe}`,
    durationSec: safe,
    totalDrops,
    spawnIntervalMs: Math.round((safe * 1000) / totalDrops),
  };
}

/** Linear model: 2 drops per second (5 s → 10, …, 25 s → 50). */
export const WATER_PRESETS: readonly WaterPreset[] = Array.from(
  { length: MAX_DURATION_SEC - MIN_DURATION_SEC + 1 },
  (_, index) => buildWaterPreset(MIN_DURATION_SEC + index),
);

/** v1 production defaults — 15 s base, 35 drops, spawn spread across base duration. */
export const WATER_V1_BASE_DURATION_SEC = 15;
export const WATER_V1_TOTAL_DROPS = 35;
export const WATER_V1_SPAWN_INTERVAL_MS = (WATER_V1_BASE_DURATION_SEC * 1000) / WATER_V1_TOTAL_DROPS;

export function buildWaterV1LegacyPreset(bonusSeconds: number): WaterPreset {
  return {
    id: "water-v1-legacy",
    durationSec: WATER_V1_BASE_DURATION_SEC + bonusSeconds,
    totalDrops: WATER_V1_TOTAL_DROPS,
    spawnIntervalMs: WATER_V1_SPAWN_INTERVAL_MS,
  };
}
