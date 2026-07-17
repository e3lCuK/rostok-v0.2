/**
 * Client-only feature flags for staged v2 rollout.
 * Default: false — v1 UI unchanged.
 *
 * Enable mock layer: VITE_SHOW_ECONOMY_V2_MOCKS=true
 */
export const SHOW_ECONOMY_V2_MOCKS =
  import.meta.env.VITE_SHOW_ECONOMY_V2_MOCKS === "true";

/** Dev-only: override water minigame with a v2 preset (e.g. VITE_DEBUG_WATER_V2_PRESET_SEC=5). */
export const DEBUG_WATER_V2_PRESET_SEC = (() => {
  if (!import.meta.env.DEV) return null;
  const raw = import.meta.env.VITE_DEBUG_WATER_V2_PRESET_SEC;
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
})();
