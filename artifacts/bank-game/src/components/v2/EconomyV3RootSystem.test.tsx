import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EconomyV3RootsState } from "@/lib/api";
import EconomyV3RootSystem, {
  V3_ROOT_FILL_COLORS,
  V3_ROOT_WASH_COLORS,
  V3_ROOT_METELKA_LOCKED_FILL,
  V3_SEGMENT_COUNT,
  V3_TRANSFER_ANIM_MS,
  canTransferV3Root,
  formatV3TransferError,
  performEconomyV3RootTransfer,
  planV3ManualTransferSuccess,
  resolveV3RootDisplayDuringTransfer,
  resolveV3RootVisualState,
  resolveV3RootsDisplaySnapshot,
  shouldAnimateV3Transfer,
  shouldAnimateV3Waiting,
  v3RootAriaLabel,
  v3RootFillRatio,
  v3SegmentFillForDisplay,
  v3SegmentFillFraction,
  v3SegmentFillFromRatio,
} from "./EconomyV3RootSystem";
import { normalizeEconomyV3RootsSnapshot } from "@/lib/v3Roots";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
const compSrc = readFileSync(join(here, "EconomyV3RootSystem.tsx"), "utf8");
const flagsSrc = readFileSync(join(here, "../../lib/featureFlags.ts"), "utf8");
const cssSrc = readFileSync(join(here, "../../bank.css"), "utf8");

function rootFromSeconds(seconds: number) {
  const fullSegments = Math.floor(seconds / 5);
  const partialSegmentSeconds = seconds % 5;
  return {
    seconds,
    fullSegments,
    partialSegmentSeconds,
    capacitySeconds: 25,
    fillFraction: seconds / 25,
    playableFromRoot: seconds >= 1,
    transferred: false,
    frozen: false,
  };
}

function sampleV3(overrides?: Partial<EconomyV3RootsState>): EconomyV3RootsState {
  const base = normalizeEconomyV3RootsSnapshot({
    enabled: true,
    dailyCapSeconds: 25,
    effectivePresetSeconds: 25,
    dayKey: "2026-07-23",
    roots: {
      water: rootFromSeconds(7),
      sun: rootFromSeconds(4),
      fertilizer: rootFromSeconds(21),
    },
    reserves: {
      water: { seconds: 0, capacitySeconds: 25, playable: false },
      sun: { seconds: 0, capacitySeconds: 25, playable: false },
      fertilizer: { seconds: 0, capacitySeconds: 25, playable: false },
    },
    careAvailability: {
      water: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
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
      progress: 0.1,
      frozenAt: null,
      insuranceDeadlineAt: null,
      firstTransferredRoot: null,
      transferredRoots: [],
      secondsUntilNextWholeSecond: 10,
      accumulating: true,
    },
  })!;
  return {
    ...base,
    ...overrides,
    roots: { ...base.roots, ...overrides?.roots },
    generation: { ...base.generation, ...overrides?.generation },
    reserves: { ...base.reserves, ...overrides?.reserves },
    ...(overrides?.effectivePresetSeconds != null
      ? { effectivePresetSeconds: overrides.effectivePresetSeconds }
      : {}),
  };
}

describe("v3SegmentFillFraction", () => {
  it("partial fill for 4 / 7 / 21 / 25 seconds", () => {
    expect(v3SegmentFillFraction(0, 0, 4)).toBeCloseTo(0.8, 10);
    expect(v3SegmentFillFraction(1, 0, 4)).toBe(0);
    expect(v3SegmentFillFraction(0, 1, 2)).toBe(1);
    expect(v3SegmentFillFraction(1, 1, 2)).toBeCloseTo(0.4, 10);
    expect(v3SegmentFillFraction(4, 4, 1)).toBeCloseTo(0.2, 10);
    for (let i = 0; i < V3_SEGMENT_COUNT; i++) {
      expect(v3SegmentFillFraction(i, 5, 0)).toBe(1);
    }
  });

  it("keeps fractional partial seconds (does not round up to a full segment)", () => {
    expect(v3SegmentFillFraction(0, 0, 2.5)).toBeCloseTo(0.5, 10);
    expect(v3SegmentFillFraction(0, 0, 0.5)).toBeCloseTo(0.1, 10);
    expect(v3SegmentFillFraction(1, 0, 2.5)).toBe(0);
  });
});

describe("v3RootFillRatio", () => {
  it("uses fixed 0–25 visual scale (ignores effectivePreset)", () => {
    expect(v3RootFillRatio(20)).toBe(0.8);
    expect(v3RootFillRatio(20, 21)).toBe(0.8);
    expect(v3RootFillRatio(21, 21)).toBeCloseTo(21 / 25, 10);
    expect(v3RootFillRatio(25, 21)).toBe(1);
  });

  it("clamps above 25 to 1 and below zero to 0", () => {
    expect(v3RootFillRatio(30, 21)).toBe(1);
    expect(v3RootFillRatio(-5, 21)).toBe(0);
    expect(v3RootFillRatio(0, 21)).toBe(0);
  });

  it("same visual ratio for equal seconds regardless of per-root capacity", () => {
    const caps = [21, 21, 21];
    const seconds = [20, 20, 20];
    const ratios = seconds.map((s, i) => v3RootFillRatio(s, caps[i]));
    expect(new Set(ratios.map((r) => r.toFixed(12))).size).toBe(1);
    expect(ratios[0]).toBe(0.8);
  });
});

describe("v3SegmentFillFromRatio / v3SegmentFillForDisplay", () => {
  function fillsFor(seconds: number, capacity = 21) {
    const root = {
      seconds,
      capacitySeconds: capacity,
      fullSegments: Math.floor(seconds / 5),
      partialSegmentSeconds: seconds % 5,
      fillFraction: seconds / capacity,
    };
    return [0, 1, 2, 3, 4].map((i) => v3SegmentFillForDisplay(i, root, capacity));
  }

  it("1. root=0 → all empty", () => {
    expect(fillsFor(0)).toEqual([0, 0, 0, 0, 0]);
  });

  it("2. root=5 → one full segment", () => {
    expect(fillsFor(5)).toEqual([1, 0, 0, 0, 0]);
  });

  it("3. root=10 → two full segments", () => {
    expect(fillsFor(10)).toEqual([1, 1, 0, 0, 0]);
  });

  it("4. root=20 → four full, fifth empty", () => {
    expect(fillsFor(20)).toEqual([1, 1, 1, 1, 0]);
  });

  it("5. root=21 → fifth at 20%", () => {
    expect(fillsFor(21)).toEqual([1, 1, 1, 1, 0.2]);
  });

  it("6. root=22 → fifth at 40%", () => {
    expect(fillsFor(22)).toEqual([1, 1, 1, 1, 0.4]);
  });

  it("7. root=24 → fifth at 80%", () => {
    expect(fillsFor(24)).toEqual([1, 1, 1, 1, 0.8]);
  });

  it("8. root=25 → all full", () => {
    expect(fillsFor(25)).toEqual([1, 1, 1, 1, 1]);
  });

  it("9. effectivePresetSeconds does not stretch segment height", () => {
    const root = {
      seconds: 20,
      capacitySeconds: 20,
      fullSegments: 4,
      partialSegmentSeconds: 0,
      fillFraction: 1,
    };
    // Same seconds → same fills whether override is 21, 25, or omitted.
    expect(v3SegmentFillForDisplay(4, root)).toBe(0);
    expect(v3SegmentFillForDisplay(4, root, 21)).toBe(0);
    expect(v3SegmentFillForDisplay(4, root, 25)).toBe(0);
    expect(v3SegmentFillForDisplay(4, root, 21)).toBe(
      v3SegmentFillForDisplay(4, root, 99),
    );
    expect(v3RootFillRatio(20, 21)).toBe(v3RootFillRatio(20, 25));
  });

  it("maps continuous visual ratio across five equal 5s segments", () => {
    expect(v3SegmentFillFromRatio(4, 20 / 25)).toBe(0);
    expect(v3SegmentFillFromRatio(4, 21 / 25)).toBeCloseTo(0.2, 10);
    expect(v3SegmentFillFromRatio(4, 24 / 25)).toBeCloseTo(0.8, 10);
    expect(v3SegmentFillFromRatio(4, 1)).toBe(1);
  });
});

describe("v3SegmentFillFraction", () => {
  it("uses fillFraction for the active partial segment (legacy)", () => {
    expect(v3SegmentFillFraction(0, 1, 0)).toBe(1);
    expect(v3SegmentFillFraction(1, 1, 2.5)).toBeCloseTo(0.5, 10);
    expect(v3SegmentFillFraction(1, 0, 2.5)).toBe(0);
  });
});

describe("resolveV3RootVisualState", () => {
  it("applies transferred / frozen / full / ready / empty", () => {
    expect(
      resolveV3RootVisualState(
        { ...rootFromSeconds(10), transferred: true },
        true,
      ),
    ).toBe("transferred");
    expect(
      resolveV3RootVisualState(
        { ...rootFromSeconds(0), transferred: true },
        true,
      ),
    ).toBe("empty");
    expect(
      resolveV3RootVisualState({ ...rootFromSeconds(10), frozen: true }, true),
    ).toBe("frozen");
    expect(resolveV3RootVisualState(rootFromSeconds(25), false)).toBe("full");
    expect(resolveV3RootVisualState(rootFromSeconds(5), false)).toBe("ready");
    expect(resolveV3RootVisualState(rootFromSeconds(0), false)).toBe("empty");
    expect(resolveV3RootVisualState(rootFromSeconds(3), true)).toBe(
      "accumulating",
    );
  });

  it("cycleFrozen → waiting only for playable energy roots; empty stays empty", () => {
    expect(
      resolveV3RootVisualState(
        { ...rootFromSeconds(0), transferred: true },
        false,
        true,
      ),
    ).toBe("empty");
    expect(
      resolveV3RootVisualState(rootFromSeconds(10), false, true),
    ).toBe("waiting");
    expect(
      resolveV3RootVisualState(rootFromSeconds(0), false, true),
    ).toBe("empty");
    expect(
      resolveV3RootVisualState(
        { ...rootFromSeconds(10), playableFromRoot: false },
        false,
        true,
      ),
    ).not.toBe("waiting");
    expect(
      resolveV3RootVisualState(rootFromSeconds(10), true, false),
    ).not.toBe("waiting");
  });
});

describe("shouldAnimateV3Waiting", () => {
  it("reduced-motion preference disables waiting motion", () => {
    expect(shouldAnimateV3Waiting(true)).toBe(false);
    expect(shouldAnimateV3Waiting(false)).toBe(true);
  });
});

describe("canTransferV3Root / performEconomyV3RootTransfer", () => {
  it("gates unavailable and transferred roots", () => {
    expect(
      canTransferV3Root(
        { playableFromRoot: false, transferred: false },
        false,
      ),
    ).toBe(false);
    expect(
      canTransferV3Root({ playableFromRoot: true, transferred: true }, false),
    ).toBe(false);
    expect(
      canTransferV3Root({ playableFromRoot: true, transferred: false }, true),
    ).toBe(false);
    expect(
      canTransferV3Root({ playableFromRoot: true, transferred: false }, false),
    ).toBe(true);
  });

  it("click water / sun / fertilizer call the matching root", async () => {
    const calls: string[] = [];
    const nextSnap = sampleV3({
      roots: {
        water: { ...rootFromSeconds(0), transferred: true, playableFromRoot: false },
        sun: rootFromSeconds(4),
        fertilizer: rootFromSeconds(21),
      },
      reserves: {
        water: { seconds: 7, capacitySeconds: 20, playable: true },
        sun: { seconds: 0, capacitySeconds: 20, playable: false },
        fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
      },
    });

    for (const kind of ["water", "sun", "fertilizer"] as const) {
      calls.length = 0;
      const result = await performEconomyV3RootTransfer({
        kind,
        root: { playableFromRoot: true, transferred: false },
        busyRoot: null,
        transferEnabled: true,
        transferFn: async (root) => {
          calls.push(root);
          return { v3Roots: nextSnap };
        },
      });
      expect(result.ok).toBe(true);
      expect(calls).toEqual([kind]);
      if (result.ok) {
        expect(result.v3Roots.reserves.water.seconds).toBe(7);
      }
    }
  });

  it("busy / transferEnabled=false / unavailable skip without API", async () => {
    const transferFn = vi.fn(async () => ({ v3Roots: sampleV3() }));
    expect(
      await performEconomyV3RootTransfer({
        kind: "water",
        root: { playableFromRoot: true, transferred: false },
        busyRoot: "sun",
        transferEnabled: true,
        transferFn,
      }),
    ).toEqual({ ok: false, skipped: true });
    expect(
      await performEconomyV3RootTransfer({
        kind: "water",
        root: { playableFromRoot: true, transferred: false },
        busyRoot: null,
        transferEnabled: false,
        transferFn,
      }),
    ).toEqual({ ok: false, skipped: true });
    expect(
      await performEconomyV3RootTransfer({
        kind: "water",
        root: { playableFromRoot: false, transferred: false },
        busyRoot: null,
        transferEnabled: true,
        transferFn,
      }),
    ).toEqual({ ok: false, skipped: true });
    expect(transferFn).not.toHaveBeenCalled();
  });

  it("success returns normalized snapshot; error keeps skip=false", async () => {
    const ok = await performEconomyV3RootTransfer({
      kind: "water",
      root: { playableFromRoot: true, transferred: false },
      busyRoot: null,
      transferEnabled: true,
      transferFn: async () => ({ v3Roots: sampleV3() }),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.v3Roots.enabled).toBe(true);

    const fail = await performEconomyV3RootTransfer({
      kind: "water",
      root: { playableFromRoot: true, transferred: false },
      busyRoot: null,
      transferEnabled: true,
      transferFn: async () => {
        throw Object.assign(new Error("already transferred"), {
          status: 409,
          code: "already_transferred",
        });
      },
    });
    expect(fail).toEqual({
      ok: false,
      skipped: false,
      error: formatV3TransferError({
        message: "already transferred",
        status: 409,
        code: "already_transferred",
      }),
    });
  });
});

describe("EconomyV3RootSystem", () => {
  it("renders 3 roots × 5 segments with activity colors/classes", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem v3Roots={sampleV3()} transferEnabled />,
    );
    expect(html).toContain('data-v3-root="water"');
    expect(html).toContain('data-v3-root="sun"');
    expect(html).toContain('data-v3-root="fertilizer"');
    expect(html).toContain("v3-root--water");
    expect(html).toContain('data-v3-root-glyph="water"');
    expect(html).toContain('data-v3-root-glyph="sun"');
    expect(html).toContain('data-v3-root-glyph="fertilizer"');
    // One glyph per segment cell (3 roots × 5 segments).
    expect(html.match(/data-v3-root-glyph=/g)?.length).toBe(15);
    expect(html.match(/data-v3-segment=/g)?.length).toBe(15);
    expect(html).toContain(V3_ROOT_FILL_COLORS.water);
    expect(html).toContain(V3_ROOT_WASH_COLORS.water);
    expect(html).toContain(v3RootAriaLabel("water", 7));
    expect(html).toContain('data-v3-root-clickable="true"');
    expect(html).not.toContain("roots--metelka-locked");
    expect(html).toContain('data-v3-roots-metelka-locked="false"');
  });

  it("metelkaLocked: columns stay; gray fill; not clickable", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        v3Roots={sampleV3()}
        transferEnabled
        metelkaLocked
      />,
    );
    expect(html).toContain('data-v3-root-system="true"');
    expect(html).toContain("v3-root-system--metelka-locked");
    expect(html).toContain("roots--metelka-locked");
    expect(html).toContain('data-v3-roots-metelka-locked="true"');
    expect(html).toContain('data-v3-root="water"');
    expect(html).toContain('data-v3-root="sun"');
    expect(html).toContain('data-v3-root="fertilizer"');
    expect(html.match(/data-v3-segment=/g)?.length).toBe(15);
    expect(html).toContain(V3_ROOT_METELKA_LOCKED_FILL);
    expect(html).not.toContain(V3_ROOT_FILL_COLORS.water);
    expect(html).not.toContain(V3_ROOT_FILL_COLORS.sun);
    expect(html).not.toContain(V3_ROOT_FILL_COLORS.fertilizer);
    expect(html).toContain('data-v3-root-clickable="false"');
    expect(html).toContain('data-v3-transfer-enabled="false"');
    expect(html).toContain("v3-root--metelka-locked");
    expect(cssSrc).toMatch(/\.v3-root-system--metelka-locked/);
    expect(cssSrc).toMatch(/\.roots--metelka-locked/);
  });

  it("marks empty / transferred as not clickable", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: { ...rootFromSeconds(0), playableFromRoot: false },
            sun: { ...rootFromSeconds(10), transferred: true },
            fertilizer: rootFromSeconds(8),
          },
        })}
      />,
    );
    expect(html).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-clickable="false"/,
    );
    expect(html).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-clickable="false"/,
    );
    expect(html).toMatch(
      /data-v3-root="fertilizer"[^>]*data-v3-root-clickable="true"/,
    );
  });

  it("applies transferred / frozen / full classes", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        v3Roots={sampleV3({
          roots: {
            water: { ...rootFromSeconds(10), transferred: true },
            sun: { ...rootFromSeconds(10), frozen: true },
            fertilizer: rootFromSeconds(25),
          },
        })}
      />,
    );
    expect(html).toContain("v3-root--transferred");
    expect(html).toContain("v3-root--frozen");
    expect(html).toContain("v3-root--full");
  });

  it("empty transferred root uses calm empty visual and stays non-interactive", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: {
              ...rootFromSeconds(0),
              transferred: true,
              playableFromRoot: false,
            },
            sun: { ...rootFromSeconds(0), playableFromRoot: false },
            fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
          },
          generation: {
            anchorAt: "2026-07-23T00:00:00.000Z",
            progress: 0.4,
            frozenAt: "2026-07-23T00:01:00.000Z",
            insuranceDeadlineAt: "2026-07-23T00:02:00.000Z",
            firstTransferredRoot: "water",
            transferredRoots: ["water"],
            secondsUntilNextWholeSecond: 360,
            accumulating: true,
          },
        })}
      />,
    );
    expect(html).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-state="empty"/,
    );
    expect(html).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-clickable="false"/,
    );
    expect(html).toMatch(/data-v3-root="water"[^>]*disabled/);
    expect(html).not.toMatch(
      /data-v3-root="water"[^>]*v3-root--waiting-motion/,
    );
    expect(html).not.toMatch(/data-v3-root="water"[^>]*v3-root--press/);
    expect(html).not.toContain('data-v3-root-waiting="true"');
  });

  it("cycleFrozen + accumulating keeps generation-active root visuals", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: {
              ...rootFromSeconds(0),
              transferred: true,
              playableFromRoot: false,
            },
            sun: { ...rootFromSeconds(3), playableFromRoot: false },
            fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
          },
          generation: {
            anchorAt: "2026-07-23T00:00:00.000Z",
            progress: 0.5,
            frozenAt: "2026-07-23T00:01:00.000Z",
            insuranceDeadlineAt: "2026-07-23T00:02:00.000Z",
            firstTransferredRoot: "water",
            transferredRoots: ["water"],
            secondsUntilNextWholeSecond: 360,
            accumulating: true,
          },
        })}
      />,
    );
    // generating follows accumulating even while frozenAt is set
    expect(html).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-state="accumulating"/,
    );
    expect(html).toContain("v3-root--accumulating");
    expect(html).toContain('data-v3-cycle-frozen="true"');
  });

  it("collect pulse: only leftmost ≥5s root blinks (live recommend)", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: rootFromSeconds(6),
            sun: rootFromSeconds(12),
            fertilizer: rootFromSeconds(9),
          },
        })}
      />,
    );
    expect(html).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-tutorial-pulse="true"/,
    );
    expect(html).toContain("v3-root--tutorial-pulse");
    expect(html).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-tutorial-pulse="false"/,
    );
    expect(html).toMatch(
      /data-v3-root="fertilizer"[^>]*data-v3-root-tutorial-pulse="false"/,
    );

    const afterWater = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: {
              ...rootFromSeconds(0),
              transferred: true,
              playableFromRoot: false,
            },
            sun: rootFromSeconds(12),
            fertilizer: rootFromSeconds(9),
          },
          generation: {
            anchorAt: null,
            progress: 0,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: "water",
            transferredRoots: ["water"],
            secondsUntilNextWholeSecond: null,
            accumulating: false,
          },
        })}
      />,
    );
    expect(afterWater).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-tutorial-pulse="true"/,
    );
    expect(afterWater).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-tutorial-pulse="false"/,
    );
  });

  it("covers empty / accumulating / ready / full / transferred / frozen / waiting states", () => {
    const htmlAccum = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: { ...rootFromSeconds(0), playableFromRoot: false },
            sun: { ...rootFromSeconds(7), playableFromRoot: false },
            fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
          },
          generation: {
            anchorAt: "2026-07-23T00:00:00.000Z",
            progress: 0.28,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: null,
            transferredRoots: [],
            secondsUntilNextWholeSecond: 3,
            accumulating: true,
          },
        })}
      />,
    );
    expect(htmlAccum).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-state="empty"/,
    );
    expect(htmlAccum).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-state="accumulating"/,
    );
    expect(htmlAccum).toContain("v3-root--empty");
    expect(htmlAccum).toContain("v3-root--accumulating");
    expect(htmlAccum.match(/data-v3-segment=/g)?.length).toBe(15);
    expect(htmlAccum).toContain('data-v3-segment-state="partial"');
    expect(htmlAccum).toContain('data-v3-segment-fill="0.40"'); // sun: 7s → 1 full + 0.4

    const htmlReady = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: { ...rootFromSeconds(0), playableFromRoot: false },
            sun: { ...rootFromSeconds(0), playableFromRoot: false },
            fertilizer: rootFromSeconds(5),
          },
          generation: {
            anchorAt: null,
            progress: 0,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: null,
            transferredRoots: [],
            secondsUntilNextWholeSecond: null,
            accumulating: false,
          },
        })}
      />,
    );
    expect(htmlReady).toMatch(
      /data-v3-root="fertilizer"[^>]*data-v3-root-state="ready"/,
    );
    expect(htmlReady).toContain("v3-root--ready");

    const htmlFull = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: rootFromSeconds(25),
            sun: { ...rootFromSeconds(0), playableFromRoot: false },
            fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
          },
        })}
      />,
    );
    expect(htmlFull).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-state="full"/,
    );

    const htmlFrozenSolo = renderToStaticMarkup(
      <EconomyV3RootSystem
        v3Roots={sampleV3({
          roots: {
            water: {
              ...rootFromSeconds(8),
              frozen: true,
              playableFromRoot: false,
            },
            sun: { ...rootFromSeconds(0), playableFromRoot: false },
            fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
          },
        })}
      />,
    );
    expect(htmlFrozenSolo).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-state="frozen"/,
    );
    expect(htmlFrozenSolo).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-clickable="false"/,
    );
    expect(htmlFrozenSolo).toContain("disabled");
  });

  it("partial fill uses seconds/capacity ratio (smooth active segment)", () => {
    // 6/25 = 0.24 → 1.2 visual segments → seg1 = 0.20 (not fixed 5s snap)
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        v3Roots={sampleV3({
          effectivePresetSeconds: 25,
          roots: {
            water: {
              ...rootFromSeconds(6),
              capacitySeconds: 25,
              fillFraction: 6 / 25,
              playableFromRoot: false,
            },
            sun: { ...rootFromSeconds(0), playableFromRoot: false },
            fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
          },
          generation: {
            anchorAt: null,
            progress: 0.24,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: null,
            transferredRoots: [],
            secondsUntilNextWholeSecond: null,
            accumulating: true,
          },
        })}
      />,
    );
    expect(html).toContain('data-v3-segment="1"');
    expect(html).toContain('data-v3-segment-fill="0.20"');
    expect(html).toContain("--v3-seg-fill:20.00%");
  });

  it("20/21 renders four full segments and empty fifth", () => {
    const root20of21 = {
      ...rootFromSeconds(20),
      seconds: 20,
      capacitySeconds: 21,
      fullSegments: 4,
      partialSegmentSeconds: 0,
      fillFraction: 20 / 21,
      playableFromRoot: true,
    };
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        v3Roots={sampleV3({
          effectivePresetSeconds: 21,
          dailyCapSeconds: 20,
          roots: {
            water: root20of21,
            sun: { ...root20of21 },
            fertilizer: { ...root20of21 },
          },
          generation: {
            anchorAt: null,
            progress: 0,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: null,
            transferredRoots: [],
            secondsUntilNextWholeSecond: null,
            accumulating: false,
          },
        })}
      />,
    );
    expect(html).toContain('data-v3-root-state="ready"');
    expect(html).not.toContain('data-v3-root-state="full"');
    // Fixed 0–25 scale: four full, crown empty
    expect(html).toMatch(/data-v3-segment="4"[^>]*data-v3-segment-state="empty"/);
    expect(html).not.toMatch(
      /data-v3-segment="4"[^>]*data-v3-segment-state="partial"/,
    );
    expect(html).not.toMatch(
      /data-v3-segment="4"[^>]*data-v3-segment-state="full"/,
    );
    expect(html).toContain('data-segment-index="4"');
    expect(html).toMatch(/data-segment-index="0"[^>]*data-segment-fill="100.00%"/);
    expect(html).toMatch(/data-segment-index="3"[^>]*data-segment-fill="100.00%"/);
    expect(html).not.toContain("--v3-seg-fill:76.19%");
  });

  it("20/21 DOM + CSS: crown empty on fixed scale; fill CSS unchanged", () => {
    const root20of21 = {
      ...rootFromSeconds(20),
      seconds: 20,
      capacitySeconds: 21,
      fillFraction: 20 / 21,
      playableFromRoot: true,
    };
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        v3Roots={sampleV3({
          effectivePresetSeconds: 21,
          roots: {
            water: root20of21,
            sun: root20of21,
            fertilizer: root20of21,
          },
          generation: {
            anchorAt: null,
            progress: 0,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: null,
            transferredRoots: [],
            secondsUntilNextWholeSecond: null,
            accumulating: false,
          },
        })}
      />,
    );
    expect(html).toMatch(
      /data-segment-index="4"[^>]*data-v3-segment-state="empty"/,
    );
    // Fill flush to inner border — no thick cream ring on tiny cells.
    expect(cssSrc).toMatch(
      /\.v3-root-segment--partial::after[\s\S]*?bottom:\s*0/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-segment--partial::after[\s\S]*?left:\s*0/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-segment--partial::after[\s\S]*?top:\s*auto/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-segment--partial::after[\s\S]*?height:\s*var\(--v3-seg-fill/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-segment--partial::after[\s\S]*?box-shadow:\s*none/,
    );
    // No glossy white inset / outer ring on ready cells.
    expect(cssSrc).not.toMatch(
      /v3-root--ready[\s\S]{0,200}inset 0 1px 0 rgba\(255/,
    );
    // Same contrast pair as activity buttons: cream shell + opaque --ac rim.
    const shellBlock = cssSrc.match(
      /\.v3-root-segment--partial,\s*\r?\n\.v3-root-segment--full\s*\{[^}]+\}/,
    );
    expect(shellBlock?.[0]).toMatch(/background:\s*var\(--v3-shell/);
    expect(shellBlock?.[0]).toMatch(
      /border-color:\s*var\(--v3-seg-color/,
    );
    expect(shellBlock?.[0]).toMatch(/color:\s*var\(--v3-seg-color/);
    // Light wash interior (timer / activity contrast) — not rim RGB.
    expect(cssSrc).toMatch(
      /\.v3-root-segment--partial::after[\s\S]*?background:\s*var\(--v3-seg-wash/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-segment \.v3-root-glyph\s*\{[\s\S]*?color:\s*inherit/,
    );
    // Ground lip must not cover crown empty (bury ≤ |tuck|)
    expect(cssSrc).toMatch(/--v3-root-crown-bury:\s*8px/);
    expect(cssSrc).toMatch(/--v3-root-anchor-tuck:\s*-64px/);
  });

  it("21/21 fifth segment is 20% filled (not 100%)", () => {
    const rootFull = {
      ...rootFromSeconds(21),
      seconds: 21,
      capacitySeconds: 21,
      fillFraction: 1,
      playableFromRoot: true,
    };
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        v3Roots={sampleV3({
          effectivePresetSeconds: 21,
          roots: {
            water: rootFull,
            sun: rootFull,
            fertilizer: rootFull,
          },
          generation: {
            anchorAt: null,
            progress: 0,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: null,
            transferredRoots: [],
            secondsUntilNextWholeSecond: null,
            accumulating: false,
          },
        })}
      />,
    );
    // Economic full (cap 21) — state still "full"
    expect(html).toMatch(/data-v3-root-state="full"/);
    expect(html).toMatch(
      /data-segment-index="4"[^>]*data-v3-segment-state="partial"[^>]*--v3-seg-fill:20\.00%/,
    );
    expect(html).toContain('data-segment-fill="20.00%"');
  });

  describe("bottom-up fill direction (visual)", () => {
    function fillsForKind(html: string, kind: "water" | "sun" | "fertilizer") {
      const idx = html.indexOf(`data-v3-root="${kind}"`);
      expect(idx).toBeGreaterThanOrEqual(0);
      const next = html.indexOf('data-v3-root="', idx + 16);
      const endBtn = html.indexOf("</button>", idx);
      const end = Math.min(
        next === -1 ? html.length : next,
        endBtn === -1 ? html.length : endBtn,
      );
      const block = html.slice(idx, end);
      const fills: { i: number; fill: number; state: string }[] = [];
      const re =
        /data-v3-segment="(\d+)"[^>]*data-v3-segment-fill="([\d.]+)"[^>]*data-v3-segment-state="(\w+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(block))) {
        fills.push({
          i: Number(m[1]),
          fill: Number(m[2]),
          state: m[3],
        });
      }
      // DOM order remains 0..4; CSS column-reverse paints 0 at tip.
      expect(fills.map((f) => f.i)).toEqual([0, 1, 2, 3, 4]);
      return fills;
    }

    it("first partial fill is logical seg0 (visual tip / bottom)", () => {
      const html = renderToStaticMarkup(
        <EconomyV3RootSystem
          v3Roots={sampleV3({
            roots: {
              water: {
                ...rootFromSeconds(2),
                playableFromRoot: false,
              },
              sun: { ...rootFromSeconds(0), playableFromRoot: false },
              fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
            },
            generation: {
              anchorAt: "2026-07-23T00:00:00.000Z",
              progress: 0.08,
              frozenAt: null,
              insuranceDeadlineAt: null,
              firstTransferredRoot: null,
              transferredRoots: [],
              secondsUntilNextWholeSecond: 3,
              accumulating: true,
            },
          })}
        />,
      );
      const w = fillsForKind(html, "water");
      expect(w[0]).toMatchObject({ i: 0, state: "partial" });
      expect(w[0].fill).toBeCloseTo(0.4, 5);
      expect(w.slice(1).every((s) => s.state === "empty" && s.fill === 0)).toBe(
        true,
      );
      expect(cssSrc).toMatch(
        /\.v3-root-segments\s*\{[\s\S]*?flex-direction:\s*column-reverse/,
      );
    });

    it("first full segment is tip; second full sits above it (seg1)", () => {
      const html = renderToStaticMarkup(
        <EconomyV3RootSystem
          v3Roots={sampleV3({
            roots: {
              water: rootFromSeconds(10), // 2 full
              sun: { ...rootFromSeconds(0), playableFromRoot: false },
              fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
            },
            generation: {
              anchorAt: null,
              progress: 0.4,
              frozenAt: null,
              insuranceDeadlineAt: null,
              firstTransferredRoot: null,
              transferredRoots: [],
              secondsUntilNextWholeSecond: null,
              accumulating: true,
            },
          })}
        />,
      );
      const w = fillsForKind(html, "water");
      expect(w[0]).toMatchObject({ i: 0, fill: 1, state: "full" });
      expect(w[1]).toMatchObject({ i: 1, fill: 1, state: "full" });
      expect(w[2].state).toBe("empty");
    });

    it("mid-root partial uses bottom-anchored CSS height growth", () => {
      const html = renderToStaticMarkup(
        <EconomyV3RootSystem
          v3Roots={sampleV3({
            roots: {
              water: {
                ...rootFromSeconds(12),
                fullSegments: 2,
                partialSegmentSeconds: 2,
                fillFraction: 2.4 / 5,
                playableFromRoot: false,
              },
              sun: { ...rootFromSeconds(0), playableFromRoot: false },
              fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
            },
            generation: {
              anchorAt: null,
              progress: 0.48,
              frozenAt: null,
              insuranceDeadlineAt: null,
              firstTransferredRoot: null,
              transferredRoots: [],
              secondsUntilNextWholeSecond: null,
              accumulating: true,
            },
          })}
        />,
      );
      const w = fillsForKind(html, "water");
      expect(w[0].state).toBe("full");
      expect(w[1].state).toBe("full");
      expect(w[2]).toMatchObject({ i: 2, state: "partial" });
      expect(w[2].fill).toBeCloseTo(0.4, 5);
      expect(html).toContain("--v3-seg-fill:40.00%");
      expect(cssSrc).toMatch(
        /\.v3-root-segment--partial::after[\s\S]*?bottom:\s*0/,
      );
      expect(cssSrc).toMatch(
        /\.v3-root-segment--partial::after[\s\S]*?top:\s*auto/,
      );
      expect(cssSrc).toMatch(
        /\.v3-root-segment--partial::after[\s\S]*?height:\s*var\(--v3-seg-fill/,
      );
    });

    it("100% fills all five segments; F5 remount keeps same direction", () => {
      const snap = sampleV3({
        roots: {
          water: rootFromSeconds(25),
          sun: rootFromSeconds(25),
          fertilizer: rootFromSeconds(25),
        },
      });
      const html = renderToStaticMarkup(
        <EconomyV3RootSystem v3Roots={snap} />,
      );
      for (const kind of ["water", "sun", "fertilizer"] as const) {
        const fills = fillsForKind(html, kind);
        expect(fills.every((s) => s.fill === 1 && s.state === "full")).toBe(
          true,
        );
      }
      const remount = renderToStaticMarkup(
        <EconomyV3RootSystem v3Roots={snap} />,
      );
      expect(remount).toContain('data-v3-segment="0"');
      expect(fillsForKind(remount, "water")[0].state).toBe("full");
      expect(cssSrc).toMatch(
        /\.v3-root-segments\s*\{[\s\S]*?flex-direction:\s*column-reverse/,
      );
    });

    it("Water / Sun / Fertilizer share the same bottom-up direction", () => {
      const html = renderToStaticMarkup(
        <EconomyV3RootSystem
          v3Roots={sampleV3({
            roots: {
              water: rootFromSeconds(3),
              sun: rootFromSeconds(3),
              fertilizer: rootFromSeconds(3),
            },
            generation: {
              anchorAt: "2026-07-23T00:00:00.000Z",
              progress: 0.12,
              frozenAt: null,
              insuranceDeadlineAt: null,
              firstTransferredRoot: null,
              transferredRoots: [],
              secondsUntilNextWholeSecond: 2,
              accumulating: true,
            },
          })}
        />,
      );
      for (const kind of ["water", "sun", "fertilizer"] as const) {
        const f = fillsForKind(html, kind);
        expect(f[0].state).toBe("partial");
        expect(f[0].fill).toBeCloseTo(0.6, 5);
        expect(f.slice(1).every((s) => s.state === "empty")).toBe(true);
      }
    });

    it("bottom-up CSS does not remove transfer / waiting / frozen state classes", () => {
      expect(cssSrc).toContain("v3-root-transfer-rise");
      expect(cssSrc).toContain(".v3-root--waiting");
      expect(cssSrc).toContain(".v3-root--frozen");
      expect(cssSrc).toContain(".v3-root--transferred");
      expect(compSrc).toContain("v3-root--transferring");
      const html = renderToStaticMarkup(
        <EconomyV3RootSystem
          v3Roots={sampleV3({
            roots: {
              water: {
                ...rootFromSeconds(25),
                transferred: true,
                playableFromRoot: false,
              },
              sun: {
                ...rootFromSeconds(10),
                playableFromRoot: false,
              },
              fertilizer: {
                ...rootFromSeconds(8),
                frozen: true,
                playableFromRoot: false,
              },
            },
            generation: {
              anchorAt: "2026-07-23T00:00:00.000Z",
              progress: 1,
              frozenAt: "2026-07-23T00:10:00.000Z",
              insuranceDeadlineAt: "2026-07-23T00:20:00.000Z",
              firstTransferredRoot: "water",
              transferredRoots: ["water"],
              secondsUntilNextWholeSecond: null,
              accumulating: false,
            },
          })}
        />,
      );
      // Non-empty transferred still uses transferred class; waiting needs playable energy.
      expect(html).toContain('data-v3-root-state="transferred"');
      expect(html).toMatch(
        /data-v3-root="fertilizer"[^>]*data-v3-root-state="frozen"/,
      );
      expect(cssSrc).toContain(".v3-root--waiting");
    });
  });

  it("thematic kind classes and calm state CSS (no layout shift rules)", () => {
    expect(cssSrc).toContain(".v3-root--water");
    expect(cssSrc).toContain(".v3-root--sun");
    expect(cssSrc).toContain(".v3-root--fertilizer");
    expect(cssSrc).toContain("--v3-shell");
    expect(cssSrc).toContain(".v3-root:focus-visible");
    expect(cssSrc).toContain("v3-root-ready-breathe");
    expect(cssSrc).toContain(".v3-root--transferred");
    expect(cssSrc).toContain(".v3-root--frozen");
    expect(cssSrc).toContain(".v3-root--waiting");
    expect(cssSrc).toContain("max-height: 100%");
    // Hit area wider than stem; states must not change segment height.
    expect(cssSrc).toMatch(/\.v3-root\s*\{[\s\S]*?width:\s*52px/);
    expect(cssSrc).toMatch(/\.v3-root-segment\s*\{[\s\S]*?height:\s*15px/);
    expect(cssSrc).toContain("no layout shift");
  });

  it("disabled / transferred / frozen skip transfer without API call", async () => {
    const transferFn = vi.fn(async () => ({ v3Roots: sampleV3() }));
    for (const root of [
      { playableFromRoot: false, transferred: false },
      { playableFromRoot: true, transferred: true },
      { playableFromRoot: false, transferred: true },
    ] as const) {
      const result = await performEconomyV3RootTransfer({
        kind: "water",
        root,
        busyRoot: null,
        transferEnabled: true,
        transferFn,
      });
      expect(result).toEqual({ ok: false, skipped: true });
    }
    expect(transferFn).not.toHaveBeenCalled();

    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          roots: {
            water: {
              ...rootFromSeconds(10),
              transferred: true,
              playableFromRoot: false,
            },
            sun: {
              ...rootFromSeconds(10),
              frozen: true,
              playableFromRoot: false,
            },
            fertilizer: { ...rootFromSeconds(0), playableFromRoot: false },
          },
        })}
      />,
    );
    expect(html).toMatch(
      /data-v3-root="water"[^>]*disabled/,
    );
    expect(html).toMatch(
      /data-v3-root="sun"[^>]*disabled/,
    );
  });

  it("F5-style remount from snapshot restores visual states (no client-only fill)", () => {
    const snap = sampleV3({
      roots: {
        water: {
          ...rootFromSeconds(0),
          transferred: true,
          playableFromRoot: false,
        },
        sun: { ...rootFromSeconds(12), frozen: true, playableFromRoot: false },
        fertilizer: rootFromSeconds(25),
      },
      generation: {
        anchorAt: "2026-07-23T00:00:00.000Z",
        progress: 0,
        frozenAt: "2026-07-23T00:01:00.000Z",
        insuranceDeadlineAt: null,
        firstTransferredRoot: "water",
        transferredRoots: ["water"],
        secondsUntilNextWholeSecond: null,
        accumulating: true,
      },
    });
    const first = renderToStaticMarkup(
      <EconomyV3RootSystem transferEnabled reducedMotion v3Roots={snap} />,
    );
    const remount = renderToStaticMarkup(
      <EconomyV3RootSystem transferEnabled reducedMotion v3Roots={snap} />,
    );
    expect(first).toBe(remount);
    expect(remount).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-state="empty"/,
    );
    expect(remount).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-clickable="false"/,
    );
    // Non-playable energy root during freeze: frozen, not waiting pulse
    expect(remount).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-state="frozen"/,
    );
    expect(remount).toMatch(
      /data-v3-root="fertilizer"[^>]*data-v3-root-state="waiting"/,
    );
    expect(remount).not.toContain("v3-root--transferring");
    expect(remount).not.toContain("v3-root--press");
    expect(remount.match(/data-v3-segment=/g)?.length).toBe(15);
  });

  it("after first transfer: playable energy roots waiting; empty transferred calm", () => {
    const frozenSnap = sampleV3({
      roots: {
        water: {
          ...rootFromSeconds(0),
          transferred: true,
          playableFromRoot: false,
          frozen: true,
        },
        sun: { ...rootFromSeconds(8), frozen: true },
        fertilizer: { ...rootFromSeconds(0), frozen: true, playableFromRoot: false },
      },
      generation: {
        anchorAt: "2026-07-23T00:00:00.000Z",
        progress: 0.3,
        frozenAt: "2026-07-23T00:01:00.000Z",
        insuranceDeadlineAt: "2026-07-23T00:02:00.000Z",
        firstTransferredRoot: "water",
        transferredRoots: ["water"],
        secondsUntilNextWholeSecond: 400,
        accumulating: true,
      },
    });
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        reducedMotion={false}
        v3Roots={frozenSnap}
      />,
    );
    expect(html).toContain('data-v3-cycle-frozen="true"');
    expect(html).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-state="empty"/,
    );
    expect(html).not.toMatch(
      /data-v3-root="water"[^>]*data-v3-root-waiting="true"/,
    );
    expect(html).not.toMatch(/data-v3-root="water"[^>]*v3-root--waiting-motion/);
    expect(html).toMatch(/data-v3-root="sun"[^>]*data-v3-root-state="waiting"/);
    expect(html).toMatch(
      /v3-root--sun[^"]*v3-root--waiting-motion[^"]*"[^>]*data-v3-root="sun"/,
    );
    // Empty non-transferred neighbor must not pulse from insurance alone
    expect(html).toMatch(
      /data-v3-root="fertilizer"[^>]*data-v3-root-state="empty"/,
    );
    expect(html).not.toMatch(
      /v3-root--fertilizer[^"]*v3-root--waiting-motion/,
    );
    expect(html).toMatch(
      /data-v3-root="sun"[^>]*data-v3-root-clickable="true"/,
    );
    expect(html).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-clickable="false"/,
    );
  });

  it("waiting disappears on fresh unfrozen cycle snapshot", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={sampleV3({
          generation: {
            anchorAt: "2026-07-23T00:03:00.000Z",
            progress: 0.2,
            frozenAt: null,
            insuranceDeadlineAt: null,
            firstTransferredRoot: null,
            transferredRoots: [],
            secondsUntilNextWholeSecond: 5,
            accumulating: true,
          },
        })}
      />,
    );
    expect(html).toContain('data-v3-cycle-frozen="false"');
    expect(html).not.toContain('data-v3-root-state="waiting"');
    expect(html).not.toContain("v3-root--waiting-motion");
  });

  it("without frozenAt waiting is not applied", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem transferEnabled v3Roots={sampleV3()} />,
    );
    expect(html).not.toContain('data-v3-root-waiting="true"');
    expect(html).not.toContain("v3-root--waiting");
  });

  it("reduced-motion disables waiting-motion class", () => {
    const frozenSnap = sampleV3({
      roots: {
        water: {
          ...rootFromSeconds(0),
          transferred: true,
          playableFromRoot: false,
        },
        sun: rootFromSeconds(8),
        fertilizer: rootFromSeconds(12),
      },
      generation: {
        anchorAt: null,
        progress: 0,
        frozenAt: "2026-07-23T00:01:00.000Z",
        insuranceDeadlineAt: null,
        firstTransferredRoot: "water",
        transferredRoots: ["water"],
        secondsUntilNextWholeSecond: null,
        accumulating: true,
      },
    });
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        reducedMotion
        v3Roots={frozenSnap}
      />,
    );
    expect(html).toContain('data-v3-root-state="waiting"');
    expect(html).toContain("v3-root--waiting");
    expect(html).not.toContain("v3-root--waiting-motion");
    expect(cssSrc).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("waiting-motion only on playable non-transferred energy root", () => {
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        reducedMotion={false}
        v3Roots={sampleV3({
          roots: {
            water: {
              ...rootFromSeconds(0),
              transferred: true,
              playableFromRoot: false,
            },
            sun: rootFromSeconds(5),
            fertilizer: {
              ...rootFromSeconds(0),
              playableFromRoot: false,
            },
          },
          generation: {
            anchorAt: "2026-07-23T00:00:00.000Z",
            progress: 0.2,
            frozenAt: "2026-07-23T00:01:00.000Z",
            insuranceDeadlineAt: "2026-07-23T00:02:00.000Z",
            firstTransferredRoot: "water",
            transferredRoots: ["water"],
            secondsUntilNextWholeSecond: 500,
            accumulating: true,
          },
        })}
      />,
    );
    expect(html).toMatch(
      /v3-root--sun[^"]*v3-root--waiting-motion[^"]*"[^>]*data-v3-root="sun"/,
    );
    expect(html).not.toMatch(/v3-root--water[^"]*v3-root--waiting-motion/);
    expect(html).not.toMatch(
      /v3-root--fertilizer[^"]*v3-root--waiting-motion/,
    );
  });

  it("does not crash when v3 snapshot is absent", () => {
    expect(renderToStaticMarkup(<EconomyV3RootSystem v3Roots={null} />)).toBe(
      "",
    );
  });

  it("has transfer wiring; transfer anim without rAF / localStorage", () => {
    expect(compSrc).toContain("transferV3Root");
    expect(compSrc).toContain("onClick");
    expect(compSrc).toContain("performEconomyV3RootTransfer");
    expect(compSrc).toContain("planV3ManualTransferSuccess");
    expect(compSrc).toContain("waiting-motion");
    expect(compSrc).toContain("v3-root--transferring");
    expect(compSrc).toContain("V3TransferFlight");
    expect(compSrc).toContain("setTimeout");
    expect(compSrc).not.toContain("requestAnimationFrame");
    expect(compSrc).not.toMatch(/\blocalStorage\b/);
    expect(cssSrc).toContain("v3-root-waiting-pulse");
    expect(cssSrc).toContain("v3-root-transfer-rise");
    expect(cssSrc).toContain("v3-transfer-flight-move");
  });
});

describe("manual transfer animation (7E)", () => {
  function frozenAfterWaterTransfer(holdSeconds = 7) {
    return sampleV3({
      roots: {
        water: {
          ...rootFromSeconds(0),
          transferred: true,
          playableFromRoot: false,
          frozen: true,
        },
        sun: { ...rootFromSeconds(4), frozen: true },
        fertilizer: { ...rootFromSeconds(21), frozen: true },
      },
      reserves: {
        water: {
          seconds: holdSeconds,
          capacitySeconds: 20,
          playable: true,
        },
        sun: { seconds: 0, capacitySeconds: 20, playable: false },
        fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
      },
      generation: {
        anchorAt: "2026-07-23T00:00:00.000Z",
        progress: 0,
        frozenAt: "2026-07-23T00:01:00.000Z",
        insuranceDeadlineAt: "2026-07-23T00:02:00.000Z",
        firstTransferredRoot: "water",
        transferredRoots: ["water"],
        secondsUntilNextWholeSecond: null,
        accumulating: false,
      },
    });
  }

  it("animation is planned only after success (not before / not on error)", async () => {
    const hold = rootFromSeconds(7);
    const pending = frozenAfterWaterTransfer(7);
    const transferFn = vi.fn(async () => ({ v3Roots: pending }));

    const before = planV3ManualTransferSuccess({
      kind: "water",
      holdRoot: hold,
      pendingSnapshot: pending,
      reducedMotion: false,
    });
    expect(before.mode).toBe("animate");

    const fail = await performEconomyV3RootTransfer({
      kind: "water",
      root: { playableFromRoot: true, transferred: false },
      busyRoot: null,
      transferEnabled: true,
      transferFn: async () => {
        throw Object.assign(new Error("conflict"), { status: 409 });
      },
    });
    expect(fail.ok).toBe(false);
    // Error path never reaches planV3ManualTransferSuccess in the component.
    expect(transferFn).not.toHaveBeenCalled();

    const ok = await performEconomyV3RootTransfer({
      kind: "water",
      root: { playableFromRoot: true, transferred: false },
      busyRoot: null,
      transferEnabled: true,
      transferFn,
    });
    expect(ok.ok).toBe(true);
    expect(transferFn).toHaveBeenCalledTimes(1);
    if (ok.ok) {
      const plan = planV3ManualTransferSuccess({
        kind: "water",
        holdRoot: hold,
        pendingSnapshot: ok.v3Roots,
        reducedMotion: false,
      });
      expect(plan.mode).toBe("animate");
      if (plan.mode === "animate") {
        expect(plan.durationMs).toBe(V3_TRANSFER_ANIM_MS);
        expect(plan.durationMs).toBeGreaterThanOrEqual(500);
        expect(plan.durationMs).toBeLessThanOrEqual(900);
      }
    }
  });

  it("successful transfer plans animate for water / sun / fertilizer", () => {
    for (const kind of ["water", "sun", "fertilizer"] as const) {
      const hold = rootFromSeconds(8);
      const pending = sampleV3({
        roots: {
          water:
            kind === "water"
              ? { ...rootFromSeconds(0), transferred: true, playableFromRoot: false }
              : { ...rootFromSeconds(4), frozen: true },
          sun:
            kind === "sun"
              ? { ...rootFromSeconds(0), transferred: true, playableFromRoot: false }
              : { ...rootFromSeconds(4), frozen: true },
          fertilizer:
            kind === "fertilizer"
              ? { ...rootFromSeconds(0), transferred: true, playableFromRoot: false }
              : { ...rootFromSeconds(4), frozen: true },
        },
        reserves: {
          water: {
            seconds: kind === "water" ? 8 : 0,
            capacitySeconds: 20,
            playable: kind === "water",
          },
          sun: {
            seconds: kind === "sun" ? 8 : 0,
            capacitySeconds: 20,
            playable: kind === "sun",
          },
          fertilizer: {
            seconds: kind === "fertilizer" ? 8 : 0,
            capacitySeconds: 20,
            playable: kind === "fertilizer",
          },
        },
        generation: {
          anchorAt: "2026-07-23T00:00:00.000Z",
          progress: 0,
          frozenAt: "2026-07-23T00:01:00.000Z",
          insuranceDeadlineAt: null,
          firstTransferredRoot: kind,
          transferredRoots: [kind],
          secondsUntilNextWholeSecond: null,
          accumulating: false,
        },
      });
      const plan = planV3ManualTransferSuccess({
        kind,
        holdRoot: hold,
        pendingSnapshot: pending,
        reducedMotion: false,
      });
      expect(plan.mode).toBe("animate");
      if (plan.mode === "animate") {
        expect(plan.kind).toBe(kind);
        expect(plan.pendingSnapshot.roots[kind].transferred).toBe(true);
        expect(plan.pendingSnapshot.reserves[kind].seconds).toBe(8);
      }
    }
  });

  it("error path rolls back lock; retry remains possible", async () => {
    let calls = 0;
    const transferFn = async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("network"), { status: 503 });
      }
      return { v3Roots: frozenAfterWaterTransfer() };
    };
    const fail = await performEconomyV3RootTransfer({
      kind: "sun",
      root: { playableFromRoot: true, transferred: false },
      busyRoot: null,
      transferEnabled: true,
      transferFn,
    });
    expect(fail.ok).toBe(false);
    if (!fail.ok && !fail.skipped) {
      expect(fail.error).toContain("503");
    }
    // After failure, a fresh call with clear busyRoot can run again.
    const retry = await performEconomyV3RootTransfer({
      kind: "sun",
      root: { playableFromRoot: true, transferred: false },
      busyRoot: null,
      transferEnabled: true,
      transferFn,
    });
    expect(retry.ok).toBe(true);
    expect(calls).toBe(2);
    expect(compSrc).toContain("Rollback visual lock");
    expect(compSrc).toContain("setBusyRoot(null)");
  });

  it("selected root gets transferring-class and held fill until apply", () => {
    const live = sampleV3();
    const hold = live.roots.water;
    const pending = frozenAfterWaterTransfer(hold.seconds);
    const plan = planV3ManualTransferSuccess({
      kind: "water",
      holdRoot: hold,
      pendingSnapshot: pending,
      reducedMotion: false,
    });
    expect(plan.mode).toBe("animate");
    if (plan.mode !== "animate") return;

    const display = resolveV3RootsDisplaySnapshot(live, plan);
    const water = resolveV3RootDisplayDuringTransfer(
      "water",
      display.roots.water,
      plan,
    );
    expect(water.seconds).toBe(hold.seconds);
    expect(water.fullSegments).toBe(hold.fullSegments);
    // Live display stays pre-transfer; pending holds transferred server truth.
    expect(display.roots.water.transferred).toBe(false);
    expect(plan.pendingSnapshot.roots.water.transferred).toBe(true);
    expect(water.transferred).toBe(false);

    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        reducedMotion={false}
        v3Roots={live}
      />,
    );
    // Idle mount has no transferring class; transferring is transient.
    expect(html).not.toContain("v3-root--transferring");
    expect(compSrc).toContain('data-v3-root-transferring={transferring ? "true"');
    expect(compSrc).toContain("v3-root--transferring");
  });

  it("snapshot apply is deferred until animation completes (plan holds pending)", () => {
    const hold = rootFromSeconds(7);
    const pending = frozenAfterWaterTransfer(7);
    const plan = planV3ManualTransferSuccess({
      kind: "water",
      holdRoot: hold,
      pendingSnapshot: pending,
      reducedMotion: false,
    });
    expect(plan.mode).toBe("animate");
    if (plan.mode === "animate") {
      expect(plan.pendingSnapshot).toBe(pending);
      expect(plan.holdRoot.seconds).toBe(7);
    }
    expect(compSrc).toContain("commitV3TransferPendingOnce");
    expect(compSrc).toContain("commitPendingTransfer");
    expect(compSrc).toContain("setTimeout");
  });

  it("double click blocked while busy / transferring", async () => {
    const transferFn = vi.fn(async () => ({
      v3Roots: frozenAfterWaterTransfer(),
    }));
    expect(
      await performEconomyV3RootTransfer({
        kind: "water",
        root: { playableFromRoot: true, transferred: false },
        busyRoot: "water",
        transferEnabled: true,
        transferFn,
      }),
    ).toEqual({ ok: false, skipped: true });
    expect(transferFn).not.toHaveBeenCalled();
    expect(compSrc).toContain("transferringRef.current != null");
    expect(compSrc).toContain("uiLocked");
  });

  it("during flight display stays live; pending snapshot carries waiting/transferred for commit", () => {
    const live = sampleV3();
    const pending = frozenAfterWaterTransfer();
    const plan = planV3ManualTransferSuccess({
      kind: "water",
      holdRoot: live.roots.water,
      pendingSnapshot: pending,
      reducedMotion: false,
    });
    expect(plan.mode).toBe("animate");
    if (plan.mode !== "animate") return;
    const display = resolveV3RootsDisplaySnapshot(live, plan);
    // Reserves / siblings must not jump ahead of the flight.
    expect(display.generation.frozenAt).toBeNull();
    expect(display.reserves.water.seconds).toBe(live.reserves.water.seconds);
    expect(plan.pendingSnapshot.generation.frozenAt).not.toBeNull();
    expect(plan.pendingSnapshot.reserves.water.seconds).toBe(7);
    expect(
      resolveV3RootVisualState(plan.pendingSnapshot.roots.sun, false, true),
    ).toBe("waiting");
    expect(
      resolveV3RootVisualState(
        plan.pendingSnapshot.roots.fertilizer,
        false,
        true,
      ),
    ).toBe("waiting");
    expect(
      resolveV3RootVisualState(plan.pendingSnapshot.roots.water, false, true),
    ).toBe("empty");
  });

  it("auto-transfer / GET snapshot path does not plan manual animation", () => {
    // Fresh GET after auto-transfer is applied via props; plan is only for POST success.
    const autoSnap = frozenAfterWaterTransfer();
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem transferEnabled v3Roots={autoSnap} />,
    );
    expect(html).toMatch(
      /data-v3-root="water"[^>]*data-v3-root-state="empty"/,
    );
    expect(html).toContain('data-v3-root-state="waiting"');
    expect(html).not.toContain("v3-root--transferring");
    expect(html).not.toContain('data-v3-transferring="water"');
    expect(compSrc).toContain("planV3ManualTransferSuccess");
    expect(compSrc).toMatch(
      /handleTransfer[\s\S]*planV3ManualTransferSuccess/,
    );
  });

  it("reduced-motion applies snapshot immediately", () => {
    expect(shouldAnimateV3Transfer(true)).toBe(false);
    const plan = planV3ManualTransferSuccess({
      kind: "water",
      holdRoot: rootFromSeconds(7),
      pendingSnapshot: frozenAfterWaterTransfer(),
      reducedMotion: true,
    });
    expect(plan).toEqual({
      mode: "immediate",
      snapshot: expect.objectContaining({ enabled: true }),
    });
    expect(compSrc).toContain('plan.mode === "immediate"');
    expect(cssSrc).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?v3-root-transfer-energy/,
    );
  });

  it("F5 / remount does not restore transfer animation", () => {
    expect(compSrc).not.toMatch(/\blocalStorage\b/);
    expect(compSrc).toContain("useState<V3TransferringState");
    const html = renderToStaticMarkup(
      <EconomyV3RootSystem
        transferEnabled
        v3Roots={frozenAfterWaterTransfer()}
      />,
    );
    expect(html).not.toContain("v3-root--transferring");
    expect(html).toContain('data-v3-transferring="false"');
  });

  it("transfer energy uses activity colors inside root", () => {
    expect(cssSrc).toContain("v3-root-transfer-channel");
    expect(cssSrc).toContain("v3-root-transfer-energy");
    expect(cssSrc).toContain("v3-root-transfer-rise");
    expect(compSrc).toContain("V3_ROOT_FILL_COLORS");
    expect(compSrc).toContain("V3_ROOT_WASH_COLORS");
    expect(compSrc).toContain("--v3-seg-wash");
    expect(compSrc).toContain("v3-root-transfer-energy");
    expect(V3_ROOT_FILL_COLORS.water).toMatch(/#2b7fff/i);
    expect(V3_ROOT_FILL_COLORS.sun).toMatch(/#ffc107/i);
    expect(V3_ROOT_FILL_COLORS.fertilizer).toMatch(/#f0a020/i);
    // Fertilizer energy pairs with warm amber accent — not green.
    expect(V3_ROOT_FILL_COLORS.fertilizer).not.toMatch(/#7eae74/i);
    expect(V3_ROOT_FILL_COLORS.water).not.toBe(V3_ROOT_FILL_COLORS.sun);
    expect(V3_ROOT_FILL_COLORS.sun).not.toBe(V3_ROOT_FILL_COLORS.fertilizer);
    expect(cssSrc).toMatch(
      /\.v3-root--water,\s*\.v3-root--sun,\s*\.v3-root--fertilizer\s*\{[\s\S]*?--v3-shell:\s*var\(--field-caption-bg\)/,
    );
    expect(cssSrc).toMatch(
      /--field-caption-bg:\s*rgba\(255,\s*248,\s*236,\s*0\.92\)/,
    );
  });
});

describe("Economy v3 primary roots UI (8C)", () => {
  it("v3 enabled mounts EconomyV3RootSystem; RootEnergyLayer only when v3 absent", () => {
    expect(flagsSrc).toContain("SHOW_ECONOMY_V3_ROOTS_PREVIEW");
    expect(flagsSrc).toContain("VITE_SHOW_ECONOMY_V3_ROOTS_PREVIEW");
    expect(pageSrc).toContain("useV3RootsUi");
    expect(pageSrc).toContain("isEconomyV3GameCycleEnabled");
    expect(pageSrc).toContain("const useV3RootsUi = useV3");
    expect(pageSrc).toContain("<EconomyV3RootSystem");
    expect(pageSrc).toContain("transferEnabled");
    expect(pageSrc).toContain("metelkaLocked");
    expect(pageSrc).toContain("careBlockedByMetelka");
    expect(pageSrc).toContain("applyEconomyV3RootsToState");
    expect(pageSrc).toContain('data-v3-roots-primary="true"');
    expect(pageSrc).toContain("!useV3RootsUi");
    expect(pageSrc).toContain("<RootEnergyLayer");
    // Preview chrome removed from production mount
    expect(pageSrc).not.toContain("v3-roots-preview-missing");
    expect(pageSrc).not.toContain('data-v3-roots-preview="true"');
    expect(pageSrc).not.toContain("data-testid=\"v3-roots-preview\"");
    // Preview env is not required to mount v3 roots
    expect(pageSrc).not.toMatch(
      /SHOW_ECONOMY_V3_ROOTS_PREVIEW\s*&&\s*\([\s\S]{0,120}EconomyV3RootSystem/,
    );
    expect(cssSrc).toMatch(/\.game-area\s+\.v3-root-anchor\s*\{/);
    expect(cssSrc).toMatch(
      /\.v3-root-system\s*\{[\s\S]*?background:\s*transparent/,
    );
  });

  it("component no longer marks itself as preview", () => {
    expect(compSrc).not.toContain('data-v3-preview="true"');
    expect(compSrc).toContain('data-v3-root-system="true"');
  });
});
