import { describe, expect, it } from "vitest";
import {
  METELKA_FILL_DIVISIONS,
  METELKA_FILL_MAX_VISUAL,
  getMetelkaFillProgress,
  metelkaFillProgress,
  metelkaPresetIndex,
  metelkaVisualPresetSeconds,
} from "./metelkaFillProgress";

describe("metelkaVisualPresetSeconds", () => {
  it("maps economy T presets 5…25", () => {
    expect(metelkaVisualPresetSeconds(5)).toBe(5);
    expect(metelkaVisualPresetSeconds(6)).toBe(6);
    expect(metelkaVisualPresetSeconds(11)).toBe(11);
    expect(metelkaVisualPresetSeconds(25)).toBe(25);
  });

  it("below unlock / invalid → null", () => {
    expect(metelkaVisualPresetSeconds(0)).toBeNull();
    expect(metelkaVisualPresetSeconds(4.99)).toBeNull();
    expect(metelkaVisualPresetSeconds(-1)).toBeNull();
    expect(metelkaVisualPresetSeconds(Number.NaN)).toBeNull();
  });
});

describe("metelkaFillProgress from T_excess preset", () => {
  it("T → presetIndex / 22", () => {
    const cases: Array<[number, number]> = [
      [5, 1 / 22],
      [6, 2 / 22],
      [7, 3 / 22],
      [11, 7 / 22],
      [20, 16 / 22],
      [24, 20 / 22],
      [25, 21 / 22],
    ];
    for (const [t, expected] of cases) {
      expect(metelkaFillProgress(t)).toBeCloseTo(expected, 10);
      expect(getMetelkaFillProgress(t)).toBeCloseTo(expected, 10);
    }
    expect(metelkaPresetIndex(11)).toBe(7);
    expect(metelkaFillProgress(25)).toBe(METELKA_FILL_MAX_VISUAL);
    expect(METELKA_FILL_DIVISIONS).toBe(22);
  });

  it("never reaches 1; invalid → 0", () => {
    expect(metelkaFillProgress(25)).toBeLessThan(1);
    expect(metelkaFillProgress(0)).toBe(0);
    expect(metelkaFillProgress(Number.NaN)).toBe(0);
  });

  it("does not treat large excess ledger as T (caller must pass excessPresetSeconds)", () => {
    // If someone wrongly passes excessSeconds=25, fill would look max — that is a
    // caller bug. Helper only interprets Metelka duration presets.
    expect(metelkaFillProgress(25)).toBeCloseTo(21 / 22, 10);
  });
});
