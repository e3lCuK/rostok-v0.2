import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeMetelkaCareIncome } from "./economy-v2-excess-metelka-income";
import {
  metelkaBonusShareForWebIndex,
  splitMetelkaBonusAmongWhiteWebs,
} from "./economy-v2-excess-metelka-payout";
import { roundMoneyToKopecks } from "./economy-v2-care-income";

const payoutSrc = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "economy-v2-excess-metelka-payout.ts",
  ),
  "utf8",
);

describe("splitMetelkaBonusAmongWhiteWebs", () => {
  it("shares sum exactly to kopeck-rounded totalBonus", () => {
    const total = 0.34;
    for (const n of [1, 3, 5, 12, 60]) {
      const shares = splitMetelkaBonusAmongWhiteWebs(total, n);
      expect(shares).toHaveLength(n);
      const sumCents = shares.reduce((s, x) => s + Math.round(x * 100), 0);
      expect(sumCents).toBe(Math.round(roundMoneyToKopecks(total) * 100));
    }
  });

  it("web index lookup matches array; out of range → 0", () => {
    const shares = splitMetelkaBonusAmongWhiteWebs(1.05, 5);
    expect(metelkaBonusShareForWebIndex(1.05, 5, 0)).toBe(shares[0]);
    expect(metelkaBonusShareForWebIndex(1.05, 5, 4)).toBe(shares[4]);
    expect(metelkaBonusShareForWebIndex(1.05, 5, 5)).toBe(0);
  });

  it("care bonus for 5s / 100k splits across session white count", () => {
    const care = computeMetelkaCareIncome({
      capital: 100_000,
      consumedExcessSeconds: 5,
    });
    expect(care.bonus).toBeGreaterThan(0);
    const n = 12;
    const shares = splitMetelkaBonusAmongWhiteWebs(care.bonus, n);
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(roundMoneyToKopecks(sum)).toBe(roundMoneyToKopecks(care.bonus));
  });
});

describe("settleImmediateMetelkaCash (no tree growth)", () => {
  it("Metelka settlement SQL never writes tree_growth_*", () => {
    expect(payoutSrc).toContain("active_balance = active_balance + $2");
    expect(payoutSrc).toContain("INSERT INTO income_history");
    expect(payoutSrc).not.toContain("tree_growth_mm");
    expect(payoutSrc).not.toContain("tree_growth_remainder");
  });
});
