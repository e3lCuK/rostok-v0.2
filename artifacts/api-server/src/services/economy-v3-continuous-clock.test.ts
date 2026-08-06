/**
 * Variant B: generation clock continuous through transfer freeze / insurance.
 */

import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import {
  autoTransferEconomyV3RemainingPure,
  buildEconomyV3RootsPublicState,
  settleEconomyV3Roots,
  transferEconomyV3RootPure,
  V3_TRANSFER_INSURANCE_MS,
} from "./economy-v3-roots";

const NOW = 1_700_000_000_000;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("Economy v3 continuous generation clock (variant B)", () => {
  it("1–3. first transfer keeps progress/anchor; accumulating + countdown stay live", () => {
    const anchor = NOW - 0.5 * T * 1000;
    const t = transferEconomyV3RootPure({
      root: "water",
      rootWaterSeconds: 1,
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
      generationProgress: 0.5,
      generationAnchorAt: anchor,
    });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.startedFreeze).toBe(true);
    expect(t.generationProgress).toBe(0.5);
    expect(t.generationAnchorAt).toBe(anchor);

    const pub = buildEconomyV3RootsPublicState(
      {
        v3_root_water_seconds: t.rootWaterSeconds,
        v3_root_sun_seconds: t.rootSunSeconds,
        v3_root_fertilizer_seconds: t.rootFertilizerSeconds,
        v3_reserve_water_seconds: t.reserveWaterSeconds,
        v3_transferred_roots: t.transferredRoots,
        v3_first_transferred_root: t.firstTransferredRoot,
        v3_generation_frozen_at: new Date(t.generationFrozenAt!).toISOString(),
        v3_insurance_deadline_at: new Date(t.insuranceDeadlineAt!).toISOString(),
        v3_generation_progress: t.generationProgress,
        v3_generation_anchor_at: new Date(t.generationAnchorAt).toISOString(),
        v3_generation_rr_cursor: 1,
        tutorial_done: true,
      },
      { capital: 100_000, nowMs: NOW },
    );
    expect(pub.generation.accumulating).toBe(true);
    expect(pub.generation.frozenAt).not.toBeNull();
    expect(pub.generation.secondsUntilNextWholeSecond).toBeCloseTo(0.5 * T, 5);
    expect(pub.generation.cycleDurationSeconds).toBe(T);
    expect(pub.generation.nextWholeSecondAt).not.toBeNull();
    expect(pub.generation.rrCursor).toBe(1);
    expect(pub.generation.nextRoot).toBe("sun");
  });

  it("4–5. settle while frozen advances progress and RR once per whole unit", () => {
    const frozenAt = NOW;
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      generationProgress: 0.5,
      generationAnchorAt: frozenAt,
      generationFrozenAt: frozenAt,
      generationRrCursor: 1,
      dayKey: "2026-07-25",
      capital: 100_000,
      nowMs: frozenAt + T * 1000,
      tutorialActive: false,
      transferredRoots: ["water"],
      visitBonusSeconds: 0,
    });
    expect(r.wholeSeconds).toBe(1);
    expect(r.rootSunSeconds).toBe(1);
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.rootFertilizerSeconds).toBe(0);
    expect(r.generationRrCursor).toBe(2);
    expect(r.generationProgress).toBeCloseTo(0.5, 9);
  });

  it("6–7. insurance / manual trio clear freeze but keep progress/anchor", () => {
    const frozenAt = NOW;
    const anchor = frozenAt - 200_000;
    const auto = autoTransferEconomyV3RemainingPure({
      nowMs: frozenAt + V3_TRANSFER_INSURANCE_MS,
      rootWaterSeconds: 0,
      rootSunSeconds: 3,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 1,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      transferredRoots: ["water"],
      firstTransferredRoot: "water",
      generationFrozenAt: frozenAt,
      insuranceDeadlineAt: frozenAt + V3_TRANSFER_INSURANCE_MS,
      generationProgress: 0.5,
      generationAnchorAt: anchor,
    });
    expect(auto.applied).toBe(true);
    if (!auto.applied) return;
    expect(auto.generationProgress).toBe(0.5);
    expect(auto.generationAnchorAt).toBe(anchor);
    expect(auto.generationFrozenAt).toBeNull();

    const trio = transferEconomyV3RootPure({
      root: "fertilizer",
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 2,
      reserveWaterSeconds: 1,
      reserveSunSeconds: 1,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      transferredRoots: ["water", "sun"],
      firstTransferredRoot: "water",
      nowMs: NOW + 1,
      generationFrozenAt: frozenAt,
      insuranceDeadlineAt: frozenAt + V3_TRANSFER_INSURANCE_MS,
      generationProgress: 0.42,
      generationAnchorAt: anchor,
    });
    expect(trio.ok).toBe(true);
    if (!trio.ok) return;
    expect(trio.cycleCompleted).toBe(true);
    expect(trio.generationProgress).toBe(0.42);
    expect(trio.generationAnchorAt).toBe(anchor);
  });

  it("12. transfer does not move rrCursor (public cursor unchanged)", () => {
    const beforeCursor = 1;
    const t = transferEconomyV3RootPure({
      root: "water",
      rootWaterSeconds: 1,
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
      generationProgress: 0.1,
      generationAnchorAt: NOW,
    });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    const pub = buildEconomyV3RootsPublicState(
      {
        v3_root_water_seconds: t.rootWaterSeconds,
        v3_generation_frozen_at: new Date(t.generationFrozenAt!).toISOString(),
        v3_insurance_deadline_at: new Date(t.insuranceDeadlineAt!).toISOString(),
        v3_transferred_roots: t.transferredRoots,
        v3_generation_progress: t.generationProgress,
        v3_generation_rr_cursor: beforeCursor,
        tutorial_done: true,
      },
      { capital: 100_000, nowMs: NOW },
    );
    expect(pub.generation.rrCursor).toBe(beforeCursor);
  });
});
