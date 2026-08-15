import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  findGeneratingSectionIndex,
  formatRootTimer,
  getNextCollectableSectionIndex,
  isSectionReady,
  normalizeV2Roots,
  parseReadyMask,
  resolveGeneratingProgress,
  resolveRootTimerDisplay,
  resolveSectionVisualState,
  rootHasReadySection,
  rootIndexForSection,
  sectionInRoot,
  V2_ROOT_COUNT,
  V2_ROOT_SECTION_COUNT,
  V2_SECTIONS_PER_ROOT,
} from "./v2Roots";
import { TUTORIAL_ACTIVITY_DURATION_SEC } from "./tutorialFlow";
import { ENABLE_ECONOMY_V2_ROOT_COLLECTION } from "./featureFlags";
import { canStartV2Care, V2_CARE_MIN_START_SECONDS } from "./economyV2CareClient";
import RootEnergySystem from "@/components/v2/RootEnergySystem";
import { createElement } from "react";

describe("v2Roots mask mapping", () => {
  it("has 4 roots × 15 = 60 sections", () => {
    expect(V2_ROOT_COUNT).toBe(4);
    expect(V2_SECTIONS_PER_ROOT).toBe(15);
    expect(V2_ROOT_SECTION_COUNT).toBe(60);
  });

  it("maps section indices to root groups", () => {
    expect(rootIndexForSection(0)).toBe(0);
    expect(rootIndexForSection(14)).toBe(0);
    expect(rootIndexForSection(15)).toBe(1);
    expect(rootIndexForSection(45)).toBe(3);
    expect(sectionInRoot(17)).toBe(2);
  });

  it("readyMask bits map to sections (incl. high bits)", () => {
    const mask = (1n << 2n) | (1n << 5n) | (1n << 7n) | (1n << 55n);
    expect(isSectionReady(mask, 2)).toBe(true);
    expect(isSectionReady(mask, 5)).toBe(true);
    expect(isSectionReady(mask, 7)).toBe(true);
    expect(isSectionReady(mask, 55)).toBe(true);
    expect(isSectionReady(mask, 3)).toBe(false);
    expect(parseReadyMask(mask.toString(10))).toBe(mask);
  });

  it("holes stay empty after normalize", () => {
    const mask = ((1n << 15n) - 1n) & ~((1n << 2n) | (1n << 5n) | (1n << 7n));
    const roots = normalizeV2Roots({
      readyMask: mask.toString(10),
      readyCount: 12,
      generationProgress: 0.2,
      secondsPerSection: 720,
      secondsUntilNextSection: 100,
      isFull: false,
    });
    const parsed = parseReadyMask(roots.readyMask);
    expect(isSectionReady(parsed, 2)).toBe(false);
    expect(isSectionReady(parsed, 5)).toBe(false);
    expect(isSectionReady(parsed, 7)).toBe(false);
    expect(isSectionReady(parsed, 0)).toBe(true);
  });

  it("formats timer without fractional display", () => {
    expect(formatRootTimer(702)).toBe("11:42");
    expect(formatRootTimer(0)).toBe("0:00");
    expect(formatRootTimer(720)).toBe("12:00");
    // Fresh cycle must not ceil past the cycle cap (12:01 glitch).
    expect(formatRootTimer(720.01, 720)).toBe("12:00");
    expect(formatRootTimer(720.9, 720)).toBe("12:00");
  });

  it("collect order within a root is tip → base (14 → 0)", () => {
    // Root 0: ready at 0, 2, 14 → collect tip (14) first
    const mask =
      (1n << 0n) | (1n << 2n) | (1n << 14n) | (1n << 15n) | (1n << 29n);
    expect(getNextCollectableSectionIndex(0, mask)).toBe(14);
    expect(getNextCollectableSectionIndex(1, mask)).toBe(29); // tip of root 1
    expect(rootHasReadySection(2, mask)).toBe(false);
    expect(getNextCollectableSectionIndex(2, mask)).toBeNull();

    // After tip cleared, next is highest remaining in-root index
    const withoutTip = mask & ~(1n << 14n);
    expect(getNextCollectableSectionIndex(0, withoutTip)).toBe(2);
  });

  it("resolveRootTimerDisplay covers countdown / hidden (no pause text)", () => {
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        capital: 100_000,
        secondsUntilNext: 720,
        secondsPerSection: 720,
        tutorialDone: false,
      }),
    ).toEqual({ kind: "hidden" });
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        capital: 100_000,
        secondsUntilNext: 720,
        secondsPerSection: 720,
        tutorialDone: true,
      }),
    ).toMatchObject({ kind: "countdown", seconds: 720, timeLabel: "12:00" });
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        capital: 100_000,
        secondsUntilNext: 720,
        secondsPerSection: 720,
      }),
    ).toMatchObject({
      kind: "countdown",
      timeLabel: "12:00",
      seconds: 720,
      barProgress: 0,
      pulse: false,
    });
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        capital: 100_000,
        secondsUntilNext: -5,
        secondsPerSection: 720,
      }),
    ).toMatchObject({
      kind: "countdown",
      seconds: 0,
      timeLabel: "0:00",
      barProgress: 1,
    });
    expect(
      resolveRootTimerDisplay({
        isFull: true,
        capital: 100_000,
        secondsUntilNext: 0,
      }),
    ).toEqual({ kind: "hidden" });
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        capital: 0,
        secondsUntilNext: 100,
      }),
    ).toEqual({ kind: "hidden" });
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        storageFull: true,
        capital: 100_000,
        secondsUntilNext: null,
        secondsPerSection: 720,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("normalizeV2Roots keeps server storage fields as source of truth", () => {
    const n = normalizeV2Roots({
      readyMask: "31",
      readyCount: 5,
      generationProgress: 0.25,
      secondsPerSection: 720,
      secondsUntilNextSection: null,
      isFull: false,
      storageFull: true,
      storageOccupied: 60,
      storageFree: 0,
      storageOverCapacity: false,
    });
    expect(n.storageFull).toBe(true);
    expect(n.storageOccupied).toBe(60);
    expect(n.secondsUntilNextSection).toBeNull();
    expect(n.readyCount).toBe(5);
  });
});

describe("generating section / progress", () => {
  it("generating is first free bit (backend order)", () => {
    expect(findGeneratingSectionIndex(0n)).toBe(0);
    expect(findGeneratingSectionIndex(0b11111n)).toBe(5);
    // hole at 2 among first bits
    const withHole = 0b11011n; // bits 0,1,3,4
    expect(findGeneratingSectionIndex(withHole)).toBe(2);
  });

  it("no generating when full", () => {
    let full = 0n;
    for (let i = 0; i < 60; i++) full |= 1n << BigInt(i);
    expect(findGeneratingSectionIndex(full)).toBeNull();
  });

  it("resolveSectionVisualState maps empty/generating/ready/collecting", () => {
    const mask = 0b11n; // 0,1 ready
    expect(
      resolveSectionVisualState({
        sectionIndex: 0,
        readyMask: mask,
        generatingSectionIndex: 2,
        collectingSectionIndex: null,
      }),
    ).toBe("ready");
    expect(
      resolveSectionVisualState({
        sectionIndex: 2,
        readyMask: mask,
        generatingSectionIndex: 2,
        collectingSectionIndex: null,
      }),
    ).toBe("generating");
    expect(
      resolveSectionVisualState({
        sectionIndex: 3,
        readyMask: mask,
        generatingSectionIndex: 2,
        collectingSectionIndex: null,
      }),
    ).toBe("empty");
    expect(
      resolveSectionVisualState({
        sectionIndex: 0,
        readyMask: mask,
        generatingSectionIndex: 2,
        collectingSectionIndex: 0,
      }),
    ).toBe("collecting");
  });

  it("resolveGeneratingProgress prefers timer-derived fill", () => {
    expect(
      resolveGeneratingProgress({
        generationProgress: 0.1,
        secondsUntilNextSection: 360,
        secondsPerSection: 720,
      }),
    ).toBeCloseTo(0.5, 9);
    expect(
      resolveGeneratingProgress({
        generationProgress: 0.25,
        secondsUntilNextSection: null,
        secondsPerSection: 720,
      }),
    ).toBeCloseTo(0.25, 9);
  });
});

describe("Root art centerline lock", () => {
  it("major art paths stay identical to section centerlines", async () => {
    const { ROOT_ART_STROKES, ROOT_ART_MAJOR_CENTERLINE_IDS } = await import(
      "@/components/v2/rootArtCatalog"
    );
    const { MAJOR_MOCK_BRANCH_CATALOG } = await import(
      "@/components/v2/rootMajorMockBranches"
    );
    for (const { artId, catalogId } of ROOT_ART_MAJOR_CENTERLINE_IDS) {
      const art = ROOT_ART_STROKES.find((s) => s.id === artId);
      const catalog = MAJOR_MOCK_BRANCH_CATALOG.find((b) => b.id === catalogId);
      expect(art?.d).toBe(catalog?.d);
    }
  });

  it("has exactly four majors sharing one trunk origin; no junction wedge", async () => {
    const { ROOT_TRUNK_OVERLAP_PX } = await import(
      "@/components/v2/rootArtCatalog"
    );
    const { MAJOR_MOCK_BRANCH_CATALOG } = await import(
      "@/components/v2/rootMajorMockBranches"
    );
    expect(MAJOR_MOCK_BRANCH_CATALOG).toHaveLength(4);
    expect(ROOT_TRUNK_OVERLAP_PX).toBeGreaterThanOrEqual(1);
    for (const branch of MAJOR_MOCK_BRANCH_CATALOG) {
      expect(branch.d.startsWith("M 100 1")).toBe(true);
    }

    const masks = ["0", "1", "32767", ((1n << 60n) - 1n).toString(10)];
    for (const readyMask of masks) {
      const html = renderToStaticMarkup(
        createElement(RootEnergySystem, { readyMask, artMode: true }),
      );
      expect(html.match(/data-root-kind="major"/g)?.length).toBe(4);
      expect(html).not.toContain("v2-root-junction");
      expect(html).not.toContain("data-root-junction");
      expect(html).not.toContain("v2-root-flare");
      expect(html).toContain('data-origin-x="100"');
      expect(html).toContain('data-origin-y="4"');
    }
  });
});

describe("RootEnergySystem markup", () => {
  it("renders 4×15 visible sections + hits + chest", () => {
    // first 5 ready → generating = 5
    const mask = 0b11111n;
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: mask.toString(10),
        generatingProgress: 0.5,
      }),
    );
    expect(html).toContain('data-art-mode="true"');
    expect(html).toContain("v2-capital-chest");
    expect(html).toContain('data-capital-chest="true"');
    expect(html).toContain('viewBox="0 0 200 88"');
    expect(html).not.toContain("v2-root-flare");
    expect(html).not.toContain("v2-root-junction");
    expect(html).not.toContain("data-root-junction");
    expect(html).not.toContain("v2-root-art-layer--back");
    expect(html).not.toContain('data-root-kind="secondary"');
    expect(html).not.toContain('data-root-kind="tip"');
    expect(html).not.toContain("v2-root-section--hit-only");
    expect(html.match(/data-root-kind="major"/g)?.length).toBe(4);
    expect(html.match(/data-section-visual="true"/g)?.length).toBe(60);
    expect(html.match(/data-root-hit="/g)?.length).toBe(4);
    expect(html).toContain('data-section-state="ready"');
    expect(html).toContain('data-section-state="empty"');
    expect(html).toContain('data-section-state="generating"');
    expect(html).toContain('data-section-index="5"');
    expect(html).toContain("v2-root-section--ready");
    expect(html).toContain("v2-root-section--empty");
    expect(html).toContain("v2-root-section--generating");
    expect(html).toContain("4:15:60");
    // light empty + dark ready colors present
    expect(html).toContain("#c9a878");
    expect(html).toContain("#7a4e2c");
    // hit strokes are transparent with pointer-events on ready roots
    expect(html).toContain('stroke="transparent"');
    expect(html).toContain('pointer-events="stroke"');
    expect(html).toContain('stroke-width="28"');
  });

  it("maps sectionIndex ranges per root (0–14 … 45–59)", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: "0",
        generatingProgress: 0,
      }),
    );
    expect(html).toMatch(/data-root="0"[\s\S]*?data-section-index="0"/);
    expect(html).toMatch(/data-section-index="14"/);
    expect(html).toMatch(/data-section-index="15"/);
    expect(html).toMatch(/data-section-index="45"/);
    expect(html).toMatch(/data-section-index="59"/);
  });

  it("shows 4 majors + chest without readyMask (mock path)", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, { artMode: true }),
    );
    expect(html).toContain('data-art-mode="true"');
    expect(html).toContain('data-capital-chest="true"');
    expect(html.match(/data-root-kind="major"/g)?.length).toBe(4);
    expect(html).not.toContain('data-root-kind="secondary"');
    expect(html).not.toContain("v2-root-section--hit-only");
  });

  it("holes do not collapse — collected section stays empty among ready", () => {
    // ready 0,1,3,4 — hole at 2
    const mask = 0b11011n;
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: mask.toString(10),
        generatingProgress: 0.3,
      }),
    );
    // section 2 must be generating (first hole), not shifted
    expect(html).toMatch(
      /data-section-index="2"[^>]*data-section-state="generating"[^>]*data-section-visual="true"/,
    );
    expect(html).toMatch(
      /data-section-index="0"[^>]*data-section-state="ready"[^>]*data-section-visual="true"/,
    );
    expect(html).toMatch(
      /data-section-index="3"[^>]*data-section-state="ready"[^>]*data-section-visual="true"/,
    );
  });

  it("collecting overrides only the selected section", () => {
    const mask = 0b111n;
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: mask.toString(10),
        collectingSectionIndices: new Set([1]),
      }),
    );
    expect(html).toMatch(
      /data-section-index="1"[^>]*data-section-state="collecting"[^>]*data-section-visual="true"/,
    );
    expect(html).toMatch(
      /data-section-index="0"[^>]*data-section-state="ready"[^>]*data-section-visual="true"/,
    );
    expect(html).toMatch(
      /data-section-index="2"[^>]*data-section-state="ready"[^>]*data-section-visual="true"/,
    );
  });

  it("whole-root hit is clickable only when the root has ready sections", () => {
    const mask = 0b1n; // only section 0 ready → root 0 clickable
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: mask.toString(10),
        generatingProgress: 0.2,
      }),
    );
    expect(html).toMatch(
      /data-root-hit="0"[^>]*data-root-has-ready="true"[\s\S]*?pointer-events="stroke"/,
    );
    expect(html).toMatch(
      /data-root-hit="1"[^>]*data-root-has-ready="false"[\s\S]*?pointer-events="none"/,
    );
  });
});

describe("section stroke taper", () => {
  it("base sections are thicker than tip sections", async () => {
    const { sectionStrokeWidthFactor } = await import("./v2Roots");
    expect(sectionStrokeWidthFactor(0)).toBe(1);
    expect(sectionStrokeWidthFactor(1)).toBe(0.98);
    expect(sectionStrokeWidthFactor(7)).toBe(0.76);
    expect(sectionStrokeWidthFactor(14)).toBe(0.46);
    expect(sectionStrokeWidthFactor(0)).toBeGreaterThan(sectionStrokeWidthFactor(14));
  });
});

describe("root section polish palette / gaps", () => {
  it("uses warm wood empty and darker ready from central palette", async () => {
    const { V2_ROOT_EMPTY_COLOR, V2_ROOT_READY_COLOR } = await import(
      "./v2RootColors"
    );
    expect(V2_ROOT_EMPTY_COLOR).toBe("#c9a878");
    expect(V2_ROOT_READY_COLOR).toBe("#7a4e2c");
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: "1",
        generatingProgress: 0.4,
      }),
    );
    expect(html).toContain(V2_ROOT_EMPTY_COLOR);
    expect(html).toContain(V2_ROOT_READY_COLOR);
  });

  it("keeps a readable dash gap (~28%)", async () => {
    const { ROOT_SECTION_VISUAL_RATIO } = await import("./v2Roots");
    expect(ROOT_SECTION_VISUAL_RATIO).toBeGreaterThanOrEqual(0.7);
    expect(ROOT_SECTION_VISUAL_RATIO).toBeLessThanOrEqual(0.76);
  });

  it("chest does not capture pointer events", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: "1",
        capital: 1000,
      }),
    );
    expect(html).toMatch(/v2-capital-chest[^>]*pointer-events="none"/);
  });

  it("hit-layer appears after visual sections in markup", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, { readyMask: "1" }),
    );
    const visualAt = html.indexOf('data-section-visual="true"');
    const hitLayerAt = html.indexOf('class="v2-root-hit-layer"');
    const hitAt = html.indexOf('data-root-hit="');
    expect(visualAt).toBeGreaterThan(-1);
    expect(hitLayerAt).toBeGreaterThan(visualAt);
    expect(hitAt).toBeGreaterThan(hitLayerAt);
  });

  it("buildReadyMaskFromSections sets exact bits without collapsing holes", async () => {
    const { buildReadyMaskFromSections, isSectionReady, parseReadyMask } =
      await import("./v2Roots");
    const mask = parseReadyMask(buildReadyMaskFromSections([0, 2, 5]));
    expect(isSectionReady(mask, 0)).toBe(true);
    expect(isSectionReady(mask, 1)).toBe(false);
    expect(isSectionReady(mask, 2)).toBe(true);
    expect(isSectionReady(mask, 5)).toBe(true);
  });
});

describe("Care gate / Tutorial / flags", () => {
  it("Care uses collected bank only", () => {
    expect(canStartV2Care(4)).toBe(false);
    expect(canStartV2Care(15)).toBe(true);
    expect(V2_CARE_MIN_START_SECONDS).toBe(15);
  });

  it("tutorial duration stays 10", () => {
    expect(TUTORIAL_ACTIVITY_DURATION_SEC).toBe(10);
  });

  it("root collection flag is boolean", () => {
    expect(typeof ENABLE_ECONOMY_V2_ROOT_COLLECTION).toBe("boolean");
  });
});

describe("collect API contract", () => {
  it("api.collectV2RootSection posts sectionIndex", async () => {
    const { api } = await import("./api");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        collected: true,
        collectedSectionIndex: 3,
        energySeconds: 5,
        roots: {
          readyMask: "0",
          readyCount: 0,
          generationProgress: 0,
          secondsPerSection: 720,
          secondsUntilNextSection: 700,
          isFull: false,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await api.collectV2RootSection(3);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      sectionIndex: 3,
    });
    vi.unstubAllGlobals();
  });
});
