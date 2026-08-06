/**
 * AUDIT ONLY — round-robin when the cursor root is at capacity (25).
 * Does not change production code. Characterizes current discard semantics.
 */

import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import {
  settleEconomyV3Roots,
  type SettleEconomyV3RootsResult,
} from "./economy-v3-roots";

const NOW = 1_700_000_000_000;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

type Kind = "water" | "sun" | "fertilizer";

function settleOneCycle(input: {
  water: number;
  sun: number;
  fertilizer: number;
  cursor: 0 | 1 | 2;
  progress?: number;
  reserves?: { water: number; sun: number; fertilizer: number };
  excessSeconds?: number;
}): SettleEconomyV3RootsResult {
  return settleEconomyV3Roots({
    rootWaterSeconds: input.water,
    rootSunSeconds: input.sun,
    rootFertilizerSeconds: input.fertilizer,
    generationProgress: input.progress ?? 0,
    generationAnchorAt: NOW - T * 1000,
    generationFrozenAt: null,
    generationRrCursor: input.cursor,
    dayKey: "2026-07-25",
    capital: 100_000,
    nowMs: NOW,
    tutorialActive: false,
    reserveWaterSeconds: input.reserves?.water ?? 0,
    reserveSunSeconds: input.reserves?.sun ?? 0,
    reserveFertilizerSeconds: input.reserves?.fertilizer ?? 0,
    dailyCapSeconds: 25,
    streakDays: 0,
    visitBonusSeconds: 0,
    excessSeconds: input.excessSeconds ?? 0,
    excessElapsedMs: 0,
  });
}

function snapshot(label: string, before: {
  water: number;
  sun: number;
  fertilizer: number;
  cursor: number;
  progress: number;
  excess: number;
}, after: SettleEconomyV3RootsResult) {
  return {
    label,
    before,
    after: {
      rootWaterSeconds: after.rootWaterSeconds,
      rootSunSeconds: after.rootSunSeconds,
      rootFertilizerSeconds: after.rootFertilizerSeconds,
      rrCursor: after.generationRrCursor,
      ordinaryFull: after.ordinaryFull,
      excessSeconds: after.excessSeconds,
      excessGenerated: after.excessGenerated,
      generationProgress: after.generationProgress,
      generationAnchorAt: after.generationAnchorAt,
      wholeSeconds: after.wholeSeconds,
      generatedRaw: after.generatedRaw,
    },
    deltas: {
      water: after.rootWaterSeconds - before.water,
      sun: after.rootSunSeconds - before.sun,
      fertilizer: after.rootFertilizerSeconds - before.fertilizer,
      rootSum:
        after.rootWaterSeconds -
        before.water +
        (after.rootSunSeconds - before.sun) +
        (after.rootFertilizerSeconds - before.fertilizer),
      excess: after.excessGenerated,
    },
  };
}

describe("AUDIT: full root + one generation cycle (characterization)", () => {
  it("1. Water=25, cursor=Water → unit discarded; Sun/Fert unchanged; cursor→Sun; not Excess", () => {
    const before = {
      water: 25,
      sun: 0,
      fertilizer: 0,
      cursor: 0 as const,
      progress: 0,
      excess: 0,
    };
    const after = settleOneCycle(before);
    const report = snapshot("full-water", before, after);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));

    expect(after.wholeSeconds).toBe(1);
    expect(after.generatedRaw).toBeCloseTo(1, 9);

    // Unit is LOST (discard), not rerouted to Sun, not Excess.
    expect(after.rootWaterSeconds).toBe(25);
    expect(after.rootSunSeconds).toBe(0);
    expect(after.rootFertilizerSeconds).toBe(0);
    expect(report.deltas.rootSum).toBe(0);
    expect(after.ordinaryFull).toBe(false);
    expect(after.excessGenerated).toBe(0);
    expect(after.excessSeconds).toBe(0);

    // Cursor advances past the full root.
    expect(after.generationRrCursor).toBe(1);
    expect(after.generationAnchorAt).toBe(NOW);
    expect(after.generationProgress).toBe(0);
  });

  it("1b. after full-Water discard, next cycle credits Sun +1; cursor→Fertilizer", () => {
    const afterDiscard = settleOneCycle({
      water: 25,
      sun: 0,
      fertilizer: 0,
      cursor: 0,
    });
    expect(afterDiscard.generationRrCursor).toBe(1);

    const second = settleEconomyV3Roots({
      rootWaterSeconds: afterDiscard.rootWaterSeconds,
      rootSunSeconds: afterDiscard.rootSunSeconds,
      rootFertilizerSeconds: afterDiscard.rootFertilizerSeconds,
      generationProgress: afterDiscard.generationProgress,
      generationAnchorAt: afterDiscard.generationAnchorAt,
      generationFrozenAt: null,
      generationRrCursor: afterDiscard.generationRrCursor,
      dayKey: "2026-07-25",
      capital: 100_000,
      nowMs: afterDiscard.generationAnchorAt + T * 1000,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 25,
      streakDays: 0,
      visitBonusSeconds: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
    });

    expect(second.wholeSeconds).toBe(1);
    expect(second.rootWaterSeconds).toBe(25);
    expect(second.rootSunSeconds).toBe(1);
    expect(second.rootFertilizerSeconds).toBe(0);
    expect(second.generationRrCursor).toBe(2);
    expect(second.excessGenerated).toBe(0);
  });

  it("2. Sun=25, cursor=Sun → discard; cursor→Fertilizer", () => {
    const before = {
      water: 0,
      sun: 25,
      fertilizer: 0,
      cursor: 1 as const,
      progress: 0,
      excess: 0,
    };
    const after = settleOneCycle(before);
    const report = snapshot("full-sun", before, after);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));

    expect(after.wholeSeconds).toBe(1);
    expect(after.rootWaterSeconds).toBe(0);
    expect(after.rootSunSeconds).toBe(25);
    expect(after.rootFertilizerSeconds).toBe(0);
    expect(report.deltas.rootSum).toBe(0);
    expect(after.excessGenerated).toBe(0);
    expect(after.generationRrCursor).toBe(2);
  });

  it("3. Fertilizer=25, cursor=Fertilizer → discard; cursor→Water", () => {
    const before = {
      water: 0,
      sun: 0,
      fertilizer: 25,
      cursor: 2 as const,
      progress: 0,
      excess: 0,
    };
    const after = settleOneCycle(before);
    const report = snapshot("full-fertilizer", before, after);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));

    expect(after.wholeSeconds).toBe(1);
    expect(after.rootWaterSeconds).toBe(0);
    expect(after.rootSunSeconds).toBe(0);
    expect(after.rootFertilizerSeconds).toBe(25);
    expect(report.deltas.rootSum).toBe(0);
    expect(after.excessGenerated).toBe(0);
    expect(after.generationRrCursor).toBe(0);
  });

  it("4. cursor always advances once per wholeSecond even when discarded", () => {
    const cases: Array<{
      kind: Kind;
      water: number;
      sun: number;
      fertilizer: number;
      cursor: 0 | 1 | 2;
      next: 0 | 1 | 2;
    }> = [
      {
        kind: "water",
        water: 25,
        sun: 0,
        fertilizer: 0,
        cursor: 0,
        next: 1,
      },
      {
        kind: "sun",
        water: 0,
        sun: 25,
        fertilizer: 0,
        cursor: 1,
        next: 2,
      },
      {
        kind: "fertilizer",
        water: 0,
        sun: 0,
        fertilizer: 25,
        cursor: 2,
        next: 0,
      },
    ];
    for (const c of cases) {
      const after = settleOneCycle(c);
      expect(after.generationRrCursor, c.kind).toBe(c.next);
    }
  });

  it("5. one completed cycle ⇒ at most one generated unit (no ×2/×3)", () => {
    for (const cursor of [0, 1, 2] as const) {
      const after = settleOneCycle({
        water: cursor === 0 ? 25 : 0,
        sun: cursor === 1 ? 25 : 0,
        fertilizer: cursor === 2 ? 25 : 0,
        cursor,
      });
      expect(after.wholeSeconds).toBe(1);
      expect(after.generatedRaw).toBeCloseTo(1, 9);
      const acceptedRootDelta =
        Math.max(0, after.rootWaterSeconds - (cursor === 0 ? 25 : 0)) +
        Math.max(0, after.rootSunSeconds - (cursor === 1 ? 25 : 0)) +
        Math.max(0, after.rootFertilizerSeconds - (cursor === 2 ? 25 : 0));
      // Full cursor root → accepted 0; still only one unit attempted.
      expect(acceptedRootDelta).toBeLessThanOrEqual(1);
      expect(after.excessGenerated + acceptedRootDelta).toBeLessThanOrEqual(1);
    }
  });

  it("contrast: full root ≠ Excess; Excess only when all reserves at dailyCap", () => {
    const fullRoot = settleOneCycle({
      water: 25,
      sun: 0,
      fertilizer: 0,
      cursor: 0,
      reserves: { water: 0, sun: 0, fertilizer: 0 },
    });
    expect(fullRoot.ordinaryFull).toBe(false);
    expect(fullRoot.excessGenerated).toBe(0);

    const allReservesFull = settleOneCycle({
      water: 0,
      sun: 0,
      fertilizer: 0,
      cursor: 0,
      reserves: { water: 25, sun: 25, fertilizer: 25 },
      excessSeconds: 0,
    });
    expect(allReservesFull.ordinaryFull).toBe(true);
    expect(allReservesFull.wholeSeconds).toBe(0);
    expect(allReservesFull.rootWaterSeconds).toBe(0);
    expect(allReservesFull.excessGenerated).toBeGreaterThan(0);
    // Cursor unchanged on ordinaryFull path.
    expect(allReservesFull.generationRrCursor).toBe(0);
  });
});
