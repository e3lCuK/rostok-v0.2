import { describe, expect, it } from "vitest";
import {
  deriveExcessLiveFields,
  deriveExcessPresetSeconds,
  excessBonusRate,
  excessCycleFromSeconds,
  excessPresetSecondsFromCycle,
  minExcessSecondsForPreset,
  MIN_LEDGER_SEARCH_STEP,
} from "./excessEconomyDerive";
import { metelkaFillProgress } from "./metelkaFillProgress";

describe("excessEconomyDerive — T from ledger only", () => {
  it("excessSeconds=25 → T=5 (not 25)", () => {
    const live = deriveExcessLiveFields(25);
    expect(live.excessCycle).toBeCloseTo(25 / 60, 10);
    expect(live.excessPresetSeconds).toBe(5);
    expect(live.excessAvailable).toBe(true);
    expect(live.excessRate).toBeCloseTo(excessBonusRate(25 / 60), 10);
  });

  it("large ledger still clamps T at 25", () => {
    expect(deriveExcessPresetSeconds(3690)).toBe(25);
    expect(deriveExcessPresetSeconds(50_000)).toBe(25);
  });

  it("ignores any notion of independent preset — only ledger input", () => {
    // Caller must not pass a separate preset; derive has a single argument.
    expect(deriveExcessLiveFields(60).excessPresetSeconds).toBe(6);
    expect(excessPresetSecondsFromCycle(excessCycleFromSeconds(60))).toBe(6);
  });

  it("empty ledger → T=5, unavailable", () => {
    const live = deriveExcessLiveFields(0);
    expect(live.excessAvailable).toBe(false);
    expect(live.excessPresetSeconds).toBe(5);
    expect(live.excessRate).toBeCloseTo(0.015, 10);
  });

  it("minExcessSecondsForPreset: each T=5…25 round-trips via production derive", () => {
    for (let T = 5; T <= 25; T++) {
      const ledger = minExcessSecondsForPreset(T);
      expect(deriveExcessPresetSeconds(ledger)).toBe(T);
      if (T > 5) {
        const prev = deriveExcessPresetSeconds(
          ledger - MIN_LEDGER_SEARCH_STEP,
        );
        expect(prev).toBeLessThan(T);
        expect(prev).toBeGreaterThanOrEqual(T - 1);
      }
    }
  });

  it("stale API preset is ignored — derive from ledger only", () => {
    // Simulate normalize path: caller passes only ledger.
    const live = deriveExcessLiveFields(25);
    expect(live.excessPresetSeconds).toBe(5);
    expect(metelkaFillProgress(live.excessPresetSeconds)).toBeCloseTo(1 / 22, 10);
    const t25 = deriveExcessLiveFields(minExcessSecondsForPreset(25));
    expect(t25.excessPresetSeconds).toBe(25);
    expect(metelkaFillProgress(t25.excessPresetSeconds)).toBeCloseTo(21 / 22, 10);
  });
});
