import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  resolveV3CareCycleRecovery,
  resolveV3CareShovelAction,
  sessionScoresFromV3Claim,
  sessionScoresFromV3RewardPreview,
  shouldAcknowledgeV3CareCycle,
  shouldShowV3CareShovel,
  shouldShowV3RewardPreview,
} from "./v3CareClient";
import { mayStartLegacyCareFromActivityCard } from "./v3ActivityCards";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const apiSrc = readFileSync(join(here, "api.ts"), "utf8");
const clientSrc = readFileSync(join(here, "v3CareClient.ts"), "utf8");

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
      startedAt: "2026-07-23T10:00:00.000Z",
      completedAt: "2026-07-23T10:05:00.000Z",
      finishedAt: null,
      status: "ready",
      allCompleted: true,
      readyToFinish: true,
      totalPresetSeconds: 30,
      averageSkill: 0.7,
      activities: {
        water: { completed: true, presetSeconds: 10, skill: 0.7 },
        sun: { completed: true, presetSeconds: 10, skill: 0.7 },
        fertilizer: { completed: true, presetSeconds: 10, skill: 0.7 },
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

describe("v3 Care cycle — shovel / preview / claim helpers", () => {
  it("ready shows «Уход» (readyToFinish or status ready)", () => {
    expect(shouldShowV3CareShovel(baseV3())).toBe(true);
    expect(
      shouldShowV3CareShovel(
        baseV3({
          careCycle: {
            ...baseV3().careCycle,
            readyToFinish: false,
            status: "ready",
          },
        }),
      ),
    ).toBe(true);
    expect(
      shouldShowV3CareShovel(
        baseV3({
          careCycle: {
            ...baseV3().careCycle,
            readyToFinish: true,
            status: "in_progress",
          },
        }),
      ),
    ).toBe(true);
    expect(
      shouldShowV3CareShovel(
        baseV3({
          careCycle: {
            ...baseV3().careCycle,
            readyToFinish: false,
            status: "finished",
          },
        }),
      ),
    ).toBe(false);
    // finished must never re-enter finish-cycle even if readyToFinish is stale true
    expect(
      shouldShowV3CareShovel(
        baseV3({
          careCycle: {
            ...baseV3().careCycle,
            readyToFinish: true,
            status: "finished",
            finishedAt: "2026-07-23T10:06:00.000Z",
          },
        }),
      ),
    ).toBe(false);
  });

  it("resolveV3CareShovelAction orders finish → claim → acknowledge", () => {
    expect(resolveV3CareShovelAction(baseV3())).toBe("finish-cycle");
    expect(
      resolveV3CareShovelAction(
        baseV3({
          careCycle: {
            ...baseV3().careCycle,
            status: "finished",
            finishedAt: "2026-07-23T10:06:00.000Z",
            readyToFinish: false,
            rewardPreview: {
              available: true,
              xp: 10,
              apples: 0,
              treeGrowth: 3,
              income: { base: 2, bonus: 1, total: 3 },
            },
          },
        }),
      ),
    ).toBe("claim-cycle");
    expect(
      resolveV3CareShovelAction(
        baseV3({
          careCycle: {
            ...baseV3().careCycle,
            status: "finished",
            finishedAt: "2026-07-23T10:06:00.000Z",
            readyToFinish: false,
            rewardPreview: {
              available: true,
              xp: 10,
              apples: 0,
              treeGrowth: 3,
              income: { base: 2, bonus: 1, total: 3 },
            },
            claim: {
              claimed: true,
              claimedAt: "2026-07-23T10:07:00.000Z",
              xp: 10,
              treeGrowth: 3,
              income: { base: 2, bonus: 1, total: 3 },
            },
          },
        }),
      ),
    ).toBe("acknowledge-cycle");
  });

  it("rewardPreview is read from server snapshot only", () => {
    const finished = baseV3({
      careCycle: {
        ...baseV3().careCycle,
        status: "finished",
        finishedAt: "2026-07-23T10:06:00.000Z",
        readyToFinish: false,
        rewardPreview: {
          available: true,
          xp: 42,
          apples: 0,
          treeGrowth: 7,
          income: { base: 10.5, bonus: 2.25, total: 12.75 },
        },
      },
    });
    expect(shouldShowV3RewardPreview(finished)).toBe(true);
    expect(sessionScoresFromV3RewardPreview(finished.careCycle.rewardPreview)).toEqual({
      water: 0,
      sun: 0,
      fert: 0,
      xp: 42,
      base: 10.5,
      bonus: 2.25,
      mm: 7,
    });
  });

  it("claimed cycle requests acknowledge, not re-claim", () => {
    const claimed = baseV3({
      careCycle: {
        ...baseV3().careCycle,
        status: "finished",
        finishedAt: "2026-07-23T10:06:00.000Z",
        readyToFinish: false,
        rewardPreview: {
          available: true,
          xp: 42,
          apples: 0,
          treeGrowth: 7,
          income: { base: 10, bonus: 2, total: 12 },
        },
        claim: {
          claimed: true,
          claimedAt: "2026-07-23T10:07:00.000Z",
          xp: 42,
          treeGrowth: 7,
          income: { base: 10, bonus: 2, total: 12 },
        },
      },
    });
    expect(shouldShowV3RewardPreview(claimed)).toBe(false);
    expect(shouldAcknowledgeV3CareCycle(claimed)).toBe(true);
    expect(resolveV3CareCycleRecovery(claimed)).toEqual({
      type: "acknowledge-cycle",
    });
  });

  it("F5 recovery: ready → shovel, finished → preview, claimed → ack", () => {
    expect(resolveV3CareCycleRecovery(baseV3())).toEqual({ type: "show-shovel" });
    const finished = baseV3({
      careCycle: {
        ...baseV3().careCycle,
        status: "finished",
        finishedAt: "2026-07-23T10:06:00.000Z",
        readyToFinish: false,
        rewardPreview: {
          available: true,
          xp: 12,
          apples: 0,
          treeGrowth: 3,
          income: { base: 1, bonus: 0, total: 1 },
        },
      },
    });
    expect(resolveV3CareCycleRecovery(finished)).toEqual({
      type: "show-reward-preview",
    });
  });

  it("sessionScoresFromV3Claim maps pending/xp/growth from claim response", () => {
    expect(
      sessionScoresFromV3Claim({
        xp: 15,
        treeGrowth: 4,
        income: { base: 3, bonus: 1, total: 4 },
      }),
    ).toEqual({
      water: 0,
      sun: 0,
      fert: 0,
      xp: 15,
      base: 3,
      bonus: 1,
      mm: 4,
    });
    expect(
      sessionScoresFromV3Claim({
        xp: 15,
        treeGrowth: 0,
        income: { base: 3, bonus: 1, total: 4 },
        pendingBaseReward: 3,
        pendingBonusReward: 1,
      }),
    ).toMatchObject({ mm: 4, xp: 15 });
  });

  it("v2 flow remains when v3 snapshot is absent", () => {
    expect(
      mayStartLegacyCareFromActivityCard({
        previewEnabled: true,
        v3Roots: null,
      }),
    ).toBe(true);
    expect(shouldShowV3CareShovel(null)).toBe(false);
    expect(resolveV3CareCycleRecovery(null)).toEqual({ type: "none" });
  });
});

describe("v3 Care cycle — GamePage / api wiring (7I)", () => {
  it("finish-cycle is wired once via finishV3CareCycleOnce", () => {
    expect(apiSrc).toContain('"/game/v3/care/finish-cycle"');
    expect(apiSrc).toContain("finishV3CareCycle:");
    expect(pageSrc).toContain("finishV3CareCycleOnce");
    expect(pageSrc).toContain("api.finishV3CareCycle()");
    expect(pageSrc.match(/api\.finishV3CareCycle\(\)/g)?.length).toBe(1);
  });

  it("claim-cycle is wired once via claimV3CareCycleOnce", () => {
    expect(apiSrc).toContain('"/game/v3/care/claim-cycle"');
    expect(apiSrc).toContain("claimV3CareCycle:");
    expect(pageSrc).toContain("claimV3CareCycleOnce");
    expect(pageSrc).toContain("api.claimV3CareCycle()");
    expect(pageSrc.match(/api\.claimV3CareCycle\(\)/g)?.length).toBe(1);
  });

  it("acknowledge-cycle clears UI after claim (or defers for reward queue)", () => {
    expect(apiSrc).toContain('"/game/v3/care/acknowledge-cycle"');
    expect(pageSrc).toContain("acknowledgeV3CareCycleOnce");
    expect(pageSrc).toContain("api.acknowledgeV3CareCycle()");
    expect(pageSrc).toContain("exitPostCareUiForNextCycle()");
    expect(pageSrc).toContain("skipUiExit");
    expect(pageSrc).toContain("handleGoToRewards(scoresForQueue)");
  });

  it("ready shovel uses handleV3CareShovelClick; rewardPreview from server", () => {
    expect(pageSrc).toContain("handleV3CareShovelClick");
    expect(pageSrc).toContain("shouldShowV3CareShovel");
    expect(pageSrc).toContain("shouldShowV3RewardPreview");
    expect(pageSrc).toContain("sessionScoresFromV3RewardPreview");
    expect(pageSrc).toContain("applyV3RewardPreviewToUi");
    // Status/reward line under «Уход» removed from player UI.
    expect(pageSrc).not.toContain("data-v3-care-reward-preview");
    expect(pageSrc).not.toContain("v3-activity-preview-status");
  });

  it("pending rewards come from claim response fields", () => {
    expect(pageSrc).toContain("pendingBaseReward: claimed.pendingBaseReward");
    expect(pageSrc).toContain("pendingBonusReward: claimed.pendingBonusReward");
    expect(pageSrc).toContain("playerXP: claimed.playerXp");
  });

  it("reuses existing handleGoToRewards animation queue after claim", () => {
    expect(pageSrc).toContain("handleGoToRewards(scoresForQueue)");
    expect(pageSrc).toContain("pendingXpRef.current = {");
    expect(pageSrc).toContain("setShowXpPopup(true)");
    expect(pageSrc).toContain("setShowGrowthAnim(true)");
    expect(pageSrc).toContain("setShowApples(true)");
    expect(pageSrc).toContain("claimApplesAndIncome");
  });

  it("F5 cycle recovery is wired for ready / finished / claimed", () => {
    expect(pageSrc).toContain("resolveV3CareCycleRecovery");
    expect(pageSrc).toContain('"show-shovel"');
    expect(pageSrc).toContain('"show-reward-preview"');
    expect(pageSrc).toContain('"acknowledge-cycle"');
    expect(pageSrc).toContain("enterV3CareShovelUi");
  });

  it("guards against double finish / claim", () => {
    expect(pageSrc).toContain("v3FinishCycleInFlightRef");
    expect(pageSrc).toContain("v3ClaimCycleInFlightRef");
    expect(pageSrc).toContain("v3AckCycleInFlightRef");
    expect(pageSrc).toMatch(
      /if \(v3FinishCycleInFlightRef\.current \|\| v3ClaimCycleInFlightRef\.current\)/,
    );
    expect(pageSrc).toContain("resolveV3CareShovelAction");
  });

  it("shovel finish chains claim in the same gesture", () => {
    expect(pageSrc).toContain('action === "finish-cycle"');
    expect(pageSrc).toContain("await finishV3CareCycleOnce()");
    expect(pageSrc).toContain("await claimV3CareCycleOnce()");
    expect(pageSrc).toContain("shouldShowV3RewardPreview(after)");
  });

  it("does not schedule activity ghost after v3 claim (avoids stuck ghost UI)", () => {
    const claimFn = pageSrc.match(
      /async function claimV3CareCycleOnce\([\s\S]*?\n  async function handleV3CareShovelClick/,
    );
    expect(claimFn?.[0] ?? "").not.toContain("setShowActivityGhost(true)");
  });

  it("shovel slot reserves fixed width so preview status cannot shift «Уход»", () => {
    const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
    expect(pageSrc).toContain("session-actions-care-shovel-slot");
    expect(pageSrc).toContain('data-care-shovel-slot="true"');
    expect(cssSrc).toContain(".session-actions-care-shovel-slot");
    expect(cssSrc).toMatch(
      /\.session-actions-care-shovel-slot\s*\{[\s\S]*?width:\s*var\(--action-btn-size/,
    );
    expect(cssSrc).toMatch(
      /\.v3-activity-preview-status\s*\{[\s\S]*?position:\s*absolute/,
    );
  });

  it("reward preview UI only applies when shouldShowV3RewardPreview", () => {
    expect(pageSrc).toContain(
      "if (!shouldShowV3RewardPreview(v3Roots))",
    );
    expect(pageSrc).toContain(
      "Happy path continues to claim in the same shovel gesture",
    );
  });

  it("after activity ack, ready cycle converges trio into shovel UI", () => {
    expect(pageSrc).toContain("shouldShowV3CareShovel(ack.v3Roots)");
    expect(pageSrc).toContain("beginV3CareTrioConverge()");
    expect(pageSrc).toContain("function beginV3CareTrioConverge");
    expect(pageSrc).toContain("v3LiveConvergeRef");
    // Recovery must not restore_shovel while live converge is armed
    expect(pageSrc).toContain("v3LiveConvergeRef.current");
    expect(pageSrc).toMatch(
      /v3LiveConvergeRef\.current &&[\s\S]*?show-shovel/,
    );
    // F5 / recovery still skips converge when live flag is off
    expect(pageSrc).toContain("function enterV3CareShovelUi");
  });

  it("v3 shovel path does not replace tutorial shovel handler", () => {
    expect(pageSrc).toContain("handleTutorialFinish");
    expect(pageSrc).toContain("useV3ActivityCards");
    expect(pageSrc).toContain("handleGoToRewards");
  });

  it("Care errors use formatV3CareError + careSyncError (no raw HTTP on scene)", () => {
    expect(pageSrc).toContain("formatV3CareError");
    expect(pageSrc).toContain("setCareSyncError(friendly)");
    expect(pageSrc).toContain("setCareClicked(false)");
    expect(pageSrc).toContain("v2-care-sync-error");
    // Must not format status as "HTTP ${…}" in GamePage Care path.
    expect(pageSrc).not.toMatch(/HTTP \$\{/);
    expect(clientSrc).toContain(
      "Не удалось выполнить уход. Попробуйте ещё раз.",
    );
    expect(clientSrc).not.toMatch(/HTTP \$\{.*status/);
  });

  it("full cycle endpoints are wired: start → finish → ack → finish-cycle → claim → ack-cycle", () => {
    for (const path of [
      "/game/v3/care/start-activity",
      "/game/v3/care/finish-activity",
      "/game/v3/care/acknowledge-activity",
      "/game/v3/care/finish-cycle",
      "/game/v3/care/claim-cycle",
      "/game/v3/care/acknowledge-cycle",
    ]) {
      expect(apiSrc).toContain(`"${path}"`);
    }
    expect(pageSrc).toContain("handleStartV3CareActivity");
    expect(pageSrc).toContain("finishV3CareActivityWithSkill");
    expect(pageSrc).toContain("acknowledgeV3CareActivityOnce");
    expect(pageSrc).toContain("finishV3CareCycleOnce");
    expect(pageSrc).toContain("claimV3CareCycleOnce");
    expect(pageSrc).toContain("acknowledgeV3CareCycleOnce");
    expect(pageSrc).toContain("handleV3CareShovelClick");
  });
});
