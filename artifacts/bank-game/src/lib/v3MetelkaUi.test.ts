import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV2ExcessState, EconomyV3RootsState } from "./api";
import { isExcessCleaningMode } from "./excessCleaningCountdown";
import { resolveCareReadyRowMode } from "./careSessionActionsUi";
import { shouldShowMetelkaCard } from "@/components/v2/MetelkaActionCard";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  shouldShowMetelkaCardWithV3Gate,
  v3CareBlocksMetelka,
} from "./v3MetelkaUi";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");

function excessState(
  overrides: Partial<EconomyV2ExcessState> = {},
): EconomyV2ExcessState {
  return {
    excessSeconds: 10,
    excessElapsedMs: 1000,
    excessBaseIncome: 0,
    excessCycle: 0,
    excessAvailable: true,
    excessPresetSeconds: 10,
    excessRate: 0.01,
    session: undefined,
    result: undefined,
    ...overrides,
  };
}

function activeMetelkaExcess(
  overrides: Partial<EconomyV2ExcessState> = {},
): EconomyV2ExcessState {
  return excessState({
    excessAvailable: false,
    session: {
      active: true,
      startedAt: Date.now(),
      presetSeconds: 10,
    } as EconomyV2ExcessState["session"],
    ...overrides,
  });
}

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
      water: { seconds: 0, capacitySeconds: 20, playable: false },
      sun: { seconds: 0, capacitySeconds: 20, playable: false },
      fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
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
    metelkaCycle: {
      required: false,
      completedForCycle: false,
      transferLocked: false,
      careLocked: false,
      phase: "roots_accumulating",
    },
    ...overrides,
  };
  const snap = normalizeEconomyV3RootsSnapshot(raw);
  if (!snap) throw new Error("expected snap");
  return snap;
}

describe("v3 Metelka UI gate (excessAvailable only)", () => {
  it("excessAvailable=true with empty roots → Metelka visible", () => {
    expect(
      shouldShowMetelkaCard(excessState({ excessAvailable: true }), baseV3()),
    ).toBe(true);
  });

  it("excessAvailable=false → hidden even with rootsFull", () => {
    const v3 = baseV3({
      excessGate: {
        ordinaryFull: false,
        rootsFull: true,
        reservesFull: { water: false, sun: false, fertilizer: false },
        generatingExcess: true,
      },
    });
    expect(
      shouldShowMetelkaCard(excessState({ excessAvailable: false }), v3),
    ).toBe(false);
  });

  it("after transfer (roots emptied) Metelka still shows if excessAvailable", () => {
    expect(
      shouldShowMetelkaCardWithV3Gate({
        excess: excessState({ excessAvailable: true, excessSeconds: 5.1 }),
        v3Roots: baseV3(),
      }),
    ).toBe(true);
  });

  it("active Metelka session restores as cleaning", () => {
    const active = activeMetelkaExcess();
    expect(isExcessCleaningMode(active)).toBe(true);
    expect(shouldShowMetelkaCard(active, baseV3())).toBe(false);
    expect(
      resolveCareReadyRowMode({
        excess: active,
        careBlocksMetelka: false,
        v3Roots: baseV3(),
      }),
    ).toBe("cleaning");
  });

  it("active v3 Care blocks Metelka", () => {
    const v3 = baseV3({
      careSession: {
        active: true,
        activity: "water",
        presetSeconds: 10,
        startedAt: "2026-07-23T10:00:00.000Z",
        finishedAt: null,
        status: "active",
        skill: null,
      },
      careCycle: {
        ...baseV3().careCycle,
        status: "in_progress",
        startedAt: "2026-07-23T10:00:00.000Z",
      },
    });
    expect(v3CareBlocksMetelka(v3)).toBe(true);
  });

  it("without v3 snapshot legacy gate remains", () => {
    expect(
      shouldShowMetelkaCard(excessState({ excessAvailable: true }), null),
    ).toBe(true);
    expect(
      shouldShowMetelkaCard(excessState({ excessAvailable: false }), null),
    ).toBe(false);
  });

  it("GamePage still wires Metelka gate helpers", () => {
    expect(pageSrc).toContain("v3CareBlocksMetelka");
    expect(pageSrc).toContain("shouldShowMetelkaCard(excess, v3Roots)");
  });
});
