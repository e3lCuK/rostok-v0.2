/**
 * Final local check: after setPreset (min ledger for T), further generation
 * keeps growing ledger / money without breaking T boundaries.
 */
import { describe, expect, it } from "vitest";
import {
  deriveExcessPresetSeconds,
  excessBonusRate,
  excessCycleFromSeconds,
  minExcessSecondsForPreset,
  V2_EXCESS_PRESET_MAX,
  V2_EXCESS_PRESET_MIN,
} from "./economy-v2-excess";
import {
  computeBaseIncomeForElapsedMs,
  computeExcessGrossIncome,
} from "./economy-v2-excess-income";

const CAPITAL = 10_000;
/** Pair each +ledger game-second with 1s wall-clock for financial accrual. */
const MS_PER_GAME_SEC = 1000;

describe("setPreset continuity — T=25 then further generation", () => {
  it("ledger grows without cap; T stays 25; r/D_base/D_excess keep updating", () => {
    let ledger = minExcessSecondsForPreset(25);
    let elapsedMs = ledger * MS_PER_GAME_SEC; // paired history so finance is valid
    expect(deriveExcessPresetSeconds(ledger)).toBe(25);

    const increments = [1, 5, 20, 100, 1000] as const;
    let prevLedger = ledger;
    let prevRate = excessBonusRate(excessCycleFromSeconds(ledger));
    let prevDBase = computeBaseIncomeForElapsedMs({
      capital: CAPITAL,
      elapsedMs,
    });
    let prevDExcess = computeExcessGrossIncome({
      capital: CAPITAL,
      excessElapsedMs: elapsedMs,
      annualRate: prevRate,
    });

    for (const add of increments) {
      ledger += add;
      elapsedMs += add * MS_PER_GAME_SEC;

      expect(ledger).toBeGreaterThan(prevLedger);
      expect(deriveExcessPresetSeconds(ledger)).toBe(25);

      const n = excessCycleFromSeconds(ledger);
      const rate = excessBonusRate(n);
      // Larger n → lower r_excess (strictly decreasing in n).
      expect(rate).toBeLessThan(prevRate);

      const dBase = computeBaseIncomeForElapsedMs({
        capital: CAPITAL,
        elapsedMs,
      });
      const dExcess = computeExcessGrossIncome({
        capital: CAPITAL,
        excessElapsedMs: elapsedMs,
        annualRate: rate,
      });
      expect(dBase).toBeGreaterThan(prevDBase);
      expect(dExcess).toBeGreaterThan(prevDExcess);

      prevLedger = ledger;
      prevRate = rate;
      prevDBase = dBase;
      prevDExcess = dExcess;
    }

    // Unlimited: far past T=25 floor still T=25.
    expect(ledger).toBeGreaterThan(3688.88 + 1000);
    expect(deriveExcessPresetSeconds(ledger + 50_000)).toBe(25);
  });
});

describe("setPreset boundaries — every T=5…25", () => {
  it("min ledger +1 never jumps more than one preset level", () => {
    for (let T = V2_EXCESS_PRESET_MIN; T <= V2_EXCESS_PRESET_MAX; T++) {
      const ledger = minExcessSecondsForPreset(T);
      expect(deriveExcessPresetSeconds(ledger)).toBe(T);

      const next = deriveExcessPresetSeconds(ledger + 1);
      expect(next).toBeGreaterThanOrEqual(T);
      expect(next).toBeLessThanOrEqual(T + 1);
      // No skips like 15→17 or 20→22.
      expect(next - T).toBeLessThanOrEqual(1);
    }
  });

  it("scanning each bucket: T is constant inside, then steps by +1 at edge", () => {
    for (let T = V2_EXCESS_PRESET_MIN; T < V2_EXCESS_PRESET_MAX; T++) {
      const start = minExcessSecondsForPreset(T);
      const nextStart = minExcessSecondsForPreset(T + 1);
      expect(nextStart).toBeGreaterThan(start);

      // Mid-bucket stays at T.
      const mid = (start + nextStart) / 2;
      expect(deriveExcessPresetSeconds(mid)).toBe(T);

      // Just before next bucket still T; at nextStart → T+1.
      expect(deriveExcessPresetSeconds(nextStart - 0.01)).toBe(T);
      expect(deriveExcessPresetSeconds(nextStart)).toBe(T + 1);
    }

    // T=25 plateau has no upper game-seconds bound.
    const t25 = minExcessSecondsForPreset(25);
    expect(deriveExcessPresetSeconds(t25)).toBe(25);
    expect(deriveExcessPresetSeconds(t25 + 1)).toBe(25);
    expect(deriveExcessPresetSeconds(t25 + 10_000)).toBe(25);
  });
});
