import { afterEach, describe, expect, it } from "vitest";
import {
  armTutorialWaitClock,
  clearTutorialFastFillUsed,
  clearTutorialWaitClock,
  loadTutorialFastFillUsed,
  loadTutorialWaitClock,
  persistTutorialFastFillUsed,
  persistTutorialWaitClock,
  TUTORIAL_FAST_FILL_USED_STORAGE_KEY,
  TUTORIAL_WAIT_CLOCK_STORAGE_KEY,
} from "./tutorialWaitClock";
import {
  TUTORIAL_V3_WAIT_MS,
  tutorialWaitMsForCapital,
  tutorialWaitSecondsForCapital,
} from "./tutorialFlow";

afterEach(() => {
  clearTutorialWaitClock();
  clearTutorialFastFillUsed();
});

describe("tutorialWaitClock — F5-safe energy wait", () => {
  it("persists and restores the same deadline (no fresh cycle)", () => {
    const now = 1_700_000_000_000;
    const clock = {
      startedAtMs: now - 120_000,
      deadlineMs: now - 120_000 + TUTORIAL_V3_WAIT_MS,
    };
    persistTutorialWaitClock(clock);
    expect(loadTutorialWaitClock(now)).toEqual(clock);
    expect(TUTORIAL_WAIT_CLOCK_STORAGE_KEY).toContain("tutorialWaitClock");
  });

  it("armTutorialWaitClock reuses stored clock instead of resetting", () => {
    const now = 1_700_000_000_000;
    const first = armTutorialWaitClock(now - 90_000);
    const again = armTutorialWaitClock(now);
    expect(again.startedAtMs).toBe(first.startedAtMs);
    expect(again.deadlineMs).toBe(first.deadlineMs);
    expect(again.deadlineMs - now).toBeLessThan(TUTORIAL_V3_WAIT_MS);
  });

  it("T(K): K=0 → 60:00, K=100k → 12:00", () => {
    expect(tutorialWaitSecondsForCapital(0)).toBe(3600);
    expect(tutorialWaitSecondsForCapital(100_000)).toBe(720);
    const now = 1_700_000_000_000;
    const atZero = armTutorialWaitClock(now, 0);
    expect(atZero.deadlineMs - atZero.startedAtMs).toBe(
      tutorialWaitMsForCapital(0),
    );
    clearTutorialWaitClock();
    const atRef = armTutorialWaitClock(now, 100_000);
    expect(atRef.deadlineMs - atRef.startedAtMs).toBe(TUTORIAL_V3_WAIT_MS);
  });

  it("fast-fill used is one-shot and clears with reset", () => {
    expect(loadTutorialFastFillUsed()).toBe(false);
    persistTutorialFastFillUsed();
    expect(loadTutorialFastFillUsed()).toBe(true);
    expect(TUTORIAL_FAST_FILL_USED_STORAGE_KEY).toContain("tutorialFastFillUsed");
    clearTutorialFastFillUsed();
    expect(loadTutorialFastFillUsed()).toBe(false);
  });

  it("GamePage wires sessionStorage wait clock for F5 + complete handoff", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
    const gameSrc = readFileSync(
      join(here, "../../../api-server/src/routes/game.ts"),
      "utf8",
    );
    expect(pageSrc).toContain("armTutorialWaitClock");
    expect(pageSrc).toContain("loadTutorialWaitClock");
    expect(pageSrc).toContain("clearTutorialWaitClock");
    expect(pageSrc).toContain("persistTutorialFastFillUsed");
    expect(pageSrc).toContain("clearTutorialFastFillUsed");
    expect(gameSrc).toContain("alreadyComplete");
    expect(gameSrc).toContain("tutorial_done === true");
  });

  it("account reset / fresh onboarding clears persisted wait clock", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
    expect(appSrc).toContain("clearTutorialWaitClock");
    expect(appSrc).toContain("clearTutorialFastFillUsed");
    expect(appSrc).toMatch(/if\s*\(\s*!data\.exists\s*\)[\s\S]*?clearTutorialWaitClock/);
    expect(appSrc).toMatch(
      /handleOnboardingComplete[\s\S]*?clearTutorialWaitClock[\s\S]*?initAccount/,
    );
    const panelPath = join(here, "../local/debug-panel.tsx");
    if (existsSync(panelPath)) {
      const panelSrc = readFileSync(panelPath, "utf8");
      expect(panelSrc).toContain("clearTutorialWaitClock");
      expect(panelSrc).toContain("reset-progress");
      expect(panelSrc).toMatch(
        /clearStaleWaitClockBeforeAccountWipe[\s\S]*?reset-progress/,
      );
    }
  });
});
