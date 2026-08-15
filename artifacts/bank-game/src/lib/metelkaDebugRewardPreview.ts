/**
 * Debug-only Metelka money preview (mirrors production finish formulas).
 * Does not invent rewards — only shows what finish would compute from inputs.
 */

import {
  deriveExcessLiveFields,
  excessBonusRate,
  excessCycleFromSeconds,
} from "@/lib/excessEconomyDerive";

/** Same year length as api-server economy-v2-care-income / excess-income. */
export const V2_SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
export const V2_YEAR_DURATION_MS = V2_SECONDS_PER_YEAR * 1000;
export const V2_BASE_APR = 0.12;
/** Same as api-server economy-v2.V2_SECONDS_PER_ENERGY_AT_REFERENCE (t_60 unit). */
export const V2_SECONDS_PER_ENERGY_AT_REFERENCE = 12 * 60;
/** Same as api-server economy-v2.V2_SECONDS_PER_ENERGY_AT_ZERO. */
export const V2_SECONDS_PER_ENERGY_AT_ZERO = 60 * 60;
export const V2_REFERENCE_CAPITAL = 100_000;
export const V2_CAPITAL_EXPONENT = 0.15;
export const V2_ENERGY_CAPITAL_WEIGHT = 4;

/**
 * Real seconds for +1 game-second:
 *   T(K) = 3600 / (1 + 4·(K/100000)^0.15)
 * Mirrors api-server `secondsPerGameSecondForCapital`.
 */
export function secondsPerGameSecondForCapital(capital: number): number {
  if (!Number.isFinite(capital) || capital < 0) {
    return Number.POSITIVE_INFINITY;
  }
  const ratio =
    capital === 0
      ? 0
      : Math.pow(capital / V2_REFERENCE_CAPITAL, V2_CAPITAL_EXPONENT);
  return (
    V2_SECONDS_PER_ENERGY_AT_ZERO /
    (1 + V2_ENERGY_CAPITAL_WEIGHT * ratio)
  );
}

/** Compat M(K) = 720 / T(K). Prefer secondsPerGameSecondForCapital. */
export function capitalMultiplier(capital: number): number {
  const t = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return V2_SECONDS_PER_ENERGY_AT_REFERENCE / t;
}

/**
 * Diagnostic only: wall-clock ms to naturally *generate* ledger game-seconds.
 * Must NOT assign production/debug excessElapsedMs.
 */
export function debugMetelkaElapsedMsForLedger(
  ledgerGameSeconds: number,
  capital: number,
): number {
  const ledger =
    Number.isFinite(ledgerGameSeconds) && ledgerGameSeconds > 0
      ? ledgerGameSeconds
      : 0;
  if (ledger <= 0) return 0;
  const per = secondsPerGameSecondForCapital(capital);
  if (!Number.isFinite(per) || per <= 0) return 0;
  return Math.max(0, ledger * per * 1000);
}

/**
 * @deprecated Session T is not financial time. Use debugMetelkaElapsedMsForLedger.
 * Kept for tests that assert the old bug model is gone.
 */
export function debugMetelkaElapsedMsForPreset(presetSeconds: number): number {
  const T = Math.round(Number(presetSeconds) || 0);
  if (!Number.isFinite(T) || T <= 0) return 0;
  return T * 1000;
}

export function roundMoneyToKopecks(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Compact legacy shorthand. */
export function formatExcessElapsedDebug(ms: number): string {
  return formatExcessElapsedReadout(ms);
}

function ruDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function ruHours(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return "часов";
  if (last === 1) return "час";
  if (last >= 2 && last <= 4) return "часа";
  return "часов";
}

function ruMinutes(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return "минут";
  if (last === 1) return "минута";
  if (last >= 2 && last <= 4) return "минуты";
  return "минут";
}

/**
 * Read-only financial time for Metelka debug panel.
 * Formats production `excessElapsedMs` only (never session preset T).
 * 39 сек | 2 мин 15 сек | 5 часов 12 минут | 2 дня 14 часов 38 минут
 */
export function formatExcessElapsedReadout(ms: number): string {
  const totalSec = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  if (totalSec < 60) return `${totalSec} сек`;
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) {
    const parts = [`${days} ${ruDays(days)}`];
    if (hours > 0) parts.push(`${hours} ${ruHours(hours)}`);
    if (minutes > 0) parts.push(`${minutes} ${ruMinutes(minutes)}`);
    return parts.join(" ");
  }
  if (hours > 0) {
    const parts = [`${hours} ${ruHours(hours)}`];
    if (minutes > 0) parts.push(`${minutes} ${ruMinutes(minutes)}`);
    return parts.join(" ");
  }
  return `${minutes} мин ${seconds} сек`;
}

/** Live Metelka game preset is clamped at 25 — financial ledger/elapsed may still grow. */
export function isMetelkaMaxGamePreset(livePresetSeconds: number): boolean {
  const T = Math.round(Number(livePresetSeconds) || 0);
  return T >= 25;
}

export const METELKA_MAX_PRESET_STATUS = "Максимальный игровой пресет достигнут";
export const METELKA_MAX_PRESET_FINANCE_HINT =
  "Финансовое накопление продолжается";

export type MetelkaDebugRewardPreview = {
  capital: number;
  excessSeconds: number;
  excessElapsedMs: number;
  livePresetSeconds: number;
  rate: number;
  missingElapsedHistory: boolean;
  /** Raw (pre-kopeck) D_base. */
  dBaseRaw: number;
  /** Raw D_excess gross. */
  dExcessRaw: number;
  skill0Total: number;
  skill1Total: number;
  skill0Base: number;
  skill0Bonus: number;
  skill1Base: number;
  skill1Bonus: number;
  /** True when even Skill=100% rounds to 0.00. */
  roundsToZero: boolean;
  warning: string | null;
};

export function previewMetelkaDebugReward(input: {
  capital: number;
  excessSeconds: number;
  excessElapsedMs: number;
}): MetelkaDebugRewardPreview {
  const capital =
    Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;
  const live = deriveExcessLiveFields(input.excessSeconds);
  const excessElapsedMs =
    Number.isFinite(input.excessElapsedMs) && input.excessElapsedMs > 0
      ? input.excessElapsedMs
      : 0;
  const missingElapsedHistory =
    live.excessSeconds > 0 && excessElapsedMs <= 0;
  const rate = excessBonusRate(excessCycleFromSeconds(live.excessSeconds));

  if (missingElapsedHistory || capital <= 0 || excessElapsedMs <= 0) {
    return {
      capital,
      excessSeconds: live.excessSeconds,
      excessElapsedMs,
      livePresetSeconds: live.excessPresetSeconds,
      rate,
      missingElapsedHistory,
      dBaseRaw: 0,
      dExcessRaw: 0,
      skill0Total: 0,
      skill1Total: 0,
      skill0Base: 0,
      skill0Bonus: 0,
      skill1Base: 0,
      skill1Bonus: 0,
      roundsToZero: true,
      warning: missingElapsedHistory
        ? "Нет финансового накопления (elapsedMs=0): Метёлка запустится, но денежная награда будет 0."
        : capital <= 0
          ? "Капитал = 0: денежная награда будет 0."
          : "Финансовое время = 0: денежная награда будет 0.",
    };
  }

  const yearFrac = excessElapsedMs / V2_YEAR_DURATION_MS;
  const dBaseRaw = capital * V2_BASE_APR * yearFrac;
  const dExcessRaw = capital * rate * yearFrac;
  const skill0BonusRaw = dExcessRaw * 0.5;
  const skill1BonusRaw = dExcessRaw * 1;

  const skill0Base = roundMoneyToKopecks(dBaseRaw);
  const skill1Base = skill0Base;
  const skill0Bonus = roundMoneyToKopecks(skill0BonusRaw);
  const skill1Bonus = roundMoneyToKopecks(skill1BonusRaw);
  const skill0Total = roundMoneyToKopecks(skill0Base + skill0Bonus);
  const skill1Total = roundMoneyToKopecks(skill1Base + skill1Bonus);
  const roundsToZero = skill1Total <= 0;

  return {
    capital,
    excessSeconds: live.excessSeconds,
    excessElapsedMs,
    livePresetSeconds: live.excessPresetSeconds,
    rate,
    missingElapsedHistory: false,
    dBaseRaw,
    dExcessRaw,
    skill0Total,
    skill1Total,
    skill0Base,
    skill0Bonus,
    skill1Base,
    skill1Bonus,
    roundsToZero,
    warning: roundsToZero
      ? "Доход меньше 0,01 ₽ — денежная монетка не появится"
      : null,
  };
}
