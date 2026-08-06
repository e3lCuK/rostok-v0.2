import { describe, expect, it } from "vitest";
import {
  debugMetelkaElapsedMsForLedger,
  debugMetelkaElapsedMsForPreset,
  formatExcessElapsedReadout,
  isMetelkaMaxGamePreset,
  METELKA_MAX_PRESET_FINANCE_HINT,
  METELKA_MAX_PRESET_STATUS,
  previewMetelkaDebugReward,
  roundMoneyToKopecks,
  secondsPerGameSecondForCapital,
} from "./metelkaDebugRewardPreview";
import { minExcessSecondsForPreset } from "./excessEconomyDerive";

describe("metelkaDebugRewardPreview", () => {
  it("ledger only / elapsedMs=0 → warning and zero money", () => {
    const p = previewMetelkaDebugReward({
      capital: 10_000,
      excessSeconds: 25,
      excessElapsedMs: 0,
    });
    expect(p.missingElapsedHistory).toBe(true);
    expect(p.skill1Total).toBe(0);
    expect(p.warning).toMatch(/elapsedMs=0|финансового накопления/i);
  });

  it("artificial T×1000 elapsed at low capital can round to 0.00", () => {
    const p = previewMetelkaDebugReward({
      capital: 100,
      excessSeconds: minExcessSecondsForPreset(5),
      excessElapsedMs: debugMetelkaElapsedMsForPreset(5),
    });
    expect(p.excessElapsedMs).toBe(5000);
    expect(p.roundsToZero).toBe(true);
    expect(p.skill1Total).toBe(0);
    expect(p.warning).toMatch(/монетка не появится/);
  });

  it("natural ledger elapsed at K=100k yields real money for T=5", () => {
    const ledger = minExcessSecondsForPreset(5);
    const capital = 100_000;
    const elapsed = debugMetelkaElapsedMsForLedger(ledger, capital);
    expect(elapsed).toBe(ledger * secondsPerGameSecondForCapital(capital) * 1000);
    expect(elapsed).not.toBe(5_000);
    const p = previewMetelkaDebugReward({
      capital,
      excessSeconds: ledger,
      excessElapsedMs: elapsed,
    });
    expect(p.roundsToZero).toBe(false);
    expect(p.skill1Total).toBeGreaterThan(0);
  });

  it("natural T=25 elapsed ≫ 25s; money ≫ artificial 25s elapsed", () => {
    const ledger = minExcessSecondsForPreset(25);
    const capital = 100_000;
    const natural = debugMetelkaElapsedMsForLedger(ledger, capital);
    const artificial = 25_000;
    expect(natural).toBeGreaterThan(artificial * 100);
    const withNatural = previewMetelkaDebugReward({
      capital,
      excessSeconds: ledger,
      excessElapsedMs: natural,
    });
    const withArtificial = previewMetelkaDebugReward({
      capital,
      excessSeconds: ledger,
      excessElapsedMs: artificial,
    });
    expect(withNatural.skill1Total).toBeGreaterThan(withArtificial.skill1Total);
  });

  it("higher capital shortens wall-clock for same ledger", () => {
    const ledger = minExcessSecondsForPreset(15);
    const low = debugMetelkaElapsedMsForLedger(ledger, 50_000);
    const high = debugMetelkaElapsedMsForLedger(ledger, 200_000);
    expect(high).toBeLessThan(low);
    expect(low).toBeGreaterThan(0);
  });

  it("tiny elapsed can round to zero with clear warning", () => {
    const p = previewMetelkaDebugReward({
      capital: 100,
      excessSeconds: minExcessSecondsForPreset(25),
      excessElapsedMs: 60_000, // 1 minute
    });
    expect(p.dBaseRaw).toBeGreaterThan(0);
    expect(roundMoneyToKopecks(p.dBaseRaw + p.dExcessRaw)).toBe(0);
    expect(p.roundsToZero).toBe(true);
    expect(p.warning).toMatch(/монетка не появится/);
  });

  it("formatExcessElapsedReadout uses human units including days", () => {
    expect(formatExcessElapsedReadout(39_000)).toBe("39 сек");
    expect(formatExcessElapsedReadout(135_000)).toBe("2 мин 15 сек");
    expect(formatExcessElapsedReadout(3_920_000)).toBe("1 час 5 минут");
    expect(formatExcessElapsedReadout(2 * 86400_000 + 14 * 3600_000 + 38 * 60_000)).toBe(
      "2 дня 14 часов 38 минут",
    );
  });

  it("T=25 max-preset status copy is shown; financial accumulation continues", () => {
    expect(isMetelkaMaxGamePreset(25)).toBe(true);
    expect(isMetelkaMaxGamePreset(24)).toBe(false);
    expect(METELKA_MAX_PRESET_STATUS).toMatch(/Максимальный игровой пресет/);
    expect(METELKA_MAX_PRESET_FINANCE_HINT).toMatch(/продолжается/);
    expect(METELKA_MAX_PRESET_FINANCE_HINT).not.toMatch(/после T=25/);
    const atCap = previewMetelkaDebugReward({
      capital: 100_000,
      excessSeconds: minExcessSecondsForPreset(25),
      excessElapsedMs: debugMetelkaElapsedMsForLedger(
        minExcessSecondsForPreset(25),
        100_000,
      ),
    });
    const afterAdd = previewMetelkaDebugReward({
      capital: 100_000,
      excessSeconds: minExcessSecondsForPreset(25) + 5,
      excessElapsedMs:
        atCap.excessElapsedMs +
        debugMetelkaElapsedMsForLedger(5, 100_000),
    });
    expect(atCap.livePresetSeconds).toBe(25);
    expect(afterAdd.livePresetSeconds).toBe(25);
    expect(afterAdd.skill1Total).toBeGreaterThan(atCap.skill1Total);
  });
});
