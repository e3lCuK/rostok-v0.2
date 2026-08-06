/**
 * Economy v3 activity palette.
 * Root segment fills are the source of truth; buttons / icons / reserve
 * fills reuse the same hues so underground and care UI stay matched.
 */

import type { EconomyV3RootKind } from "@/lib/api";

/**
 * Root energy fills (and transfer flight). Also used as button --ac /
 * icon stroke so activity buttons match their roots.
 */
export const V3_ACTIVITY_ENERGY_COLORS: Record<EconomyV3RootKind, string> = {
  water: "#2b7fff",
  sun: "#ffc107",
  fertilizer: "#f0a020",
};

/** Button border / icon — identical to root fill colors. */
export const V3_ACTIVITY_ACCENT_COLORS: Record<EconomyV3RootKind, string> =
  V3_ACTIVITY_ENERGY_COLORS;
