/**
 * Landmark points on T(K) for the vault capital help modal.
 * Same formula as api-server `secondsPerGameSecondForCapital`.
 */

import { secondsPerGameSecondForCapital } from "@/lib/metelkaDebugRewardPreview";

export type VaultCapitalMark = {
  capital: number;
  /** Short table label. */
  label: string;
};

/** Key ticks: 0 → 60 мин, 100 тыс. → 12 мин, … */
export const VAULT_CAPITAL_CURVE_MARKS: readonly VaultCapitalMark[] = [
  { capital: 0, label: "0 ₽" },
  { capital: 10_000, label: "10 тыс." },
  { capital: 100_000, label: "100 тыс." },
  { capital: 1_000_000, label: "1 млн" },
];

export function energyWaitSecondsForCapital(capital: number): number {
  const t = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(t) || t <= 0) return 60 * 60;
  return t;
}

/** Compact wait label: "12 мин", "16 мин", "9 мин". */
export function formatEnergyWaitMinutes(capital: number): string {
  const sec = energyWaitSecondsForCapital(capital);
  const minutes = Math.round(sec / 60);
  return `${minutes} мин`;
}
