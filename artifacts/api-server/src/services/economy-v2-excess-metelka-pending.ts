/**
 * Separate Metelka pending reward (not Care pending_* / claimAll).
 *
 * Written on finish; claimed in a later stage. Survives page reload via game_state.
 *
 * Money (approved v2 excess model):
 *   D_base  = frozen excess-base ledger (12% APR over full financial t_excess)
 *   D_excess = K × (t_excess / Y) × r_excess(n)   [frozen session rate + elapsed]
 *   D_paid_bonus = D_excess × (0.5 + 0.5 × Skill)
 *
 * XP still uses Metelka duration preset T, not the unlimited ledger.
 */

import { randomBytes } from "node:crypto";
import { roundMoneyToKopecks, V2_BASE_APR } from "./economy-v2-care-income";
import {
  computeBaseIncomeForElapsedMs,
  computeExcessCleaningIncome,
  computeExcessGrossIncome,
  computeExcessPaidIncome,
  normalizeExcessBaseIncome,
  normalizeExcessElapsedMs,
} from "./economy-v2-excess-income";
import { metelkaBonusShareForWebIndex } from "./economy-v2-excess-metelka-payout";
import { computeExcessRegularSkill } from "./economy-v2-excess-rewards";
import { computeExcessCleaningXp } from "./economy-v2-excess-xp";
import { parseClearedExcessWebIds } from "./economy-v2-excess-webs";

export type MetelkaPendingRewardPublic = {
  active: boolean;
  baseAmount: number;
  bonusAmount: number;
  totalAmount: number;
  xpAmount: number;
  createdAt: number | null;
  claimToken: string | null;
  claimedAt: number | null;
};

export type MetelkaFinishAwardBreakdown = {
  skill: number;
  clearedCount: number;
  totalCount: number;
  fullBase: number;
  fullBonus: number;
  earnedBase: number;
  earnedBonus: number;
  earnedXp: number;
  totalMoney: number;
  claimToken: string;
  paymentFactor: number;
};

export function emptyMetelkaPendingReward(): MetelkaPendingRewardPublic {
  return {
    active: false,
    baseAmount: 0,
    bonusAmount: 0,
    totalAmount: 0,
    xpAmount: 0,
    createdAt: null,
    claimToken: null,
    claimedAt: null,
  };
}

function asBool(raw: unknown): boolean {
  return raw === true || raw === "t" || raw === "true" || raw === 1 || raw === "1";
}

function parseMoney(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function parseIntOrNull(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function parseXp(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Stable public snapshot from a game_state row. */
export function readMetelkaPendingRewardFromRow(
  row: Record<string, unknown> | null | undefined,
): MetelkaPendingRewardPublic {
  if (!row) return emptyMetelkaPendingReward();
  const active = asBool(row.metelka_pending_active);
  const baseAmount = roundMoneyToKopecks(parseMoney(row.metelka_pending_base));
  const bonusAmount = roundMoneyToKopecks(parseMoney(row.metelka_pending_bonus));
  const xpAmount = parseXp(row.metelka_pending_xp);
  const createdAt = parseIntOrNull(row.metelka_pending_created_at);
  const claimedAt = parseIntOrNull(row.metelka_pending_claimed_at);
  const claimToken =
    row.metelka_pending_claim_token == null
      ? null
      : String(row.metelka_pending_claim_token);

  if (!active) {
    if (
      claimedAt != null ||
      (claimToken != null &&
        (baseAmount > 0 || bonusAmount > 0 || xpAmount > 0))
    ) {
      return {
        active: false,
        baseAmount,
        bonusAmount,
        totalAmount: roundMoneyToKopecks(baseAmount + bonusAmount),
        xpAmount,
        createdAt,
        claimToken,
        claimedAt,
      };
    }
    return emptyMetelkaPendingReward();
  }

  return {
    active: true,
    baseAmount,
    bonusAmount,
    totalAmount: roundMoneyToKopecks(baseAmount + bonusAmount),
    xpAmount,
    createdAt,
    claimToken,
    claimedAt: null,
  };
}

/**
 * Legacy per-web share helper (tests / tooling).
 * Production finish uses Skill factor on full D_excess.
 */
export function computeMetelkaEarnedBonusFromClearedWebs(input: {
  fullBonus: number;
  whiteWebCount: number;
  clearedWebIds: readonly string[];
}): number {
  const n = Math.max(0, Math.floor(Number(input.whiteWebCount) || 0));
  if (n <= 0) return 0;
  const ids = parseClearedExcessWebIds(input.clearedWebIds);
  let cents = 0;
  for (const id of ids) {
    const m = /^web-(\d+)$/.exec(id);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= n) continue;
    const share = metelkaBonusShareForWebIndex(input.fullBonus, n, idx);
    cents += Math.round(roundMoneyToKopecks(share) * 100);
  }
  return cents / 100;
}

export function createMetelkaPendingClaimToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Pure finish award from frozen financial snapshots + Skill.
 *
 * earnedBase  = full D_base (snapshot or recomputed from elapsed)
 * earnedBonus = D_excess × (0.5 + 0.5 × Skill)
 * earnedXp    = XP_max(T) × Skill
 */
export function computeMetelkaFinishPendingAward(input: {
  capital: number;
  /** Unlimited game-second ledger snapshot. Not used for money. */
  sourceSeconds: number;
  /** Financial wall-clock ms for the excess period (t_excess). */
  sourceElapsedMs: number;
  /** Frozen r_excess(n) at session start. */
  annualRate: number;
  /** Accrued excess-base ledger snapshot (preferred D_base). */
  baseIncomeSnapshot?: number;
  presetSeconds: number;
  whiteWebCount: number;
  clearedWebIds: readonly string[];
  tutorialActive?: boolean;
}): MetelkaFinishAwardBreakdown {
  const totalCount = Math.max(0, Math.floor(Number(input.whiteWebCount) || 0));
  const clearedIds = parseClearedExcessWebIds(input.clearedWebIds);
  let clearedCount = 0;
  for (const id of clearedIds) {
    const m = /^web-(\d+)$/.exec(id);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (idx >= 0 && idx < totalCount) clearedCount += 1;
  }
  const skill = computeExcessRegularSkill(clearedCount, totalCount);

  const sourceElapsedMs = normalizeExcessElapsedMs(input.sourceElapsedMs);
  const rate =
    Number.isFinite(input.annualRate) && input.annualRate > 0
      ? input.annualRate
      : 0;
  const capital =
    Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;

  const snapshotBase = normalizeExcessBaseIncome(input.baseIncomeSnapshot);
  const recomputedBase = computeBaseIncomeForElapsedMs({
    capital,
    elapsedMs: sourceElapsedMs,
    annualRate: V2_BASE_APR,
  });
  const fullBaseRaw = snapshotBase > 0 ? snapshotBase : recomputedBase;

  const income = computeExcessCleaningIncome({
    capital,
    sourceElapsedMs,
    sourceSeconds: input.sourceSeconds,
    annualRate: rate,
    skill,
  });
  const fullBonusRaw =
    income.available && income.reason !== "missing_excess_elapsed_history"
      ? computeExcessGrossIncome({
          capital,
          excessElapsedMs: sourceElapsedMs,
          annualRate: rate,
        })
      : 0;
  const { paymentFactor, paidIncome } = computeExcessPaidIncome({
    grossIncome: fullBonusRaw,
    skill,
  });

  const xp = computeExcessCleaningXp({
    presetSeconds: input.presetSeconds,
    skill,
  });

  const fullBase = roundMoneyToKopecks(fullBaseRaw);
  const fullBonus = roundMoneyToKopecks(fullBonusRaw);
  const earnedBonus = roundMoneyToKopecks(paidIncome);

  if (input.tutorialActive) {
    return {
      skill,
      clearedCount,
      totalCount,
      fullBase,
      fullBonus,
      earnedBase: 0,
      earnedBonus: 0,
      earnedXp: 0,
      totalMoney: 0,
      claimToken: createMetelkaPendingClaimToken(),
      paymentFactor,
    };
  }

  if (income.reason === "missing_excess_elapsed_history") {
    return {
      skill,
      clearedCount,
      totalCount,
      fullBase: 0,
      fullBonus: 0,
      earnedBase: 0,
      earnedBonus: 0,
      earnedXp: xp.awardedXp,
      totalMoney: 0,
      claimToken: createMetelkaPendingClaimToken(),
      paymentFactor,
    };
  }

  const earnedBase = fullBase;
  return {
    skill,
    clearedCount,
    totalCount,
    fullBase,
    fullBonus,
    earnedBase,
    earnedBonus,
    earnedXp: xp.awardedXp,
    totalMoney: roundMoneyToKopecks(earnedBase + earnedBonus),
    claimToken: createMetelkaPendingClaimToken(),
    paymentFactor,
  };
}

/** SQL column list for SELECT / migrations documentation. */
export const METELKA_PENDING_SELECT_COLUMNS = `
  metelka_pending_active,
  metelka_pending_base,
  metelka_pending_bonus,
  metelka_pending_xp,
  metelka_pending_created_at,
  metelka_pending_claim_token,
  metelka_pending_claimed_at
`.trim();
