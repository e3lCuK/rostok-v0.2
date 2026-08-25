/**
 * Economy v3 generation — sequential round-robin (product A).
 */

import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import {
  buildEconomyV3RootsPublicState,
  distributeV3WholeSecondsRoundRobin,
  settleEconomyV3Roots,
  transferEconomyV3RootPure,
} from "./economy-v3-roots";

const NOW = 1_700_000_000_000;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

const base = {
  rootWaterSeconds: 0,
  rootSunSeconds: 0,
  rootFertilizerSeconds: 0,
  generationProgress: 0,
  generationFrozenAt: null as number | null,
  dayKey: "2026-07-25",
  capital: 100_000,
  tutorialActive: false,
  generationRrCursor: 0,
  visitBonusSeconds: 0,
};

describe("distributeV3WholeSecondsRoundRobin", () => {
  it("wholeSeconds=10 from Water → 4/3/3 and next cursor Sun", () => {
    const d = distributeV3WholeSecondsRoundRobin({
      wholeSeconds: 10,
      generationRrCursor: 0,
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reservesFull: { water: false, sun: false, fertilizer: false },
      transferredRoots: [],
    });
    expect(d.rootWaterSeconds).toBe(4);
    expect(d.rootSunSeconds).toBe(3);
    expect(d.rootFertilizerSeconds).toBe(3);
    expect(d.acceptedUnits).toBe(10);
    expect(d.discardedUnits).toBe(0);
    expect(d.generationRrCursor).toBe(1);
    expect(
      d.rootWaterSeconds + d.rootSunSeconds + d.rootFertilizerSeconds,
    ).toBe(d.acceptedUnits);
  });

  it("full target root reroutes to next accepting root (no void while room exists)", () => {
    const d = distributeV3WholeSecondsRoundRobin({
      wholeSeconds: 3,
      generationRrCursor: 0,
      rootWaterSeconds: 25,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reservesFull: { water: false, sun: false, fertilizer: false },
      transferredRoots: [],
      rootCapacitySeconds: 25,
    });
    expect(d.rootWaterSeconds).toBe(25);
    expect(d.rootSunSeconds).toBe(2);
    expect(d.rootFertilizerSeconds).toBe(1);
    expect(d.acceptedUnits).toBe(3);
    expect(d.discardedUnits).toBe(0);
    expect(d.generationRrCursor).toBe(2);
  });

  it("after water transfer, sun full + fert empty: unit goes to fert (not void)", () => {
    const d = distributeV3WholeSecondsRoundRobin({
      wholeSeconds: 1,
      generationRrCursor: 0,
      rootWaterSeconds: 0,
      rootSunSeconds: 21,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 21,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      reservesFull: { water: true, sun: false, fertilizer: false },
      transferredRoots: ["water"],
      rootCapacitySeconds: 21,
    });
    expect(d.rootFertilizerSeconds).toBe(1);
    expect(d.rootSunSeconds).toBe(21);
    expect(d.acceptedUnits).toBe(1);
    expect(d.discardedUnits).toBe(0);
  });

  it("shared pool: partial reserve shrinks root room (root+reserve ≤ cap)", () => {
    const d = distributeV3WholeSecondsRoundRobin({
      wholeSeconds: 20,
      generationRrCursor: 0,
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 15,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      reservesFull: { water: false, sun: false, fertilizer: false },
      transferredRoots: [],
      rootCapacitySeconds: 21,
    });
    // Water can take at most 21-15=6; catch-up fills empty sun/fert first.
    expect(d.rootWaterSeconds).toBe(0);
    expect(d.rootSunSeconds).toBe(10);
    expect(d.rootFertilizerSeconds).toBe(10);
    expect(d.rootWaterSeconds + 15).toBeLessThanOrEqual(21);
    expect(d.rootSunSeconds + 0).toBeLessThanOrEqual(21);
    expect(d.rootFertilizerSeconds + 0).toBeLessThanOrEqual(21);
  });

  it("water root 2s / others 0 → empty roots fill left-to-right, not more water", () => {
    const d = distributeV3WholeSecondsRoundRobin({
      wholeSeconds: 3,
      generationRrCursor: 0,
      rootWaterSeconds: 2,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reservesFull: { water: false, sun: false, fertilizer: false },
      transferredRoots: [],
    });
    expect(d.rootWaterSeconds).toBe(2);
    expect(d.rootSunSeconds).toBe(2);
    expect(d.rootFertilizerSeconds).toBe(1);
    expect(d.acceptedUnits).toBe(3);
  });

  it("activity-button seconds count toward load (water reserve 2, roots empty)", () => {
    const d = distributeV3WholeSecondsRoundRobin({
      wholeSeconds: 3,
      generationRrCursor: 0,
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 2,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      reservesFull: { water: false, sun: false, fertilizer: false },
      transferredRoots: [],
    });
    expect(d.rootWaterSeconds).toBe(0);
    expect(d.rootSunSeconds).toBe(2);
    expect(d.rootFertilizerSeconds).toBe(1);
    expect(d.acceptedUnits).toBe(3);
  });
});

describe("settleEconomyV3Roots round-robin sequence", () => {
  function settleCycles(n: number, startCursor = 0) {
    let progress = 0;
    let cursor = startCursor;
    let anchor = NOW;
    let roots = { water: 0, sun: 0, fertilizer: 0 };
    // First settle: set anchor
    const init = settleEconomyV3Roots({
      ...base,
      generationAnchorAt: null,
      generationRrCursor: cursor,
      nowMs: NOW,
    });
    anchor = init.generationAnchorAt;
    cursor = init.generationRrCursor;

    for (let i = 0; i < n; i++) {
      const r = settleEconomyV3Roots({
        ...base,
        rootWaterSeconds: roots.water,
        rootSunSeconds: roots.sun,
        rootFertilizerSeconds: roots.fertilizer,
        generationProgress: progress,
        generationAnchorAt: anchor,
        generationRrCursor: cursor,
        nowMs: anchor + T * 1000,
      });
      progress = r.generationProgress;
      cursor = r.generationRrCursor;
      anchor = r.generationAnchorAt;
      roots = {
        water: r.rootWaterSeconds,
        sun: r.rootSunSeconds,
        fertilizer: r.rootFertilizerSeconds,
      };
    }
    return { roots, cursor, progress };
  }

  it("1–4. cycles assign Water → Sun → Fertilizer → Water", () => {
    expect(settleCycles(1).roots).toEqual({
      water: 1,
      sun: 0,
      fertilizer: 0,
    });
    expect(settleCycles(1).cursor).toBe(1);

    expect(settleCycles(2).roots).toEqual({
      water: 1,
      sun: 1,
      fertilizer: 0,
    });
    expect(settleCycles(2).cursor).toBe(2);

    expect(settleCycles(3).roots).toEqual({
      water: 1,
      sun: 1,
      fertilizer: 1,
    });
    expect(settleCycles(3).cursor).toBe(0);

    expect(settleCycles(4).roots).toEqual({
      water: 2,
      sun: 1,
      fertilizer: 1,
    });
    expect(settleCycles(4).cursor).toBe(1);
  });

  it("5. three cycles sum delta = 3 not 9", () => {
    const { roots } = settleCycles(3);
    expect(roots.water + roots.sun + roots.fertilizer).toBe(3);
  });

  it("7. public snapshot preserves rrCursor / nextRoot (F5)", () => {
    const after = settleCycles(1);
    const snap = buildEconomyV3RootsPublicState(
      {
        v3_root_water_seconds: after.roots.water,
        v3_root_sun_seconds: after.roots.sun,
        v3_root_fertilizer_seconds: after.roots.fertilizer,
        v3_generation_rr_cursor: after.cursor,
        v3_generation_progress: after.progress,
        tutorial_done: true,
      },
      { capital: 100_000, nowMs: NOW },
    );
    expect(snap.generation.rrCursor).toBe(1);
    expect(snap.generation.nextRoot).toBe("sun");
  });

  it("8. transfer does not change generation cursor", () => {
    const after = settleCycles(1);
    expect(after.cursor).toBe(1);
    const t = transferEconomyV3RootPure({
      root: "water",
      rootWaterSeconds: after.roots.water,
      rootSunSeconds: after.roots.sun,
      rootFertilizerSeconds: after.roots.fertilizer,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      transferredRoots: [],
      firstTransferredRoot: null,
      nowMs: NOW,
      generationFrozenAt: null,
      insuranceDeadlineAt: null,
      generationProgress: after.progress,
      generationAnchorAt: NOW,
    });
    expect(t.ok).toBe(true);
    // Transfer does not move rrCursor; short settle while frozen advances
    // fractional progress only (30s << one cycle) — cursor unchanged.
    const frozen = settleEconomyV3Roots({
      ...base,
      rootWaterSeconds: t.ok ? t.rootWaterSeconds : 0,
      rootSunSeconds: t.ok ? t.rootSunSeconds : 0,
      rootFertilizerSeconds: t.ok ? t.rootFertilizerSeconds : 0,
      generationProgress: after.progress,
      generationAnchorAt: NOW,
      generationFrozenAt: t.ok ? t.generationFrozenAt : NOW,
      generationRrCursor: after.cursor,
      nowMs: NOW + 30_000,
      transferredRoots: t.ok ? t.transferredRoots : ["water"],
    });
    expect(frozen.wholeSeconds).toBe(0);
    expect(frozen.generationRrCursor).toBe(1);
    expect(frozen.generationProgress).toBeGreaterThan(after.progress);
  });

  it("10–11. idempotent settle + fractional progress", () => {
    const first = settleEconomyV3Roots({
      ...base,
      generationAnchorAt: NOW - T * 1000,
      nowMs: NOW,
    });
    expect(first.rootWaterSeconds).toBe(1);
    expect(first.generationRrCursor).toBe(1);

    const again = settleEconomyV3Roots({
      ...base,
      rootWaterSeconds: first.rootWaterSeconds,
      rootSunSeconds: first.rootSunSeconds,
      rootFertilizerSeconds: first.rootFertilizerSeconds,
      generationProgress: first.generationProgress,
      generationAnchorAt: first.generationAnchorAt,
      generationRrCursor: first.generationRrCursor,
      nowMs: NOW,
    });
    expect(again.wholeSeconds).toBe(0);
    expect(again.rootWaterSeconds).toBe(1);
    expect(again.rootSunSeconds).toBe(0);
    expect(again.generationRrCursor).toBe(1);

    const frac = settleEconomyV3Roots({
      ...base,
      generationProgress: 0.4,
      generationAnchorAt: NOW - 0.3 * T * 1000,
      generationRrCursor: 2,
      nowMs: NOW,
    });
    expect(frac.wholeSeconds).toBe(0);
    expect(frac.generationProgress).toBeCloseTo(0.7, 9);
    expect(frac.generationRrCursor).toBe(2);
  });

  it("14–16. ratesheet: +1 / 12m, +5 / h, +40 / 8h", () => {
    const twelve = settleCycles(1);
    expect(
      twelve.roots.water + twelve.roots.sun + twelve.roots.fertilizer,
    ).toBe(1);
    const hour = settleCycles(5);
    expect(hour.roots.water + hour.roots.sun + hour.roots.fertilizer).toBe(5);
    const eight = settleCycles(40);
    expect(eight.roots.water + eight.roots.sun + eight.roots.fertilizer).toBe(
      40,
    );
    expect(eight.roots).toEqual({ water: 14, sun: 13, fertilizer: 13 });
  });
});
