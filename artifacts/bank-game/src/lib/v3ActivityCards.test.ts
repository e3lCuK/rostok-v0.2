import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  mayStartLegacyCareFromActivityCard,
  resolveV3ActivityCard,
  shouldUseV3ActivityCardUi,
  splitV3ReserveSeconds,
  v3ActivityReserveFillPercent,
  v3ActivitySegmentFill,
  V3_ACTIVITY_PLAYABLE_MIN_SECONDS,
} from "./v3ActivityCards";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
const fillSrc = readFileSync(
  join(here, "../components/v2/V3ActivityReserveFill.tsx"),
  "utf8",
);
const meterSrc = readFileSync(
  join(here, "../components/v2/V3ActivityReserveMeter.tsx"),
  "utf8",
);

function baseV3(
  overrides: {
    reserves?: Partial<EconomyV3RootsState["reserves"]>;
    careAvailability?: Partial<EconomyV3RootsState["careAvailability"]>;
    careSession?: Partial<EconomyV3RootsState["careSession"]>;
    careCycleActivities?: Partial<
      EconomyV3RootsState["careCycle"]["activities"]
    >;
  } = {},
): EconomyV3RootsState {
  const raw = {
    enabled: true,
    dailyCapSeconds: 20,
    dayKey: "2026-07-23",
    roots: {
      water: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
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
        transferred: false,
        frozen: false,
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
    reserves: {
      water: { seconds: 0, capacitySeconds: 20, playable: false },
      sun: { seconds: 0, capacitySeconds: 20, playable: false },
      fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
      ...overrides.reserves,
    },
    careAvailability: {
      water: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      fertilizer: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      ...overrides.careAvailability,
    },
    careSession: {
      active: false,
      activity: null,
      presetSeconds: null,
      startedAt: null,
      finishedAt: null,
      status: null,
      skill: null,
      ...overrides.careSession,
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
        ...overrides.careCycleActivities,
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
  };
  const snap = normalizeEconomyV3RootsSnapshot(raw);
  if (!snap) throw new Error("expected normalized v3 snapshot");
  return snap;
}

describe("shouldUseV3ActivityCardUi", () => {
  it("follows live v3Roots.enabled; preview env is not required", () => {
    expect(shouldUseV3ActivityCardUi(false, baseV3())).toBe(true);
    expect(shouldUseV3ActivityCardUi(true, null)).toBe(false);
    expect(shouldUseV3ActivityCardUi(true, undefined)).toBe(false);
    expect(shouldUseV3ActivityCardUi(false, null)).toBe(false);
    expect(shouldUseV3ActivityCardUi(true, baseV3())).toBe(true);
  });
});

describe("splitV3ReserveSeconds / partial fill", () => {
  it("maps 7 / 13 / 21 to expected segment fills", () => {
    expect(splitV3ReserveSeconds(7)).toEqual({
      fullSegments: 1,
      partialSegmentSeconds: 2,
    });
    expect(splitV3ReserveSeconds(13)).toEqual({
      fullSegments: 2,
      partialSegmentSeconds: 3,
    });
    expect(splitV3ReserveSeconds(21)).toEqual({
      fullSegments: 4,
      partialSegmentSeconds: 1,
    });
    // Water 7: seg0 full, seg1 40%, rest empty
    expect(v3ActivitySegmentFill(0, 7)).toBe(1);
    expect(v3ActivitySegmentFill(1, 7)).toBeCloseTo(0.4);
    expect(v3ActivitySegmentFill(2, 7)).toBe(0);
    // Sun 13: 2 full + 60%
    expect(v3ActivitySegmentFill(0, 13)).toBe(1);
    expect(v3ActivitySegmentFill(1, 13)).toBe(1);
    expect(v3ActivitySegmentFill(2, 13)).toBeCloseTo(0.6);
    // Fertilizer 21: 4 full + 20%
    expect(v3ActivitySegmentFill(3, 21)).toBe(1);
    expect(v3ActivitySegmentFill(4, 21)).toBeCloseTo(0.2);
  });
});

describe("resolveV3ActivityCard — per-kind reserves", () => {
  it("each card reads its own reserve; water does not affect sun/fertilizer", () => {
    const snap = baseV3({
      reserves: {
        water: { seconds: 7, capacitySeconds: 25, playable: true },
        sun: { seconds: 13, capacitySeconds: 25, playable: true },
        fertilizer: { seconds: 21, capacitySeconds: 25, playable: true },
      },
      careAvailability: {
        water: { reserveSeconds: 7, playable: true, maxPresetSeconds: 7 },
        sun: { reserveSeconds: 13, playable: true, maxPresetSeconds: 13 },
        fertilizer: {
          reserveSeconds: 21,
          playable: true,
          maxPresetSeconds: 21,
        },
      },
    });
    // dailyCap default 20 would clamp 21 → override via normalize: rebuild with cap 25
    const withCap = normalizeEconomyV3RootsSnapshot({
      ...snap,
      dailyCapSeconds: 25,
      reserves: {
        water: { seconds: 7, capacitySeconds: 25, playable: true },
        sun: { seconds: 13, capacitySeconds: 25, playable: true },
        fertilizer: { seconds: 21, capacitySeconds: 25, playable: true },
      },
    });
    if (!withCap) throw new Error("expected snap");
    const water = resolveV3ActivityCard("water", withCap);
    const sun = resolveV3ActivityCard("sun", withCap);
    const fert = resolveV3ActivityCard("fertilizer", withCap);
    expect(water.reserveSeconds).toBe(7);
    expect(sun.reserveSeconds).toBe(13);
    expect(fert.reserveSeconds).toBe(21);
    expect(water.reserveSeconds).not.toBe(sun.reserveSeconds);
    expect(water.reserveSeconds).not.toBe(fert.reserveSeconds);
    expect(water.uiState).toBe("available");
    expect(sun.uiState).toBe("available");
    expect(fert.uiState).toBe("available");
  });

  it("4 seconds → disabled; 5 seconds → available", () => {
    expect(V3_ACTIVITY_PLAYABLE_MIN_SECONDS).toBe(5);
    const low = resolveV3ActivityCard(
      "water",
      baseV3({
        reserves: {
          water: { seconds: 4, capacitySeconds: 20, playable: false },
        },
        careAvailability: {
          water: { reserveSeconds: 4, playable: false, maxPresetSeconds: 0 },
        },
      }),
    );
    expect(low.uiState).toBe("disabled");
    expect(low.playable).toBe(false);

    const ok = resolveV3ActivityCard(
      "water",
      baseV3({
        reserves: {
          water: { seconds: 5, capacitySeconds: 20, playable: true },
        },
        careAvailability: {
          water: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
        },
      }),
    );
    expect(ok.uiState).toBe("available");
    expect(ok.playable).toBe(true);
  });

  it("completed activity is separate from disabled/available", () => {
    const snap = baseV3({
      reserves: {
        water: { seconds: 10, capacitySeconds: 20, playable: true },
        sun: { seconds: 10, capacitySeconds: 20, playable: true },
      },
      careAvailability: {
        water: { reserveSeconds: 10, playable: true, maxPresetSeconds: 10 },
        sun: { reserveSeconds: 10, playable: true, maxPresetSeconds: 10 },
      },
      careCycleActivities: {
        water: { completed: true, presetSeconds: 5, skill: 0.4 },
      },
    });
    expect(resolveV3ActivityCard("water", snap).uiState).toBe("completed");
    expect(resolveV3ActivityCard("sun", snap).uiState).toBe("available");
  });

  it("active v3 session locks other cards and the active card", () => {
    const snap = baseV3({
      reserves: {
        water: { seconds: 8, capacitySeconds: 20, playable: true },
        sun: { seconds: 8, capacitySeconds: 20, playable: true },
        fertilizer: { seconds: 8, capacitySeconds: 20, playable: true },
      },
      careAvailability: {
        water: { reserveSeconds: 8, playable: true, maxPresetSeconds: 8 },
        sun: { reserveSeconds: 8, playable: true, maxPresetSeconds: 8 },
        fertilizer: { reserveSeconds: 8, playable: true, maxPresetSeconds: 8 },
      },
      careSession: {
        active: true,
        activity: "water",
        status: "active",
        presetSeconds: 5,
        startedAt: "2026-07-23T12:00:00.000Z",
        finishedAt: null,
        skill: null,
      },
    });
    expect(resolveV3ActivityCard("water", snap).sessionActiveHere).toBe(true);
    expect(resolveV3ActivityCard("water", snap).uiState).toBe("session-locked");
    expect(resolveV3ActivityCard("sun", snap).uiState).toBe(
      "session-locked",
    );
    expect(resolveV3ActivityCard("fertilizer", snap).uiState).toBe(
      "session-locked",
    );
  });
});

describe("mayStartLegacyCareFromActivityCard — no dual v2/v3 spend", () => {
  it("blocks legacy start when v3 Roots UI is active", () => {
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: true,
        v3Roots: baseV3(),
      }),
    ).toBe(false);
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: false,
        v3Roots: baseV3(),
      }),
    ).toBe(false);
  });

  it("allows legacy start without v3 snapshot (old UI)", () => {
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: true,
        v3Roots: null,
      }),
    ).toBe(true);
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: false,
        v3Roots: null,
      }),
    ).toBe(true);
  });

  it("tutorial override still allows local minigame path", () => {
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: true,
        v3Roots: baseV3(),
        tutorialOverride: true,
      }),
    ).toBe(true);
  });
});

describe("GamePage wiring (7G reserves + 7H start)", () => {
  it("wires continuous reserve fill + v3 Care start (not legacy when v3 card)", () => {
    expect(pageSrc).toContain("shouldUseV3ActivityCardUi");
    expect(pageSrc).toContain("resolveV3ActivityCard");
    expect(pageSrc).toContain("mayStartLegacyCareFromActivityCard");
    expect(pageSrc).toContain("V3ActivityReserveFill");
    expect(pageSrc).toContain("v3ActivityReserveFillPercent");
    expect(pageSrc).not.toContain("V3ActivityReserveMeter");
    expect(pageSrc).toContain("data-v3-activity-card");
    expect(pageSrc).toContain("data-v3-activity-legacy-start");
    expect(pageSrc).toContain("handleStartV3CareActivity");
    expect(pageSrc).toContain("api.startV3CareActivity");
    expect(pageSrc).not.toMatch(
      /debugEconomyV3Roots[\s\S]{0,40}handleStartSession/,
    );
    const mapBlock = pageSrc.slice(
      pageSrc.indexOf('label: "Вода"'),
      pageSrc.indexOf("data-v3-activity-can-start"),
    );
    expect(mapBlock).toContain("handleStartV3CareActivity");
    expect(mapBlock.indexOf("handleStartV3CareActivity")).toBeLessThan(
      mapBlock.indexOf("handleStartSession(btn.key)"),
    );
  });

  it("production UI has no five reserve cells; legacy meter file remains", () => {
    expect(pageSrc).not.toContain("v3-activity-reserve-segment");
    expect(pageSrc).not.toContain("v3ActivitySegmentFill");
    expect(fillSrc).toContain("data-v3-activity-reserve-fill");
    expect(cssSrc).toMatch(
      /\.v3-activity-reserve-fill\s*\{[\s\S]*?pointer-events:\s*none/,
    );
    expect(fillSrc).not.toContain("api.");
    expect(fillSrc).not.toContain("handleStartSession");
    // Legacy segment meter kept on disk for rollback/tests — not mounted.
    expect(meterSrc).toContain("v3ActivitySegmentFill");
    expect(meterSrc).toContain("V3_SEGMENT_COUNT");
  });
});

describe("v3ActivityReserveFillPercent — continuous visual height", () => {
  it("maps reserve/cap to 0–100% without local economy math", () => {
    expect(v3ActivityReserveFillPercent(0, 25)).toBe(0);
    expect(v3ActivityReserveFillPercent(5, 25)).toBe(20);
    expect(v3ActivityReserveFillPercent(9, 25)).toBe(36);
    expect(v3ActivityReserveFillPercent(20, 25)).toBe(80);
    expect(v3ActivityReserveFillPercent(25, 25)).toBe(100);
  });

  it("clamps to 0–100 and ignores invalid cap", () => {
    expect(v3ActivityReserveFillPercent(-3, 25)).toBe(0);
    expect(v3ActivityReserveFillPercent(40, 25)).toBe(100);
    expect(v3ActivityReserveFillPercent(10, 0)).toBe(0);
    expect(v3ActivityReserveFillPercent("9", "25")).toBe(36);
  });

  it("water/sun/fertilizer stay independent via per-card reserves", () => {
    const withCap = normalizeEconomyV3RootsSnapshot({
      ...baseV3(),
      dailyCapSeconds: 25,
      reserves: {
        water: { seconds: 5, capacitySeconds: 25, playable: true },
        sun: { seconds: 9, capacitySeconds: 25, playable: true },
        fertilizer: { seconds: 25, capacitySeconds: 25, playable: true },
      },
      careAvailability: {
        water: { reserveSeconds: 5, playable: true, maxPresetSeconds: 5 },
        sun: { reserveSeconds: 9, playable: true, maxPresetSeconds: 9 },
        fertilizer: {
          reserveSeconds: 25,
          playable: true,
          maxPresetSeconds: 25,
        },
      },
    });
    if (!withCap) throw new Error("expected snap");
    const water = resolveV3ActivityCard("water", withCap);
    const sun = resolveV3ActivityCard("sun", withCap);
    const fert = resolveV3ActivityCard("fertilizer", withCap);
    expect(
      v3ActivityReserveFillPercent(water.reserveSeconds, water.dailyCapSeconds),
    ).toBe(20);
    expect(
      v3ActivityReserveFillPercent(sun.reserveSeconds, sun.dailyCapSeconds),
    ).toBe(36);
    expect(
      v3ActivityReserveFillPercent(fert.reserveSeconds, fert.dailyCapSeconds),
    ).toBe(100);
    expect(water.reserveSeconds).not.toBe(sun.reserveSeconds);
  });

  it("activity buttons stay compact squares (v3-reserve must not stretch)", () => {
    expect(cssSrc).toContain("--care-control-size: 46px");
    expect(cssSrc).toMatch(
      /\.session-actions\s*\{[\s\S]*?--action-btn-size:\s*var\(--care-control-size/,
    );
    expect(cssSrc).toMatch(
      /\.action-btn-bank\s*\{[\s\S]*?width:\s*var\(--action-btn-size[\s\S]*?height:\s*var\(--action-btn-size[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/,
    );
    const v3Reserve = cssSrc.match(
      /\.action-btn-bank--v3-reserve\s*\{([^}]+)\}/,
    )?.[1];
    expect(v3Reserve).toBeTruthy();
    expect(v3Reserve).toMatch(/width:\s*var\(--action-btn-size/);
    expect(v3Reserve).toMatch(/height:\s*var\(--action-btn-size/);
    expect(v3Reserve).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    expect(v3Reserve).not.toMatch(/min-height:\s*72px/);
    expect(v3Reserve).not.toMatch(/width:\s*58px/);
  });

  it("fill layer CSS: under icon, no pointer events, reduced-motion, muted disabled", () => {
    expect(cssSrc).toContain(".v3-activity-reserve-fill");
    expect(cssSrc).toMatch(
      /\.v3-activity-reserve-fill\s*\{[\s\S]*?pointer-events:\s*none/,
    );
    expect(cssSrc).toMatch(
      /\.v3-activity-reserve-fill\s*\{[\s\S]*?z-index:\s*0/,
    );
    expect(cssSrc).toContain("v3-activity-reserve-fill--animate");
    expect(cssSrc).toContain("v3-activity-reserve-fill--muted");
    expect(cssSrc).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?v3-activity-reserve-fill--animate/,
    );
    expect(fillSrc).toContain("v3-activity-reserve-fill--animate");
    expect(fillSrc).toContain("requestAnimationFrame");
    expect(pageSrc).toContain('muted={');
    expect(pageSrc).toContain('uiState === "disabled"');
    // completed takes priority in resolveV3ActivityCard before disabled
    expect(
      resolveV3ActivityCard(
        "water",
        baseV3({
          careCycleActivities: {
            water: { completed: true, presetSeconds: 5, skill: 0.5 },
          },
          careAvailability: {
            water: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
          },
        }),
      ).uiState,
    ).toBe("completed");
  });

  it("filled activities: no Metelka grey-lock on Care row; no stale result «done» shell", () => {
    // Visual lock comes only from card/tutorial — not careBlockedByMetelka.
    expect(pageSrc).toContain("isV3ActivityButtonVisuallyLocked");
    expect(pageSrc).not.toMatch(
      /v3VisuallyLocked\s*=\s*useV3\s*\?\s*metelkaBlocksCare\s*\|\|/,
    );
    // Server-ready Care cycle forces shovel instead of white completed cards.
    expect(pageSrc).toContain("v3ServerWantsCareShovel");
    expect(pageSrc).toContain("showCareShovelUi");
    // Result fill / action-btn-done only while pending ack/finish or completed.
    expect(pageSrc).toContain("v3ShowResultFill");
    expect(pageSrc).toContain("v3PendingAck === btn.key");
  });
});
