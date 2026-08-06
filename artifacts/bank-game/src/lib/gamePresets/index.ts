export { WATER_PRESETS, buildWaterPreset, buildWaterV1LegacyPreset, type WaterPreset } from "./waterPresets";
export { SUN_PRESETS, buildSunPreset, buildSunV1LegacyPreset, type SunPreset } from "./sunPresets";
export {
  FERTILIZER_PRESETS,
  FERTILIZER_DEFAULT_PRESET,
  buildFertilizerPresetForDuration,
  buildFertilizerV1LegacyPreset,
  type FertilizerPreset,
} from "./fertilizerPresets";
export {
  distributeEnergyEvenly,
  distributeEnergyAmong,
  computeLiveAllocation,
  type ActivityEnergyAllocation,
  type CareActivity,
} from "./energyAllocation";

