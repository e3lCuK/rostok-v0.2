import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(resolve(root, "bank.css"), "utf8");
const achSrc = readFileSync(resolve(root, "components/AchievementsModal.tsx"), "utf8");
const lvlSrc = readFileSync(resolve(root, "components/LevelWidget.tsx"), "utf8");

describe("Level modal embeds achievements; no bottom nav", () => {
  it("removes bottom nav chrome from GamePage", () => {
    expect(pageSrc).not.toContain("game-bottom-nav");
    expect(pageSrc).not.toContain("game-nav-h-divider");
    expect(pageSrc).not.toContain("setShowAchievements");
    expect(pageSrc).not.toContain("<Medal");
  });

  it("level modal shows level progress then AchievementsPanel", () => {
    expect(pageSrc).toContain("AchievementsPanel");
    expect(pageSrc).toContain("xp-level-achievements");
    expect(pageSrc).toContain("xp-level-achievements-title");
    expect(pageSrc).toContain("showLevelModal");
    expect(achSrc).toContain("export function AchievementsPanel");
    expect(achSrc).toContain('data-achievements-panel="true"');
  });

  it("pending achievements surface on LevelWidget", () => {
    expect(pageSrc).toContain("pendingAchievements={hasPendingAchievements}");
    expect(lvlSrc).toContain("pendingAchievements");
    expect(lvlSrc).toContain("lvl-badge-ach-dot");
    expect(cssSrc).toContain(".lvl-badge-ach-dot");
  });

  it("level diamond uses thin flask-style rim + cream shell", () => {
    expect(lvlSrc).toContain("const SW = 1.05");
    expect(lvlSrc).toContain("#2f5c0e");
    expect(lvlSrc).toContain('rgba(255, 248, 236, 0.92)');
    expect(lvlSrc).toContain("vectorEffect=\"non-scaling-stroke\"");
    expect(lvlSrc).not.toContain("drop-shadow(0 0 10px");
  });

  it("tutorial achievement «Пройти обучение» + blink after dismiss", () => {
    expect(achSrc).toContain('id: "tutorial_1"');
    expect(achSrc).toContain("Пройти обучение");
    expect(achSrc).toContain('countKey: "tutorial_done"');
    expect(achSrc).toMatch(/tutorial_1[\s\S]*?reward:\s*1/);
    expect(pageSrc).toContain("checkPendingAchievements()");
    expect(pageSrc).toMatch(
      /handleTutorialDismiss[\s\S]*?checkPendingAchievements\(\)/,
    );
    expect(pageSrc).toMatch(
      /useEffect\(\(\) => \{\s*if \(!tutorialDone\) return;\s*checkPendingAchievements\(\);/,
    );
  });
});
