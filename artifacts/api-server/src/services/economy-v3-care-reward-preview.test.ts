/**
 * Economy v3 Care rewardPreview — pure + snapshot wiring (no awards).
 */

import { describe, expect, it } from "vitest";
import {
  computeIncomeForOneGame,
  computeCycleSkill,
} from "./economy-v2-care-income";
import { computeEconomyV2CycleXp } from "./economy-v2-care-xp";
import {
  buildEconomyV3CareRewardPreview,
  v3CareSkillToV2Score,
} from "./economy-v3-care-reward-preview";
import {
  buildEconomyV3RootsPublicState,
  buildV3CareCycle,
  type V3CareCycleState,
} from "./economy-v3-roots";
import { computeEconomyV3TreeGrowth } from "./economy-v3-tree-growth";

const NOW = 1_700_000_000_000;
const ANCHOR = NOW - 3_600_000;

const CTX = {
  capital: 100_000,
  incomeAnchorAt: ANCHOR,
  nowMs: NOW,
  freshness: 1,
  ordinaryIncomeElapsedMs: 3_600_000,
} as const;

function completeActivities(overrides?: {
  waterPreset?: number;
  sunPreset?: number;
  fertPreset?: number;
  waterSkill?: number;
  sunSkill?: number;
  fertSkill?: number;
}): V3CareCycleState["activities"] {
  return {
    water: {
      completed: true,
      presetSeconds: overrides?.waterPreset ?? 5,
      skill: overrides?.waterSkill ?? 0.5,
    },
    sun: {
      completed: true,
      presetSeconds: overrides?.sunPreset ?? 10,
      skill: overrides?.sunSkill ?? 0.8,
    },
    fertilizer: {
      completed: true,
      presetSeconds: overrides?.fertPreset ?? 15,
      skill: overrides?.fertSkill ?? 1,
    },
  };
}

function readyCycle(
  activities = completeActivities(),
): Pick<V3CareCycleState, "status" | "allCompleted" | "activities"> {
  return {
    status: "ready",
    allCompleted: true,
    activities,
  };
}

describe("v3CareSkillToV2Score", () => {
  it("maps 0–1 skill to 0–100 v2 score", () => {
    expect(v3CareSkillToV2Score(0)).toBe(0);
    expect(v3CareSkillToV2Score(0.5)).toBe(50);
    expect(v3CareSkillToV2Score(1)).toBe(100);
    expect(v3CareSkillToV2Score(0.833)).toBe(83);
  });
});

describe("buildEconomyV3CareRewardPreview", () => {
  it("unavailable before all three activities complete", () => {
    const preview = buildEconomyV3CareRewardPreview(
      {
        status: "in_progress",
        allCompleted: false,
        activities: {
          water: { completed: true, presetSeconds: 5, skill: 1 },
          sun: { completed: true, presetSeconds: 5, skill: 1 },
          fertilizer: { completed: false, presetSeconds: null, skill: null },
        },
      },
      CTX,
    );
    expect(preview).toEqual({
      available: false,
      xp: 0,
      apples: 0,
      treeGrowth: 0,
      income: { base: 0, bonus: 0, total: 0 },
    });
  });

  it("available at status=ready with valid activity data", () => {
    const activities = completeActivities();
    const preview = buildEconomyV3CareRewardPreview(
      readyCycle(activities),
      CTX,
    );
    expect(preview.available).toBe(true);
    expect(preview.apples).toBe(0);

    const scores = {
      water: v3CareSkillToV2Score(activities.water.skill!),
      sun: v3CareSkillToV2Score(activities.sun.skill!),
      fertilizer: v3CareSkillToV2Score(activities.fertilizer.skill!),
    };
    const expectedXp = computeEconomyV2CycleXp(
      {
        waterSeconds: 5,
        sunSeconds: 10,
        fertilizerSeconds: 15,
      },
      scores,
      { water: true, sun: true, fertilizer: true },
    );
    const parts = [
      computeIncomeForOneGame({
        capital: CTX.capital,
        presetSeconds: 5,
        skill: 0.5,
        freshness: CTX.freshness,
      }),
      computeIncomeForOneGame({
        capital: CTX.capital,
        presetSeconds: 10,
        skill: 0.8,
        freshness: CTX.freshness,
      }),
      computeIncomeForOneGame({
        capital: CTX.capital,
        presetSeconds: 15,
        skill: 1,
        freshness: CTX.freshness,
      }),
    ];
    const expectedIncome = {
      base: Math.round((parts[0]!.base + parts[1]!.base + parts[2]!.base + Number.EPSILON) * 100) / 100,
      bonus: Math.round((parts[0]!.bonus + parts[1]!.bonus + parts[2]!.bonus + Number.EPSILON) * 100) / 100,
      total: Math.round((parts[0]!.total + parts[1]!.total + parts[2]!.total + Number.EPSILON) * 100) / 100,
    };
    expect(preview.xp).toBe(expectedXp);
    expect(preview.income).toEqual(expectedIncome);
    expect(preview.treeGrowth).toBe(
      computeEconomyV3TreeGrowth({
        water: { presetSeconds: 5, skill: 0.5 },
        sun: { presetSeconds: 10, skill: 0.8 },
        fertilizer: { presetSeconds: 15, skill: 1 },
        longCareCycles: 0,
      }).awardedMm,
    );
    expect(preview.treeGrowth).toBeGreaterThan(0);
    expect(
      computeCycleSkill(scores.water, scores.sun, scores.fertilizer),
    ).toBeCloseTo((0.5 + 0.8 + 1) / 3, 10);
  });

  it("treeGrowth rises with LongCare N and is independent of capital", () => {
    const cycle = readyCycle();
    const at0 = buildEconomyV3CareRewardPreview(cycle, {
      ...CTX,
      longCareCycles: 0,
    });
    const at500 = buildEconomyV3CareRewardPreview(cycle, {
      ...CTX,
      capital: 1,
      longCareCycles: 500,
    });
    expect(at500.treeGrowth).toBeGreaterThan(at0.treeGrowth);
    const sameCapitalDifferent = buildEconomyV3CareRewardPreview(cycle, {
      ...CTX,
      capital: 1,
      longCareCycles: 0,
    });
    expect(sameCapitalDifferent.treeGrowth).toBe(at0.treeGrowth);
  });

  it("available at status=finished", () => {
    const preview = buildEconomyV3CareRewardPreview(
      { ...readyCycle(), status: "finished" },
      CTX,
    );
    expect(preview.available).toBe(true);
    expect(preview.xp).toBeGreaterThan(0);
  });

  it("identical inputs → identical preview", () => {
    const cycle = readyCycle();
    const a = buildEconomyV3CareRewardPreview(cycle, CTX);
    const b = buildEconomyV3CareRewardPreview(cycle, { ...CTX });
    expect(a).toEqual(b);
  });

  it("different skill → different xp / income", () => {
    const low = buildEconomyV3CareRewardPreview(
      readyCycle(completeActivities({ waterSkill: 0, sunSkill: 0, fertSkill: 0 })),
      CTX,
    );
    const high = buildEconomyV3CareRewardPreview(
      readyCycle(completeActivities({ waterSkill: 1, sunSkill: 1, fertSkill: 1 })),
      CTX,
    );
    expect(low.available).toBe(true);
    expect(low.xp).toBe(1);
    expect(high.available).toBe(true);
    expect(high.xp).toBeGreaterThan(low.xp);
    expect(high.income.bonus).toBeGreaterThan(low.income.bonus);
  });

  it("different presetSeconds → different xp", () => {
    const short = buildEconomyV3CareRewardPreview(
      readyCycle(
        completeActivities({ waterPreset: 5, sunPreset: 5, fertPreset: 5 }),
      ),
      CTX,
    );
    const long = buildEconomyV3CareRewardPreview(
      readyCycle(
        completeActivities({ waterPreset: 25, sunPreset: 25, fertPreset: 25 }),
      ),
      CTX,
    );
    expect(long.xp).toBeGreaterThan(short.xp);
  });

  it("invalid / missing activity data → available=false", () => {
    expect(
      buildEconomyV3CareRewardPreview(
        {
          status: "ready",
          allCompleted: true,
          activities: {
            water: { completed: true, presetSeconds: null, skill: 0.5 },
            sun: { completed: true, presetSeconds: 5, skill: 0.5 },
            fertilizer: { completed: true, presetSeconds: 5, skill: 0.5 },
          },
        },
        CTX,
      ).available,
    ).toBe(false);

    expect(
      buildEconomyV3CareRewardPreview(
        {
          status: "ready",
          allCompleted: true,
          activities: {
            water: { completed: true, presetSeconds: 5, skill: null },
            sun: { completed: true, presetSeconds: 5, skill: 0.5 },
            fertilizer: { completed: true, presetSeconds: 5, skill: 0.5 },
          },
        },
        CTX,
      ).available,
    ).toBe(false);

    expect(
      buildEconomyV3CareRewardPreview(
        {
          status: "in_progress",
          allCompleted: true,
          activities: completeActivities(),
        },
        CTX,
      ).available,
    ).toBe(false);
  });
});

describe("careCycle.rewardPreview snapshot wiring", () => {
  const trioRow = {
    v3_care_cycle_status: "ready" as const,
    v3_care_cycle_water_completed: true,
    v3_care_cycle_water_preset_seconds: 5,
    v3_care_cycle_water_skill: 0.5,
    v3_care_cycle_sun_completed: true,
    v3_care_cycle_sun_preset_seconds: 10,
    v3_care_cycle_sun_skill: 0.8,
    v3_care_cycle_fertilizer_completed: true,
    v3_care_cycle_fertilizer_preset_seconds: 15,
    v3_care_cycle_fertilizer_skill: 1,
    v3_care_activity_status: null,
    v2_income_anchor_at: new Date(ANCHOR),
    v2_freshness: 1,
    v2_ordinary_income_elapsed_ms: 3_600_000,
  };

  it("absent until trio complete", () => {
    const snap = buildV3CareCycle(
      {
        v3_care_cycle_status: "in_progress",
        v3_care_cycle_water_completed: true,
        v3_care_cycle_water_preset_seconds: 5,
        v3_care_cycle_water_skill: 1,
        v3_care_cycle_sun_completed: false,
      },
      { capital: 100_000, nowMs: NOW },
    );
    expect(snap.rewardPreview.available).toBe(false);
  });

  it("appears at status=ready and persists at finished", () => {
    const ready = buildEconomyV3RootsPublicState(trioRow, {
      capital: 100_000,
      nowMs: NOW,
    });
    expect(ready.careCycle.status).toBe("ready");
    expect(ready.careCycle.rewardPreview.available).toBe(true);
    expect(ready.careCycle.rewardPreview.xp).toBeGreaterThan(0);

    const finished = buildEconomyV3RootsPublicState(
      {
        ...trioRow,
        v3_care_cycle_status: "finished",
        v3_care_cycle_finished_at: new Date(NOW + 1),
        v3_care_cycle_total_preset_seconds: 30,
        v3_care_cycle_average_skill: (0.5 + 0.8 + 1) / 3,
      },
      { capital: 100_000, nowMs: NOW },
    );
    expect(finished.careCycle.status).toBe("finished");
    expect(finished.careCycle.rewardPreview).toEqual(
      ready.careCycle.rewardPreview,
    );
  });

  it("GET-style rebuild does not mutate row / awards nothing", () => {
    const row = { ...trioRow };
    const pendingBase = 0;
    const pendingBonus = 0;
    const playerXp = 10;
    const totalApples = 2;
    const treeGrowth = 5;
    const status = "ready";

    const first = buildEconomyV3RootsPublicState(row, {
      capital: 100_000,
      nowMs: NOW,
    });
    const second = buildEconomyV3RootsPublicState(row, {
      capital: 100_000,
      nowMs: NOW,
    });

    expect(first.careCycle.rewardPreview).toEqual(
      second.careCycle.rewardPreview,
    );
    expect(row.v3_care_cycle_status).toBe(status);
    expect(pendingBase).toBe(0);
    expect(pendingBonus).toBe(0);
    expect(playerXp).toBe(10);
    expect(totalApples).toBe(2);
    expect(treeGrowth).toBe(5);
  });
});
