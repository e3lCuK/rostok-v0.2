import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(resolve(root, "bank.css"), "utf8");

describe("field level host (top-left of play field)", () => {
  it("LevelWidget is mounted on the play field", () => {
    expect(pageSrc).toContain('data-field-level-host="true"');
    expect(pageSrc).toContain("<LevelWidget");
    expect(pageSrc).not.toContain("game-topbar-col-mid");
    expect(pageSrc).not.toContain("game-left-widgets");
    expect(pageSrc).not.toContain('className="game-top-bar"');

    const fieldIdx = pageSrc.indexOf('data-field-level-host="true"');
    const levelIdx = pageSrc.indexOf("<LevelWidget");
    const gameAreaIdx = pageSrc.indexOf("PLAY FIELD");
    expect(fieldIdx).toBeGreaterThan(gameAreaIdx);
    expect(levelIdx).toBeGreaterThan(fieldIdx);
  });

  it("XP popup is anchored to the field level host", () => {
    expect(pageSrc).toContain("data-field-level-xp-popup");
    expect(pageSrc).toContain("field-level-xp-popup");
  });

  it("CSS pins host to top-left of game-area", () => {
    expect(cssSrc).toContain(".field-level-host");
    expect(cssSrc).toMatch(/\.field-level-host\s*\{[^}]*top:\s*6px/s);
    expect(cssSrc).toMatch(/\.field-level-host\s*\{[^}]*left:\s*2px/s);
  });

  it("settings gear floats on the field (no topbar)", () => {
    expect(pageSrc).toContain('data-field-settings="true"');
    expect(pageSrc).not.toContain("data-topbar-settings");
  });
});
