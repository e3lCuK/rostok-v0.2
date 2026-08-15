import { describe, expect, it, beforeEach } from "vitest";
import {
  clearTutorialCompensationClock,
  loadTutorialCompensationClock,
  markTutorialCompensationEnded,
  markTutorialCompensationStarted,
  TUTORIAL_COMPENSATION_CLOCK_STORAGE_KEY,
} from "./tutorialCompensationClock";

describe("tutorialCompensationClock", () => {
  beforeEach(() => {
    clearTutorialCompensationClock();
    try {
      sessionStorage.removeItem(TUTORIAL_COMPENSATION_CLOCK_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  });

  it("keeps first start and first end", () => {
    const t0 = 1_700_000_000_000;
    markTutorialCompensationStarted(t0, 100_000);
    markTutorialCompensationStarted(t0 + 10_000, 50_000);
    markTutorialCompensationEnded(t0 + 60_000);
    markTutorialCompensationEnded(t0 + 90_000);
    const clock = loadTutorialCompensationClock(t0 + 90_000);
    expect(clock).toEqual({
      startedAtMs: t0,
      endedAtMs: t0 + 60_000,
      capital: 100_000,
    });
  });
});
