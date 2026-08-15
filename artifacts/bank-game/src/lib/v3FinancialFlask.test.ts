import { describe, expect, it } from "vitest";
import {
  remainingMsInFinancialCycle,
  resolveV3FinancialCycleSeconds,
  resolveV3FinancialFlaskDisplay,
} from "./v3FinancialFlask";

describe("v3FinancialFlask — grey flask countdown from financial phase", () => {
  it("at elapsed 0 shows full cycle (12:00) and empty fill — not gold leftover", () => {
    const d = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 0,
      cycleDurationSeconds: 720,
    });
    expect(d.timeLabel).toBe("12:00");
    expect(d.barProgress).toBe(0);
    expect(d.remainingSeconds).toBe(720);
    expect(d.elapsedSeconds).toBe(0);
  });

  it("1s financial → 11:59; 2s → 11:58 (synced with finance seconds)", () => {
    // Sub-second: finance still «0 сек» → flask stays 12:00 (not 11:59 at 1ms).
    const sub = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 999,
      cycleDurationSeconds: 720,
    });
    expect(sub.elapsedSeconds).toBe(0);
    expect(sub.timeLabel).toBe("12:00");

    const one = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 1_000,
      cycleDurationSeconds: 720,
    });
    expect(one.elapsedSeconds).toBe(1);
    expect(one.timeLabel).toBe("11:59");

    const oneAlmost = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 1_999,
      cycleDurationSeconds: 720,
    });
    expect(oneAlmost.elapsedSeconds).toBe(1);
    expect(oneAlmost.timeLabel).toBe("11:59");

    const two = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 2_000,
      cycleDurationSeconds: 720,
    });
    expect(two.elapsedSeconds).toBe(2);
    expect(two.timeLabel).toBe("11:58");
  });

  it("counts down within the cycle; fill rises as remaining shrinks", () => {
    const half = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 360_000,
      cycleDurationSeconds: 720,
    });
    expect(half.timeLabel).toBe("6:00");
    expect(half.barProgress).toBeCloseTo(0.5, 5);
    expect(half.remainingSeconds).toBe(360);

    const late = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 13_000,
      cycleDurationSeconds: 720,
    });
    expect(late.timeLabel).toBe("11:47");
    expect(late.elapsedSeconds).toBe(13);
    expect(late.barProgress).toBeCloseTo(13 / 720, 5);
  });

  it("does not show count-up total (0:13) as the flask label", () => {
    const d = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 13_000,
      cycleDurationSeconds: 720,
    });
    expect(d.timeLabel).not.toBe("0:13");
    expect(d.timeLabel).toBe("11:47");
  });

  it("exact cycle boundary restarts at full 12:00", () => {
    expect(remainingMsInFinancialCycle(720_000, 720)).toBe(720_000);
    const d = resolveV3FinancialFlaskDisplay({
      excessElapsedMs: 720_000,
      cycleDurationSeconds: 720,
    });
    expect(d.timeLabel).toBe("12:00");
    expect(d.barProgress).toBe(0);
  });

  it("resolveV3FinancialCycleSeconds prefers server cycle, then capital", () => {
    expect(
      resolveV3FinancialCycleSeconds({
        cycleDurationSeconds: 600,
        capital: 100_000,
      }),
    ).toBe(600);
    expect(
      resolveV3FinancialCycleSeconds({
        cycleDurationSeconds: null,
        capital: 100_000,
      }),
    ).toBe(720);
  });
});
