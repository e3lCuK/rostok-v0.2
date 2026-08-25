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
const cssSrc = readFileSync(join(__dirname, "../bank.css"), "utf8");

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

  it("pins step hint cards in the sky above the tree", () => {
    expect(cssSrc).toMatch(
      /\.tutorial-intro-overlay\s*\{[\s\S]*?align-items:\s*flex-start/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-intro-overlay\s*\{[\s\S]*?padding-top:\s*8px/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-intro-overlay\s*\{[\s\S]*?justify-content:\s*center/,
    );
    expect(cssSrc).not.toMatch(
      /\.tutorial-intro-overlay\s*\{[\s\S]*?padding-left:\s*72px/,
    );
    expect(cssSrc).not.toMatch(
      /\.tutorial-intro-overlay\s*\{[\s\S]*?padding-top:\s*clamp\(118px/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-intro-card\s*\{[\s\S]*?width:\s*fit-content/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-intro-card\s*\{[\s\S]*?max-width:\s*min\(188px/,
    );
  });
});
