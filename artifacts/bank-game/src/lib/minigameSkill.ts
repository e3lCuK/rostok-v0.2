/**
 * Minigame skill 0–100 from catches vs opportunities in *this* preset.
 * Button fill uses the same percent (activityResultFillPercent).
 */

import { buildFertilizerPresetForDuration } from "./gamePresets/fertilizerPresets";
import type { WaterPreset } from "./gamePresets/waterPresets";

/** Care activity presets are whole seconds 5…25. */
export const CARE_MINIGAME_PRESET_SECONDS: readonly number[] = Array.from(
  { length: 21 },
  (_, i) => 5 + i,
);

/** Water canvas geometry — keep in sync with FallingGameWater. */
export const WATER_GAME_H = 348;
export const WATER_DROP_R = 11;
export const WATER_BAR_H = 11;
export const WATER_BAR_Y = WATER_GAME_H - 28;
export const WATER_DROP_SPEED_PX_S = 100;

export function minigameSkillPercent(
  caught: number,
  opportunities: number,
): number {
  const c = Math.max(0, Math.floor(Number(caught) || 0));
  const o = Math.max(0, Math.floor(Number(opportunities) || 0));
  if (o <= 0) return 0;
  return Math.min(100, Math.round((Math.min(c, o) / o) * 100));
}

/**
 * Time for a drop spawned at y = −R to first overlap the catch bar.
 * Drops spawned later than `totalMs − this` cannot be caught.
 */
export function waterDropFallToBarMs(): number {
  const startY = -WATER_DROP_R;
  const catchY = WATER_BAR_Y - WATER_BAR_H - WATER_DROP_R;
  const distPx = catchY - startY;
  return (distPx / WATER_DROP_SPEED_PX_S) * 1000;
}

export function waterCanSpawnAt(spawnAtMs: number, totalMs: number): boolean {
  return spawnAtMs + waterDropFallToBarMs() <= totalMs;
}

/** How many water drops can actually reach the bar before the timer ends. */
export function countCatchableWaterSpawns(input: {
  totalMs: number;
  spawnIntervalMs: number;
  maxDrops: number;
}): number {
  const interval = Math.max(1, Math.floor(Number(input.spawnIntervalMs) || 0));
  const max = Math.max(0, Math.floor(Number(input.maxDrops) || 0));
  const totalMs = Math.max(0, Number(input.totalMs) || 0);
  let n = 0;
  let t = 0;
  while (n < max) {
    if (!waterCanSpawnAt(t, totalMs)) break;
    n += 1;
    t += interval;
  }
  return n;
}

export function waterCatchableDropsForPreset(preset: WaterPreset): number {
  return countCatchableWaterSpawns({
    totalMs: preset.durationSec * 1000,
    spawnIntervalMs: preset.spawnIntervalMs,
    maxDrops: preset.totalDrops,
  });
}

/**
 * Match-3 100% bar for this Care duration — same 5…25 table as
 * `FERTILIZER_PRESETS[].maxRows` (12 rows at 15 s, scaled).
 */
export function fertilizerMaxMatchesForDuration(durationSec: number): number {
  return Math.max(1, buildFertilizerPresetForDuration(durationSec).maxRows);
}

export function minigameResultLabel(
  scored: number,
  opportunities: number,
): string {
  const n = Math.max(0, Math.floor(Number(scored) || 0));
  const max = Math.max(0, Math.floor(Number(opportunities) || 0));
  if (max <= 0 || n <= 0) return "Попробуйте ещё";
  if (n >= max) return "Отлично!";
  if (n >= Math.max(1, Math.round(max * 0.5))) return "Хорошо";
  return "Попробуйте ещё";
}
