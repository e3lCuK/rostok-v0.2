/**
 * Metelka rewards:
 * - Legacy (version NULL/1): per-click progressive Skill / XP / 50%+50% bonus.
 * - Version 2: clear is bookkeeping only; finish computes Skill/bonus/base/XP;
 *   acknowledge pays base + bonus.
 *
 * Legacy totals stay equivalent to:
 *   paid = gross × (0.5 + 0.5 × Skill)
 *   XP   = round(XP_max × Skill)
 * via progressive rounding on each regular clear.
 *
 * Version 2:
 *   bonusPaid = gross × Skill
 *   basePaid  = sessionBaseIncome snapshot
 *   XP        = round(XP_max × Skill)
 */

import { roundMoneyToKopecks } from "./economy-v2-excess-income";
import { computeExcessCleaningXp } from "./economy-v2-excess-xp";

/** Version-2 red web: entire session base-income snapshot (not Skill/XP). */
export const EXCESS_BASE_INCOME_WEB_ID = "base-income-web";

/**
 * Legacy alias for the red income web id (`web-special`).
 * Kept for old sessions / clients; new layouts use EXCESS_BASE_INCOME_WEB_ID.
 */
export const EXCESS_SPECIAL_WEB_ID = "web-special";

export type ExcessBaseWebCollectionMode = "manual" | "automatic";

export function isBaseIncomeWebId(webId: string): boolean {
  return webId === EXCESS_BASE_INCOME_WEB_ID;
}

export function isExcessSpecialWebId(webId: string): boolean {
  return webId === EXCESS_SPECIAL_WEB_ID || isBaseIncomeWebId(webId);
}

export function isExcessRegularWebId(webId: string): boolean {
  return /^web-\d+$/.test(webId);
}

/** Cleared regular webs only (excludes special / base-income). */
export function countRegularClearedWebs(
  clearedIds: readonly string[],
  webCount: number,
): number {
  const n = Math.max(0, Math.floor(Number(webCount) || 0));
  let c = 0;
  for (const id of clearedIds) {
    if (!isExcessRegularWebId(id)) continue;
    const m = /^web-(\d+)$/.exec(id);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (idx >= 0 && idx < n) c += 1;
  }
  return c;
}

export function isSpecialWebCleared(clearedIds: readonly string[]): boolean {
  return (
    clearedIds.includes(EXCESS_SPECIAL_WEB_ID) ||
    clearedIds.includes(EXCESS_BASE_INCOME_WEB_ID)
  );
}

/** Skill = regularCleared / webCount (special / base-income excluded). */
export function computeExcessRegularSkill(
  regularCleared: number,
  webCount: number,
): number {
  const total = Math.floor(Number(webCount) || 0);
  if (total <= 0) return 0;
  const cleared = Math.max(0, Math.floor(Number(regularCleared) || 0));
  return Math.min(1, Math.max(0, cleared / total));
}

/** Version-2 bonus: gross × Skill (not the legacy 0.5 + 0.5×Skill factor). */
export function computeExcessV2BonusPaid(gross: number, skill: number): number {
  const g = Number.isFinite(gross) && gross > 0 ? gross : 0;
  const s =
    Number.isFinite(skill) && skill > 0 ? Math.min(1, Math.max(0, skill)) : 0;
  return roundMoneyToKopecks(g * s);
}

export function computeExcessGuaranteedIncome(gross: number): number {
  const g = Number.isFinite(gross) && gross > 0 ? gross : 0;
  return g * 0.5;
}

export function computeExcessBonusPool(gross: number): number {
  return computeExcessGuaranteedIncome(gross);
}

/**
 * Progressive XP: target cumulative = round(XP_max × cleared/N).
 * Delta for this clear = target − alreadyAwarded (≥ 0).
 */
export function computeRegularWebXpDelta(input: {
  presetSeconds: number;
  webCount: number;
  regularClearedAfter: number;
  xpAwardedBefore: number;
}): { maxXp: number; deltaXp: number; xpAwardedAfter: number } {
  const skill = computeExcessRegularSkill(
    input.regularClearedAfter,
    input.webCount,
  );
  const { maxXp } = computeExcessCleaningXp({
    presetSeconds: input.presetSeconds,
    skill: 1,
  });
  const target = Math.max(0, Math.round(maxXp * skill));
  const before = Math.max(0, Math.floor(Number(input.xpAwardedBefore) || 0));
  const deltaXp = Math.max(0, target - before);
  return { maxXp, deltaXp, xpAwardedAfter: before + deltaXp };
}

/**
 * Progressive bonus income share among regular webs.
 * target = roundKopecks(bonusPool × cleared/N); delta = target − paidBonusBefore.
 */
export function computeRegularWebBonusDelta(input: {
  bonusPool: number;
  webCount: number;
  regularClearedAfter: number;
  bonusPaidBefore: number;
}): { deltaMoney: number; bonusPaidAfter: number } {
  const n = Math.max(0, Math.floor(Number(input.webCount) || 0));
  const cleared = Math.max(0, Math.floor(Number(input.regularClearedAfter) || 0));
  const pool =
    Number.isFinite(input.bonusPool) && input.bonusPool > 0
      ? input.bonusPool
      : 0;
  const target =
    n <= 0 || cleared <= 0 ? 0 : roundMoneyToKopecks(pool * (cleared / n));
  const before =
    Number.isFinite(input.bonusPaidBefore) && input.bonusPaidBefore > 0
      ? input.bonusPaidBefore
      : 0;
  const deltaMoney = Math.max(0, roundMoneyToKopecks(target - before));
  return {
    deltaMoney,
    bonusPaidAfter: roundMoneyToKopecks(before + deltaMoney),
  };
}

export function computeSpecialWebIncomeDelta(input: {
  guaranteed: number;
  specialAlreadyPaid: boolean;
}): number {
  if (input.specialAlreadyPaid) return 0;
  const g =
    Number.isFinite(input.guaranteed) && input.guaranteed > 0
      ? input.guaranteed
      : 0;
  return roundMoneyToKopecks(g);
}

export function isExcessBaseWebCollectionMode(
  raw: unknown,
): raw is ExcessBaseWebCollectionMode {
  return raw === "manual" || raw === "automatic";
}

export type V2WhiteWebRewardShares = {
  /** gross / N — this clear's raw bonus share (visual/animation amount). */
  bonusRawPerWeb: number;
  /** maxXp / N — this clear's raw XP share (visual/animation amount). */
  xpRawPerWeb: number;
  /** Alias of bonusRawPerWeb — the delta unlocked by this clear. */
  bonusRawDelta: number;
  /** Alias of xpRawPerWeb — the delta unlocked by this clear. */
  xpRawDelta: number;
  /** gross × clearedWhiteAfter / N — cumulative raw bonus unlocked this session. */
  cumulativeBonusRaw: number;
  /** maxXp × clearedWhiteAfter / N — cumulative raw XP unlocked this session. */
  cumulativeXpRaw: number;
  /** max(0, awardedXpAfter − xpAwardedBefore) — integer XP to add to player_xp now. */
  xpIntegerDelta: number;
  /** round(maxXp × clearedWhiteAfter / N) — new cumulative integer XP awarded. */
  xpAwardedAfter: number;
};

/**
 * Metelka version=2 white-web (regular) clear reward shares.
 *
 * Bonus money is never credited on clear — only the raw (unrounded) share is
 * tracked for display / cumulative bookkeeping; actual crediting happens once
 * at finish. XP is applied immediately as an integer delta so progress is
 * never lost, using the same round-the-cumulative-target technique as money.
 */
export function computeV2WhiteWebRewardShares(input: {
  gross: number;
  maxXp: number;
  whiteWebCount: number;
  clearedWhiteAfter: number;
  xpAwardedBefore: number;
}): V2WhiteWebRewardShares {
  const gross =
    Number.isFinite(input.gross) && input.gross > 0 ? input.gross : 0;
  const maxXp =
    Number.isFinite(input.maxXp) && input.maxXp > 0 ? input.maxXp : 0;
  const n = Math.max(0, Math.floor(Number(input.whiteWebCount) || 0));
  const clearedAfter = Math.max(
    0,
    Math.floor(Number(input.clearedWhiteAfter) || 0),
  );
  const xpBefore = Math.max(
    0,
    Math.floor(Number(input.xpAwardedBefore) || 0),
  );

  if (n <= 0) {
    return {
      bonusRawPerWeb: 0,
      xpRawPerWeb: 0,
      bonusRawDelta: 0,
      xpRawDelta: 0,
      cumulativeBonusRaw: 0,
      cumulativeXpRaw: 0,
      xpIntegerDelta: 0,
      xpAwardedAfter: xpBefore,
    };
  }

  const clearedRatio = Math.min(1, clearedAfter / n);
  const bonusRawPerWeb = gross / n;
  const xpRawPerWeb = maxXp / n;
  const cumulativeBonusRaw = gross * clearedRatio;
  const cumulativeXpRaw = maxXp * clearedRatio;
  const xpAwardedAfter = Math.max(0, Math.round(maxXp * clearedRatio));
  const xpIntegerDelta = Math.max(0, xpAwardedAfter - xpBefore);

  return {
    bonusRawPerWeb,
    xpRawPerWeb,
    bonusRawDelta: bonusRawPerWeb,
    xpRawDelta: xpRawPerWeb,
    cumulativeBonusRaw,
    cumulativeXpRaw,
    xpIntegerDelta,
    xpAwardedAfter,
  };
}
