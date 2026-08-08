/**
 * Economy v3 activity palette.
 * Timer-capsule contrast: opaque rim (--ac) + lighter ~50% wash interior.
 */

import type { EconomyV3RootKind } from "@/lib/api";

/**
 * Opaque rim / icon / transfer flight — button --ac and root border.
 */
export const V3_ACTIVITY_ENERGY_COLORS: Record<EconomyV3RootKind, string> = {
  water: "#2b7fff",
  sun: "#ffc107",
  fertilizer: "#f0a020",
};

/** Button border / icon — identical to energy rim colors. */
export const V3_ACTIVITY_ACCENT_COLORS: Record<EconomyV3RootKind, string> =
  V3_ACTIVITY_ENERGY_COLORS;

/**
 * Light interior wash (activity cards + root cells) — same role as the
 * wait-timer mint fill under a darker green rim.
 */
export const V3_ACTIVITY_FILL_WASH_COLORS: Record<EconomyV3RootKind, string> = {
  water: "rgba(125, 211, 252, 0.5)",
  sun: "rgba(253, 224, 71, 0.5)",
  fertilizer: "rgba(251, 191, 36, 0.5)",
};

/** «Уход» shovel — opaque rim + light amber wash (timer contrast). */
export const V3_CARE_SHOVEL_RIM = "#92400e";
export const V3_CARE_SHOVEL_WASH = "rgba(251, 191, 36, 0.5)";

/** Metelka brush card — opaque stone rim + light grey wash. */
export const V3_METELKA_RIM = "#44403c";
export const V3_METELKA_WASH = "rgba(168, 162, 158, 0.5)";
