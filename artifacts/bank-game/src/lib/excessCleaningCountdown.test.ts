import { describe, expect, it } from "vitest";
import type { EconomyV2ExcessSessionState } from "@/lib/api";
import {
  computeExcessCleaningRemainingMs,
  computeExcessCleaningRemainingSeconds,
  excessCleaningEndAtMs,
  excessSessionFinishKey,
  isExcessCleaningMode,
  shouldRequestExcessFinish,
} from "./excessCleaningCountdown";

const NOW = 1_700_000_000_000;

function session(
  partial: Partial<EconomyV2ExcessSessionState> & {
    active: boolean;
    startedAt: number | null;
    presetSeconds: number | null;
  },
): EconomyV2ExcessSessionState {
  return {
    sourceSeconds: null,
    rate: null,
    ...partial,
  };
}

describe("excessCleaningCountdown", () => {
  it("isExcessCleaningMode follows session.active only", () => {
    expect(
      isExcessCleaningMode({
        excessSeconds: 10,
        excessCycle: 0,
        excessAvailable: true,
        excessPresetSeconds: 10,
        excessRate: 0.01,
        session: session({
          active: false,
          startedAt: null,
          presetSeconds: null,
        }),
      }),
    ).toBe(false);
    expect(
      isExcessCleaningMode({
        excessSeconds: 0,
        excessCycle: 0,
        excessAvailable: false,
        excessPresetSeconds: 5,
        excessRate: 0.01,
        session: session({
          active: true,
          startedAt: NOW,
          presetSeconds: 10,
        }),
      }),
    ).toBe(true);
  });

  it("endAt = startedAt + presetSeconds * 1000", () => {
    expect(
      excessCleaningEndAtMs(
        session({ active: true, startedAt: NOW, presetSeconds: 10 }),
      ),
    ).toBe(NOW + 10_000);
  });

  it("remaining from wall clock — F5 mid-session does not restart", () => {
    const s = session({
      active: true,
      startedAt: NOW,
      presetSeconds: 10,
    });
    // 6s elapsed → ~4s left
    expect(computeExcessCleaningRemainingSeconds(s, NOW + 6_000)).toBe(4);
    expect(computeExcessCleaningRemainingMs(s, NOW + 6_000)).toBe(4_000);
    // same inputs again → same remaining (not decremented locally)
    expect(computeExcessCleaningRemainingSeconds(s, NOW + 6_000)).toBe(4);
  });

  it("ceil boundary and never below 0", () => {
    const s = session({
      active: true,
      startedAt: NOW,
      presetSeconds: 5,
    });
    expect(computeExcessCleaningRemainingSeconds(s, NOW)).toBe(5);
    expect(computeExcessCleaningRemainingSeconds(s, NOW + 4_001)).toBe(1);
    expect(computeExcessCleaningRemainingSeconds(s, NOW + 5_000)).toBe(0);
    expect(computeExcessCleaningRemainingSeconds(s, NOW + 60_000)).toBe(0);
    expect(computeExcessCleaningRemainingMs(s, NOW + 60_000)).toBe(0);
  });

  it("inactive session yields 0 / null end", () => {
    const s = session({
      active: false,
      startedAt: NOW,
      presetSeconds: 10,
    });
    expect(excessCleaningEndAtMs(s)).toBeNull();
    expect(computeExcessCleaningRemainingSeconds(s, NOW)).toBe(0);
  });

  it("shouldRequestExcessFinish blocks when result.available", () => {
    const base = {
      excessSeconds: 10,
      excessCycle: 0,
      excessAvailable: true,
      excessPresetSeconds: 10,
      excessRate: 0.01,
    };
    expect(
      shouldRequestExcessFinish(
        {
          ...base,
          session: session({
            active: true,
            startedAt: NOW - 20_000,
            presetSeconds: 10,
            remainingWebCount: 5,
          }),
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      shouldRequestExcessFinish(
        {
          ...base,
          session: session({
            active: true,
            startedAt: NOW,
            presetSeconds: 10,
            remainingWebCount: 0,
          }),
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      shouldRequestExcessFinish(
        {
          ...base,
          session: session({
            active: true,
            startedAt: NOW - 20_000,
            presetSeconds: 10,
            remainingWebCount: 5,
          }),
          result: {
            available: true,
            finishedAt: NOW,
            reason: "time_expired",
            clearedCount: 0,
            webCount: 12,
            skill: 0,
            sourceSeconds: 10,
            presetSeconds: 10,
            rate: 0.01,
          },
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("timer 0 with webs remaining still requests finish via remainingMs", () => {
    const base = {
      excessSeconds: 254,
      excessCycle: 0,
      excessAvailable: true,
      excessPresetSeconds: 15,
      excessRate: 0.01,
    };
    const s = session({
      active: true,
      startedAt: NOW,
      presetSeconds: 15,
      remainingWebCount: 20,
      clearedWebCount: 0,
    });
    expect(shouldRequestExcessFinish({ ...base, session: s }, NOW + 14_999)).toBe(
      false,
    );
    expect(shouldRequestExcessFinish({ ...base, session: s }, NOW + 15_000)).toBe(
      true,
    );
  });

  it("finish key is stable absolute deadline identity", () => {
    const s = session({
      active: true,
      startedAt: NOW,
      presetSeconds: 15,
    });
    expect(excessSessionFinishKey(s)).toBe(`${NOW}:15`);
    expect(excessCleaningEndAtMs(s)).toBe(NOW + 15_000);
  });
});
