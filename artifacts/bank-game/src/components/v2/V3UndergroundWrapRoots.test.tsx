/**
 * Decorative wrap roots — visual envelope for underground UI.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTreeTrunkColor } from "@/components/TreeSVG";
import { taperWidthFactor } from "@/components/v2/rootTaperGeometry";
import V3UndergroundWrapRoots, {
  buildTrunkShoulderCollarPath,
  buildV3WrapRoots,
  V3_WRAP_ROOTS_VIEW,
} from "@/components/v2/V3UndergroundWrapRoots";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../../bank.css"), "utf8");

describe("V3UndergroundWrapRoots", () => {
  it("builds tapered fill paths for every wrap stroke", () => {
    const roots = buildV3WrapRoots();
    expect(roots.length).toBeGreaterThanOrEqual(12);
    for (const r of roots) {
      expect(r.fillPath.startsWith("M ")).toBe(true);
      expect(r.fillPath.endsWith("Z")).toBe(true);
    }
  });

  it("continuation segments start at the lead tip width (no shoulder step)", () => {
    const majorLead = 11;
    const majorCont = majorLead * taperWidthFactor(1, "trunk-wide");
    expect(majorCont).toBeCloseTo(5.5, 5);
    expect(majorCont * taperWidthFactor(0, "continue")).toBeCloseTo(
      majorCont,
      5,
    );
  });

  it("renders decorative svg with pointer-free data attr", () => {
    const html = renderToStaticMarkup(createElement(V3UndergroundWrapRoots));
    expect(html).toContain('data-v3-underground-wrap-roots="true"');
    expect(html).toContain(`viewBox="0 0 ${V3_WRAP_ROOTS_VIEW.width} ${V3_WRAP_ROOTS_VIEW.height}"`);
    expect(html).toContain("data-wrap-root=");
    expect(html).toContain('data-wrap-root-collar="true"');
    expect(html).toContain('data-v3-wrap-root-system="true"');
    expect(html).not.toContain("data-wrap-root-mini-shoulder");
  });

  it("builds the approved single-arc soft collar", () => {
    const d = buildTrunkShoulderCollarPath();
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.startsWith("M 146.8 -12")).toBe(true);
    expect(d).toContain("C 141.8 -7");
  });

  it("keeps collar + fan in one unclipped wrap-root system group", () => {
    const html = renderToStaticMarkup(createElement(V3UndergroundWrapRoots));
    expect(html).toContain('data-v3-wrap-root-system="true"');
    expect(html).toContain('data-wrap-root-collar="true"');
    expect(html).not.toContain("v3-wrap-roots-below-grass");
  });

  it("matches the tree trunk color for the given stage", () => {
    const stage3 = getTreeTrunkColor(3);
    const html = renderToStaticMarkup(
      createElement(V3UndergroundWrapRoots, { treeStage: 3 }),
    );
    expect(html).toContain(`fill="${stage3}"`);
    expect(html).toContain(`data-wrap-root-color="${stage3}"`);
    expect(stage3).toBe("#6b4423");
  });

  it("is mounted in the v3 underground stack and reaches the grass/trunk line", () => {
    expect(pageSrc).toContain("V3UndergroundWrapRoots");
    expect(pageSrc).toContain("<V3UndergroundWrapRoots treeStage={currentStage}");
    expect(pageSrc).toContain("undergroundWrapRootsWipeAnimate");
    expect(pageSrc).not.toContain("TreeTrunkNeckFillets");
    expect(cssSrc).not.toMatch(/\.tree-trunk-neck-fillets\s*\{/);
    expect(cssSrc).toMatch(
      /\.v3-underground-wrap-roots\s*\{[\s\S]*?pointer-events:\s*none/,
    );
    expect(cssSrc).toMatch(
      /\.v3-underground-wrap-roots\s*\{[\s\S]*?z-index:\s*0/,
    );
    expect(cssSrc).toMatch(
      /\.v3-underground-wrap-wipe\s*\{[\s\S]*?--v3-trunk-join/,
    );
    expect(cssSrc).toMatch(/--v3-trunk-join:\s*calc\(var\(--v2-scene-lift\)/);
  });
});
