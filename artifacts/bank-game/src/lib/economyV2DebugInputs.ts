/**
 * Shared parse/validate helpers for Economy v2 debug inputs (right panel).
 */

/** Energy / excess add: trim, finite, > 0 (fractional allowed). */
export function parsePositiveSecondsInput(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Roots add (v2): trim, positive integer only. */
export function parsePositiveIntInput(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** V3 roots/reserves set: trim, whole integer ≥ 0 (0 allowed). */
export function parseNonNegativeIntInput(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function formatBankDebugParts(seconds: number): { label: string; value: string } {
  const n = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return { label: "Банк", value: `${n.toFixed(2)} / 60 сек` };
}

export function formatBankDebugLabel(seconds: number): string {
  const { label, value } = formatBankDebugParts(seconds);
  return `${label}: ${value}`;
}

export function formatRootsDebugParts(readyCount: number): {
  label: string;
  value: string;
} {
  const n =
    typeof readyCount === "number" && Number.isFinite(readyCount)
      ? Math.max(0, Math.floor(readyCount))
      : 0;
  return { label: "Готовые секции", value: `${n} / 60` };
}

export function formatRootsDebugLabel(readyCount: number): string {
  const { label, value } = formatRootsDebugParts(readyCount);
  return `${label}: ${value}`;
}

export function formatExcessDebugParts(
  seconds: number,
  livePresetSeconds?: number,
): {
  label: string;
  value: string;
} {
  const n = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const T =
    livePresetSeconds != null && Number.isFinite(livePresetSeconds)
      ? Math.round(livePresetSeconds)
      : null;
  return {
    label: "Ledger",
    value:
      T != null
        ? `${n.toFixed(2)} сек · live T=${T}`
        : `${n.toFixed(2)} сек`,
  };
}

export function formatExcessDebugLabel(
  seconds: number,
  livePresetSeconds?: number,
): string {
  const { label, value } = formatExcessDebugParts(seconds, livePresetSeconds);
  return `${label}: ${value}`;
}
