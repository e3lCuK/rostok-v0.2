/**
 * Tutorial welcome + root-pulse visuals (no mechanics changes).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  nextV3TutorialStepAfterRootTransfer,
  tutorialHighlightRoot,
  v3TutorialOverlayConfig,
} from "./tutorialFlow";
import { isV3TutorialActivitiesInteractionLocked } from "./tutorialFlow";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
const rootSrc = readFileSync(
  join(here, "../components/v2/EconomyV3RootSystem.tsx"),
  "utf8",
);

describe("tutorial v3 welcome + root pulse visuals", () => {
  it("1–2. welcome title and tree icon (same asset as complete)", () => {
    expect(pageSrc).toContain(">Ухаживайте за деревом<");
    expect(pageSrc).not.toContain("Как ухаживать за деревом");
    expect(pageSrc).not.toContain(">Уход за деревом<");
    expect(pageSrc).toMatch(
      /tutorial-welcome-icon[^>]*>🌳<\/span>/,
    );
    expect(pageSrc).toMatch(
      /tutorial-complete-icon[^>]*>🌳<\/span>/,
    );
    expect(pageSrc).not.toMatch(
      /tutorial-welcome-icon[\s\S]{0,120}<TreePine/,
    );
    expect(pageSrc).not.toMatch(
      /tutorial-welcome-icon[\s\S]{0,120}<Shovel/,
    );
    expect(pageSrc).not.toMatch(
      /tutorial-welcome-icon[^>]*>\s*🌱/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-icon\s*\{[\s\S]*?font-size:\s*2\.8rem/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-complete-icon\s*\{[\s\S]*?font-size:\s*2\.8rem/,
    );
  });

  it("3–4. copy uses «активности»; welcome text centered; activity rows aligned", () => {
    expect(pageSrc).toContain("затем пройдите активности ухода");
    expect(pageSrc).not.toContain("три активности ухода");
    expect(pageSrc).not.toContain("мини-активности");
    expect(pageSrc).toContain("Три вида активности");
    expect(pageSrc).not.toContain("Три вида ухода");
    expect(pageSrc).toContain("Полив — ловить капли");
    expect(pageSrc).toContain("Освещение — собирать лучи");
    expect(pageSrc).toContain("Удобрение — собирать гранулы в ряд");
    expect(pageSrc).toContain('tutorial-welcome-game-icon');
    expect(pageSrc).toContain("FertilizerIcon size={22} filled={false}");
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-desc\s*\{[\s\S]*?text-align:\s*center/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-card\s*\{[\s\S]*?text-align:\s*center/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-title\s*\{[\s\S]*?text-align:\s*center/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-game-icon\s*\{[\s\S]*?width:\s*28px/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-game-row\s*\{[\s\S]*?gap:\s*10px/,
    );
  });

  it("5–7. root steps have no overlay card / icons / rectangular outline", () => {
    for (const step of [
      "intro",
      "v3-root-water",
      "v3-root-sun",
      "v3-root-fertilizer",
    ] as const) {
      expect(v3TutorialOverlayConfig(step)).toBeNull();
    }
    expect(cssSrc).toMatch(
      /\.v3-root--tutorial-pulse\s*\{[\s\S]*?outline:\s*none/,
    );
    expect(cssSrc).not.toMatch(
      /\.v3-root--tutorial-pulse\s*\{[^}]*outline:\s*2px solid/,
    );
    expect(cssSrc).not.toMatch(
      /\.game-area--v3-roots \.v3-root--tutorial-pulse\s*\{[^}]*outline:\s*2px solid/,
    );
  });

  it("8–10. pulse only on highlighted root; advances / clears with steps", () => {
    expect(tutorialHighlightRoot("v3-root-water")).toBe("water");
    expect(tutorialHighlightRoot("v3-root-sun")).toBe("sun");
    expect(tutorialHighlightRoot("v3-root-fertilizer")).toBe("fertilizer");
    expect(tutorialHighlightRoot("v3-activities-intro")).toBeNull();
    expect(nextV3TutorialStepAfterRootTransfer("water")).toBe("v3-root-sun");
    expect(nextV3TutorialStepAfterRootTransfer("sun")).toBe(
      "v3-root-fertilizer",
    );
    expect(nextV3TutorialStepAfterRootTransfer("fertilizer")).toBe(
      "v3-activities-intro",
    );
    expect(rootSrc).toContain("tutorialHighlightRoot === kind && clickable");
    expect(rootSrc).toContain("v3-root--tutorial-pulse");
    expect(cssSrc).toMatch(
      /\.v3-root--tutorial-pulse \.v3-root-segments\s*\{[\s\S]*?v3-root-tut-seg-glow/,
    );
  });

  it("11. activities stay locked during root steps", () => {
    expect(isV3TutorialActivitiesInteractionLocked("v3-root-water", false)).toBe(
      true,
    );
    expect(isV3TutorialActivitiesInteractionLocked("v3-root-sun", false)).toBe(
      true,
    );
    expect(
      isV3TutorialActivitiesInteractionLocked("v3-root-fertilizer", false),
    ).toBe(true);
    expect(
      isV3TutorialActivitiesInteractionLocked("v3-activities-intro", false),
    ).toBe(false);
  });

  it("12. reduced-motion uses static brighter segments", () => {
    expect(cssSrc).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?\.v3-root--tutorial-pulse \.v3-root-segments[\s\S]*?animation:\s*none[\s\S]*?brightness\(1\.14\)/,
    );
  });

  it("13. non-tutorial root chrome unchanged (no forced pulse class)", () => {
    expect(rootSrc).toContain('tutorialPulse ? "v3-root--tutorial-pulse" : ""');
    expect(pageSrc).toContain(
      "!tutorialDone ? tutorialHighlightRoot(tutorialStep) : null",
    );
  });
});
