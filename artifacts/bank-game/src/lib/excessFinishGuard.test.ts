import { describe, expect, it, vi } from "vitest";
import { createExcessFinishGuard } from "./excessFinishGuard";
import {
  excessResultClearedLabel,
  formatExcessSkillPercent,
  isExcessResultAvailable,
} from "./excessResultUi";
import {
  excessSessionFinishKey,
  shouldForceExcessFinish,
  shouldRequestExcessFinish,
} from "./excessCleaningCountdown";

describe("excessFinishGuard", () => {
  it("1–3. countdown/all-cleared coalesce to one finish", async () => {
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
      await Promise.resolve();
    });
    guard.requestFinish({ sessionKey: "s1" });
    guard.requestFinish({ sessionKey: "s1" });
    guard.requestFinish({ sessionKey: "s1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(guard.getFinished("s1")).toBe(true);
  });

  it("reset clears finished flag so next session can finish", async () => {
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
    });
    guard.requestFinish({ sessionKey: "s1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(guard.getFinished("s1")).toBe(true);
    guard.reset();
    expect(guard.getFinished("s1")).toBe(false);
    guard.requestFinish({ sessionKey: "s2" });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
  });

  it("10. after success, further requestFinish is a no-op", async () => {
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
    });
    guard.requestFinish({ sessionKey: "s1" });
    await Promise.resolve();
    await Promise.resolve();
    guard.requestFinish({ sessionKey: "s1" });
    guard.requestFinish({ sessionKey: "s1" });
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it("failed finish does not lock; retry works and exposes error", async () => {
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network down");
    });
    guard.requestFinish({ sessionKey: "s1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(guard.getFinished("s1")).toBe(false);
    expect(guard.getLastError()).toMatch(/network down/);
    guard.clearLastError();
    guard.requestFinish({ sessionKey: "s1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    expect(guard.getFinished("s1")).toBe(true);
    expect(guard.getLastError()).toBeNull();
  });

  it("force finish ignores clearInFlight (timer expiry)", async () => {
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
    });
    guard.setClearInFlight(2);
    guard.requestFinish({ sessionKey: "s1", force: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(guard.getFinished("s1")).toBe(true);
  });

  it("without force, waits for clears then finishes", async () => {
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
    });
    guard.setClearInFlight(1);
    guard.requestFinish({ sessionKey: "s1" });
    await Promise.resolve();
    expect(calls).toBe(0);
    guard.setClearInFlight(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it("invalidate drops in-flight success for old session (debug race)", async () => {
    let finishResolve!: () => void;
    const finishGate = new Promise<void>((r) => {
      finishResolve = r;
    });
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
      await finishGate;
    });
    guard.requestFinish({ sessionKey: "old", force: true });
    await Promise.resolve();
    expect(guard.getInFlight("old")).toBe(true);
    guard.invalidate("old");
    finishResolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(guard.getFinished("old")).toBe(false);
    guard.requestFinish({ sessionKey: "new", force: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    expect(guard.getFinished("new")).toBe(true);
  });

  it("Strict Mode double request still one finish per session key", async () => {
    let calls = 0;
    const guard = createExcessFinishGuard(async () => {
      calls += 1;
      await Promise.resolve();
    });
    // Simulate Strict Mode remount effects calling request twice.
    guard.requestFinish({ sessionKey: "a:15", force: true });
    guard.requestFinish({ sessionKey: "a:15", force: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(guard.getFinishStarted("a:15")).toBe(true);
  });
});

describe("excess session finish key / force", () => {
  const NOW = 1_700_000_000_000;
  it("session key from startedAt+preset; force on deadline", () => {
    const session = {
      active: true as const,
      startedAt: NOW,
      presetSeconds: 15,
      remainingWebCount: 10,
    };
    expect(excessSessionFinishKey(session)).toBe(`${NOW}:15`);
    const excess = {
      excessSeconds: 100,
      excessCycle: 0,
      excessAvailable: true,
      excessPresetSeconds: 15,
      excessRate: 0.01,
      session,
    };
    expect(shouldRequestExcessFinish(excess, NOW + 14_999)).toBe(false);
    expect(shouldForceExcessFinish(excess, NOW + 14_999)).toBe(false);
    expect(shouldRequestExcessFinish(excess, NOW + 15_000)).toBe(true);
    expect(shouldForceExcessFinish(excess, NOW + 15_000)).toBe(true);
  });
});

describe("excessResultUi", () => {
  it("6–8. labels and percent from server skill", () => {
    expect(formatExcessSkillPercent(0.5)).toBe("50%");
    expect(formatExcessSkillPercent(1)).toBe("100%");
    expect(formatExcessSkillPercent(0)).toBe("0%");
    expect(
      excessResultClearedLabel({
        available: true,
        finishedAt: 1,
        reason: "time_expired",
        clearedCount: 6,
        webCount: 12,
        skill: 0.5,
        sourceSeconds: 10,
        presetSeconds: 5,
        rate: 0.01,
        xp: { max: 6, raw: 3, awarded: 3, applied: true },
      }),
    ).toBe("Очищено 6 из 12");
    expect(
      isExcessResultAvailable({
        excessSeconds: 10,
        excessCycle: 0,
        excessAvailable: true,
        excessPresetSeconds: 5,
        excessRate: 0.01,
        result: {
          available: true,
          sessionVersion: 1,
          finishedAt: 1,
          reason: "time_expired",
          clearedCount: 6,
          webCount: 12,
          skill: 0.5,
          sourceSeconds: 10,
          presetSeconds: 5,
          rate: 0.01,
          xp: { max: 6, raw: 3, awarded: 3, applied: true },
        },
      }),
    ).toBe(true);
    expect(
      isExcessResultAvailable({
        excessSeconds: 0,
        excessCycle: 0,
        excessAvailable: false,
        excessPresetSeconds: 5,
        excessRate: 0.01,
        result: {
          available: true,
          sessionVersion: 2,
          finishedAt: 1,
          reason: "time_expired",
          clearedCount: 6,
          webCount: 12,
          skill: 0.5,
          sourceSeconds: 10,
          presetSeconds: 5,
          rate: 0.01,
          xp: { max: 6, raw: 3, awarded: 3, applied: true },
        },
      }),
    ).toBe(false);
  });
});

describe("excess finish API contracts", () => {
  it("finish and acknowledge endpoints exist", async () => {
    const { api } = await import("./api");
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        excessSeconds: 10,
        excess: {
          excessSeconds: 10,
          result: {
            available: true,
            skill: 0.5,
            xp: { max: 6, raw: 3, awarded: 3, applied: true },
          },
        },
        result: {
          available: true,
          skill: 0.5,
          xp: { max: 6, raw: 3, awarded: 3, applied: true },
        },
        playerXp: 103,
        playerLevel: 1,
        xpGained: 3,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await api.finishEconomyV2ExcessSession();
    await api.acknowledgeEconomyV2ExcessResult();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/game/v2/excess/finish"))).toBe(true);
    expect(
      urls.some((u) => u.includes("/game/v2/excess/result/acknowledge")),
    ).toBe(true);
    vi.unstubAllGlobals();
  });
});
