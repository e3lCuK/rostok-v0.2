export interface SunPreset {
  id: string;
  durationSec: number;
  totalTargets: number;
  spawnIntervalMs: number;
}

const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 25;
const TARGETS_PER_SEC = 2;
const SPAWN_INTERVAL_MS = 500;

function buildSunPreset(durationSec: number): SunPreset {
  const totalTargets = durationSec * TARGETS_PER_SEC;
  return {
    id: `sun-${durationSec}`,
    durationSec,
    totalTargets,
    spawnIntervalMs: SPAWN_INTERVAL_MS,
  };
}

/** Linear model: 2 targets per second (5 s → 10, …, 25 s → 50). */
export const SUN_PRESETS: readonly SunPreset[] = Array.from(
  { length: MAX_DURATION_SEC - MIN_DURATION_SEC + 1 },
  (_, index) => buildSunPreset(MIN_DURATION_SEC + index),
);
