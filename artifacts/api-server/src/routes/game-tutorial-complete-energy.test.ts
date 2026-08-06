import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const gameRouteSrc = readFileSync(join(here, "game.ts"), "utf8");

describe("POST /game/tutorial/complete energy boundary", () => {
  it("marks tutorial done and resets Economy v2 generation clock", () => {
    expect(gameRouteSrc).toContain("tutorial_done = TRUE");
    expect(gameRouteSrc).toContain("v2_energy_anchor_at = $2");
    expect(gameRouteSrc).toContain("v2_root_generation_progress = 0");
    expect(gameRouteSrc).toContain("v2_root_ready_mask = '0'");
    // Collected Care bank must not be wiped on tutorial finish.
    const completeBlock = gameRouteSrc.slice(
      gameRouteSrc.indexOf("POST /game/tutorial/complete"),
      gameRouteSrc.indexOf("POST /api/game/accrue"),
    );
    expect(completeBlock).not.toContain("v2_energy_seconds");
  });

  it("new accounts start with tutorial_done FALSE", () => {
    expect(gameRouteSrc).toMatch(
      /INSERT INTO game_state[\s\S]*tutorial_done\)[\s\S]*FALSE/,
    );
  });
});
