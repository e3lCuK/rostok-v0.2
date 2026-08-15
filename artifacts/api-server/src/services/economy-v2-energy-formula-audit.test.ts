/**
 * Independent audit of Economy v2 energy accumulation.
 *
 * Expected values are computed from the approved formula literals only —
 * not from production constants or production helpers — so a wrong
 * implementation cannot make both sides agree by construction.
 *
 * Spec:
 *   T(K) = 3600 / (1 + 4 · (K/100000)^0.15)
 *   generated = elapsed / T(K)
 *   M(K) = 720 / T(K)   (compat multiplier vs 12-min reference)
 */
import { describe, expect, it } from "vitest";
import {
  capitalMultiplier,
  generateEnergyFromElapsed,
  secondsPerGameSecondForCapital,
} from "./economy-v2";
import {
  countReadySections,
  settleEconomyV2Roots,
} from "./economy-v2-roots";

/** Spec literals — intentionally local, not imported from production. */
const SPEC_REF_CAPITAL = 100_000;
const SPEC_EXPONENT = 0.15;
const SPEC_WEIGHT = 4;
const SPEC_SECONDS_AT_ZERO = 3600;
const SPEC_SECONDS_AT_REF = 720;
const SPEC_BANK_CAP = 60;
const TOL = 1e-9;

function expectedT(capital: number): number {
  if (!Number.isFinite(capital) || capital < 0) {
    return Number.POSITIVE_INFINITY;
  }
  const ratio =
    capital === 0
      ? 0
      : Math.pow(capital / SPEC_REF_CAPITAL, SPEC_EXPONENT);
  return SPEC_SECONDS_AT_ZERO / (1 + SPEC_WEIGHT * ratio);
}

function expectedM(capital: number): number {
  const t = expectedT(capital);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return SPEC_SECONDS_AT_REF / t;
}

function expectedGenerated(capital: number, elapsedSeconds: number): number {
  const safeElapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
  if (safeElapsed === 0) return 0;
  const t = expectedT(capital);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return safeElapsed / t;
}

function expectedMinutesPerEnergy(capital: number): number {
  return expectedT(capital) / 60;
}

/** Total matured root energy (ready sections + fractional progress). Bank unchanged. */
function settleFromElapsed(
  capital: number,
  elapsedSeconds: number,
  currentEnergy = 0,
): number {
  const now = 1_700_000_000_000;
  const r = settleEconomyV2Roots({
    energySeconds: currentEnergy,
    energyAnchorAt: now - elapsedSeconds * 1000,
    rootReadyMask: 0n,
    rootGenerationProgress: 0,
    capital,
    nowMs: now,
  });
  return countReadySections(r.rootReadyMask) + r.rootGenerationProgress;
}

const CONTROL_CAPITALS = [
  0,
  10_000,
  50_000,
  100_000,
  100_011.55,
  300_000,
  500_000,
  1_000_000,
  2_000_000,
  3_000_000,
  10_000_000,
] as const;

describe("Economy v2 energy formula audit (independent expected)", () => {
  describe("control capitals vs production", () => {
    it.each(CONTROL_CAPITALS)(
      "matches T(K), M(K), generation, and settle@cap for K=%s",
      (capital) => {
        const t = expectedT(capital);
        const m = expectedM(capital);
        const e12min = expectedGenerated(capital, 720);
        const e1h = expectedGenerated(capital, 3600);
        const e12h = expectedGenerated(capital, 43_200);
        const capped = Math.min(SPEC_BANK_CAP, e12h);

        expect(secondsPerGameSecondForCapital(capital)).toBeCloseTo(t, 9);
        expect(capitalMultiplier(capital)).toBeCloseTo(m, 9);
        expect(generateEnergyFromElapsed(capital, 720)).toBeCloseTo(e12min, 9);
        expect(generateEnergyFromElapsed(capital, 3600)).toBeCloseTo(e1h, 9);
        expect(generateEnergyFromElapsed(capital, 43_200)).toBeCloseTo(e12h, 9);
        expect(settleFromElapsed(capital, 43_200)).toBeCloseTo(capped, 9);

        const minutes = expectedMinutesPerEnergy(capital);
        expect(minutes).toBeGreaterThan(0);
        expect(Number.isFinite(minutes)).toBe(true);
        // Cross-check: energy over T(K) wall seconds equals 1.
        expect(expectedGenerated(capital, t)).toBeCloseTo(1, 12);
      },
    );
  });

  describe("anchor reference points", () => {
    it("K=0 → T=3600 (60 min); +3600 s → exactly 1 energy", () => {
      expect(expectedT(0)).toBe(3600);
      expect(generateEnergyFromElapsed(0, 3600)).toBeCloseTo(1, 9);
      expect(capitalMultiplier(0)).toBeCloseTo(0.2, 9);
    });

    it("100 000 ₽ + 720 s → exactly 1 energy", () => {
      const expected = expectedGenerated(100_000, 720);
      expect(expected).toBeCloseTo(1, 12);
      expect(generateEnergyFromElapsed(100_000, 720)).toBeCloseTo(expected, 9);
      expect(Math.abs(generateEnergyFromElapsed(100_000, 720) - 1)).toBeLessThan(
        TOL,
      );
    });

    it("100 000 ₽ + 3600 s → exactly 5 energy", () => {
      const expected = expectedGenerated(100_000, 3600);
      expect(expected).toBeCloseTo(5, 12);
      expect(generateEnergyFromElapsed(100_000, 3600)).toBeCloseTo(expected, 9);
    });

    it("100 000 ₽ + 43 200 s → exactly 60 energy", () => {
      const expected = expectedGenerated(100_000, 43_200);
      expect(expected).toBeCloseTo(60, 12);
      expect(generateEnergyFromElapsed(100_000, 43_200)).toBeCloseTo(
        expected,
        9,
      );
    });

    it("100 011,55 ₽ + 720 s is only slightly above 1", () => {
      const expected = expectedGenerated(100_011.55, 720);
      const actual = generateEnergyFromElapsed(100_011.55, 720);
      expect(actual).toBeCloseTo(expected, 9);
      expect(actual).toBeGreaterThan(1);
      expect(actual).toBeLessThan(1.001);
    });

    it("10 000 ₽ accrues slower than 100 000 ₽", () => {
      const low = generateEnergyFromElapsed(10_000, 720);
      const ref = generateEnergyFromElapsed(100_000, 720);
      expect(low).toBeLessThan(ref);
      expect(low).toBeCloseTo(expectedGenerated(10_000, 720), 9);
    });

    it("1 000 000 ₽ accrues faster than 100 000 ₽", () => {
      const high = generateEnergyFromElapsed(1_000_000, 720);
      const ref = generateEnergyFromElapsed(100_000, 720);
      expect(high).toBeGreaterThan(ref);
      expect(high).toBeCloseTo(expectedGenerated(1_000_000, 720), 9);
    });
  });

  describe("monotonicity", () => {
    it("generatedEnergy strictly increases for K ≥ 0", () => {
      for (let i = 1; i < CONTROL_CAPITALS.length; i++) {
        const prev = generateEnergyFromElapsed(CONTROL_CAPITALS[i - 1], 720);
        const next = generateEnergyFromElapsed(CONTROL_CAPITALS[i], 720);
        expect(next).toBeGreaterThan(prev);
      }
    });

    it("minutesPerEnergy strictly decreases for K ≥ 0", () => {
      for (let i = 1; i < CONTROL_CAPITALS.length; i++) {
        const prev = expectedMinutesPerEnergy(CONTROL_CAPITALS[i - 1]);
        const next = expectedMinutesPerEnergy(CONTROL_CAPITALS[i]);
        expect(next).toBeLessThan(prev);
        const prodMinutes =
          secondsPerGameSecondForCapital(CONTROL_CAPITALS[i]) / 60;
        expect(prodMinutes).toBeCloseTo(next, 9);
      }
    });
  });

  describe("non-linearity (weight×ratio^0.15)", () => {
    it("10× capital does not multiply speed by 10× (dampened)", () => {
      const at100k = generateEnergyFromElapsed(100_000, 720);
      const at1m = generateEnergyFromElapsed(1_000_000, 720);
      const ratio = at1m / at100k;
      expect(ratio).toBeCloseTo(
        expectedGenerated(1_000_000, 720) / expectedGenerated(100_000, 720),
        9,
      );
      // Old pure power-law was ~1.41; weighted formula is slower growth.
      expect(ratio).toBeLessThan(2);
      expect(ratio).not.toBeCloseTo(10, 1);
      expect(ratio).toBeCloseTo(
        (1 + SPEC_WEIGHT * Math.pow(10, SPEC_EXPONENT)) /
          (1 + SPEC_WEIGHT),
        9,
      );
    });

    it("2× capital does not double accrual speed", () => {
      const at100k = generateEnergyFromElapsed(100_000, 720);
      const at200k = generateEnergyFromElapsed(200_000, 720);
      const ratio = at200k / at100k;
      expect(ratio).toBeCloseTo(
        (1 + SPEC_WEIGHT * Math.pow(2, SPEC_EXPONENT)) / (1 + SPEC_WEIGHT),
        9,
      );
      expect(ratio).toBeLessThan(1.2);
      expect(ratio).not.toBeCloseTo(2, 1);
    });
  });

  describe("continuity near 100 000 ₽", () => {
    it("no jump across 99 999 / 100 000 / 100 001", () => {
      const a = generateEnergyFromElapsed(99_999, 720);
      const b = generateEnergyFromElapsed(100_000, 720);
      const c = generateEnergyFromElapsed(100_001, 720);

      expect(a).toBeCloseTo(expectedGenerated(99_999, 720), 9);
      expect(b).toBeCloseTo(1, 9);
      expect(c).toBeCloseTo(expectedGenerated(100_001, 720), 9);

      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
      expect(b - a).toBeLessThan(1e-4);
      expect(c - b).toBeLessThan(1e-4);
    });
  });

  describe("settleEconomyV2Roots / root-cap edge cases", () => {
    const now = 1_700_000_000_000;

    it("bank 0, K=100000, elapsed=720 → 1 ready; bank still 0", () => {
      const result = settleEconomyV2Roots({
        energySeconds: 0,
        energyAnchorAt: now - 720_000,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        capital: 100_000,
        nowMs: now,
      });
      expect(countReadySections(result.rootReadyMask)).toBe(1);
      expect(result.energySeconds).toBe(0);
      expect(result.generatedEnergy).toBeCloseTo(
        expectedGenerated(100_000, 720),
        9,
      );
    });

    it("bank 10.4, gain=0.7 → progress 0.7; bank stays 10.4", () => {
      const result = settleEconomyV2Roots({
        energySeconds: 10.4,
        energyAnchorAt: now - 504_000,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        capital: 100_000,
        nowMs: now,
      });
      expect(result.generatedEnergy).toBeCloseTo(0.7, 9);
      expect(result.energySeconds).toBeCloseTo(10.4, 9);
      expect(result.rootGenerationProgress).toBeCloseTo(0.7, 9);
    });

    it("bank 59.5 + 1 generated → only 0.5 usable under shared cap", () => {
      const result = settleEconomyV2Roots({
        energySeconds: 59.5,
        energyAnchorAt: now - 720_000,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        capital: 100_000,
        nowMs: now,
      });
      expect(result.generatedEnergy).toBeCloseTo(1, 9);
      expect(result.usableGeneratedEnergy).toBeCloseTo(0.5, 9);
      expect(result.energySeconds).toBe(59.5);
      expect(countReadySections(result.rootReadyMask)).toBe(0);
      expect(result.rootGenerationProgress).toBeCloseTo(0.5, 9);
    });

    it("bank 60 stays 60; roots do not mature when storage full; excess grows", () => {
      const result = settleEconomyV2Roots({
        energySeconds: 60,
        energyAnchorAt: now - 720_000,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        excessSeconds: 0,
        capital: 100_000,
        nowMs: now,
      });
      expect(result.energySeconds).toBe(60);
      expect(countReadySections(result.rootReadyMask)).toBe(0);
      expect(result.usableGeneratedEnergy).toBe(0);
      expect(result.storageFull).toBe(true);
      expect(result.excessGenerated).toBeCloseTo(1, 9);
      expect(result.excessSeconds).toBeCloseTo(1, 9);
    });

    it("negative bank clamped; generation goes to roots", () => {
      const result = settleEconomyV2Roots({
        energySeconds: -5,
        energyAnchorAt: now - 720_000,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        capital: 100_000,
        nowMs: now,
      });
      expect(result.energySeconds).toBe(0);
      expect(countReadySections(result.rootReadyMask)).toBe(1);
    });

    it("K=0 + 3600 s → +1 root energy (60 min cycle)", () => {
      const result = settleEconomyV2Roots({
        energySeconds: 12,
        energyAnchorAt: now - 3_600_000,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        capital: 0,
        nowMs: now,
      });
      expect(result.generatedEnergy).toBeCloseTo(1, 9);
      expect(countReadySections(result.rootReadyMask)).toBe(1);
      expect(result.energySeconds).toBe(12);
    });

    it("missing anchor → no backfill", () => {
      const result = settleEconomyV2Roots({
        energySeconds: 8,
        energyAnchorAt: null,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        capital: 100_000,
        nowMs: now,
      });
      expect(result.generatedEnergy).toBe(0);
      expect(result.elapsedSeconds).toBe(0);
      expect(result.energySeconds).toBe(8);
      expect(result.energyAnchorAt).toBe(now);
    });

    it("future anchor → no accrual", () => {
      const result = settleEconomyV2Roots({
        energySeconds: 8,
        energyAnchorAt: now + 60_000,
        rootReadyMask: 0n,
        rootGenerationProgress: 0,
        capital: 100_000,
        nowMs: now,
      });
      expect(result.generatedEnergy).toBe(0);
      expect(result.elapsedSeconds).toBe(0);
      expect(result.energySeconds).toBe(8);
      expect(result.energyAnchorAt).toBe(now);
    });
  });

  describe("string NUMERIC capital reaches the formula as a number", () => {
    it("parseFloat('100011.55') yields the same generation as number 100011.55", () => {
      const fromString = parseFloat(String("100011.55"));
      expect(typeof fromString).toBe("number");
      expect(fromString).toBe(100_011.55);

      const expected = expectedGenerated(fromString, 720);
      expect(generateEnergyFromElapsed(fromString, 720)).toBeCloseTo(
        expected,
        9,
      );
      expect(generateEnergyFromElapsed(100_011.55, 720)).toBeCloseTo(
        expected,
        9,
      );
    });
  });
});
