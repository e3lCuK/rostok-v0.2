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
});
