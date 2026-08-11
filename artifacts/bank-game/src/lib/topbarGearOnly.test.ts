import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const css = readFileSync(join(here, "../bank.css"), "utf8");
const bg = readFileSync(join(here, "../components/GameAreaBg.tsx"), "utf8");

describe("Stage 1 — no top nav; floating gear only", () => {
  it("1. no legacy status labels", () => {
    expect(page).not.toContain('"Готова"');
    expect(page).not.toContain("Мало энергии");
    expect(page).not.toContain("Можно начать");
    expect(page).not.toContain('"В процессе"');
    expect(page).not.toContain("Перезарядка");
    expect(page).not.toContain("Заберите награду");
    expect(page).not.toContain("Осталось:");
  });

  it("2. battery is not rendered", () => {
    expect(page).not.toContain("battery-svg");
    expect(css).not.toContain(".battery-svg");
  });

  it("3. SettingsWidget still renders", () => {
    expect(page).toContain("<SettingsWidget");
    expect(page).toContain('from "@/components/SettingsWidget"');
  });

  it("4. gear remains clickable on the play field", () => {
    expect(page).toContain('data-settings-gear="true"');
    expect(page).toContain('data-field-settings="true"');
    expect(page).toContain("setShowSettings");
    expect(page).toContain("game-gear-btn");
    // Cream shell, no rim (same language as the eye control).
    expect(css).toMatch(/\.game-gear-btn\s*\{[\s\S]*?border:\s*none/);
    expect(css).toMatch(/\.settings-action-btn\s*\{[\s\S]*?border:\s*none/);
    expect(page).toContain("strokeWidth={2.25}");
  });

  it("5. Care v2 start/claim paths remain in GamePage", () => {
    expect(page).toContain("ENABLE_ECONOMY_V2_CARE");
    expect(page).toContain("startV2Care");
    expect(page).toContain("claimAll");
    expect(page).toContain("handleGoToRewards");
  });

  it("6. Tutorial flow remains", () => {
    expect(page).toContain("tutorialDone");
    expect(page).toContain("tutorialStep");
    expect(page).toContain("tutorial-welcome");
  });

  it("7. top nav bar is removed; sky extends under floating gear", () => {
    expect(page).not.toContain('className="game-top-bar"');
    expect(page).not.toContain("data-topbar-settings");
    expect(page).not.toContain("game-topbar-col-settings");
    expect(page).not.toContain("game-session-status");
    expect(css).not.toContain(".game-session-status");
    expect(css).not.toContain(".session-status-badge");
    expect(css).toContain(".game-top-controls");
    expect(css).toMatch(
      /\.game-area\s*\{[^}]*linear-gradient\(180deg,\s*#b7dff5/s,
    );
  });

  it("8. sun right; clouds clear of level-badge lane", () => {
    expect(bg).toContain('className="bg-sun"');
    expect(bg).toContain("<BgSun cx={292} cy={22}");
    expect(bg).toContain('className="bg-cloud-left"');
    expect(bg).toContain("ox={130} oy={22}");
    expect(bg).toContain('className="bg-cloud-right"');
    expect(bg).toContain("ox={220} oy={20}");
    expect(bg).toContain("bg-sky-wash");
    expect(bg).not.toContain('cy="65"');
    expect(bg).not.toContain('y2="-3"');
    expect(css).toMatch(/bg-cloud-drift-left[\s\S]*translateX\(36px\)/);
    expect(css).toMatch(/bg-cloud-drift-right[\s\S]*translateX\(-28px\)/);
  });
});

