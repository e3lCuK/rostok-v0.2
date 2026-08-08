import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const gameRouteSrc = readFileSync(join(here, "game.ts"), "utf8");

describe("POST /game/tutorial/complete energy boundary", () => {
  it("marks tutorial done and continues v3 generation from tutorial wait", () => {
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
    // Keep tutorial collectibles: starting capital +1₽ / +1 мм / +1 apple.
    expect(completeBlock).toContain("starting_capital");
    expect(completeBlock).toContain("NULLIF(starting_capital, 0)");
    expect(completeBlock).toContain("100000) + 1");
    expect(completeBlock).toContain("active_earned = 1");
    expect(completeBlock).toContain("DELETE FROM income_history");
    expect(completeBlock).toContain("INSERT INTO income_history");
    expect(completeBlock).toMatch(/tree_growth_mm\s*=\s*1/);
    expect(completeBlock).toMatch(/total_apples\s*=\s*1/);
    // v3 clock: client tutorial 12:00 start → same remaining after dismiss.
    expect(completeBlock).toContain("generationAnchorAt");
    expect(completeBlock).toContain("new Date(generationAnchorAt)");
  });

  it("new accounts start with tutorial_done FALSE", () => {
    expect(gameRouteSrc).toMatch(
      /INSERT INTO game_state[\s\S]*tutorial_done\)[\s\S]*FALSE/,
    );
  });
});
