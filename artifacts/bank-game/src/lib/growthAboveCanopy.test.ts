import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STAGE_DIMS } from "@/components/TreeSVG";
import {
  GROWTH_ABOVE_CANOPY_GAP_PX,
  growthAboveHostBottomPx,
  treeCanopyHeightPx,
} from "./growthAboveCanopy";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");

describe("growth timer / +мм above canopy", () => {
  it("keeps a constant gap above each stage canopy height", () => {
    for (let stage = 0; stage <= 4; stage++) {
      expect(growthAboveHostBottomPx(stage)).toBe(
        STAGE_DIMS[stage][1] + GROWTH_ABOVE_CANOPY_GAP_PX,
      );
      expect(treeCanopyHeightPx(stage)).toBe(STAGE_DIMS[stage][1]);
    }
    expect(growthAboveHostBottomPx(4)).toBeGreaterThan(
      growthAboveHostBottomPx(0),
    );
  });

  it("GamePage hosts pill above tree with stage-aware bottom", () => {
    expect(pageSrc).toContain("growthAboveHostBottomPx");
    expect(pageSrc).toContain('data-growth-side-host="true"');
    expect(pageSrc).toContain("--growth-above-bottom");
    expect(cssSrc).toMatch(
      /\.growth-side-host\s*\{[^}]*left:\s*50%/s,
    );
    expect(cssSrc).toMatch(
      /\.growth-side-host\s*\{[^}]*bottom:\s*var\(--growth-above-bottom/s,
    );
    expect(cssSrc).toMatch(
      /\.growth-side-host\s*\{[^}]*transform:\s*translateX\(-50%\)/s,
    );
    expect(cssSrc).not.toMatch(
      /\.growth-side-host\s*\{[^}]*right:\s*100%/s,
    );
  });
});
