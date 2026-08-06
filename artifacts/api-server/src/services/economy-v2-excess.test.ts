import { describe, expect, it } from "vitest";
import {
  buildEconomyV2ExcessPublicState,
  computeExcessSessionSnapshot,
  deriveExcessPresetSeconds,
  excessBonusRate,
  excessCycleFromSeconds,
  excessPresetSeconds,
  isExcessAvailable,
  minExcessSecondsForPreset,
  normalizeExcessSeconds,
  splitGeneratedIntoOrdinaryAndExcess,
  V2_EXCESS_MIN_AVAILABLE_SECONDS,
  V2_EXCESS_PRESET_MAX,
  V2_EXCESS_PRESET_MIN,
} from "./economy-v2-excess";

describe("normalizeExcessSeconds", () => {
  it("keeps fractional values without floor", () => {
    expect(normalizeExcessSeconds(4.37)).toBeCloseTo(4.37, 10);
    expect(normalizeExcessSeconds("2.5")).toBeCloseTo(2.5, 10);
  });

  it("rejects negative / non-finite", () => {
    expect(normalizeExcessSeconds(-1)).toBe(0);
    expect(normalizeExcessSeconds(NaN)).toBe(0);
    expect(normalizeExcessSeconds(null)).toBe(0);
  });
});

describe("splitGeneratedIntoOrdinaryAndExcess", () => {
  it("fills ordinary first then excess", () => {
    const r = splitGeneratedIntoOrdinaryAndExcess({
      generated: 4,
      freeCapacity: 1.5,
    });
    expect(r.ordinaryAccepted).toBeCloseTo(1.5, 10);
    expect(r.excessGenerated).toBeCloseTo(2.5, 10);
  });

  it("all to ordinary when free capacity covers generated", () => {
    const r = splitGeneratedIntoOrdinaryAndExcess({
      generated: 3,
      freeCapacity: 10,
    });
    expect(r.ordinaryAccepted).toBe(3);
    expect(r.excessGenerated).toBe(0);
  });

  it("all to excess when free capacity is 0", () => {
    const r = splitGeneratedIntoOrdinaryAndExcess({
      generated: 7.25,
      freeCapacity: 0,
    });
    expect(r.ordinaryAccepted).toBe(0);
    expect(r.excessGenerated).toBeCloseTo(7.25, 10);
  });
});

describe("excess cycle / rate / preset", () => {
  it("8. excessCycle = excess / 60", () => {
    expect(excessCycleFromSeconds(0)).toBe(0);
    expect(excessCycleFromSeconds(30)).toBeCloseTo(0.5, 10);
    expect(excessCycleFromSeconds(60)).toBeCloseTo(1, 10);
    expect(excessCycleFromSeconds(90)).toBeCloseTo(1.5, 10);
  });

  it("9+10. excessAvailable threshold at 5", () => {
    expect(isExcessAvailable(4.9)).toBe(false);
    expect(isExcessAvailable(5)).toBe(true);
    expect(V2_EXCESS_MIN_AVAILABLE_SECONDS).toBe(5);
    expect(buildEconomyV2ExcessPublicState(4.9).excessAvailable).toBe(false);
    expect(buildEconomyV2ExcessPublicState(5).excessAvailable).toBe(true);
  });

  it("11. preset always in [5, 25]", () => {
    for (const n of [0, 0.1, 0.5, 1, 2, 5, 10, 50, 100]) {
      const t = excessPresetSeconds(n);
      expect(t).toBeGreaterThanOrEqual(V2_EXCESS_PRESET_MIN);
      expect(t).toBeLessThanOrEqual(V2_EXCESS_PRESET_MAX);
    }
    expect(excessPresetSeconds(0)).toBe(5);
  });

  it("12. rate matches r = 0.005 + 0.01×exp(−0.06n)", () => {
    expect(excessBonusRate(0)).toBeCloseTo(0.015, 12);
    expect(excessBonusRate(1)).toBeCloseTo(0.005 + 0.01 * Math.exp(-0.06), 12);
    expect(excessBonusRate(10)).toBeCloseTo(0.005 + 0.01 * Math.exp(-0.6), 12);
  });

  it("public state bundles fields", () => {
    const s = buildEconomyV2ExcessPublicState(90);
    expect(s.excessSeconds).toBe(90);
    expect(s.excessCycle).toBeCloseTo(1.5, 10);
    expect(s.excessAvailable).toBe(true);
    expect(s.excessPresetSeconds).toBe(excessPresetSeconds(1.5));
    expect(s.excessRate).toBeCloseTo(excessBonusRate(1.5), 12);
    expect(s.session).toEqual({
      active: false,
      version: null,
      startedAt: null,
      sourceSeconds: null,
      sourceElapsedMs: null,
      capital: null,
      baseIncome: null,
      baseWebCleared: false,
      baseWebCollectionMode: null,
      presetSeconds: null,
      rate: null,
      webCount: null,
      whiteWebCount: null,
      bonusRawUnlocked: null,
      xpAwarded: null,
      layoutSeed: null,
      clearedWebIds: [],
      clearedWebCount: 0,
      remainingWebCount: 0,
      specialWebId: null,
      baseWebId: null,
      specialCleared: false,
      webs: [],
    });
    expect(s.result).toEqual({
      available: false,
      sessionVersion: null,
      finishedAt: null,
      reason: null,
      clearedCount: null,
      clearedWhiteCount: null,
      webCount: null,
      whiteWebCount: null,
      skill: null,
      sourceSeconds: null,
      presetSeconds: null,
      rate: null,
      xp: {
        max: null,
        raw: null,
        awarded: null,
        applied: false,
      },
      income: {
        available: false,
        reason: null,
        capital: null,
        excessElapsedMs: null,
        annualRate: null,
        gross: null,
        paymentFactor: null,
        paid: null,
        applied: false,
      },
    });
    expect(s.excessElapsedMs).toBe(0);
    expect(s.excessBaseIncome).toBe(0);
    expect(s.excessFinanciallyValid).toBe(false); // 90s without elapsed = synthetic
  });

  it("excessPresetSeconds is derived from ledger only (25 ledger → T=5)", () => {
    const s = buildEconomyV2ExcessPublicState(25, null, null, 0, 0);
    expect(s.excessSeconds).toBe(25);
    expect(s.excessPresetSeconds).toBe(5);
    expect(s.excessCycle).toBeCloseTo(25 / 60, 10);
  });

  it("setPreset ledger → start snapshot freezes matching session.presetSeconds", () => {
    for (const T of [5, 10, 15, 25] as const) {
      const ledger = minExcessSecondsForPreset(T);
      expect(deriveExcessPresetSeconds(ledger)).toBe(T);
      const snap = computeExcessSessionSnapshot(ledger);
      expect(snap.presetSeconds).toBe(T);
      expect(snap.webCount).toBe(Math.round(2.4 * T));
    }
  });
});

describe("architecture: excessPresetSeconds is not persisted state", () => {
  it("migrations / excess module never ALTER a live excess_preset column", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const indexSrc = readFileSync(join(here, "../index.ts"), "utf8");
    const excessSrc = readFileSync(join(here, "economy-v2-excess.ts"), "utf8");
    expect(indexSrc).not.toMatch(/v2_excess_preset/);
    expect(excessSrc).toContain("Never a DB column");
    expect(excessSrc).toContain(
      "excessPresetSeconds: excessPresetSeconds(excessCycle)",
    );
    // Only session freeze is stored:
    expect(indexSrc).toMatch(/v2_excess_session_preset_seconds/);
  });
});
