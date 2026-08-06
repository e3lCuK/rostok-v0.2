/**
 * Visual flight helpers for Economy v3 root → activity-reserve transfer.
 * Coordinates come from live DOM rects — no hard-coded scene positions.
 */

import type { EconomyV3RootKind } from "@/lib/api";
import { V3_ACTIVITY_ENERGY_COLORS } from "@/lib/v3ActivityColors";

/** Soft flight blob colors — same tokens as root filled energy. */
export const V3_TRANSFER_FLIGHT_COLORS: Record<EconomyV3RootKind, string> =
  V3_ACTIVITY_ENERGY_COLORS;

export const V3_ACTIVITY_CARD_SELECTOR = (kind: EconomyV3RootKind) =>
  `[data-v3-activity-card="${kind}"]`;

export const V3_ACTIVITY_RESERVE_SELECTOR = (kind: EconomyV3RootKind) =>
  `[data-v3-activity-reserve-fill="${kind}"]`;

export const V3_ROOT_SELECTOR = (kind: EconomyV3RootKind) =>
  `[data-v3-root="${kind}"]`;

export type V3TransferFlightPoints = {
  kind: EconomyV3RootKind;
  fromX: number;
  fromY: number;
  midX: number;
  midY: number;
  toX: number;
  toY: number;
  color: string;
};

function centerOf(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Measure flight path from the chosen root to its matching activity card/reserve.
 * Returns null when either endpoint is missing (e.g. SSR / card not mounted).
 */
export function measureV3TransferFlight(
  kind: EconomyV3RootKind,
  doc: Document = document,
): V3TransferFlightPoints | null {
  const fromEl = doc.querySelector(V3_ROOT_SELECTOR(kind));
  const toEl =
    doc.querySelector(V3_ACTIVITY_RESERVE_SELECTOR(kind)) ??
    doc.querySelector(V3_ACTIVITY_CARD_SELECTOR(kind));
  if (!fromEl || !toEl) return null;

  const from = centerOf(fromEl.getBoundingClientRect());
  const to = centerOf(toEl.getBoundingClientRect());
  // Soft arc toward the card (activity column is typically left of the tree).
  const midX = from.x + (to.x - from.x) * 0.45;
  const midY = Math.min(from.y, to.y) - Math.abs(to.y - from.y) * 0.18 - 12;

  return {
    kind,
    fromX: from.x,
    fromY: from.y,
    midX,
    midY,
    toX: to.x,
    toY: to.y,
    color: V3_TRANSFER_FLIGHT_COLORS[kind],
  };
}

/** Map root kind → activity card kind (1:1 Water/Sun/Fertilizer). */
export function v3RootToActivityKind(
  kind: EconomyV3RootKind,
): EconomyV3RootKind {
  return kind;
}

const pulseTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Brief receive pulse on the matching activity card (visual only). */
export function pulseV3ActivityReceive(
  kind: EconomyV3RootKind,
  doc: Document = document,
  durationMs = 420,
): void {
  const el = doc.querySelector(V3_ACTIVITY_CARD_SELECTOR(kind));
  if (!el) return;
  const prev = pulseTimers.get(el);
  if (prev != null && typeof globalThis.clearTimeout === "function") {
    globalThis.clearTimeout(prev);
    pulseTimers.delete(el);
  }
  el.classList.add("v3-activity-card--receive");
  if (typeof globalThis.setTimeout !== "function") return;
  const id = globalThis.setTimeout(() => {
    el.classList.remove("v3-activity-card--receive");
    pulseTimers.delete(el);
  }, durationMs);
  pulseTimers.set(el, id);
}
