import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  settleEconomyV3Roots,
  transferEconomyV3RootPure,
} from "./economy-v3-roots";
import { isExcessAvailable } from "./economy-v2-excess";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";

const here = dirname(fileURLToPath(import.meta.url));
const transferSrc = readFileSync(
  join(here, "economy-v3-roots-transfer.ts"),
  "utf8",
);
const settleSrc = readFileSync(join(here, "economy-v3-roots-settle.ts"), "utf8");

const NOW = Date.parse("2026-07-27T20:00:00.000Z");
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("transfer overflow ADDs to excess; prior excess preserved", () => {
  it("source: transfer UPDATE writes v2_excess_seconds from before+discarded", () => {
    expect(transferSrc).toMatch(/v2_excess_seconds\s*=\s*\$17/);
    expect(transferSrc).toContain(
      "Overflow ADDs to excess ledger; prior excess is kept.",
    );
  });

  it("source: auto-transfer path ADDs discard into excess", () => {
    expect(settleSrc).toContain(
      "Overflow from auto-transfer ADDs to excess; never clears prior ledger.",
    );
    expect(settleSrc).toMatch(
      /settled\.excessSeconds\s*\+\s*autoDiscard/,
    );
  });

  it("roots full + excess=2 → transfer with no overflow leaves excess untouched (pure)", () => {
    const beforeExcess = 2;
    const t = transferEconomyV3RootPure({
      root: "water",
      rootWaterSeconds: 25,
      rootSunSeconds: 25,
      rootFertilizerSeconds: 25,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 25,
      capacitySeconds: 25,
      transferredRoots: [],
      firstTransferredRoot: null,
      nowMs: NOW,
      generationFrozenAt: null,
      insuranceDeadlineAt: null,
      generationProgress: 0,
      generationAnchorAt: NOW,
    });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.rootWaterSeconds).toBe(0);
    expect(t.reserveWaterSeconds).toBe(25);
    expect(t.discardedSeconds).toBe(0);
    expect(beforeExcess + t.discardedSeconds).toBe(2);
  });

  it("excess=4.8 preserved across three transfers when no overflow", () => {
    let roots = { water: 25, sun: 25, fertilizer: 25 };
    let reserves = { water: 0, sun: 0, fertilizer: 0 };
    let excess = 4.8;
    let transferred: Array<"water" | "sun" | "fertilizer"> = [];
    let frozenAt: number | null = null;
    let insurance: number | null = null;
    let first: "water" | "sun" | "fertilizer" | null = null;

    for (const kind of ["water", "sun", "fertilizer"] as const) {
      const r = transferEconomyV3RootPure({
        root: kind,
        rootWaterSeconds: roots.water,
        rootSunSeconds: roots.sun,
        rootFertilizerSeconds: roots.fertilizer,
        reserveWaterSeconds: reserves.water,
        reserveSunSeconds: reserves.sun,
        reserveFertilizerSeconds: reserves.fertilizer,
        dailyCapSeconds: 25,
        capacitySeconds: 25,
        transferredRoots: transferred,
        firstTransferredRoot: first,
        nowMs: NOW + transferred.length * 1000,
        generationFrozenAt: frozenAt,
        insuranceDeadlineAt: insurance,
        generationProgress: 0,
        generationAnchorAt: NOW,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      excess += r.discardedSeconds;
      roots = {
        water: r.rootWaterSeconds,
        sun: r.rootSunSeconds,
        fertilizer: r.rootFertilizerSeconds,
      };
      reserves = {
        water: r.reserveWaterSeconds,
        sun: r.reserveSunSeconds,
        fertilizer: r.reserveFertilizerSeconds,
      };
      transferred = r.transferredRoots;
      frozenAt = r.generationFrozenAt;
      insurance = r.insuranceDeadlineAt;
      first = r.firstTransferredRoot;
    }

    expect(roots).toEqual({ water: 0, sun: 0, fertilizer: 0 });
    expect(reserves).toEqual({ water: 25, sun: 25, fertilizer: 25 });
    expect(excess).toBe(4.8);
    expect(isExcessAvailable(excess)).toBe(false);
  });

  it("after transfer, further generation can raise excess to Metelka threshold", () => {
    // Roots full again → new generated seconds accrue into existing excess.
    const rootsFullAgain = settleEconomyV3Roots({
      rootWaterSeconds: 25,
      rootSunSeconds: 25,
      rootFertilizerSeconds: 25,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - 1 * T * 1000,
      generationFrozenAt: null,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 20,
      streakDays: 5, // effective 25
      excessSeconds: 4.8,
      excessElapsedMs: 0,
      transferredRoots: [],
    });
    expect(rootsFullAgain.excessSeconds).toBeCloseTo(5.8, 5);
    expect(isExcessAvailable(rootsFullAgain.excessSeconds)).toBe(true);
  });
});
