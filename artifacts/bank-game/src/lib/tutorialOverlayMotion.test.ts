import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TUTORIAL_CARD_ANIMATE,
  TUTORIAL_CARD_INITIAL,
  TUTORIAL_OVERLAY_FADE_S,
  TUTORIAL_OVERLAY_INITIAL,
} from "./tutorialOverlayMotion";

const pageSrc = readFileSync(
  join(__dirname, "../pages/GamePage.tsx"),
  "utf8",
);

describe("tutorialOverlayMotion", () => {
  it("fades in over a visible beat (not a snap)", () => {
    expect(TUTORIAL_OVERLAY_FADE_S).toBeGreaterThanOrEqual(0.3);
    expect(TUTORIAL_OVERLAY_INITIAL).toEqual({ opacity: 0 });
    expect(TUTORIAL_CARD_INITIAL.opacity).toBe(0);
    expect(TUTORIAL_CARD_INITIAL.y).toBeGreaterThan(0);
    expect(TUTORIAL_CARD_ANIMATE).toEqual({ opacity: 1, y: 0, scale: 1 });
  });

  it("GamePage uses the shared motion on welcome and step cards", () => {
    expect(pageSrc).toContain("TUTORIAL_CARD_INITIAL");
    expect(pageSrc).toContain("TUTORIAL_CARD_ANIMATE");
    expect(pageSrc).toContain("TUTORIAL_OVERLAY_INITIAL");
    expect(pageSrc).toContain("tutorial-welcome-overlay");
    expect(pageSrc).toContain("AnimatePresence mode=\"wait\"");
  });
});
