/**
 * Economy v3 Care reward preview — XP from cycle journal; money = sum of
 * per-game incomes (preset × skill) so income tracks chosen durations.
 * Tree mm = T × Skill × Care × LongCare (not rub→mm).
 */

import { computeIncomeForOneGame } from "./economy-v2-care-income";
import { computeEconomyV2CycleXp } from "./economy-v2-care-xp";
import type {
  V3CareCycleActivityResult,
  V3CareCycleState,
  V3CareCycleStatus,
} from "./economy-v3-roots";
import { computeEconomyV3TreeGrowth } from "./economy-v3-tree-growth";

export type EconomyV3CareRewardEconomyContext = {
  capital: number;
  /** Epoch ms of last income settle; null → no back-accrual (v2 first-run). */
  incomeAnchorAt: number | null;
  nowMs: number;
  /** Persisted freshness before Care (0.50–1.00). */
  freshness: number;
  /**
   * @deprecated Ordinary wall-clock split is no longer used for v3 Care money.
   * Kept for call-site compatibility.
   */
  ordinaryIncomeElapsedMs?: number | null;
  /**
   * Lifetime successful Care claims before this cycle (LongCare N).
   * Defaults to 0 when omitted.
   */
  longCareCycles?: number;
};

export type EconomyV3CareRewardPreviewIncome = {
  base: number;
  bonus: number;
  total: number;
};

export type EconomyV3CareRewardPreview = {
  available: boolean;
  xp: number;
  /** Care does not award apples in v2 — always 0 when available. */
  apples: number;
  /** Integer mm from Growth_mm = T×Skill×Care×LongCare (floor). */
  treeGrowth: number;
  income: EconomyV3CareRewardPreviewIncome;
};

const UNAVAILABLE: EconomyV3CareRewardPreview = {
  available: false,
  xp: 0,
  apples: 0,
  treeGrowth: 0,
  income: { base: 0, bonus: 0, total: 0 },
};

/** v3 skill ∈ [0, 1] → v2 skillScore ∈ [0, 100] (rounded like normalizeSkillScore). */
export function v3CareSkillToV2Score(skill: number): number {
  if (!Number.isFinite(skill)) return 0;
  return Math.min(100, Math.max(0, Math.round(skill * 100)));
}

function activityDataValid(a: V3CareCycleActivityResult): boolean {
  return (
    a.completed === true &&
    a.presetSeconds != null &&
    Number.isInteger(a.presetSeconds) &&
    a.presetSeconds >= 0 &&
    a.skill != null &&
    Number.isFinite(a.skill) &&
    a.skill >= 0 &&
    a.skill <= 1
  );
}

function statusAllowsPreview(status: V3CareCycleStatus | null): boolean {
  return status === "ready" || status === "finished";
}

function roundKopecks(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Pure Care reward preview from a completed cycle journal + economy context.
 * Money = sum of one-game incomes for Water/Sun/Fertilizer presets.
 */
export function buildEconomyV3CareRewardPreview(
  careCycle: Pick<
    V3CareCycleState,
    "status" | "allCompleted" | "activities"
  >,
  economyContext: EconomyV3CareRewardEconomyContext,
): EconomyV3CareRewardPreview {
  const { water, sun, fertilizer } = careCycle.activities;

  if (
    !statusAllowsPreview(careCycle.status) ||
    !careCycle.allCompleted ||
    !activityDataValid(water) ||
    !activityDataValid(sun) ||
    !activityDataValid(fertilizer)
  ) {
    return { ...UNAVAILABLE, income: { ...UNAVAILABLE.income } };
  }

  const waterScore = v3CareSkillToV2Score(water.skill!);
  const sunScore = v3CareSkillToV2Score(sun.skill!);
  const fertilizerScore = v3CareSkillToV2Score(fertilizer.skill!);

  const xp = computeEconomyV2CycleXp(
    {
      waterSeconds: water.presetSeconds!,
      sunSeconds: sun.presetSeconds!,
      fertilizerSeconds: fertilizer.presetSeconds!,
    },
    { water: waterScore, sun: sunScore, fertilizer: fertilizerScore },
    { water: true, sun: true, fertilizer: true },
  );

  const parts = [water, sun, fertilizer].map((a) =>
    computeIncomeForOneGame({
      capital: economyContext.capital,
      presetSeconds: a.presetSeconds!,
      skill: a.skill!,
      freshness: economyContext.freshness,
    }),
  );
  const base = roundKopecks(parts.reduce((s, p) => s + p.base, 0));
  const bonus = roundKopecks(parts.reduce((s, p) => s + p.bonus, 0));
  const total = roundKopecks(parts.reduce((s, p) => s + p.total, 0));

  const growth = computeEconomyV3TreeGrowth({
    water: {
      presetSeconds: water.presetSeconds!,
      skill: water.skill!,
    },
    sun: {
      presetSeconds: sun.presetSeconds!,
      skill: sun.skill!,
    },
    fertilizer: {
      presetSeconds: fertilizer.presetSeconds!,
      skill: fertilizer.skill!,
    },
    longCareCycles: economyContext.longCareCycles ?? 0,
  });

  return {
    available: true,
    xp,
    apples: 0,
    treeGrowth: growth.awardedMm,
    income: { base, bonus, total },
  };
}
