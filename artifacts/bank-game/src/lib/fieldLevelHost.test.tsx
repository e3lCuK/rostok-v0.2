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

  it("XP popup sits under level «УРОВЕНЬ», before the vault", () => {
    expect(pageSrc).toContain("data-field-level-xp-popup");
    expect(pageSrc).toContain("field-level-xp-popup");
    expect(pageSrc).toContain("data-field-level-badge-stack");
    const stackIdx = pageSrc.indexOf("data-field-level-badge-stack");
    const xpIdx = pageSrc.indexOf("data-field-level-xp-popup");
    const vaultIdx = pageSrc.indexOf("<VaultWidget");
    expect(stackIdx).toBeGreaterThan(-1);
    expect(xpIdx).toBeGreaterThan(stackIdx);
    expect(vaultIdx).toBeGreaterThan(xpIdx);
    expect(cssSrc).toContain(".field-level-badge-stack");
    expect(cssSrc).toMatch(
      /\.field-level-xp-popup\s*\{[^}]*top:\s*calc\(100%\s*\+\s*1px\)/s,
    );
    // Cream pill like apple / income; exit goes up (y: -4), not down.
    expect(cssSrc).toMatch(
      /\.field-level-xp-popup\s*\{[^}]*background:\s*rgba\(255,\s*248,\s*236/s,
    );
    expect(pageSrc).toContain("exit={{ opacity: 0, y: -4");
    expect(pageSrc).not.toContain("y: 18");
    // Star icon stays in the XP flash (same family as apple / income icons).
    expect(pageSrc).toContain('data-xp-popup-star="true"');
    expect(pageSrc).toContain("<Star");
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
