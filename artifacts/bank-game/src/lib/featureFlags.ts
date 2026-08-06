/**
 * Client-only feature flags for staged v2 rollout.
 * Default: false — v1 UI unchanged.
 *
 * Visual mock layer / debug energy panel: VITE_SHOW_ECONOMY_V2_MOCKS=true
 * Production Care path (start/activity/finish API): VITE_ENABLE_ECONOMY_V2_CARE=true
 * Root collection UI (manual tap harvest): VITE_ENABLE_ECONOMY_V2_ROOT_COLLECTION=true
 *
 * Note: root settle is always server-side after migration. This flag only
 * gates the production root UI / collect API client wiring.
 */
export const SHOW_ECONOMY_V2_MOCKS =
  import.meta.env.VITE_SHOW_ECONOMY_V2_MOCKS === "true";

/**
 * Wire GamePage Care to server-side Economy v2 Care endpoints.
 * Independent of the visual mock flag — do not reuse MOCKS as the long-term switch.
 */
export const ENABLE_ECONOMY_V2_CARE =
  import.meta.env.VITE_ENABLE_ECONOMY_V2_CARE === "true";

/** Production 4×15 root sections + collect endpoint. */
export const ENABLE_ECONOMY_V2_ROOT_COLLECTION =
  import.meta.env.VITE_ENABLE_ECONOMY_V2_ROOT_COLLECTION === "true";

/**
 * Legacy DEV preview flag for Economy v3 roots.
 * No longer required for production render: primary v3 roots UI follows
 * `game.v3Roots.enabled` (server ENABLE_ECONOMY_V3_ROOTS). Kept so missing
 * env does not break builds and older DEV setups still parse the variable.
 */
export const SHOW_ECONOMY_V3_ROOTS_PREVIEW =
  import.meta.env.VITE_SHOW_ECONOMY_V3_ROOTS_PREVIEW === "true";

/** Dev-only: override water minigame with a v2 preset (e.g. VITE_DEBUG_WATER_V2_PRESET_SEC=5). */
export const DEBUG_WATER_V2_PRESET_SEC = (() => {
  if (!import.meta.env.DEV) return null;
  const raw = import.meta.env.VITE_DEBUG_WATER_V2_PRESET_SEC;
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
})();
