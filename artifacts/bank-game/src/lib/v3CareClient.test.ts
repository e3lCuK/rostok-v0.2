import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  CARE_BLOCKED_BY_METELKA_HINT,
  canStartV3CareActivity,
  careBlockedByMetelka,
  formatV3CareError,
  isV3CareSessionBlocking,
  isV3RootCollectionIncomplete,
  minigameScoreToV3Skill,
  resolveV3CareRecovery,
  resolveV3CareStartPresetSeconds,
  ROOTS_COLLECTION_INCOMPLETE_HINT,
} from "./v3CareClient";
import { mayStartLegacyCareFromActivityCard } from "./v3ActivityCards";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const apiSrc = readFileSync(join(here, "api.ts"), "utf8");

function baseV3(
  overrides: Record<string, unknown> = {},
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
      water: { seconds: 12, capacitySeconds: 20, playable: true },
      sun: { seconds: 8, capacitySeconds: 20, playable: true },
      fertilizer: { seconds: 15, capacitySeconds: 20, playable: true },
    },
    careAvailability: {
      water: { reserveSeconds: 12, playable: true, maxPresetSeconds: 12 },
      sun: { reserveSeconds: 8, playable: true, maxPresetSeconds: 8 },
      fertilizer: { reserveSeconds: 15, playable: true, maxPresetSeconds: 15 },
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
    ...overrides,
  };
  const snap = normalizeEconomyV3RootsSnapshot(raw);
  if (!snap) throw new Error("expected snap");
  return snap;
}

describe("minigameScoreToV3Skill", () => {
  it("maps 0…100 score to skill 0…1", () => {
    expect(minigameScoreToV3Skill(0)).toBe(0);
    expect(minigameScoreToV3Skill(50)).toBe(0.5);
    expect(minigameScoreToV3Skill(100)).toBe(1);
    expect(minigameScoreToV3Skill(83)).toBe(0.83);
    expect(minigameScoreToV3Skill(-5)).toBe(0);
    expect(minigameScoreToV3Skill(140)).toBe(1);
    expect(minigameScoreToV3Skill(NaN)).toBe(0);
  });
});

describe("resolveV3CareStartPresetSeconds / canStart", () => {
  it("GamePage locks live Care until root transfer trio completes", () => {
    expect(pageSrc).toContain("isV3RootCollectionIncomplete");
    expect(pageSrc).toContain("rootsCollectionLocked");
    expect(pageSrc).toContain("activitiesInteractionLocked");
    expect(pageSrc).toContain("ROOTS_COLLECTION_INCOMPLETE_HINT");
    // Accent theming matches live rootsCollectionLocked (not greyed by tutorial).
    expect(pageSrc).toMatch(
      /isV3ActivityButtonVisuallyLocked\(\s*v3Card,\s*false\s*\)/,
    );
    expect(pageSrc).toMatch(
      /v3Themed\s*=\s*\n?\s*useV3\s*&&\s*shouldThemeV3ActivityButton\(v3Card\)/,
    );
  });

  it("uses server maxPresetSeconds — not a local invention", () => {
    const snap = baseV3();
    expect(resolveV3CareStartPresetSeconds("water", snap)).toBe(12);
    expect(resolveV3CareStartPresetSeconds("sun", snap)).toBe(8);
    expect(resolveV3CareStartPresetSeconds("fertilizer", snap)).toBe(15);
  });

  it("4s not startable; 5s+ playable is startable after root trio", () => {
    const low = baseV3({
      reserves: {
        water: { seconds: 4, capacitySeconds: 20, playable: false },
        sun: { seconds: 0, capacitySeconds: 20, playable: false },
        fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
      },
      careAvailability: {
        water: { reserveSeconds: 4, playable: false, maxPresetSeconds: 0 },
        sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
        fertilizer: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      },
    });
    expect(
      canStartV3CareActivity({ activity: "water", v3Roots: low, busy: false }),
    ).toBe(false);

    const ok = baseV3({
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
    });
    expect(isV3RootCollectionIncomplete(ok)).toBe(false);
    expect(
      canStartV3CareActivity({ activity: "water", v3Roots: ok, busy: false }),
    ).toBe(true);
    expect(
      canStartV3CareActivity({ activity: "water", v3Roots: ok, busy: true }),
    ).toBe(false);
  });

  it("mid transfer-trio blocks Care even with playable reserve", () => {
    const mid = baseV3({
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
      generation: {
        ...baseV3().generation,
        frozenAt: "2026-07-23T12:00:00.000Z",
        insuranceDeadlineAt: "2026-07-23T12:01:00.000Z",
        firstTransferredRoot: "water",
        transferredRoots: ["water"],
      },
    });
    expect(isV3RootCollectionIncomplete(mid)).toBe(true);
    expect(
      canStartV3CareActivity({ activity: "water", v3Roots: mid, busy: false }),
    ).toBe(false);
    expect(formatV3CareError({
      status: 409,
      code: "roots_collection_incomplete",
      message: "Collect energy from all roots before starting Care",
    })).toBe(ROOTS_COLLECTION_INCOMPLETE_HINT);

    // Stale full transfer list without freeze must not keep Care grey.
    const staleFull = baseV3({
      generation: {
        ...baseV3().generation,
        frozenAt: null,
        transferredRoots: ["water", "sun", "fertilizer"],
      },
    });
    expect(isV3RootCollectionIncomplete(staleFull)).toBe(false);
    expect(
      canStartV3CareActivity({
        activity: "water",
        v3Roots: staleFull,
        busy: false,
      }),
    ).toBe(true);
  });

  it("busy / active session / completed cycle activity blocks start", () => {
    const active = baseV3({
      careSession: {
        active: true,
        activity: "water",
        presetSeconds: 5,
        startedAt: "2026-07-23T12:00:00.000Z",
        finishedAt: null,
        status: "active",
        skill: null,
      },
    });
    expect(isV3CareSessionBlocking(active)).toBe(true);
    expect(
      canStartV3CareActivity({
        activity: "sun",
        v3Roots: active,
        busy: false,
      }),
    ).toBe(false);

    const done = baseV3({
      careCycle: {
        ...baseV3().careCycle,
        activities: {
          water: { completed: true, presetSeconds: 5, skill: 0.5 },
          sun: { completed: false, presetSeconds: null, skill: null },
          fertilizer: { completed: false, presetSeconds: null, skill: null },
        },
      },
    });
    expect(
      canStartV3CareActivity({
        activity: "water",
        v3Roots: done,
        busy: false,
      }),
    ).toBe(false);
    expect(
      canStartV3CareActivity({
        activity: "sun",
        v3Roots: done,
        busy: false,
      }),
    ).toBe(true);
  });

  it("careBlockedByMetelka: excessAvailable / careLocked block Care start", () => {
    const snap = baseV3();
    expect(careBlockedByMetelka({ v3Roots: snap })).toBe(false);
    expect(
      careBlockedByMetelka({
        excess: {
          excessSeconds: 12,
          excessAvailable: true,
          excessPresetSeconds: 10,
          excessElapsedMs: 0,
          excessFinanciallyValid: false,
          session: {
            active: false,
            startedAt: null,
            sourceSeconds: null,
            sourceElapsedMs: null,
            capital: null,
            presetSeconds: null,
            rate: null,
            webCount: null,
            layoutSeed: null,
            webs: [],
          },
        } as any,
        v3Roots: snap,
      }),
    ).toBe(true);
    expect(
      canStartV3CareActivity({
        activity: "water",
        v3Roots: snap,
        excess: { excessAvailable: true, session: { active: false } } as any,
        busy: false,
      }),
    ).toBe(false);

    const locked = baseV3({
      metelkaCycle: {
        rootsFull: true,
        required: true,
        completedForCycle: false,
        transferLocked: true,
        careLocked: true,
        phase: "metelka_available",
      },
    });
    expect(careBlockedByMetelka({ v3Roots: locked })).toBe(true);
    expect(
      canStartV3CareActivity({
        activity: "water",
        v3Roots: locked,
        busy: false,
      }),
    ).toBe(false);
  });

  it("pending Metelka coin alone does not block Care", () => {
    expect(
      careBlockedByMetelka({
        excess: {
          excessAvailable: false,
          session: { active: false },
        } as any,
        v3Roots: baseV3({
          metelkaCycle: {
            rootsFull: true,
            required: false,
            completedForCycle: true,
            transferLocked: true,
            careLocked: false,
            phase: "metelka_pending_result",
          },
        }),
      }),
    ).toBe(false);
  });

  it("formatV3CareError maps metelka_required_before_care", () => {
    expect(
      formatV3CareError({
        status: 409,
        code: "metelka_required_before_care",
        message: "Clear excess",
      }),
    ).toBe(CARE_BLOCKED_BY_METELKA_HINT);
  });
});

describe("resolveV3CareRecovery (F5)", () => {
  it("active session → open minigame with server preset (no re-start)", () => {
    const snap = baseV3({
      careSession: {
        active: true,
        activity: "sun",
        presetSeconds: 8,
        startedAt: "2026-07-23T12:00:00.000Z",
        finishedAt: null,
        status: "active",
        skill: null,
      },
    });
    expect(resolveV3CareRecovery(snap)).toEqual({
      type: "open-minigame",
      activity: "sun",
      presetSeconds: 8,
    });
  });

  it("completed session → await acknowledge (no reserve re-spend)", () => {
    const snap = baseV3({
      careSession: {
        active: false,
        activity: "fertilizer",
        presetSeconds: 10,
        startedAt: "2026-07-23T12:00:00.000Z",
        finishedAt: "2026-07-23T12:00:10.000Z",
        status: "completed",
        skill: 0.7,
      },
    });
    expect(resolveV3CareRecovery(snap)).toEqual({
      type: "await-acknowledge",
      activity: "fertilizer",
      skill: 0.7,
    });
  });
});

describe("formatV3CareError (no raw HTTP in scene)", () => {
  it("never surfaces HTTP 500 / Internal server error text", () => {
    const msg = formatV3CareError({
      status: 500,
      message: "Internal server error",
      code: "internal",
    });
    expect(msg).toBe("Не удалось выполнить уход. Попробуйте ещё раз.");
    expect(msg).not.toMatch(/HTTP/i);
    expect(msg).not.toMatch(/500/);
    expect(msg).not.toMatch(/Internal server error/i);
  });

  it("maps common 409 codes to short Russian copy", () => {
    expect(
      formatV3CareError({
        status: 409,
        code: "insufficient_reserve",
        message: "not enough",
      }),
    ).toMatch(/запасе|энерг/i);
    expect(
      formatV3CareError({
        status: 409,
        code: "pending_rewards",
        message: "pending",
      }),
    ).toMatch(/награду/i);
    // Must NOT confuse reward_preview / session_pending with unclaimed money.
    expect(
      formatV3CareError({
        status: 409,
        code: "reward_preview_unavailable",
        message: "reward preview unavailable",
      }),
    ).not.toMatch(/награду/i);
    expect(
      formatV3CareError({
        status: 409,
        code: "activity_session_pending",
        message: "activity session pending",
      }),
    ).not.toMatch(/награду/i);
  });

  it("network / missing status stays neutral", () => {
    expect(formatV3CareError(new Error("Failed to fetch"))).toBe(
      "Не удалось выполнить уход. Попробуйте ещё раз.",
    );
  });
});

describe("GamePage v3 Care wiring (7H)", () => {
  it("Water/Sun/Fertilizer call startV3CareActivity with server preset", () => {
    expect(apiSrc).toContain('"/game/v3/care/start-activity"');
    expect(apiSrc).toContain('"/game/v3/care/finish-activity"');
    expect(apiSrc).toContain('"/game/v3/care/acknowledge-activity"');
    expect(pageSrc).toContain("handleStartV3CareActivity");
    expect(pageSrc).toContain("api.startV3CareActivity");
    expect(pageSrc).toContain("resolveV3CareStartPresetSeconds");
    expect(pageSrc).toContain("api.finishV3CareActivity");
    expect(pageSrc).toContain("api.acknowledgeV3CareActivity");
    expect(pageSrc).toContain("minigameScoreToV3Skill");
  });

  it("v2 start is not used when v3 card path is active", () => {
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: true,
        v3Roots: baseV3(),
      }),
    ).toBe(false);
    const mapBlock = pageSrc.slice(
      pageSrc.indexOf('label: "Вода"'),
      pageSrc.indexOf("data-v3-activity-can-start"),
    );
    expect(mapBlock).toContain("handleStartV3CareActivity");
    expect(mapBlock).toContain("handleStartSession(btn.key)");
    expect(mapBlock.indexOf("handleStartV3CareActivity")).toBeLessThan(
      mapBlock.indexOf("handleStartSession(btn.key)"),
    );
  });

  it("finish success path leads to acknowledge; finish error does not", () => {
    expect(pageSrc).toContain("finishV3CareActivityWithSkill");
    expect(pageSrc).toContain("acknowledgeV3CareActivityOnce");
    expect(pageSrc).toContain("setV3PendingFinish");
    expect(pageSrc).toContain("setV3PendingAck(activity)");
    expect(pageSrc).toContain("setV3PendingAck(null)");
    // On finish error: pending finish kept, ack cleared
    expect(pageSrc).toMatch(
      /setV3PendingFinish\(\{[\s\S]*?setV3PendingAck\(null\)/,
    );
  });

  it("duration comes from careSession.presetSeconds; F5 recovery wired", () => {
    expect(pageSrc).toContain("v3CarePresetSeconds");
    expect(pageSrc).toContain("resolveV3CareRecovery");
    expect(pageSrc).toContain('"open-minigame"');
    expect(pageSrc).toContain('"await-acknowledge"');
  });

  it("without v3 snapshot legacy start remains available", () => {
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: true,
        v3Roots: null,
      }),
    ).toBe(true);
  });
});
