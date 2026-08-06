/**
 * Full-chain contracts for the Economy v3 wait timer (API → normalize → GamePage → component).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  captureV3RootWaitTimer,
  remainingV3RootWaitSeconds,
  resolveV3RootWaitTimerDisplay,
} from "./v3RootWaitTimer";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const compSrc = readFileSync(
  join(here, "../components/v2/V3RootWaitTimer.tsx"),
  "utf8",
);
const apiTs = readFileSync(join(here, "api.ts"), "utf8");
const rootsNorm = readFileSync(join(here, "v3Roots.ts"), "utf8");
const apiRoots = readFileSync(
  join(here, "../../../api-server/src/services/economy-v3-roots.ts"),
  "utf8",
);
const tutorialSql = readFileSync(
  join(here, "../../../api-server/src/services/economy-v3-tutorial.ts"),
  "utf8",
);
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");

describe("v3 wait timer full chain", () => {
  it("1. API public state includes nextWholeSecondAt + cycleDurationSeconds", () => {
    expect(apiRoots).toContain("nextWholeSecondAt");
    expect(apiRoots).toContain("cycleDurationSeconds");
    expect(apiRoots).toContain("toISOString()");
  });

  it("2. client types + normalize keep nextWholeSecondAt / cycleDurationSeconds", () => {
    expect(apiTs).toContain("nextWholeSecondAt");
    expect(apiTs).toContain("cycleDurationSeconds");
    expect(rootsNorm).toContain("nextWholeSecondAt");
    expect(rootsNorm).toContain("cycleDurationSeconds");
    const now = Date.parse("2026-07-25T10:00:00.000Z");
    const snap = normalizeEconomyV3RootsSnapshot({
      enabled: true,
      dailyCapSeconds: 20,
      dayKey: "2026-07-25",
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
        anchorAt: "2026-07-25T10:00:00.000Z",
        progress: 0,
        frozenAt: null,
        insuranceDeadlineAt: null,
        firstTransferredRoot: null,
        transferredRoots: [],
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(now + 720_000).toISOString(),
        cycleDurationSeconds: 720,
        accumulating: true,
      },
      excessGate: {
        ordinaryFull: false,
        rootsFull: false,
        reservesFull: { water: false, sun: false, fertilizer: false },
        generatingExcess: false,
      },
    });
    expect(snap?.generation.nextWholeSecondAt).toBe(
      new Date(now + 720_000).toISOString(),
    );
    expect(snap?.generation.cycleDurationSeconds).toBe(720);
  });

  it("3. GamePage mounts V3RootWaitTimer with game.v3Roots + nowMs", () => {
    expect(pageSrc).toContain("<V3RootWaitTimer");
    expect(pageSrc).toContain("v3Roots={game.v3Roots}");
    expect(pageSrc).toContain("nowMs={now}");
    expect(pageSrc).toContain("tutorialDone={tutorialDone}");
    expect(pageSrc).toContain("data-v3-root-wait-timer-host");
  });

  it("4–5. accumulating → countdown MM:SS; not null", () => {
    const now = Date.parse("2026-07-25T10:00:00.000Z");
    const v3Roots = normalizeEconomyV3RootsSnapshot({
      enabled: true,
      dailyCapSeconds: 20,
      dayKey: null,
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
        anchorAt: "2026-07-25T10:00:00.000Z",
        progress: 0,
        frozenAt: null,
        insuranceDeadlineAt: null,
        firstTransferredRoot: null,
        transferredRoots: [],
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(now + 720_000).toISOString(),
        cycleDurationSeconds: 720,
        accumulating: true,
      },
      excessGate: {
        ordinaryFull: false,
        rootsFull: false,
        reservesFull: { water: false, sun: false, fertilizer: false },
        generatingExcess: false,
      },
    });
    const snap = captureV3RootWaitTimer({
      v3Roots,
      capital: 100_000,
      nowMs: now,
      tutorialDone: true,
    });
    expect(snap).not.toBeNull();
    const display = resolveV3RootWaitTimerDisplay({ snapshot: snap, nowMs: now });
    expect(display).toMatchObject({ kind: "countdown", timeLabel: "12:00" });
    expect(compSrc).toContain("data-testid=\"v3-root-wait-timer-capsule\"");
  });

  it("6–7. frozen keeps cycle timer; thaw keeps continuous countdown", () => {
    const now = Date.parse("2026-07-25T10:00:00.000Z");
    const baseGen = {
      anchorAt: "2026-07-25T10:00:00.000Z",
      progress: 0,
      firstTransferredRoot: null as null,
      transferredRoots: [] as string[],
      insuranceDeadlineAt: null as string | null,
    };
    const frozen = normalizeEconomyV3RootsSnapshot({
      enabled: true,
      dailyCapSeconds: 20,
      dayKey: null,
      roots: {
        water: {
          seconds: 0,
          fullSegments: 0,
          partialSegmentSeconds: 0,
          capacitySeconds: 25,
          fillFraction: 0,
          playableFromRoot: false,
          transferred: true,
          frozen: true,
        },
        sun: {
          seconds: 0,
          fullSegments: 0,
          partialSegmentSeconds: 0,
          capacitySeconds: 25,
          fillFraction: 0,
          playableFromRoot: false,
          transferred: false,
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
          frozen: true,
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
        ...baseGen,
        progress: 0.5,
        frozenAt: "2026-07-25T10:00:00.000Z",
        insuranceDeadlineAt: "2026-07-25T10:01:00.000Z",
        secondsUntilNextWholeSecond: 360,
        nextWholeSecondAt: new Date(now + 360_000).toISOString(),
        cycleDurationSeconds: 720,
        accumulating: true,
        transferredRoots: ["water"],
        firstTransferredRoot: "water",
      },
      excessGate: {
        ordinaryFull: false,
        rootsFull: false,
        reservesFull: { water: false, sun: false, fertilizer: false },
        generatingExcess: false,
      },
    });
    const whileFrozen = captureV3RootWaitTimer({
      v3Roots: frozen,
      capital: 100_000,
      nowMs: now,
      tutorialDone: true,
    });
    expect(whileFrozen).not.toBeNull();
    expect(remainingV3RootWaitSeconds(whileFrozen, now)).toBeCloseTo(360, 0);

    const thawed = normalizeEconomyV3RootsSnapshot({
      ...frozen!,
      generation: {
        ...baseGen,
        frozenAt: null,
        insuranceDeadlineAt: null,
        secondsUntilNextWholeSecond: 360,
        nextWholeSecondAt: new Date(now + 360_000).toISOString(),
        cycleDurationSeconds: 720,
        accumulating: true,
        progress: 0.5,
        transferredRoots: [],
        firstTransferredRoot: null,
      },
    });
    const after = captureV3RootWaitTimer({
      v3Roots: thawed,
      capital: 100_000,
      nowMs: now,
      tutorialDone: true,
    });
    expect(after).not.toBeNull();
    expect(remainingV3RootWaitSeconds(after, now)).toBeCloseTo(360, 0);
    expect(
      resolveV3RootWaitTimerDisplay({ snapshot: after, nowMs: now }).kind,
    ).toBe("countdown");
  });

  it("8–10. ~12:00; still visible at +70s; F5 keeps absolute deadline", () => {
    const t0 = Date.parse("2026-07-25T10:00:00.000Z");
    const deadline = t0 + 720_000;
    const snap = captureV3RootWaitTimer({
      v3Roots: normalizeEconomyV3RootsSnapshot({
        enabled: true,
        dailyCapSeconds: 20,
        dayKey: null,
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
          anchorAt: "2026-07-25T10:00:00.000Z",
          progress: 0,
          frozenAt: null,
          insuranceDeadlineAt: null,
          firstTransferredRoot: null,
          transferredRoots: [],
          secondsUntilNextWholeSecond: 720,
          nextWholeSecondAt: new Date(deadline).toISOString(),
          cycleDurationSeconds: 720,
          accumulating: true,
        },
        excessGate: {
          ordinaryFull: false,
          rootsFull: false,
          reservesFull: { water: false, sun: false, fertilizer: false },
          generatingExcess: false,
        },
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    expect(remainingV3RootWaitSeconds(snap, t0)).toBeCloseTo(720, 5);
    expect(remainingV3RootWaitSeconds(snap, t0 + 70_000)).toBeCloseTo(650, 5);
    expect(
      resolveV3RootWaitTimerDisplay({ snapshot: snap, nowMs: t0 + 70_000 }),
    ).toMatchObject({ kind: "countdown", timeLabel: "10:50" });
    const afterF5 = captureV3RootWaitTimer({
      v3Roots: normalizeEconomyV3RootsSnapshot({
        enabled: true,
        dailyCapSeconds: 20,
        dayKey: null,
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
          anchorAt: "2026-07-25T10:00:00.000Z",
          progress: 70 / 720,
          frozenAt: null,
          insuranceDeadlineAt: null,
          firstTransferredRoot: null,
          transferredRoots: [],
          secondsUntilNextWholeSecond: 650,
          nextWholeSecondAt: new Date(deadline).toISOString(),
          cycleDurationSeconds: 720,
          accumulating: true,
        },
        excessGate: {
          ordinaryFull: false,
          rootsFull: false,
          reservesFull: { water: false, sun: false, fertilizer: false },
          generatingExcess: false,
        },
      }),
      capital: 100_000,
      nowMs: t0 + 70_000,
      tutorialDone: true,
    });
    expect(afterF5?.deadlineAtMs).toBe(deadline);
  });

  it("11–13. CSS host between roots/chest; responsive tokens; tutorial SQL cast", () => {
    expect(cssSrc).toContain("--v3-stack-gap");
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.v3-underground-stack \.v3-root-wait-timer-host\s*\{[\s\S]*?z-index:\s*6/,
    );
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots\s*\{[\s\S]*?--v3-roots-depth:\s*83px/,
    );
    expect(cssSrc).toContain("--v3-stack-gap: 6px");
    expect(cssSrc).toContain("v3-underground-stack");
    expect(tutorialSql).toContain("v3_generation_anchor_at = $3");
    expect(compSrc).toContain("useMemo");
  });
});
