export interface FertilizerPreset {
  id: string;
  durationSec: number;
  maxRows: number;
}

const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 25;
const ROWS_AT_15_SEC = 12;

/** Linear scale: 12 rows at 15 s, proportional for other durations. */
function maxRowsForDuration(durationSec: number): number {
  return Math.round((ROWS_AT_15_SEC * durationSec) / 15);
}

function buildFertilizerPreset(durationSec: number): FertilizerPreset {
  return {
    id: `fertilizer-${durationSec}`,
    durationSec,
    maxRows: maxRowsForDuration(durationSec),
  };
}

export const FERTILIZER_PRESETS: readonly FertilizerPreset[] = Array.from(
  { length: MAX_DURATION_SEC - MIN_DURATION_SEC + 1 },
  (_, index) => buildFertilizerPreset(MIN_DURATION_SEC + index),
);
