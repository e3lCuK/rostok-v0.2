/**
 * Live Care-cycle completion scenario (client SoT).
 *
 * Walks: reserves → activities done → shovel finish → claim → ack
 * without mounting full GamePage. Asserts endpoint order, no artificial
 * zero preview before finished+available, and shovel slot geometry CSS.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "@/lib/api";
import { normalizeEconomyV3RootsSnapshot } from "@/lib/v3Roots";
import {
  formatV3CareError,
  resolveV3CareCycleRecovery,
  resolveV3CareShovelAction,
  sessionScoresFromV3RewardPreview,
  shouldAcknowledgeV3CareCycle,
  shouldShowV3CareShovel,
  shouldShowV3RewardPreview,
} from "@/lib/v3CareClient";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
const apiSrc = readFileSync(join(here, "api.ts"), "utf8");

function activity(skill = 0.7, preset = 10) {
  return { completed: true, presetSeconds: preset, skill };
}

function snap(overrides: Record<string, unknown> = {}): EconomyV3RootsState {
  const raw = {
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
        transferred: true,
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
        frozen: false,
      },
      fertilizer: {
        seconds: 0,
        fullSegments: 0,
        partialSegmentSeconds: 0,
        capacitySeconds: 25,
        fillFraction: 0,
        playableFromRoot: false,
        transferred: true,
        frozen: false,
      },
    },
    reserves: {
      water: { seconds: 10, capacitySeconds: 20, playable: true },
      sun: { seconds: 10, capacitySeconds: 20, playable: true },
      fertilizer: { seconds: 10, capacitySeconds: 20, playable: true },
    },
    careAvailability: {
      water: { reserveSeconds: 10, playable: true, maxPresetSeconds: 10 },
      sun: { reserveSeconds: 10, playable: true, maxPresetSeconds: 10 },
      fertilizer: {
        reserveSeconds: 10,
        playable: true,
        maxPresetSeconds: 10,
      },
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
      startedAt: "2026-07-25T12:00:00.000Z",
      completedAt: null,
      finishedAt: null,
      status: "in_progress",
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
      transferredRoots: ["water", "sun", "fertilizer"],
      secondsUntilNextWholeSecond: null,
      accumulating: false,
    },
    excessGate: {
      ordinaryFull: false,
      rootsFull: false,
      reservesFull: { water: false, sun: false, fertilizer: false },
      generatingExcess: false,
    },
    ...overrides,
  };
  const normalized = normalizeEconomyV3RootsSnapshot(raw);
  if (!normalized) throw new Error("expected snap");
  return normalized;
}

describe("v3 Care full cycle — live completion scenario", () => {
  it("1–5: reserves → trio complete → shovel is finish-cycle (not start)", () => {
    const withReserves = snap();
    expect(withReserves.reserves.water.playable).toBe(true);

    const afterTrio = snap({
      careCycle: {
        ...snap().careCycle,
        status: "ready",
        allCompleted: true,
        readyToFinish: true,
        completedAt: "2026-07-25T12:10:00.000Z",
        activities: {
          water: activity(0.8, 10),
          sun: activity(0.7, 10),
          fertilizer: activity(0.6, 10),
        },
      },
    });
    expect(shouldShowV3CareShovel(afterTrio)).toBe(true);
    expect(resolveV3CareShovelAction(afterTrio)).toBe("finish-cycle");
    expect(shouldShowV3RewardPreview(afterTrio)).toBe(false);
    expect(sessionScoresFromV3RewardPreview(afterTrio.careCycle.rewardPreview)).toBeNull();
  });

  it("6–7: no artificial zero preview until finished+available; then scores from server", () => {
    const ready = snap({
      careCycle: {
        ...snap().careCycle,
        status: "ready",
        allCompleted: true,
        readyToFinish: true,
        activities: {
          water: activity(),
          sun: activity(),
          fertilizer: activity(),
        },
        // Server may compute preview at ready — client must not treat as claimable UI
        rewardPreview: {
          available: true,
          xp: 0,
          apples: 0,
          treeGrowth: 0,
          income: { base: 0, bonus: 0, total: 0 },
        },
      },
    });
    expect(shouldShowV3RewardPreview(ready)).toBe(false);
    expect(resolveV3CareShovelAction(ready)).toBe("finish-cycle");

    const finished = snap({
      careCycle: {
        ...ready.careCycle,
        status: "finished",
        finishedAt: "2026-07-25T12:11:00.000Z",
        readyToFinish: false,
        rewardPreview: {
          available: true,
          xp: 18,
          apples: 0,
          treeGrowth: 5,
          income: { base: 4, bonus: 1, total: 5 },
        },
      },
    });
    expect(shouldShowV3RewardPreview(finished)).toBe(true);
    expect(resolveV3CareShovelAction(finished)).toBe("claim-cycle");
    expect(sessionScoresFromV3RewardPreview(finished.careCycle.rewardPreview)).toEqual({
      water: 0,
      sun: 0,
      fert: 0,
      xp: 18,
      base: 4,
      bonus: 1,
      mm: 5,
    });
  });

  it("8–11: claim → ack clears cycle; F5 does not restore active shovel", () => {
    const claimed = snap({
      careCycle: {
        ...snap().careCycle,
        status: "finished",
        finishedAt: "2026-07-25T12:11:00.000Z",
        readyToFinish: false,
        allCompleted: true,
        activities: {
          water: activity(),
          sun: activity(),
          fertilizer: activity(),
        },
        rewardPreview: {
          available: true,
          xp: 18,
          apples: 0,
          treeGrowth: 5,
          income: { base: 4, bonus: 1, total: 5 },
        },
        claim: {
          claimed: true,
          claimedAt: "2026-07-25T12:12:00.000Z",
          xp: 18,
          treeGrowth: 5,
          income: { base: 4, bonus: 1, total: 5 },
        },
      },
    });
    expect(shouldShowV3RewardPreview(claimed)).toBe(false);
    expect(shouldAcknowledgeV3CareCycle(claimed)).toBe(true);
    expect(resolveV3CareShovelAction(claimed)).toBe("acknowledge-cycle");
    expect(resolveV3CareCycleRecovery(claimed)).toEqual({
      type: "acknowledge-cycle",
    });

    const idle = snap({
      careCycle: {
        ...snap().careCycle,
        status: null,
        allCompleted: false,
        readyToFinish: false,
        startedAt: null,
        completedAt: null,
        finishedAt: null,
      },
    });
    expect(shouldShowV3CareShovel(idle)).toBe(false);
    expect(shouldShowV3RewardPreview(idle)).toBe(false);
    expect(resolveV3CareCycleRecovery(idle)).toEqual({ type: "none" });
  });

  it("12: shovel slot has fixed geometry; no status text under «Уход»", () => {
    expect(cssSrc).toMatch(
      /\.session-actions-care-shovel-slot\s*\{[\s\S]*?width:\s*var\(--action-btn-size[\s\S]*?min-width:\s*var\(--action-btn-size/,
    );
    expect(pageSrc).toContain("session-actions-care-shovel-slot");
    expect(pageSrc).toContain('data-care-shovel="true"');
    // Reward/error status line under shovel removed from player UI.
    expect(pageSrc).not.toMatch(
      /session-actions-care-shovel-slot[\s\S]*?v3-activity-preview-status/,
    );
  });

  it("13–16: GamePage wires finish→claim chain, retry on error, no raw HTTP", () => {
    for (const path of [
      "/game/v3/care/finish-cycle",
      "/game/v3/care/claim-cycle",
      "/game/v3/care/acknowledge-cycle",
    ]) {
      expect(apiSrc).toContain(`"${path}"`);
    }
    expect(pageSrc).toContain('action === "finish-cycle"');
    expect(pageSrc).toContain("await claimV3CareCycleOnce()");
    expect(pageSrc).toContain("applyV3RewardPreviewToUi(retrySnap)");
    expect(pageSrc).toContain("setCareClicked(false)");
    expect(pageSrc).toContain("formatV3CareError");
    expect(pageSrc).not.toMatch(/HTTP \$\{/);
    expect(formatV3CareError({ status: 500, message: "HTTP 500: boom" })).toBe(
      "Не удалось выполнить уход. Попробуйте ещё раз.",
    );
    expect(formatV3CareError({ status: 500, message: "HTTP 500: boom" })).not.toContain(
      "HTTP 500",
    );
  });

  it("simulates shovel action sequence without double finish", () => {
    const calls: string[] = [];
    let state = snap({
      careCycle: {
        ...snap().careCycle,
        status: "ready",
        allCompleted: true,
        readyToFinish: true,
        completedAt: "2026-07-25T12:10:00.000Z",
        activities: {
          water: activity(0.8),
          sun: activity(0.7),
          fertilizer: activity(0.6),
        },
      },
    });

    const runShovel = () => {
      const action = resolveV3CareShovelAction(state);
      if (action === "finish-cycle") {
        calls.push("finish-cycle");
        state = snap({
          careCycle: {
            ...state.careCycle,
            status: "finished",
            finishedAt: "2026-07-25T12:11:00.000Z",
            readyToFinish: false,
            rewardPreview: {
              available: true,
              xp: 12,
              apples: 0,
              treeGrowth: 2,
              income: { base: 1.5, bonus: 0.5, total: 2 },
            },
          },
        });
        if (shouldShowV3RewardPreview(state)) {
          calls.push("claim-cycle");
          state = snap({
            careCycle: {
              ...state.careCycle,
              claim: {
                claimed: true,
                claimedAt: "2026-07-25T12:12:00.000Z",
                xp: 12,
                treeGrowth: 2,
                income: { base: 1.5, bonus: 0.5, total: 2 },
              },
            },
          });
          if (shouldAcknowledgeV3CareCycle(state)) {
            calls.push("acknowledge-cycle");
            state = snap({
              careCycle: {
                ...snap().careCycle,
                status: null,
                startedAt: null,
              },
            });
          }
        }
        return;
      }
      if (action === "claim-cycle") {
        calls.push("claim-cycle");
        return;
      }
      if (action === "acknowledge-cycle") {
        calls.push("acknowledge-cycle");
      }
    };

    runShovel();
    expect(calls).toEqual(["finish-cycle", "claim-cycle", "acknowledge-cycle"]);
    // Second press on idle does nothing
    const before = calls.length;
    runShovel();
    expect(calls.length).toBe(before);
    expect(resolveV3CareShovelAction(state)).toBe("none");
  });

  it("double-claim guard uses in-flight refs (not stale v3CareBusy alone)", () => {
    expect(pageSrc).toContain(
      "do not gate on React `v3CareBusy` (stale after finish→claim chain)",
    );
    const claimFn = pageSrc.match(
      /async function claimV3CareCycleOnce\([\s\S]*?\n  \/\*\*/,
    );
    expect(claimFn?.[0] ?? "").toContain("v3ClaimCycleInFlightRef.current");
    expect(claimFn?.[0] ?? "").not.toMatch(/\|\| v3CareBusy\) return false/);
  });
});

describe("v3 Care shovel DOM geometry contract", () => {
  it("status overlay cannot widen the shovel hit target", () => {
    // Contract: base slot tracks --action-btn-size; status is absolutely positioned under it.
    // v3 horizontal row widens the slot to ghost|shovel|ghost, but shovel button stays sized.
    const slot = cssSrc.match(
      /(?:^|\n)\.session-actions-care-shovel-slot\s*\{([^}]+)\}/,
    );
    expect(slot?.[1]).toMatch(/width:\s*var\(--action-btn-size/);
    expect(slot?.[1]).toMatch(/position:\s*relative/);
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.session-actions-care-shovel-slot\s*\{[\s\S]*?width:\s*auto/,
    );
    const status = cssSrc.match(/\.v3-activity-preview-status\s*\{([^}]+)\}/);
    expect(status?.[1]).toMatch(/position:\s*absolute/);
    expect(status?.[1]).toMatch(/pointer-events:\s*none/);
  });
});
