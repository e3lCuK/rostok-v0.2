/**
 * Metelka (excess unload) care-style income — LEGACY / tests only.
 *
 * Production finish awards use APR D_base + D_excess×(0.5+0.5×Skill) from
 * excessElapsedMs (see computeMetelkaFinishPendingAward). Do not use this for money.
 */

import {
  computeIncomeForOneGame,
  normalizePersistedFreshness,
  V2_FRESHNESS_MAX,
} from "./economy-v2-care-income";
import { normalizeExcessSeconds } from "./economy-v2-excess";

/** Perfect Metelka completion skill for care-income parity. */
export const METELKA_CARE_INCOME_SKILL = 1;

/**
 * Game-seconds consumed by one Metelka run = frozen session source snapshot.
 * Floored to match computeIncomeForOneGame presetSeconds.
 */
export function resolveMetelkaConsumedExcessSeconds(
  sourceSecondsRaw: unknown,
): number {
  return Math.max(0, Math.floor(normalizeExcessSeconds(sourceSecondsRaw)));
}

export function computeMetelkaCareIncome(input: {
  capital: number;
  consumedExcessSeconds: number;
  freshness?: number;
}): {
  consumedExcessSeconds: number;
  base: number;
  bonus: number;
  total: number;
  bonusRate: number;
  elapsedFinancialSeconds: number;
} {
  const consumedExcessSeconds = resolveMetelkaConsumedExcessSeconds(
    input.consumedExcessSeconds,
  );
  const freshness =
    input.freshness != null && Number.isFinite(input.freshness)
      ? normalizePersistedFreshness(Number(input.freshness))
      : V2_FRESHNESS_MAX;
  const awarded = computeIncomeForOneGame({
    capital: input.capital,
    presetSeconds: consumedExcessSeconds,
    skill: METELKA_CARE_INCOME_SKILL,
    freshness,
  });
  return {
    consumedExcessSeconds,
    base: awarded.base,
    bonus: awarded.bonus,
    total: awarded.total,
    bonusRate: awarded.bonusRate,
    elapsedFinancialSeconds: awarded.elapsedFinancialSeconds,
  };
}
