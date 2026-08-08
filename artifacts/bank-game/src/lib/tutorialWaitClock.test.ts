import { afterEach, describe, expect, it } from "vitest";
import {
  armTutorialWaitClock,
  clearTutorialWaitClock,
  loadTutorialWaitClock,
  persistTutorialWaitClock,
  TUTORIAL_WAIT_CLOCK_STORAGE_KEY,
} from "./tutorialWaitClock";
import { TUTORIAL_V3_WAIT_MS } from "./tutorialFlow";

afterEach(() => {
  clearTutorialWaitClock();
});

describe("tutorialWaitClock — F5-safe 12:00 wait", () => {
  it("persists and restores the same deadline (no fresh 12:00)", () => {
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
    expect(gameSrc).toContain("alreadyComplete");
    expect(gameSrc).toContain("tutorial_done === true");
  });
});
