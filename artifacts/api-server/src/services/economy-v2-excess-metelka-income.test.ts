import { describe, expect, it } from "vitest";
import { computeIncomeForOneGame } from "./economy-v2-care-income";
import {
  computeMetelkaCareIncome,
  METELKA_CARE_INCOME_SKILL,
  resolveMetelkaConsumedExcessSeconds,
} from "./economy-v2-excess-metelka-income";

describe("Metelka care-style income (computeIncomeForOneGame)", () => {
  it("consumed excess floors to game-seconds for duration", () => {
    expect(resolveMetelkaConsumedExcessSeconds(5)).toBe(5);
    expect(resolveMetelkaConsumedExcessSeconds(5.9)).toBe(5);
    expect(resolveMetelkaConsumedExcessSeconds(0)).toBe(0);
  });

  it("5s at 100% matches ordinary Care one-game income", () => {
    const capital = 100_000;
    const metelka = computeMetelkaCareIncome({
      capital,
      consumedExcessSeconds: 5,
    });
    const care = computeIncomeForOneGame({
      capital,
      presetSeconds: 5,
      skill: 1,
    });
    expect(METELKA_CARE_INCOME_SKILL).toBe(1);
    expect(metelka.consumedExcessSeconds).toBe(5);
    expect(metelka.base).toBe(care.base);
    expect(metelka.bonus).toBe(care.bonus);
    expect(metelka.total).toBe(care.total);
    expect(metelka.total).toBeGreaterThan(0);
  });

  it("0 consumed seconds → zero income", () => {
    const metelka = computeMetelkaCareIncome({
      capital: 100_000,
      consumedExcessSeconds: 0,
    });
    expect(metelka.total).toBe(0);
  });

  it("natural excess durations (not only debug 5) use same formula", () => {
    for (const sec of [5, 8, 12, 20]) {
      const metelka = computeMetelkaCareIncome({
        capital: 100_000,
        consumedExcessSeconds: sec,
      });
      const care = computeIncomeForOneGame({
        capital: 100_000,
        presetSeconds: sec,
        skill: 1,
      });
      expect(metelka.total).toBe(care.total);
      expect(metelka.total).toBeGreaterThan(0);
    }
  });
});
