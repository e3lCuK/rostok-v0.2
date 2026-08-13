import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveTreeStageSwapDelayMs,
  TREE_STAGE_CROSSFADE_S,
  TREE_STAGE_SWAP_AFTER_MM_MS,
} from "./treeStageTransition";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");

describe("tree stage transition after growth mm", () => {
  it("defers stage swap while growth anim / mm accrual is playing", () => {
    expect(resolveTreeStageSwapDelayMs({ growthAnimActive: true })).toBe(
      TREE_STAGE_SWAP_AFTER_MM_MS,
    );
    expect(resolveTreeStageSwapDelayMs({ growthAnimActive: false })).toBe(0);
    expect(TREE_STAGE_SWAP_AFTER_MM_MS).toBeGreaterThanOrEqual(1400);
    expect(pageSrc).toContain("resolveTreeStageSwapDelayMs");
    expect(pageSrc).toContain("showGrowthAnimRef");
  });

  it("crossfades stages without emptying the wrap (no mode=wait / opacity-0 hold)", () => {
    expect(TREE_STAGE_CROSSFADE_S).toBeLessThanOrEqual(0.35);
    expect(pageSrc).toContain('data-tree-stage-swap="true"');
    expect(pageSrc).toContain("tree-stage-layer");
    expect(pageSrc).toContain("TREE_STAGE_CROSSFADE_S");
    // Old path: wait-for-exit + long opacity:0 left a blank trunk for ~1s.
    const treeBlock =
      pageSrc.match(
        /data-tree-stages-hit[\s\S]*?<TreeSVG stage=\{currentStage\}/,
      )?.[0] ?? "";
    expect(treeBlock).not.toContain('mode="wait"');
    expect(cssSrc).toContain(".tree-stage-swap");
    expect(cssSrc).toContain(".tree-stage-layer");
    expect(cssSrc).not.toMatch(
      /\.tree-wrapper\.transitioning\s*\{[^}]*opacity:\s*0/s,
    );
  });
});
