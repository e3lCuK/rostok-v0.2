import { describe, expect, it } from "vitest";
import {
  ECONOMY_V3_ROOT_MIGRATION_SQL,
  applyEconomyV3RootMigrations,
} from "./economy-v3-roots-migrations";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";
import {
  V3_DAILY_CAP_DEFAULT,
  V3_ROOT_KINDS,
  V3_TRANSFER_INSURANCE_MS,
  autoTransferEconomyV3RemainingPure,
  buildEconomyV3CareAvailability,
  buildEconomyV3RootsPublicState,
  clampReserveSeconds,
  clampRootSeconds,
  isEconomyV3RootsStateValid,
  normalizeDailyCap,
  normalizeGenerationProgress,
  normalizeTransferredRoots,
  settleEconomyV3Roots,
  splitIntoFiveSegments,
  startEconomyV3CareActivityPure,
  finishEconomyV3CareActivityPure,
  acknowledgeEconomyV3CareActivityPure,
  recordCareCycleFinishPure,
  finishEconomyV3CareCyclePure,
  acknowledgeEconomyV3CareCyclePure,
  buildV3CareCycle,
  clampAverageSkill,
  transferEconomyV3RootPure,
  validateEconomyV3RootsState,
  validateRootKind,
} from "./economy-v3-roots";
import {
  settleEconomyV2Roots,
  V2_ROOT_SECTION_COUNT,
} from "./economy-v2-roots";
import { createEconomyV2CareAllocation } from "./economy-v2-care-allocation";
import { splitGeneratedIntoOrdinaryAndExcess } from "./economy-v2-excess";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";

const NOW = 1_700_000_000_000;
/** At K=100_000, 1 game-second = 720 real seconds. */
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("Economy v3 root migrations", () => {
  it("declares idempotent ADD COLUMN IF NOT EXISTS with expected defaults", () => {
    const joined = ECONOMY_V3_ROOT_MIGRATION_SQL.join("\n");
    expect(ECONOMY_V3_ROOT_MIGRATION_SQL.length).toBe(44);
    for (const sql of ECONOMY_V3_ROOT_MIGRATION_SQL) {
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS");
    }
    expect(joined).toContain(
      "v3_generation_progress NUMERIC NOT NULL DEFAULT 0",
    );
    expect(joined).toContain(
      "v3_generation_rr_cursor INTEGER NOT NULL DEFAULT 0",
    );
    expect(joined).toContain("v3_care_activity_kind TEXT NULL");
    expect(joined).toContain("v3_care_activity_preset_seconds INTEGER NULL");
    expect(joined).toContain("v3_care_activity_started_at TIMESTAMP NULL");
    expect(joined).toContain("v3_care_activity_status TEXT NULL");
    expect(joined).toContain("v3_care_activity_skill NUMERIC NULL");
    expect(joined).toContain("v3_care_activity_finished_at TIMESTAMP NULL");
    expect(joined).toContain(
      "v3_care_cycle_water_completed BOOLEAN NOT NULL DEFAULT FALSE",
    );
    expect(joined).toContain("v3_care_cycle_started_at TIMESTAMP NULL");
    expect(joined).toContain("v3_care_cycle_completed_at TIMESTAMP NULL");
    expect(joined).toContain("v3_care_cycle_finished_at TIMESTAMP NULL");
    expect(joined).toContain("v3_care_cycle_status TEXT NULL");
    expect(joined).toContain("v3_care_cycle_total_preset_seconds INTEGER NULL");
    expect(joined).toContain("v3_care_cycle_average_skill NUMERIC NULL");
    expect(joined).toContain("v3_care_cycle_claimed_at TIMESTAMP NULL");
    expect(joined).toContain("v3_care_cycle_claimed_xp INTEGER NULL");
    expect(joined).toContain("v3_care_cycle_claimed_tree_growth INTEGER NULL");
    expect(joined).toContain("v3_care_cycle_claimed_base_income NUMERIC NULL");
    expect(joined).toContain("v3_care_cycle_claimed_bonus_income NUMERIC NULL");
    expect(joined).toContain("v3_care_cycle_claimed_total_income NUMERIC NULL");
    expect(joined).toContain(
      "v3_metelka_required BOOLEAN NOT NULL DEFAULT FALSE",
    );
    expect(joined).toContain(
      "v3_metelka_completed_for_cycle BOOLEAN NOT NULL DEFAULT FALSE",
    );
    expect(joined).not.toContain("v2_energy_seconds");
    expect(joined).not.toContain("v2_root_ready_mask");
  });

  it("applies each migration statement exactly once per call", async () => {
    const queries: string[] = [];
    await applyEconomyV3RootMigrations({
      query: async (text) => {
        queries.push(text);
      },
    });
    expect(queries).toEqual([...ECONOMY_V3_ROOT_MIGRATION_SQL]);
  });
});

describe("ENABLE_ECONOMY_V3_ROOTS feature flag", () => {
  it("defaults to false when unset", () => {
    expect(isEconomyV3RootsEnabled({})).toBe(false);
  });

  it("is true only for exact string true", () => {
    expect(isEconomyV3RootsEnabled({ ENABLE_ECONOMY_V3_ROOTS: "true" })).toBe(
      true,
    );
  });
});

describe("Economy v3 pure helpers", () => {
  it("keeps three roots and three reserves as separate keys", () => {
    const snap = buildEconomyV3RootsPublicState({
      v3_root_water_seconds: 3,
      v3_root_sun_seconds: 7,
      v3_root_fertilizer_seconds: 12,
      v3_reserve_water_seconds: 5,
      v3_reserve_sun_seconds: 8,
      v3_reserve_fertilizer_seconds: 11,
      v3_daily_cap_seconds: 20,
    });
    expect(Object.keys(snap.roots).sort()).toEqual([...V3_ROOT_KINDS].sort());
    expect(snap.roots.water.seconds).toBe(3);
    expect(snap.reserves.sun.seconds).toBe(8);
  });

  it("clamps root / reserve / dailyCap", () => {
    expect(clampRootSeconds(26)).toBe(26); // absolute max 30
    expect(clampRootSeconds(31)).toBe(30);
    expect(clampRootSeconds(26, 25)).toBe(25);
    expect(clampReserveSeconds(30, 20)).toBe(20);
    expect(clampReserveSeconds(28, 30)).toBe(28);
    expect(normalizeDailyCap(4)).toBe(5);
    expect(normalizeDailyCap(undefined)).toBe(V3_DAILY_CAP_DEFAULT);
  });

  it("splits seconds into five-segment full + partial", () => {
    expect(splitIntoFiveSegments(0)).toEqual({
      fullSegments: 0,
      partialSegmentSeconds: 0,
    });
    expect(splitIntoFiveSegments(4)).toEqual({
      fullSegments: 0,
      partialSegmentSeconds: 4,
    });
    expect(splitIntoFiveSegments(5)).toEqual({
      fullSegments: 1,
      partialSegmentSeconds: 0,
    });
    expect(splitIntoFiveSegments(20)).toEqual({
      fullSegments: 4,
      partialSegmentSeconds: 0,
    });
    expect(splitIntoFiveSegments(21)).toEqual({
      fullSegments: 4,
      partialSegmentSeconds: 1,
    });
    expect(splitIntoFiveSegments(24)).toEqual({
      fullSegments: 4,
      partialSegmentSeconds: 4,
    });
    expect(splitIntoFiveSegments(25)).toEqual({
      fullSegments: 5,
      partialSegmentSeconds: 0,
    });
  });

  it("rejects unknown root kinds", () => {
    expect(validateRootKind("soil")).toBe(false);
    expect(normalizeTransferredRoots(["water", "soil", "sun"])).toEqual([
      "water",
      "sun",
    ]);
  });

  it("keeps generation progress in [0, 1)", () => {
    expect(normalizeGenerationProgress(0.4)).toBe(0.4);
    expect(normalizeGenerationProgress(1)).toBe(0);
    expect(normalizeGenerationProgress(2.25)).toBe(0.25);
    expect(normalizeGenerationProgress(-1)).toBe(0);
  });

  it("exposes fillFraction / playableFromRoot / countdown fields", () => {
    const nowMs = Date.parse("2026-07-25T12:00:00.000Z");
    const snap = buildEconomyV3RootsPublicState(
      {
        v3_root_water_seconds: 0,
        v3_root_sun_seconds: 1,
        v3_root_fertilizer_seconds: 25,
        v3_generation_progress: 0.25,
        tutorial_done: true,
      },
      { capital: 100_000, nowMs },
    );
    expect(snap.roots.water.playableFromRoot).toBe(false);
    expect(snap.roots.sun.playableFromRoot).toBe(true);
    expect(snap.roots.fertilizer.fillFraction).toBe(1);
    expect(snap.generation.progress).toBe(0.25);
    expect(snap.generation.accumulating).toBe(true);
    expect(snap.generation.secondsUntilNextWholeSecond).toBeGreaterThan(0);
    expect(snap.generation.secondsUntilNextWholeSecond).toBeLessThanOrEqual(T);
    expect(snap.generation.cycleDurationSeconds).toBe(T);
    expect(snap.generation.nextWholeSecondAt).toBe(
      new Date(
        nowMs + (snap.generation.secondsUntilNextWholeSecond ?? 0) * 1000,
      ).toISOString(),
    );
  });

  it("enforces freeze/insurance invariant", () => {
    const bad = buildEconomyV3RootsPublicState({
      v3_generation_frozen_at: null,
      v3_insurance_deadline_at: new Date("2026-01-01T00:01:00.000Z"),
    });
    expect(
      validateEconomyV3RootsState(bad).some(
        (i) => i.code === "insurance_without_freeze",
      ),
    ).toBe(true);
    expect(isEconomyV3RootsStateValid(bad)).toBe(false);
  });
});

describe("settleEconomyV3Roots (round-robin distribution)", () => {
  const baseInput = {
    rootWaterSeconds: 0,
    rootSunSeconds: 0,
    rootFertilizerSeconds: 0,
    generationProgress: 0,
    generationFrozenAt: null as number | null,
    dayKey: "2026-07-23",
    capital: 100_000,
    tutorialActive: false,
    // Isolate RR / generation tests from visit-day bonus SoT.
    visitBonusSeconds: 0,
  };

  it("1. first settle with null anchor only sets anchor", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      generationAnchorAt: null,
      nowMs: NOW,
    });
    expect(r.wholeSeconds).toBe(0);
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.generationAnchorAt).toBe(NOW);
    expect(r.generated).toBe(false);
  });

  it("2–3. same elapsed distributes whole seconds round-robin from cursor 0", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      generationAnchorAt: NOW - 3 * T * 1000,
      nowMs: NOW,
    });
    expect(r.generatedRaw).toBeCloseTo(3, 9);
    expect(r.wholeSeconds).toBe(3);
    expect(r.rootWaterSeconds).toBe(1);
    expect(r.rootSunSeconds).toBe(1);
    expect(r.rootFertilizerSeconds).toBe(1);
    expect(r.generationRrCursor).toBe(0);
  });

  it("4–5. fractional progress persists; no whole second leaves roots unchanged", () => {
    const first = settleEconomyV3Roots({
      ...baseInput,
      generationAnchorAt: NOW - 0.4 * T * 1000,
      nowMs: NOW,
    });
    expect(first.wholeSeconds).toBe(0);
    expect(first.rootWaterSeconds).toBe(0);
    expect(first.generationProgress).toBeCloseTo(0.4, 9);

    const second = settleEconomyV3Roots({
      ...baseInput,
      generationProgress: first.generationProgress,
      generationAnchorAt: first.generationAnchorAt,
      nowMs: NOW + 0.1 * T * 1000,
    });
    expect(second.wholeSeconds).toBe(0);
    expect(second.rootWaterSeconds).toBe(0);
    expect(second.generationProgress).toBeCloseTo(0.5, 9);
  });

  it("6. crossing a whole second increments one root (cursor 0 → water)", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      generationProgress: 0.6,
      generationAnchorAt: NOW - 0.5 * T * 1000,
      nowMs: NOW,
    });
    expect(r.wholeSeconds).toBe(1);
    expect(r.rootWaterSeconds).toBe(1);
    expect(r.rootSunSeconds).toBe(0);
    expect(r.rootFertilizerSeconds).toBe(0);
    expect(r.generationProgress).toBeCloseTo(0.1, 9);
    expect(r.generationRrCursor).toBe(1);
  });

  it("7–9. root cap at effectivePreset; full root discards its slot while others continue", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      rootWaterSeconds: 25,
      rootSunSeconds: 23,
      rootFertilizerSeconds: 20,
      dailyCapSeconds: 25,
      streakDays: 0,
      visitBonusSeconds: 0,
      generationAnchorAt: NOW - 5 * T * 1000,
      nowMs: NOW,
    });
    expect(r.wholeSeconds).toBe(5);
    expect(r.rootWaterSeconds).toBe(25);
    expect(r.rootSunSeconds).toBe(25);
    expect(r.rootFertilizerSeconds).toBe(21);
  });

  it("10. repeated settle with same now is idempotent", () => {
    const first = settleEconomyV3Roots({
      ...baseInput,
      generationAnchorAt: NOW - T * 1000,
      nowMs: NOW,
    });
    const second = settleEconomyV3Roots({
      ...baseInput,
      rootWaterSeconds: first.rootWaterSeconds,
      rootSunSeconds: first.rootSunSeconds,
      rootFertilizerSeconds: first.rootFertilizerSeconds,
      generationProgress: first.generationProgress,
      generationAnchorAt: first.generationAnchorAt,
      generationRrCursor: first.generationRrCursor,
      nowMs: NOW,
    });
    expect(second.wholeSeconds).toBe(0);
    expect(second.rootWaterSeconds).toBe(first.rootWaterSeconds);
    expect(second.generationProgress).toBe(first.generationProgress);
    expect(second.generationRrCursor).toBe(first.generationRrCursor);
  });

  it("12. tutorial does not generate and does not backfill", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      tutorialActive: true,
      generationAnchorAt: NOW - 10 * T * 1000,
      nowMs: NOW,
    });
    expect(r.wholeSeconds).toBe(0);
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.generationAnchorAt).toBe(NOW);
    expect(r.generated).toBe(false);
  });

  it("13. frozen state still generates (clock continuous)", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      generationFrozenAt: NOW - 60_000,
      generationAnchorAt: NOW - 10 * T * 1000,
      nowMs: NOW,
    });
    expect(r.wholeSeconds).toBe(10);
    expect(r.rootWaterSeconds + r.rootSunSeconds + r.rootFertilizerSeconds).toBe(
      10,
    );
    expect(r.generationAnchorAt).toBe(NOW);
    expect(r.generated).toBe(true);
  });

  it("18. progress always stays in [0, 1)", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      generationProgress: 0.999,
      generationAnchorAt: NOW - 2.5 * T * 1000,
      nowMs: NOW,
    });
    expect(r.generationProgress).toBeGreaterThanOrEqual(0);
    expect(r.generationProgress).toBeLessThan(1);
  });

  it("settle skips transferred root slot; discards do not reroute", () => {
    const r = settleEconomyV3Roots({
      ...baseInput,
      rootWaterSeconds: 0,
      rootSunSeconds: 4,
      rootFertilizerSeconds: 4,
      transferredRoots: ["water"],
      generationAnchorAt: NOW - 3 * T * 1000,
      nowMs: NOW,
    });
    expect(r.wholeSeconds).toBe(3);
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.rootSunSeconds).toBe(5);
    expect(r.rootFertilizerSeconds).toBe(5);
  });
});

describe("transferEconomyV3RootPure", () => {
  const NOW = 1_700_000_000_000;
  const base = {
    rootWaterSeconds: 5,
    rootSunSeconds: 8,
    rootFertilizerSeconds: 12,
    reserveWaterSeconds: 0,
    reserveSunSeconds: 0,
    reserveFertilizerSeconds: 0,
    dailyCapSeconds: 25,
    transferredRoots: [] as const,
    firstTransferredRoot: null as null,
    nowMs: NOW,
    generationFrozenAt: null as number | null,
    insuranceDeadlineAt: null as number | null,
    generationProgress: 0.4,
    generationAnchorAt: NOW - 60_000,
  };

  it("transfers water / sun / fertilizer into matching reserves", () => {
    for (const root of ["water", "sun", "fertilizer"] as const) {
      const r = transferEconomyV3RootPure({ ...base, root });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.root).toBe(root);
      if (root === "water") {
        expect(r.rootWaterSeconds).toBe(0);
        expect(r.reserveWaterSeconds).toBe(5);
        expect(r.rootSunSeconds).toBe(8);
        expect(r.rootFertilizerSeconds).toBe(12);
        expect(r.startedFreeze).toBe(true);
        expect(r.generationFrozenAt).toBe(NOW);
        expect(r.insuranceDeadlineAt).toBe(NOW + 60_000);
        expect(r.firstTransferredRoot).toBe("water");
        expect(r.transferredRoots).toEqual(["water"]);
      }
      if (root === "sun") {
        expect(r.rootSunSeconds).toBe(0);
        expect(r.reserveSunSeconds).toBe(8);
        expect(r.rootWaterSeconds).toBe(5);
      }
      if (root === "fertilizer") {
        // Single transfer of fertilizer alone completes? No - only one root.
        expect(r.rootFertilizerSeconds).toBe(0);
        expect(r.reserveFertilizerSeconds).toBe(12);
        expect(r.cycleCompleted).toBe(false);
      }
    }
  });

  it("rejects unknown / empty / already transferred roots", () => {
    expect(transferEconomyV3RootPure({ ...base, root: "soil" }).ok).toBe(false);
    expect(
      transferEconomyV3RootPure({ ...base, root: "water", rootWaterSeconds: 0 })
        .ok,
    ).toBe(false);
    expect(
      transferEconomyV3RootPure({
        ...base,
        root: "water",
        transferredRoots: ["water"],
        generationFrozenAt: NOW,
        firstTransferredRoot: "water",
      }).ok,
    ).toBe(false);
  });

  it("caps reserve at effective capacity and clears root; overflow is discardedSeconds", () => {
    const r = transferEconomyV3RootPure({
      ...base,
      root: "water",
      rootWaterSeconds: 5,
      reserveWaterSeconds: 23,
      dailyCapSeconds: 25,
      capacitySeconds: 25,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.acceptedSeconds).toBe(2);
    expect(r.discardedSeconds).toBe(3);
    expect(r.reserveWaterSeconds).toBe(25);
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.transferredRoots).toEqual(["water"]);
  });

  it("rejects transfer when reserve has no free room", () => {
    const r = transferEconomyV3RootPure({
      ...base,
      root: "water",
      rootWaterSeconds: 5,
      reserveWaterSeconds: 25,
      dailyCapSeconds: 25,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("reserve_full");
  });

  it("first transfer freezes; second keeps firstTransferredRoot; third opens new cycle", () => {
    const first = transferEconomyV3RootPure({ ...base, root: "water" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.startedFreeze).toBe(true);
    expect(first.generationFrozenAt).toBe(NOW);
    expect(first.insuranceDeadlineAt).toBe(NOW + 60_000);
    expect(first.firstTransferredRoot).toBe("water");
    expect(first.generationProgress).toBe(0.4);

    const second = transferEconomyV3RootPure({
      ...base,
      root: "sun",
      rootWaterSeconds: first.rootWaterSeconds,
      rootSunSeconds: first.rootSunSeconds,
      rootFertilizerSeconds: first.rootFertilizerSeconds,
      reserveWaterSeconds: first.reserveWaterSeconds,
      reserveSunSeconds: first.reserveSunSeconds,
      reserveFertilizerSeconds: first.reserveFertilizerSeconds,
      transferredRoots: first.transferredRoots,
      firstTransferredRoot: first.firstTransferredRoot,
      generationFrozenAt: first.generationFrozenAt,
      insuranceDeadlineAt: first.insuranceDeadlineAt,
      generationProgress: first.generationProgress,
      generationAnchorAt: first.generationAnchorAt,
      nowMs: NOW + 10_000,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.startedFreeze).toBe(false);
    expect(second.generationFrozenAt).toBe(NOW);
    expect(second.insuranceDeadlineAt).toBe(NOW + 60_000);
    expect(second.firstTransferredRoot).toBe("water");
    expect(second.transferredRoots).toEqual(["water", "sun"]);
    expect(second.rootFertilizerSeconds).toBe(12);

    const thirdAt = NOW + 20_000;
    const third = transferEconomyV3RootPure({
      ...base,
      root: "fertilizer",
      rootWaterSeconds: second.rootWaterSeconds,
      rootSunSeconds: second.rootSunSeconds,
      rootFertilizerSeconds: second.rootFertilizerSeconds,
      reserveWaterSeconds: second.reserveWaterSeconds,
      reserveSunSeconds: second.reserveSunSeconds,
      reserveFertilizerSeconds: second.reserveFertilizerSeconds,
      transferredRoots: second.transferredRoots,
      firstTransferredRoot: second.firstTransferredRoot,
      generationFrozenAt: second.generationFrozenAt,
      insuranceDeadlineAt: second.insuranceDeadlineAt,
      generationProgress: second.generationProgress,
      generationAnchorAt: second.generationAnchorAt,
      nowMs: thirdAt,
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.cycleCompleted).toBe(true);
    expect(third.generationFrozenAt).toBeNull();
    expect(third.insuranceDeadlineAt).toBeNull();
    expect(third.firstTransferredRoot).toBeNull();
    expect(third.transferredRoots).toEqual([]);
    // Clock preserved through manual trio completion.
    expect(third.generationProgress).toBe(0.4);
    expect(third.generationAnchorAt).toBe(base.generationAnchorAt);
    expect(third.reserveWaterSeconds).toBe(5);
    expect(third.reserveSunSeconds).toBe(8);
    expect(third.reserveFertilizerSeconds).toBe(12);
  });

  it("settle while frozen keeps RR generation; trio complete preserves clock", () => {
    const frozenAt = NOW;
    const settledWhileFrozen = settleEconomyV3Roots({
      rootWaterSeconds: 0,
      rootSunSeconds: 8,
      rootFertilizerSeconds: 12,
      generationProgress: 0.5,
      generationAnchorAt: frozenAt,
      generationFrozenAt: frozenAt,
      generationRrCursor: 1,
      dayKey: "2026-07-23",
      capital: 100_000,
      nowMs: frozenAt + T * 1000,
      tutorialActive: false,
      transferredRoots: ["water"],
    });
    // One whole second while frozen → sun (cursor 1); water discarded if hit.
    expect(settledWhileFrozen.wholeSeconds).toBe(1);
    expect(settledWhileFrozen.rootSunSeconds).toBe(9);
    expect(settledWhileFrozen.rootFertilizerSeconds).toBe(12);
    expect(settledWhileFrozen.rootWaterSeconds).toBe(0);
    expect(settledWhileFrozen.generationRrCursor).toBe(2);

    const afterCycle = transferEconomyV3RootPure({
      ...base,
      root: "fertilizer",
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 12,
      reserveWaterSeconds: 5,
      reserveSunSeconds: 8,
      transferredRoots: ["water", "sun"],
      firstTransferredRoot: "water",
      generationFrozenAt: frozenAt,
      insuranceDeadlineAt: frozenAt + 60_000,
      generationProgress: 0.5,
      generationAnchorAt: frozenAt - 100_000,
      nowMs: frozenAt + 10 * T * 1000,
    });
    expect(afterCycle.ok).toBe(true);
    if (!afterCycle.ok) return;
    expect(afterCycle.cycleCompleted).toBe(true);
    expect(afterCycle.generationProgress).toBe(0.5);
    expect(afterCycle.generationAnchorAt).toBe(frozenAt - 100_000);

    const nextSettle = settleEconomyV3Roots({
      rootWaterSeconds: afterCycle.rootWaterSeconds,
      rootSunSeconds: afterCycle.rootSunSeconds,
      rootFertilizerSeconds: afterCycle.rootFertilizerSeconds,
      generationProgress: afterCycle.generationProgress,
      generationAnchorAt: afterCycle.generationAnchorAt,
      generationFrozenAt: afterCycle.generationFrozenAt,
      generationRrCursor: 0,
      dayKey: "2026-07-23",
      capital: 100_000,
      nowMs: afterCycle.generationAnchorAt,
      tutorialActive: false,
      transferredRoots: afterCycle.transferredRoots,
    });
    expect(nextSettle.wholeSeconds).toBe(0);
    expect(nextSettle.generationProgress).toBe(0.5);
  });

  it("snapshot marks transferred root empty; freeze keeps accumulating + countdown", () => {
    const transferred = transferEconomyV3RootPure({ ...base, root: "sun" });
    expect(transferred.ok).toBe(true);
    if (!transferred.ok) return;
    const snap = buildEconomyV3RootsPublicState(
      {
        v3_root_water_seconds: transferred.rootWaterSeconds,
        v3_root_sun_seconds: transferred.rootSunSeconds,
        v3_root_fertilizer_seconds: transferred.rootFertilizerSeconds,
        v3_reserve_water_seconds: transferred.reserveWaterSeconds,
        v3_reserve_sun_seconds: transferred.reserveSunSeconds,
        v3_reserve_fertilizer_seconds: transferred.reserveFertilizerSeconds,
        v3_daily_cap_seconds: transferred.dailyCapSeconds,
        v3_transferred_roots: transferred.transferredRoots,
        v3_first_transferred_root: transferred.firstTransferredRoot,
        v3_generation_frozen_at: new Date(transferred.generationFrozenAt!),
        v3_insurance_deadline_at: new Date(transferred.insuranceDeadlineAt!),
        v3_generation_progress: transferred.generationProgress,
        v3_generation_rr_cursor: 1,
      },
      { capital: 100_000, nowMs: NOW },
    );
    expect(snap.roots.sun.seconds).toBe(0);
    expect(snap.roots.sun.transferred).toBe(true);
    expect(snap.roots.sun.playableFromRoot).toBe(false);
    expect(snap.roots.water.frozen).toBe(true);
    expect(snap.roots.water.playableFromRoot).toBe(true);
    expect(snap.generation.accumulating).toBe(true);
    expect(snap.generation.frozenAt).not.toBeNull();
    expect(snap.generation.insuranceDeadlineAt).not.toBeNull();
    expect(snap.generation.secondsUntilNextWholeSecond).not.toBeNull();
    expect(snap.generation.nextWholeSecondAt).not.toBeNull();
    expect(snap.generation.cycleDurationSeconds).toBe(T);
    expect(snap.generation.progress).toBe(0.4);
    expect(snap.generation.rrCursor).toBe(1);
    expect(snap.generation.nextRoot).toBe("sun");
    expect(snap.reserves.sun.seconds).toBe(8);
  });
});

describe("autoTransferEconomyV3RemainingPure", () => {
  const frozenAt = 1_700_000_000_000;
  const deadline = frozenAt + V3_TRANSFER_INSURANCE_MS;
  const base = {
    rootWaterSeconds: 0,
    rootSunSeconds: 7,
    rootFertilizerSeconds: 4,
    reserveWaterSeconds: 5,
    reserveSunSeconds: 0,
    reserveFertilizerSeconds: 0,
    dailyCapSeconds: 25,
    transferredRoots: ["water"] as const,
    firstTransferredRoot: "water" as const,
    generationFrozenAt: frozenAt,
    insuranceDeadlineAt: deadline,
    generationProgress: 0.3,
    generationAnchorAt: frozenAt,
  };

  it("1. before deadline does nothing", () => {
    const r = autoTransferEconomyV3RemainingPure({
      ...base,
      nowMs: deadline - 1,
    });
    expect(r.applied).toBe(false);
  });

  it("2–4. at/after deadline transfers one or two remaining roots", () => {
    const oneLeft = autoTransferEconomyV3RemainingPure({
      ...base,
      rootFertilizerSeconds: 0,
      transferredRoots: ["water", "sun"],
      nowMs: deadline,
    });
    expect(oneLeft.applied).toBe(true);
    if (!oneLeft.applied) return;
    expect(oneLeft.roots).toEqual(["fertilizer"]);
    expect(oneLeft.acceptedByRoot.fertilizer).toBe(0);

    const twoLeft = autoTransferEconomyV3RemainingPure({
      ...base,
      nowMs: deadline + 1,
    });
    expect(twoLeft.applied).toBe(true);
    if (!twoLeft.applied) return;
    expect(twoLeft.roots).toEqual(["sun", "fertilizer"]);
    expect(twoLeft.acceptedByRoot.sun).toBe(7);
    expect(twoLeft.acceptedByRoot.fertilizer).toBe(4);
    expect(twoLeft.reserveSunSeconds).toBe(7);
    expect(twoLeft.reserveFertilizerSeconds).toBe(4);
    expect(twoLeft.reserveWaterSeconds).toBe(5);
  });

  it("5–12. clears freeze/insurance/transferred; keeps generation clock", () => {
    const r = autoTransferEconomyV3RemainingPure({
      ...base,
      nowMs: deadline,
    });
    expect(r.applied).toBe(true);
    if (!r.applied) return;
    expect(r.rootSunSeconds).toBe(0);
    expect(r.rootFertilizerSeconds).toBe(0);
    expect(r.generationFrozenAt).toBeNull();
    expect(r.insuranceDeadlineAt).toBeNull();
    expect(r.firstTransferredRoot).toBeNull();
    expect(r.transferredRoots).toEqual([]);
    expect(r.generationProgress).toBe(0.3);
    expect(r.generationAnchorAt).toBe(frozenAt);
    expect(r.cycleCompleted).toBe(true);
  });

  it("6. respects reserve capacity; clears root; overflow in discardedByRoot", () => {
    const r = autoTransferEconomyV3RemainingPure({
      ...base,
      rootSunSeconds: 10,
      reserveSunSeconds: 20,
      dailyCapSeconds: 25,
      nowMs: deadline,
    });
    expect(r.applied).toBe(true);
    if (!r.applied) return;
    expect(r.acceptedByRoot.sun).toBe(5);
    expect(r.discardedByRoot.sun).toBe(5);
    expect(r.reserveSunSeconds).toBe(25);
    expect(r.rootSunSeconds).toBe(0);
  });

  it("13. second call after thaw is no-op (idempotent)", () => {
    const first = autoTransferEconomyV3RemainingPure({
      ...base,
      nowMs: deadline,
    });
    expect(first.applied).toBe(true);
    if (!first.applied) return;
    const second = autoTransferEconomyV3RemainingPure({
      nowMs: deadline + 5_000,
      rootWaterSeconds: first.rootWaterSeconds,
      rootSunSeconds: first.rootSunSeconds,
      rootFertilizerSeconds: first.rootFertilizerSeconds,
      reserveWaterSeconds: first.reserveWaterSeconds,
      reserveSunSeconds: first.reserveSunSeconds,
      reserveFertilizerSeconds: first.reserveFertilizerSeconds,
      dailyCapSeconds: first.dailyCapSeconds,
      transferredRoots: first.transferredRoots,
      firstTransferredRoot: null,
      generationFrozenAt: null,
      insuranceDeadlineAt: null,
      generationProgress: first.generationProgress,
      generationAnchorAt: first.generationAnchorAt,
    });
    expect(second.applied).toBe(false);
  });

  it("16. empty remaining root still thaws the cycle", () => {
    const r = autoTransferEconomyV3RemainingPure({
      ...base,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      nowMs: deadline,
    });
    expect(r.applied).toBe(true);
    if (!r.applied) return;
    expect(r.roots).toEqual(["sun", "fertilizer"]);
    expect(r.generationFrozenAt).toBeNull();
    expect(r.reserveSunSeconds).toBe(0);
  });

  it("15. sequential race: auto then manual-equivalent does not double credit", () => {
    const auto = autoTransferEconomyV3RemainingPure({
      ...base,
      nowMs: deadline,
    });
    expect(auto.applied).toBe(true);
    if (!auto.applied) return;
    const manual = transferEconomyV3RootPure({
      root: "sun",
      rootWaterSeconds: auto.rootWaterSeconds,
      rootSunSeconds: auto.rootSunSeconds,
      rootFertilizerSeconds: auto.rootFertilizerSeconds,
      reserveWaterSeconds: auto.reserveWaterSeconds,
      reserveSunSeconds: auto.reserveSunSeconds,
      reserveFertilizerSeconds: auto.reserveFertilizerSeconds,
      dailyCapSeconds: auto.dailyCapSeconds,
      transferredRoots: auto.transferredRoots,
      firstTransferredRoot: null,
      nowMs: deadline + 1,
      generationFrozenAt: null,
      insuranceDeadlineAt: null,
      generationProgress: 0,
      generationAnchorAt: auto.generationAnchorAt,
    });
    // After thaw roots are empty → empty_root (no double reserve credit).
    expect(manual.ok).toBe(false);
    if (manual.ok) return;
    expect(manual.code).toBe("empty_root");
    expect(auto.reserveSunSeconds).toBe(7);
  });
});

describe("buildEconomyV3CareAvailability", () => {
  it("1–6. playable threshold and maxPresetSeconds ladder", () => {
    const cases: Array<{
      reserve: number;
      playable: boolean;
      preset: number;
    }> = [
      { reserve: 0, playable: false, preset: 0 },
      { reserve: 4, playable: false, preset: 0 },
      { reserve: 5, playable: true, preset: 5 },
      { reserve: 13, playable: true, preset: 13 },
      { reserve: 20, playable: true, preset: 20 },
      { reserve: 25, playable: true, preset: 25 },
    ];
    for (const c of cases) {
      const avail = buildEconomyV3CareAvailability({
        reserves: { water: c.reserve, sun: 0, fertilizer: 0 },
        dailyCapSeconds: 25,
      });
      expect(avail.water).toEqual({
        reserveSeconds: c.reserve,
        playable: c.playable,
        maxPresetSeconds: c.preset,
      });
    }
  });

  it("7–8. computes each activity independently", () => {
    const avail = buildEconomyV3CareAvailability({
      reserves: { water: 12, sun: 3, fertilizer: 0 },
      dailyCapSeconds: 20,
    });
    expect(avail.water).toEqual({
      reserveSeconds: 12,
      playable: true,
      maxPresetSeconds: 12,
    });
    expect(avail.sun).toEqual({
      reserveSeconds: 3,
      playable: false,
      maxPresetSeconds: 0,
    });
    expect(avail.fertilizer).toEqual({
      reserveSeconds: 0,
      playable: false,
      maxPresetSeconds: 0,
    });
  });

  it("9. maxPreset does not exceed dailyCap", () => {
    const avail = buildEconomyV3CareAvailability({
      reserves: { water: 25, sun: 18, fertilizer: 5 },
      dailyCapSeconds: 15,
    });
    expect(avail.water.reserveSeconds).toBe(15);
    expect(avail.water.maxPresetSeconds).toBe(15);
    expect(avail.sun.maxPresetSeconds).toBe(15);
    expect(avail.fertilizer.maxPresetSeconds).toBe(5);
  });

  it("10. fractional reserve floors to whole seconds", () => {
    const avail = buildEconomyV3CareAvailability({
      reserves: { water: 13.9, sun: 4.9, fertilizer: 5.1 },
      dailyCapSeconds: 25,
    });
    expect(avail.water).toEqual({
      reserveSeconds: 13,
      playable: true,
      maxPresetSeconds: 13,
    });
    expect(avail.sun).toEqual({
      reserveSeconds: 4,
      playable: false,
      maxPresetSeconds: 0,
    });
    expect(avail.fertilizer).toEqual({
      reserveSeconds: 5,
      playable: true,
      maxPresetSeconds: 5,
    });
    expect(Number.isInteger(avail.water.maxPresetSeconds)).toBe(true);
  });

  it("11. after manual transfer availability updates in snapshot", () => {
    const transferred = transferEconomyV3RootPure({
      root: "water",
      rootWaterSeconds: 9,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      transferredRoots: [],
      firstTransferredRoot: null,
      nowMs: NOW,
      generationFrozenAt: null,
      insuranceDeadlineAt: null,
      generationProgress: 0.2,
      generationAnchorAt: NOW,
    });
    expect(transferred.ok).toBe(true);
    if (!transferred.ok) return;

    const before = buildEconomyV3CareAvailability({
      reserves: { water: 0, sun: 0, fertilizer: 0 },
      dailyCapSeconds: 20,
    });
    expect(before.water.playable).toBe(false);

    const snap = buildEconomyV3RootsPublicState({
      v3_reserve_water_seconds: transferred.reserveWaterSeconds,
      v3_reserve_sun_seconds: transferred.reserveSunSeconds,
      v3_reserve_fertilizer_seconds: transferred.reserveFertilizerSeconds,
      v3_daily_cap_seconds: transferred.dailyCapSeconds,
    });
    expect(snap.careAvailability.water).toEqual({
      reserveSeconds: 9,
      playable: true,
      maxPresetSeconds: 9,
    });
    expect(snap.careAvailability.sun.playable).toBe(false);
  });

  it("12. after auto-transfer availability updates in snapshot", () => {
    const frozenAt = NOW;
    const deadline = frozenAt + V3_TRANSFER_INSURANCE_MS;
    const auto = autoTransferEconomyV3RemainingPure({
      nowMs: deadline,
      rootWaterSeconds: 0,
      rootSunSeconds: 8,
      rootFertilizerSeconds: 2,
      reserveWaterSeconds: 6,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      transferredRoots: ["water"],
      firstTransferredRoot: "water",
      generationFrozenAt: frozenAt,
      insuranceDeadlineAt: deadline,
      generationProgress: 0.1,
      generationAnchorAt: frozenAt,
    });
    expect(auto.applied).toBe(true);
    if (!auto.applied) return;

    const snap = buildEconomyV3RootsPublicState({
      v3_reserve_water_seconds: auto.reserveWaterSeconds,
      v3_reserve_sun_seconds: auto.reserveSunSeconds,
      v3_reserve_fertilizer_seconds: auto.reserveFertilizerSeconds,
      v3_daily_cap_seconds: auto.dailyCapSeconds,
    });
    expect(snap.careAvailability.water).toEqual({
      reserveSeconds: 6,
      playable: true,
      maxPresetSeconds: 6,
    });
    expect(snap.careAvailability.sun).toEqual({
      reserveSeconds: 8,
      playable: true,
      maxPresetSeconds: 8,
    });
    expect(snap.careAvailability.fertilizer).toEqual({
      reserveSeconds: 2,
      playable: false,
      maxPresetSeconds: 0,
    });
  });

  it("does not mutate input reserves (no spend)", () => {
    const reserves = { water: 10, sun: 7, fertilizer: 5 };
    const before = { ...reserves };
    buildEconomyV3CareAvailability({
      reserves,
      dailyCapSeconds: 20,
    });
    expect(reserves).toEqual(before);
  });
});

describe("startEconomyV3CareActivityPure", () => {
  const base = {
    reserveWaterSeconds: 12,
    reserveSunSeconds: 10,
    reserveFertilizerSeconds: 8,
    dailyCapSeconds: 20,
    careActivityStatus: null as null,
    nowMs: NOW,
  };

  it("1–3 / 10. starts each activity and debits only its reserve", () => {
    for (const activity of ["water", "sun", "fertilizer"] as const) {
      const r = startEconomyV3CareActivityPure({
        ...base,
        activity,
        presetSeconds: 5,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.activity).toBe(activity);
      expect(r.careActivityStatus).toBe("active");
      const expected = {
        water: activity === "water" ? 7 : 12,
        sun: activity === "sun" ? 5 : 10,
        fertilizer: activity === "fertilizer" ? 3 : 8,
      };
      expect(r.reserveWaterSeconds).toBe(expected.water);
      expect(r.reserveSunSeconds).toBe(expected.sun);
      expect(r.reserveFertilizerSeconds).toBe(expected.fertilizer);
    }
  });

  it("4–7. rejects invalid presets and insufficient reserve", () => {
    expect(
      startEconomyV3CareActivityPure({
        ...base,
        activity: "water",
        presetSeconds: 4,
      }),
    ).toMatchObject({ ok: false, code: "preset_below_min" });

    expect(
      startEconomyV3CareActivityPure({
        ...base,
        activity: "water",
        presetSeconds: 31,
        dailyCapSeconds: 30,
      }),
    ).toMatchObject({ ok: false, code: "preset_above_max" });

    expect(
      startEconomyV3CareActivityPure({
        ...base,
        activity: "water",
        presetSeconds: 26,
        dailyCapSeconds: 20,
      }),
    ).toMatchObject({ ok: false, code: "preset_above_daily_cap" });

    expect(
      startEconomyV3CareActivityPure({
        ...base,
        activity: "water",
        presetSeconds: 13,
        reserveWaterSeconds: 12,
      }),
    ).toMatchObject({ ok: false, code: "insufficient_reserve" });
  });

  it("8. preset equal to reserve works", () => {
    const r = startEconomyV3CareActivityPure({
      ...base,
      activity: "sun",
      presetSeconds: 10,
      reserveSunSeconds: 10,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reserveSunSeconds).toBe(0);
  });

  it("9 / 11. snapshot reflects debit, availability, and active session", () => {
    const r = startEconomyV3CareActivityPure({
      ...base,
      activity: "water",
      presetSeconds: 7,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const snap = buildEconomyV3RootsPublicState(
      {
        v3_reserve_water_seconds: r.reserveWaterSeconds,
        v3_reserve_sun_seconds: r.reserveSunSeconds,
        v3_reserve_fertilizer_seconds: r.reserveFertilizerSeconds,
        v3_daily_cap_seconds: r.dailyCapSeconds,
        v3_care_activity_kind: r.careActivityKind,
        v3_care_activity_preset_seconds: r.careActivityPresetSeconds,
        v3_care_activity_started_at: new Date(r.careActivityStartedAt),
        v3_care_activity_status: r.careActivityStatus,
      },
      { capital: 100_000 },
    );
    expect(snap.reserves.water.seconds).toBe(5);
    expect(snap.careAvailability.water).toEqual({
      reserveSeconds: 5,
      playable: true,
      maxPresetSeconds: 5,
    });
    expect(snap.careSession).toEqual({
      active: true,
      activity: "water",
      presetSeconds: 7,
      startedAt: new Date(NOW).toISOString(),
      finishedAt: null,
      status: "active",
      skill: null,
    });
  });

  it("12–13. active session blocks second start without further debit", () => {
    const first = startEconomyV3CareActivityPure({
      ...base,
      activity: "water",
      presetSeconds: 5,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = startEconomyV3CareActivityPure({
      activity: "sun",
      presetSeconds: 5,
      reserveWaterSeconds: first.reserveWaterSeconds,
      reserveSunSeconds: first.reserveSunSeconds,
      reserveFertilizerSeconds: first.reserveFertilizerSeconds,
      dailyCapSeconds: first.dailyCapSeconds,
      careActivityStatus: "active",
      nowMs: NOW + 1,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("activity_in_progress");
    expect(first.reserveWaterSeconds).toBe(7);
    expect(first.reserveSunSeconds).toBe(10);
  });
});

describe("finishEconomyV3CareActivityPure", () => {
  const activeBase = {
    careActivityKind: "water" as const,
    careActivityStatus: "active" as const,
    careActivityPresetSeconds: 7,
    careActivityStartedAt: NOW,
    careActivitySkill: null as number | null,
    careActivityFinishedAt: null as number | null,
    nowMs: NOW + 5_000,
  };

  it("1–3. finishes water / sun / fertilizer", () => {
    for (const activity of ["water", "sun", "fertilizer"] as const) {
      const r = finishEconomyV3CareActivityPure({
        ...activeBase,
        activity,
        skill: 0.75,
        careActivityKind: activity,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.alreadyCompleted).toBe(false);
      expect(r.activity).toBe(activity);
      expect(r.skill).toBe(0.75);
      expect(r.careActivityStatus).toBe("completed");
      expect(r.finishedAt).toBe(NOW + 5_000);
    }
  });

  it("4–7. accepts skill 0/1 and rejects out-of-range / non-finite", () => {
    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "water",
        skill: 0,
      }),
    ).toMatchObject({ ok: true, skill: 0 });

    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "water",
        skill: 1,
      }),
    ).toMatchObject({ ok: true, skill: 1 });

    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "water",
        skill: 1.01,
      }),
    ).toMatchObject({ ok: false, code: "invalid_skill" });

    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "water",
        skill: -0.1,
      }),
    ).toMatchObject({ ok: false, code: "invalid_skill" });

    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "water",
        skill: Number.NaN,
      }),
    ).toMatchObject({ ok: false, code: "invalid_skill" });

    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "water",
        skill: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({ ok: false, code: "invalid_skill" });
  });

  it("8–9. mismatch and missing active session", () => {
    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "sun",
        skill: 0.5,
        careActivityKind: "water",
      }),
    ).toMatchObject({ ok: false, code: "activity_mismatch" });

    expect(
      finishEconomyV3CareActivityPure({
        ...activeBase,
        activity: "water",
        skill: 0.5,
        careActivityKind: null,
        careActivityStatus: null,
      }),
    ).toMatchObject({ ok: false, code: "no_active_activity" });
  });

  it("10–14. completed snapshot, reserves untouched, idempotent repeat", () => {
    const first = finishEconomyV3CareActivityPure({
      ...activeBase,
      activity: "water",
      skill: 0.42,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const snap = buildEconomyV3RootsPublicState({
      v3_reserve_water_seconds: 5,
      v3_reserve_sun_seconds: 10,
      v3_reserve_fertilizer_seconds: 8,
      v3_daily_cap_seconds: 20,
      v3_care_activity_kind: first.activity,
      v3_care_activity_preset_seconds: first.presetSeconds,
      v3_care_activity_started_at: new Date(first.startedAt!),
      v3_care_activity_finished_at: new Date(first.finishedAt),
      v3_care_activity_status: first.careActivityStatus,
      v3_care_activity_skill: first.skill,
    });
    expect(snap.reserves.water.seconds).toBe(5);
    expect(snap.careSession).toEqual({
      active: false,
      activity: "water",
      presetSeconds: 7,
      startedAt: new Date(NOW).toISOString(),
      finishedAt: new Date(NOW + 5_000).toISOString(),
      status: "completed",
      skill: 0.42,
    });

    const second = finishEconomyV3CareActivityPure({
      activity: "water",
      skill: 0.99,
      careActivityKind: "water",
      careActivityStatus: "completed",
      careActivityPresetSeconds: 7,
      careActivityStartedAt: NOW,
      careActivitySkill: 0.42,
      careActivityFinishedAt: NOW + 5_000,
      nowMs: NOW + 10_000,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyCompleted).toBe(true);
    expect(second.skill).toBe(0.42);
    expect(second.finishedAt).toBe(NOW + 5_000);
  });
});

describe("acknowledgeEconomyV3CareActivityPure", () => {
  it("1–3. clears completed water / sun / fertilizer", () => {
    for (const activity of ["water", "sun", "fertilizer"] as const) {
      const r = acknowledgeEconomyV3CareActivityPure({
        activity,
        careActivityKind: activity,
        careActivityStatus: "completed",
      });
      expect(r).toEqual({ ok: true, activity, cleared: true });
    }
  });

  it("4–6. rejects active, mismatch, and missing completed session", () => {
    expect(
      acknowledgeEconomyV3CareActivityPure({
        activity: "water",
        careActivityKind: "water",
        careActivityStatus: "active",
      }),
    ).toMatchObject({ ok: false, code: "activity_not_completed" });

    expect(
      acknowledgeEconomyV3CareActivityPure({
        activity: "sun",
        careActivityKind: "water",
        careActivityStatus: "completed",
      }),
    ).toMatchObject({ ok: false, code: "activity_mismatch" });

    expect(
      acknowledgeEconomyV3CareActivityPure({
        activity: "water",
        careActivityKind: null,
        careActivityStatus: null,
      }),
    ).toMatchObject({ ok: false, code: "no_completed_activity" });

    expect(
      acknowledgeEconomyV3CareActivityPure({
        activity: "soil",
        careActivityKind: "water",
        careActivityStatus: "completed",
      }),
    ).toMatchObject({ ok: false, code: "unknown_activity" });
  });

  it("7–10. acknowledge clears session only; next start uses its own reserve", () => {
    const finished = finishEconomyV3CareActivityPure({
      activity: "water",
      skill: 0.5,
      careActivityKind: "water",
      careActivityStatus: "active",
      careActivityPresetSeconds: 7,
      careActivityStartedAt: NOW,
      careActivitySkill: null,
      careActivityFinishedAt: null,
      nowMs: NOW + 1_000,
    });
    expect(finished.ok).toBe(true);
    if (!finished.ok) return;

    const acked = acknowledgeEconomyV3CareActivityPure({
      activity: "water",
      careActivityKind: "water",
      careActivityStatus: "completed",
    });
    expect(acked.ok).toBe(true);

    const clearedSnap = buildEconomyV3RootsPublicState({
      v3_root_water_seconds: 3,
      v3_root_sun_seconds: 4,
      v3_root_fertilizer_seconds: 5,
      v3_reserve_water_seconds: 0,
      v3_reserve_sun_seconds: 9,
      v3_reserve_fertilizer_seconds: 8,
      v3_daily_cap_seconds: 20,
      v3_care_activity_kind: null,
      v3_care_activity_preset_seconds: null,
      v3_care_activity_started_at: null,
      v3_care_activity_finished_at: null,
      v3_care_activity_status: null,
      v3_care_activity_skill: null,
    });
    expect(clearedSnap.careSession).toEqual({
      active: false,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      finishedAt: null,
      status: null,
      skill: null,
    });
    expect(clearedSnap.reserves.sun.seconds).toBe(9);
    expect(clearedSnap.roots.water.seconds).toBe(3);

    const nextStart = startEconomyV3CareActivityPure({
      activity: "sun",
      presetSeconds: 5,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 9,
      reserveFertilizerSeconds: 8,
      dailyCapSeconds: 20,
      careActivityStatus: null,
      nowMs: NOW + 2_000,
    });
    expect(nextStart.ok).toBe(true);
    if (!nextStart.ok) return;
    expect(nextStart.reserveSunSeconds).toBe(4);
    expect(nextStart.reserveWaterSeconds).toBe(0);
    expect(nextStart.reserveFertilizerSeconds).toBe(8);
  });

  it("11. sequential water → sun → fertilizer uses only matching reserves", () => {
    let water = 7;
    let sun = 10;
    let fertilizer = 6;
    let status: "active" | "completed" | null = null;
    let kind: "water" | "sun" | "fertilizer" | null = null;

    const run = (activity: "water" | "sun" | "fertilizer", preset: number) => {
      const started = startEconomyV3CareActivityPure({
        activity,
        presetSeconds: preset,
        reserveWaterSeconds: water,
        reserveSunSeconds: sun,
        reserveFertilizerSeconds: fertilizer,
        dailyCapSeconds: 20,
        careActivityStatus: status,
        nowMs: NOW,
      });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      water = started.reserveWaterSeconds;
      sun = started.reserveSunSeconds;
      fertilizer = started.reserveFertilizerSeconds;
      kind = started.careActivityKind;
      status = "active";

      const finished = finishEconomyV3CareActivityPure({
        activity,
        skill: 0.6,
        careActivityKind: kind,
        careActivityStatus: status,
        careActivityPresetSeconds: preset,
        careActivityStartedAt: NOW,
        careActivitySkill: null,
        careActivityFinishedAt: null,
        nowMs: NOW + 1,
      });
      expect(finished.ok).toBe(true);
      if (!finished.ok) return;
      status = "completed";

      const acked = acknowledgeEconomyV3CareActivityPure({
        activity,
        careActivityKind: kind,
        careActivityStatus: status,
      });
      expect(acked.ok).toBe(true);
      kind = null;
      status = null;
    };

    run("water", 7);
    expect({ water, sun, fertilizer }).toEqual({
      water: 0,
      sun: 10,
      fertilizer: 6,
    });

    run("sun", 5);
    expect({ water, sun, fertilizer }).toEqual({
      water: 0,
      sun: 5,
      fertilizer: 6,
    });

    const fertStart = startEconomyV3CareActivityPure({
      activity: "fertilizer",
      presetSeconds: 6,
      reserveWaterSeconds: water,
      reserveSunSeconds: sun,
      reserveFertilizerSeconds: fertilizer,
      dailyCapSeconds: 20,
      careActivityStatus: status,
      nowMs: NOW,
    });
    expect(fertStart.ok).toBe(true);
    if (!fertStart.ok) return;
    expect(fertStart.reserveFertilizerSeconds).toBe(0);
    expect(fertStart.reserveWaterSeconds).toBe(0);
    expect(fertStart.reserveSunSeconds).toBe(5);
  });

  it("12. repeat acknowledge after clear fails without side effects", () => {
    const first = acknowledgeEconomyV3CareActivityPure({
      activity: "water",
      careActivityKind: "water",
      careActivityStatus: "completed",
    });
    expect(first.ok).toBe(true);

    const second = acknowledgeEconomyV3CareActivityPure({
      activity: "water",
      careActivityKind: null,
      careActivityStatus: null,
    });
    expect(second).toMatchObject({ ok: false, code: "no_completed_activity" });
  });
});

describe("Economy v3 Care cycle journal", () => {
  it("1. first successful start is reflected via careCycle.startedAt in snapshot", () => {
    const snap = buildEconomyV3RootsPublicState({
      v3_care_cycle_started_at: new Date(NOW),
      v3_care_cycle_status: "in_progress",
    });
    expect(snap.careCycle.startedAt).toBe(new Date(NOW).toISOString());
    expect(snap.careCycle.status).toBe("in_progress");
    expect(snap.careCycle.allCompleted).toBe(false);
    expect(snap.careCycle.completedAt).toBeNull();
  });

  it("2–3 / 11. finish records activity; acknowledge does not clear journal", () => {
    const recorded = recordCareCycleFinishPure({
      activity: "water",
      presetSeconds: 7,
      skill: 0.4,
      nowMs: NOW + 1,
      waterCompleted: false,
      waterPresetSeconds: null,
      waterSkill: null,
      sunCompleted: false,
      sunPresetSeconds: null,
      sunSkill: null,
      fertilizerCompleted: false,
      fertilizerPresetSeconds: null,
      fertilizerSkill: null,
      cycleCompletedAt: null,
      cycleStatus: "in_progress",
    });
    expect(recorded.recorded).toBe(true);
    expect(recorded.waterCompleted).toBe(true);
    expect(recorded.waterPresetSeconds).toBe(7);
    expect(recorded.waterSkill).toBe(0.4);
    expect(recorded.allCompleted).toBe(false);
    expect(recorded.cycleStatus).toBe("in_progress");

    const afterAck = buildEconomyV3RootsPublicState({
      v3_care_cycle_started_at: new Date(NOW),
      v3_care_cycle_status: "in_progress",
      v3_care_cycle_water_completed: true,
      v3_care_cycle_water_preset_seconds: 7,
      v3_care_cycle_water_skill: 0.4,
      v3_care_activity_kind: null,
      v3_care_activity_status: null,
    });
    expect(afterAck.careSession.status).toBeNull();
    expect(afterAck.careCycle.activities.water).toEqual({
      completed: true,
      presetSeconds: 7,
      skill: 0.4,
    });
  });

  it("4. start rejects already-completed cycle activity", () => {
    const r = startEconomyV3CareActivityPure({
      activity: "water",
      presetSeconds: 5,
      reserveWaterSeconds: 10,
      reserveSunSeconds: 10,
      reserveFertilizerSeconds: 10,
      dailyCapSeconds: 20,
      careActivityStatus: null,
      careCycleActivityCompleted: true,
      nowMs: NOW,
    });
    expect(r).toMatchObject({ ok: false, code: "activity_already_completed" });
  });

  it("5–9. water → sun → fertilizer sets allCompleted and completedAt once", () => {
    let state = {
      waterCompleted: false,
      waterPresetSeconds: null as number | null,
      waterSkill: null as number | null,
      sunCompleted: false,
      sunPresetSeconds: null as number | null,
      sunSkill: null as number | null,
      fertilizerCompleted: false,
      fertilizerPresetSeconds: null as number | null,
      fertilizerSkill: null as number | null,
      cycleCompletedAt: null as number | null,
      cycleStatus: "in_progress" as "in_progress" | "ready" | "finished" | null,
    };

    const apply = (
      activity: "water" | "sun" | "fertilizer",
      preset: number,
      skill: number,
      now: number,
    ) => {
      const next = recordCareCycleFinishPure({
        activity,
        presetSeconds: preset,
        skill,
        nowMs: now,
        ...state,
      });
      state = {
        waterCompleted: next.waterCompleted,
        waterPresetSeconds: next.waterPresetSeconds,
        waterSkill: next.waterSkill,
        sunCompleted: next.sunCompleted,
        sunPresetSeconds: next.sunPresetSeconds,
        sunSkill: next.sunSkill,
        fertilizerCompleted: next.fertilizerCompleted,
        fertilizerPresetSeconds: next.fertilizerPresetSeconds,
        fertilizerSkill: next.fertilizerSkill,
        cycleCompletedAt: next.cycleCompletedAt,
        cycleStatus: next.cycleStatus,
      };
      return next;
    };

    const w = apply("water", 7, 0.2, NOW + 1);
    expect(w.allCompleted).toBe(false);
    expect(w.cycleCompletedAt).toBeNull();
    expect(w.cycleStatus).toBe("in_progress");

    const s = apply("sun", 5, 0.5, NOW + 2);
    expect(s.allCompleted).toBe(false);
    expect(s.sunPresetSeconds).toBe(5);
    expect(s.sunSkill).toBe(0.5);
    expect(s.waterSkill).toBe(0.2);

    const f = apply("fertilizer", 6, 0.9, NOW + 3);
    expect(f.allCompleted).toBe(true);
    expect(f.cycleCompletedAt).toBe(NOW + 3);
    expect(f.fertilizerPresetSeconds).toBe(6);
    expect(f.cycleStatus).toBe("ready");

    const again = apply("fertilizer", 6, 0.1, NOW + 99);
    expect(again.recorded).toBe(false);
    expect(again.fertilizerSkill).toBe(0.9);
    expect(again.cycleCompletedAt).toBe(NOW + 3);
    expect(again.cycleStatus).toBe("ready");

    const snap = buildV3CareCycle({
      v3_care_cycle_started_at: new Date(NOW),
      v3_care_cycle_completed_at: new Date(NOW + 3),
      v3_care_cycle_status: "ready",
      v3_care_cycle_water_completed: true,
      v3_care_cycle_water_preset_seconds: 7,
      v3_care_cycle_water_skill: 0.2,
      v3_care_cycle_sun_completed: true,
      v3_care_cycle_sun_preset_seconds: 5,
      v3_care_cycle_sun_skill: 0.5,
      v3_care_cycle_fertilizer_completed: true,
      v3_care_cycle_fertilizer_preset_seconds: 6,
      v3_care_cycle_fertilizer_skill: 0.9,
    });
    expect(snap.allCompleted).toBe(true);
    expect(snap.status).toBe("ready");
    expect(snap.readyToFinish).toBe(true);
    expect(snap.completedAt).toBe(new Date(NOW + 3).toISOString());
  });

  it("10 / 12. repeat finish recording is idempotent and does not touch reserves", () => {
    const first = recordCareCycleFinishPure({
      activity: "sun",
      presetSeconds: 8,
      skill: 0.33,
      nowMs: NOW,
      waterCompleted: true,
      waterPresetSeconds: 7,
      waterSkill: 0.1,
      sunCompleted: false,
      sunPresetSeconds: null,
      sunSkill: null,
      fertilizerCompleted: false,
      fertilizerPresetSeconds: null,
      fertilizerSkill: null,
      cycleCompletedAt: null,
      cycleStatus: "in_progress",
    });
    const second = recordCareCycleFinishPure({
      activity: "sun",
      presetSeconds: 99,
      skill: 0.99,
      nowMs: NOW + 10,
      waterCompleted: first.waterCompleted,
      waterPresetSeconds: first.waterPresetSeconds,
      waterSkill: first.waterSkill,
      sunCompleted: first.sunCompleted,
      sunPresetSeconds: first.sunPresetSeconds,
      sunSkill: first.sunSkill,
      fertilizerCompleted: first.fertilizerCompleted,
      fertilizerPresetSeconds: first.fertilizerPresetSeconds,
      fertilizerSkill: first.fertilizerSkill,
      cycleCompletedAt: first.cycleCompletedAt,
      cycleStatus: first.cycleStatus,
    });
    expect(second.recorded).toBe(false);
    expect(second.sunPresetSeconds).toBe(8);
    expect(second.sunSkill).toBe(0.33);
    expect(second.waterPresetSeconds).toBe(7);

    const snap = buildEconomyV3RootsPublicState({
      v3_reserve_water_seconds: 3,
      v3_reserve_sun_seconds: 2,
      v3_care_cycle_sun_completed: true,
      v3_care_cycle_sun_preset_seconds: 8,
      v3_care_cycle_sun_skill: 0.33,
    });
    expect(snap.reserves.water.seconds).toBe(3);
    expect(snap.reserves.sun.seconds).toBe(2);
  });
});

describe("finishEconomyV3CareCyclePure", () => {
  const completeTrio = {
    waterCompleted: true,
    waterPresetSeconds: 7,
    waterSkill: 0.2,
    sunCompleted: true,
    sunPresetSeconds: 5,
    sunSkill: 0.5,
    fertilizerCompleted: true,
    fertilizerPresetSeconds: 6,
    fertilizerSkill: 0.9,
    cycleFinishedAt: null as number | null,
    totalPresetSeconds: null as number | null,
    averageSkill: null as number | null,
    nowMs: NOW + 10,
  };

  it("3–4. rejects incomplete cycle and pending session", () => {
    expect(
      finishEconomyV3CareCyclePure({
        ...completeTrio,
        careSessionStatus: null,
        cycleStatus: "in_progress",
        fertilizerCompleted: false,
      }),
    ).toMatchObject({ ok: false, code: "care_cycle_not_complete" });

    expect(
      finishEconomyV3CareCyclePure({
        ...completeTrio,
        careSessionStatus: "completed",
        cycleStatus: "ready",
      }),
    ).toMatchObject({ ok: false, code: "activity_session_pending" });
  });

  it("5–11. finishes cycle with totals; idempotent repeat", () => {
    const pendingSnap = buildV3CareCycle({
      v3_care_cycle_status: "ready",
      v3_care_cycle_water_completed: true,
      v3_care_cycle_water_preset_seconds: 7,
      v3_care_cycle_water_skill: 0.2,
      v3_care_cycle_sun_completed: true,
      v3_care_cycle_sun_preset_seconds: 5,
      v3_care_cycle_sun_skill: 0.5,
      v3_care_cycle_fertilizer_completed: true,
      v3_care_cycle_fertilizer_preset_seconds: 6,
      v3_care_cycle_fertilizer_skill: 0.9,
      v3_care_activity_status: null,
    });
    expect(pendingSnap.readyToFinish).toBe(true);

    const first = finishEconomyV3CareCyclePure({
      ...completeTrio,
      careSessionStatus: null,
      cycleStatus: "ready",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadyFinished).toBe(false);
    expect(first.cycleStatus).toBe("finished");
    expect(first.finishedAt).toBe(NOW + 10);
    expect(first.totalPresetSeconds).toBe(18);
    expect(first.averageSkill).toBeCloseTo((0.2 + 0.5 + 0.9) / 3, 10);

    const second = finishEconomyV3CareCyclePure({
      ...completeTrio,
      careSessionStatus: null,
      cycleStatus: "finished",
      cycleFinishedAt: first.finishedAt,
      totalPresetSeconds: first.totalPresetSeconds,
      averageSkill: first.averageSkill,
      nowMs: NOW + 99,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyFinished).toBe(true);
    expect(second.finishedAt).toBe(first.finishedAt);
    expect(second.totalPresetSeconds).toBe(18);
    expect(second.averageSkill).toBe(first.averageSkill);

    expect(clampAverageSkill(1.5)).toBe(1);
    expect(clampAverageSkill(-0.2)).toBe(0);

    const finishedSnap = buildEconomyV3RootsPublicState({
      v3_reserve_water_seconds: 1,
      v3_care_cycle_status: "finished",
      v3_care_cycle_finished_at: new Date(first.finishedAt),
      v3_care_cycle_completed_at: new Date(NOW + 3),
      v3_care_cycle_total_preset_seconds: 18,
      v3_care_cycle_average_skill: first.averageSkill,
      v3_care_cycle_water_completed: true,
      v3_care_cycle_water_preset_seconds: 7,
      v3_care_cycle_water_skill: 0.2,
      v3_care_cycle_sun_completed: true,
      v3_care_cycle_sun_preset_seconds: 5,
      v3_care_cycle_sun_skill: 0.5,
      v3_care_cycle_fertilizer_completed: true,
      v3_care_cycle_fertilizer_preset_seconds: 6,
      v3_care_cycle_fertilizer_skill: 0.9,
    });
    expect(finishedSnap.careCycle.status).toBe("finished");
    expect(finishedSnap.careCycle.readyToFinish).toBe(false);
    expect(finishedSnap.careCycle.totalPresetSeconds).toBe(18);
    expect(finishedSnap.careCycle.activities.water.presetSeconds).toBe(7);
    expect(finishedSnap.reserves.water.seconds).toBe(1);
  });
});

describe("acknowledgeEconomyV3CareCyclePure", () => {
  it("clears only when finished, claimed, and session is empty", () => {
    expect(
      acknowledgeEconomyV3CareCyclePure({
        careSessionStatus: null,
        cycleStatus: "finished",
        cycleClaimed: true,
      }),
    ).toEqual({ ok: true, cleared: true });
  });

  it("rejects unfinished / ready cycles, unclaimed, and pending sessions", () => {
    expect(
      acknowledgeEconomyV3CareCyclePure({
        careSessionStatus: null,
        cycleStatus: null,
        cycleClaimed: false,
      }),
    ).toMatchObject({ ok: false, code: "care_cycle_not_finished" });

    expect(
      acknowledgeEconomyV3CareCyclePure({
        careSessionStatus: null,
        cycleStatus: "ready",
        cycleClaimed: false,
      }),
    ).toMatchObject({ ok: false, code: "care_cycle_not_finished" });

    expect(
      acknowledgeEconomyV3CareCyclePure({
        careSessionStatus: null,
        cycleStatus: "in_progress",
        cycleClaimed: false,
      }),
    ).toMatchObject({ ok: false, code: "care_cycle_not_finished" });

    expect(
      acknowledgeEconomyV3CareCyclePure({
        careSessionStatus: null,
        cycleStatus: "finished",
        cycleClaimed: false,
      }),
    ).toMatchObject({ ok: false, code: "care_cycle_not_claimed" });

    expect(
      acknowledgeEconomyV3CareCyclePure({
        careSessionStatus: "completed",
        cycleStatus: "finished",
        cycleClaimed: true,
      }),
    ).toMatchObject({ ok: false, code: "activity_session_pending" });
  });

  it("after clear, snapshot is empty and a new water start is allowed", () => {
    const cleared = buildEconomyV3RootsPublicState({
      v3_reserve_water_seconds: 8,
      v3_root_water_seconds: 3,
      v3_care_cycle_status: null,
      v3_care_cycle_water_completed: false,
      v3_care_activity_status: null,
    });
    expect(cleared.careCycle).toEqual({
      startedAt: null,
      completedAt: null,
      finishedAt: null,
      status: null,
      allCompleted: false,
      readyToFinish: false,
      totalPresetSeconds: null,
      averageSkill: null,
      activities: {
        water: { completed: false, presetSeconds: null, skill: null },
        sun: { completed: false, presetSeconds: null, skill: null },
        fertilizer: { completed: false, presetSeconds: null, skill: null },
      },
      rewardPreview: {
        available: false,
        xp: 0,
        apples: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
      claim: {
        claimed: false,
        claimedAt: null,
        xp: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
    });
    expect(cleared.reserves.water.seconds).toBe(8);
    expect(cleared.roots.water.seconds).toBe(3);

    const next = startEconomyV3CareActivityPure({
      activity: "water",
      presetSeconds: 5,
      reserveWaterSeconds: 8,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      careActivityStatus: null,
      careCycleActivityCompleted: false,
      nowMs: NOW,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.reserveWaterSeconds).toBe(3);
  });
});

describe("Economy v2 production math unchanged by v3 settle", () => {
  it("still settles 60-section roots and Care allocation", () => {
    const settled = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - 720_000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: 100_000,
      nowMs: NOW,
    });
    expect(settled.placedSections).toBeGreaterThanOrEqual(1);
    expect(V2_ROOT_SECTION_COUNT).toBe(60);

    const allocation = createEconomyV2CareAllocation(16);
    expect(allocation.totalAllocatedSeconds).toBe(16);

    const split = splitGeneratedIntoOrdinaryAndExcess({
      generated: 10,
      freeCapacity: 3,
    });
    expect(split.excessGenerated).toBe(7);
  });
});
