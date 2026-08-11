/**
 * Tutorial achievement «Пройти обучение» — reward + unlock signal.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const gameSrc = readFileSync(join(here, "game.ts"), "utf8");

describe("tutorial achievement on game routes", () => {
  it("defines tutorial_1 reward (+1 apple) and threshold on tutorial_done", () => {
    expect(gameSrc).toMatch(/tutorial_1:\s*1/);
    expect(gameSrc).toContain(
      'tutorial_1:   { field: "tutorial_done",     threshold: 1 }',
    );
    expect(gameSrc).toContain("tutorialDoneCount");
    expect(gameSrc).toContain("tutorial_done: tutorialDoneCount(g.tutorial_done)");
  });

  it("GET /achievements selects tutorial_done", () => {
    expect(gameSrc).toMatch(
      /SELECT[\s\S]*tutorial_done[\s\S]*FROM game_state/,
    );
  });
});
