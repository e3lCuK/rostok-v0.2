import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EconomyV3RootSystem, {
  V3_SEGMENT_COUNT,
} from "@/components/v2/EconomyV3RootSystem";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import { shouldUseV3ActivityCardUi } from "./v3ActivityCards";
import type { EconomyV3RootsState } from "./api";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const flagsSrc = readFileSync(join(here, "featureFlags.ts"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
const localPanelPath = join(here, "../local/debug-panel.tsx");
let localPanel = "";
try {
  localPanel = readFileSync(localPanelPath, "utf8");
} catch {
  localPanel = "";
}

function sampleV3(
  overrides: Record<string, unknown> = {},
): EconomyV3RootsState {
  const raw = {
    enabled: true,
    dailyCapSeconds: 20,
    dayKey: "2026-07-23",
    roots: {
      water: {
        seconds: 7,
        fullSegments: 1,
        partialSegmentSeconds: 2,
        capacitySeconds: 25,
        fillFraction: 0.28,
        playableFromRoot: true,
        transferred: false,
        frozen: false,
      },
      sun: {
        seconds: 3,
        fullSegments: 0,
        partialSegmentSeconds: 3,
        capacitySeconds: 25,
        fillFraction: 0.12,
        playableFromRoot: true,
        transferred: false,
        frozen: false,
      },
      fertilizer: {
        seconds: 12,
        fullSegments: 2,
        partialSegmentSeconds: 2,
        capacitySeconds: 25,
        fillFraction: 0.48,
        playableFromRoot: true,
        transferred: false,
        frozen: false,
      },
    },
    reserves: {
      water: { seconds: 5, capacitySeconds: 20, playable: true },
      sun: { seconds: 0, capacitySeconds: 20, playable: false },
      fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
    },
    careAvailability: {
      water: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
      sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      fertilizer: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
    },
    careSession: {
      active: false,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      finishedAt: null,
      status: null,
      skill: null,
    },
    careCycle: {
      startedAt: null,
      completedAt: null,
      finishedAt: null,
      status: null,
      allCompleted: false,
      readyToFinish: false,
      totalPresetSeconds: null,
      averageSkill: null,
      activities: {
        water: { completed: false, presetSeconds: null, skill: null },
        sun: { completed: false, presetSeconds: null, skill: null },
        fertilizer: { completed: false, presetSeconds: null, skill: null },
      },
      rewardPreview: {
        available: false,
        xp: 0,
        apples: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
      claim: {
        claimed: false,
        claimedAt: null,
        xp: 0,
        treeGrowth: 0,
        income: { base: 0, bonus: 0, total: 0 },
      },
    },
    generation: {
      anchorAt: null,
      progress: 0,
      frozenAt: null,
      insuranceDeadlineAt: null,
      firstTransferredRoot: null,
      transferredRoots: [],
      secondsUntilNextWholeSecond: null,
      accumulating: true,
    },
    excessGate: {
      ordinaryFull: false,
      rootsFull: false,
      reservesFull: { water: false, sun: false, fertilizer: false },
      generatingExcess: false,
    },
    ...overrides,
  };
  const snap = normalizeEconomyV3RootsSnapshot(raw);
  if (!snap) throw new Error("expected snap");
  return snap;
}

describe("Economy v3 primary roots UI (8C)", () => {
  it("v3 enabled → exactly 3 new roots, each with 5 segments", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem v3Roots={sampleV3()} transferEnabled />,
    );
    expect(html.match(/data-v3-root="/g)?.length).toBe(3);
    expect(html).toContain('data-v3-root="water"');
    expect(html).toContain('data-v3-root="sun"');
    expect(html).toContain('data-v3-root="fertilizer"');
    expect(html.match(/data-v3-segment="/g)?.length).toBe(3 * V3_SEGMENT_COUNT);
  });

  it("v3 enabled → GamePage hides RootEnergyLayer; shows primary v3 anchor", () => {
    expect(pageSrc).toContain("useV3RootsUi");
    expect(pageSrc).toContain('data-v3-roots-primary="true"');
    expect(pageSrc).toContain("<RootEnergyLayer");
    expect(pageSrc).toContain("<EconomyV3RootSystem");
    expect(pageSrc).toContain("CapitalChestUnderRoots");
    expect(pageSrc).toContain('data-v3-capital-chest-host="true"');
    expect(pageSrc).toContain("useV2MockRootsLayer");
    expect(pageSrc).toContain("{useV2MockRootsLayer && <EconomyV2MockLayer />}");
    // v3 roots mount in underground stack; v2 RootEnergyLayer only when !useV3RootsUi
    expect(pageSrc).toContain("!useV3RootsUi &&");
    const v3AnchorIdx = pageSrc.indexOf('data-v3-roots-primary="true"');
    const treeWrapIdx = pageSrc.indexOf("game-tree-wrap");
    expect(v3AnchorIdx).toBeGreaterThan(-1);
    expect(treeWrapIdx).toBeGreaterThan(-1);
    expect(v3AnchorIdx).toBeLessThan(treeWrapIdx);
    const legacyBlock = pageSrc.slice(
      pageSrc.indexOf("8G: exclusive roots"),
      pageSrc.indexOf("8G: exclusive roots") + 2000,
    );
    expect(legacyBlock).toContain("RootEnergyLayer");
    expect(legacyBlock).not.toContain("EconomyV3RootSystem");
  });

  it("v3 disabled/absent → activity cards and legacy roots stay on v2 path", () => {
    expect(shouldUseV3ActivityCardUi(false, null)).toBe(false);
    expect(shouldUseV3ActivityCardUi(true, null)).toBe(false);
    expect(pageSrc).toContain("ENABLE_ECONOMY_V2_ROOT_COLLECTION");
  });

  it("transfer / waiting / transferred remain wired in primary UI", () => {
    expect(pageSrc).toContain("transferEnabled");
    expect(pageSrc).toContain("onTransferred");
    expect(pageSrc).toContain("applyEconomyV3RootsToState");
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: {
              seconds: 25,
              fullSegments: 5,
              partialSegmentSeconds: 0,
              capacitySeconds: 25,
              fillFraction: 1,
              playableFromRoot: true,
              transferred: false,
              frozen: false,
            },
            sun: {
              seconds: 0,
              fullSegments: 0,
              partialSegmentSeconds: 0,
              capacitySeconds: 25,
              fillFraction: 0,
              playableFromRoot: false,
              transferred: true,
              frozen: true,
            },
            fertilizer: {
              seconds: 0,
              fullSegments: 0,
              partialSegmentSeconds: 0,
              capacitySeconds: 25,
              fillFraction: 0,
              playableFromRoot: false,
              transferred: false,
              frozen: false,
            },
          },
          generation: {
            anchorAt: null,
            progress: 0,
            frozenAt: "2026-07-23T12:00:00.000Z",
            insuranceDeadlineAt: null,
            firstTransferredRoot: "sun",
            transferredRoots: ["sun"],
            secondsUntilNextWholeSecond: null,
            accumulating: false,
          },
        })}
      />,
    );
    expect(html).toContain('data-v3-root-clickable="true"');
    expect(html).toContain('data-v3-root="sun"');
    // Empty transferred root is visually calm empty; still not clickable.
    expect(html).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-state="empty"/,
    );
    expect(html).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-clickable="false"/,
    );
  });

  it("v3 roots hang into underground from grass line (not pillars on top)", () => {
    // Anchor TOP sits below grass: bottom = lift - depth + tuck (tuck < 0).
    expect(cssSrc).toMatch(
      /\.game-area \.v3-root-anchor\s*\{[\s\S]*?bottom:\s*calc\(\s*var\(--v2-scene-lift[\s\S]*?--v3-roots-depth/,
    );
    expect(cssSrc).toMatch(
      /\.game-area \.v3-root-anchor\s*\{[\s\S]*?--v3-root-anchor-tuck/,
    );
    expect(cssSrc).toMatch(
      /\.game-area \.v3-root-anchor\s*\{[\s\S]*?top:\s*auto/,
    );
    // Bottom-up energy: logical seg0 at tip via column-reverse (not top-down column).
    expect(cssSrc).toMatch(
      /\.v3-root-segments\s*\{[\s\S]*?flex-direction:\s*column-reverse/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-system-row\s*\{[\s\S]*?display:\s*flex/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-system-row\s*\{[\s\S]*?flex-direction:\s*row/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-system-row\s*\{[\s\S]*?align-items:\s*flex-start/,
    );
    // Not a single-point absolute petal fan (three columns in a row).
    expect(cssSrc).toMatch(
      /\.v3-root\s*\{\s*position:\s*relative;/,
    );
    expect(cssSrc).not.toMatch(
      /\.v3-root\s*\{\s*position:\s*absolute;/,
    );
    // Must not park the whole root box above the grass (petal / crown bug).
    expect(cssSrc).not.toMatch(
      /\.game-area \.v3-root-anchor\s*\{[\s\S]*?bottom:\s*calc\(var\(--v2-scene-lift,\s*120px\)\s*-\s*8px\)/,
    );
    // Three vertical columns + unified earth (no veil, no lean/fan/taper).
    expect(pageSrc).toContain("game-area--v3-roots");
    expect(pageSrc).not.toContain("v3-earth-veil");
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots\s*\{[\s\S]*?--v2-scene-lift:\s*286px/,
    );
    expect(cssSrc).not.toMatch(/\.v3-root--\w+ \.v3-root-trajectory\s*\{[^}]*transform:/);
    expect(cssSrc).not.toMatch(/--v3-fan-spread/);
    expect(cssSrc).not.toMatch(/--v3-root-spread/);
    expect(cssSrc).not.toMatch(
      /\.v3-root-segment:nth-child\(\d+\)\s*\{\s*width:/,
    );
    expect(cssSrc).not.toMatch(
      /\.v3-root-trajectory\s*\{[^}]*transform-origin:/,
    );
  });

  it("v3 root group geometry: compact equal gap, buried under grass, segment size intact", () => {
    const row = cssSrc.match(/\.v3-root-system-row\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(row).toMatch(/justify-content:\s*center/);
    expect(row).not.toMatch(/justify-content:\s*space-between/);
    expect(row).not.toMatch(/justify-content:\s*space-around/);
    expect(row).not.toMatch(/justify-content:\s*space-evenly/);
    expect(row).toMatch(/gap:\s*10px/);
    expect(row).toMatch(/width:\s*fit-content/);
    expect(row).not.toMatch(/width:\s*100%/);
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots\s*\{[\s\S]*?--v3-root-anchor-tuck:\s*-64px/,
    );
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots\s*\{[\s\S]*?--v3-root-crown-bury:\s*8px/,
    );
    // Shrink-wrap under trunk (not a wide fixed band).
    expect(cssSrc).toMatch(
      /\.game-area \.v3-root-anchor\s*\{[\s\S]*?width:\s*fit-content/,
    );
    // Segment box unchanged (22×15, gap 2, column-reverse fill).
    expect(cssSrc).toMatch(
      /\.v3-root-segments\s*\{[\s\S]*?flex-direction:\s*column-reverse[\s\S]*?gap:\s*2px[\s\S]*?width:\s*22px/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-segment\s*\{[\s\S]*?height:\s*15px[\s\S]*?width:\s*22px/,
    );
    // Hit column width unchanged; negative margin pulls stems to ~10px edge gap.
    expect(cssSrc).toMatch(/\.v3-root\s*\{[\s\S]*?width:\s*52px/);
    expect(cssSrc).toMatch(/\.v3-root\s*\{[\s\S]*?margin:\s*0\s+-15px/);
    // ≤430 / ≤360 keep compact gap + buried tuck (no wider spread).
    expect(cssSrc).toMatch(
      /@media \(max-width:\s*430px\)[\s\S]*?\.v3-root-system-row\s*\{[\s\S]*?gap:\s*10px/,
    );
    expect(cssSrc).toMatch(
      /@media \(max-width:\s*360px\)[\s\S]*?\.v3-root-system-row\s*\{[\s\S]*?gap:\s*8px/,
    );
    expect(cssSrc).toMatch(
      /@media \(max-width:\s*360px\)[\s\S]*?--v3-root-anchor-tuck:\s*-60px/,
    );
    // No fan / individual offsets.
    expect(cssSrc).not.toMatch(/\.v3-root--water\s*\{[^}]*translate/);
    expect(cssSrc).not.toMatch(/\.v3-root--sun\s*\{[^}]*left:/);
  });

  it("old v2 timer is not shown with v3 primary roots; v3 wait timer mounts instead", () => {
    // RootEnergyLayer (v2 timer host) is not mounted alongside v3
    expect(pageSrc).not.toMatch(
      /useV3RootsUi[\s\S]{0,200}RootEnergyLayer[\s\S]{0,200}EconomyV3RootSystem/,
    );
    expect(pageSrc).not.toContain("hideEnergyTimer={false}");
    expect(pageSrc).toContain("<V3RootWaitTimer");
    expect(pageSrc).toContain("hideTimer={excessCleaning}");
  });

  it("DEV readout remains; preview env not required for v3 UI", () => {
    expect(flagsSrc).toContain("SHOW_ECONOMY_V3_ROOTS_PREVIEW");
    expect(flagsSrc).toContain("No longer required for production render");
    expect(pageSrc).not.toMatch(
      /SHOW_ECONOMY_V3_ROOTS_PREVIEW\s*&&\s*\([\s\S]{0,80}EconomyV3RootSystem/,
    );
    expect(shouldUseV3ActivityCardUi(false, sampleV3())).toBe(true);
    if (localPanel) {
      expect(localPanel).toContain('data-v3-debug="roots-readout"');
    }
  });

  it("preview chrome removed; Care/Metelka stay below roots in layout", () => {
    expect(cssSrc).not.toMatch(/\.v3-roots-preview\s*\{/);
    expect(cssSrc).toMatch(/background:\s*transparent/);
    expect(pageSrc).not.toContain("v3-roots-preview-missing");
    // Care / Metelka row is session-actions, not overlapping tree wrap roots
    expect(pageSrc).toContain("CareActionsRow");
    expect(pageSrc).toContain("game-tree-wrap");
    expect(pageSrc.indexOf("game-tree-wrap")).toBeLessThan(
      pageSrc.indexOf("<CareActionsRow"),
    );
  });
});
