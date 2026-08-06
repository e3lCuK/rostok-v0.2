/**
 * Full Economy v3 roots user-cycle integration (client SoT sequencing).
 * Walks generate → ready → transfer ×3 → waiting → unfreeze → excess
 * without mounting the whole GamePage.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import type { EconomyV3RootKind, EconomyV3RootsState } from "@/lib/api";
import EconomyV3RootSystem, {
  V3_TRANSFER_ANIM_MS,
  canTransferV3Root,
  performEconomyV3RootTransfer,
  planV3ManualTransferSuccess,
  resolveV3RootDisplayDuringTransfer,
  resolveV3RootVisualState,
  resolveV3RootsDisplaySnapshot,
} from "@/components/v2/EconomyV3RootSystem";
import { normalizeEconomyV3RootsSnapshot, V3_ROOT_KINDS } from "@/lib/v3Roots";
import { shouldShowMetelkaCardWithV3Gate } from "@/lib/v3MetelkaUi";
import {
  shouldRefreshV3ExcessAfterTransfer,
  shouldRefreshV3RootsFromClock,
} from "@/lib/v3RootsRefresh";
import {
  commitV3TransferPendingOnce,
  v3TransferCommitKey,
} from "@/lib/v3TransferCommit";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const rootSysSrc = readFileSync(
  join(here, "../components/v2/EconomyV3RootSystem.tsx"),
  "utf8",
);

function rootFromSeconds(seconds: number, extra: Record<string, unknown> = {}) {
  const fullSegments = Math.floor(seconds / 5);
  return {
    seconds,
    fullSegments,
    partialSegmentSeconds: seconds % 5,
    capacitySeconds: 25,
    fillFraction: seconds / 25,
    playableFromRoot: seconds >= 5,
    transferred: false,
    frozen: false,
    ...extra,
  };
}

function baseSnap(overrides?: Partial<EconomyV3RootsState>): EconomyV3RootsState {
  const snap = normalizeEconomyV3RootsSnapshot({
    enabled: true,
    dailyCapSeconds: 20,
    dayKey: "2026-07-25",
    roots: {
      water: rootFromSeconds(0, { playableFromRoot: false }),
      sun: rootFromSeconds(0, { playableFromRoot: false }),
      fertilizer: rootFromSeconds(0, { playableFromRoot: false }),
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
      startedAt: null,
      finishedAt: null,
      presetSeconds: null,
      status: null,
      skill: null,
    },
    careCycle: {
      startedAt: null,
      finishedAt: null,
      status: null,
      activities: {
        water: { completed: false, skill: null },
        sun: { completed: false, skill: null },
        fertilizer: { completed: false, skill: null },
      },
      allCompleted: false,
      readyToFinish: false,
      totalPresetSeconds: null,
      claim: {
        claimed: false,
        claimedAt: null,
        baseIncomeAmount: null,
        bonusIncomeAmount: null,
        xp: null,
        treeGrowthMm: null,
      },
    },
    generation: {
      anchorAt: "2026-07-25T10:00:00.000Z",
      progress: 0,
      frozenAt: null,
      insuranceDeadlineAt: null,
      firstTransferredRoot: null,
      transferredRoots: [],
      secondsUntilNextWholeSecond: 4,
      accumulating: true,
    },
    excessGate: {
      ordinaryFull: false,
      rootsFull: false,
      reservesFull: { water: false, sun: false, fertilizer: false },
      generatingExcess: false,
    },
    ...overrides,
  });
  if (!snap) throw new Error("expected snap");
  return snap;
}

function afterTransfer(
  prev: EconomyV3RootsState,
  kind: EconomyV3RootKind,
  movedSeconds: number,
  transferred: EconomyV3RootKind[],
): EconomyV3RootsState {
  const reserves = { ...prev.reserves };
  const roots = { ...prev.roots };
  for (const k of V3_ROOT_KINDS) {
    if (k === kind) {
      roots[k] = {
        ...rootFromSeconds(0, { playableFromRoot: false }),
        transferred: true,
        frozen: true,
      };
      reserves[k] = {
        seconds: (prev.reserves[k].seconds || 0) + movedSeconds,
        capacitySeconds: 20,
        playable: (prev.reserves[k].seconds || 0) + movedSeconds >= 5,
      };
    } else if (!transferred.includes(k)) {
      const seconds = Math.max(0, Math.floor(Number(prev.roots[k].seconds) || 0));
      roots[k] = {
        ...prev.roots[k],
        frozen: true,
        // Insurance window: any remaining energy is manually transferable.
        playableFromRoot: seconds > 0,
      };
    }
  }
  const ordinaryFull = V3_ROOT_KINDS.every((k) => reserves[k].seconds >= 5);
  return baseSnap({
    roots,
    reserves,
    generation: {
      anchorAt: prev.generation.anchorAt,
      progress: 0,
      frozenAt: "2026-07-25T10:05:00.000Z",
      insuranceDeadlineAt: "2026-07-25T10:06:00.000Z",
      firstTransferredRoot: transferred[0] ?? kind,
      transferredRoots: transferred,
      secondsUntilNextWholeSecond: null,
      accumulating: false,
    },
    excessGate: {
      ordinaryFull,
      rootsFull: V3_ROOT_KINDS.every((k) => roots[k].seconds >= 25),
      reservesFull: {
        water: reserves.water.seconds >= 20,
        sun: reserves.sun.seconds >= 20,
        fertilizer: reserves.fertilizer.seconds >= 20,
      },
      generatingExcess: ordinaryFull,
    },
  });
}

function unfrozenReady(
  prev: EconomyV3RootsState,
  readyKind: EconomyV3RootKind,
): EconomyV3RootsState {
  const roots = { ...prev.roots };
  for (const k of V3_ROOT_KINDS) {
    if (roots[k].transferred) continue;
    roots[k] = {
      ...rootFromSeconds(k === readyKind ? 8 : roots[k].seconds || 3, {
        playableFromRoot: k === readyKind,
        transferred: false,
        frozen: false,
      }),
    };
  }
  return baseSnap({
    roots,
    reserves: prev.reserves,
    generation: {
      ...prev.generation,
      frozenAt: null,
      insuranceDeadlineAt: null,
      accumulating: true,
      secondsUntilNextWholeSecond: 2,
      transferredRoots: prev.generation.transferredRoots,
      firstTransferredRoot: prev.generation.firstTransferredRoot,
    },
    excessGate: prev.excessGate,
  });
}

describe("Economy v3 full user cycle (integration)", () => {
  it("walks generate → ready → transfer×3 → waiting → unfreeze → excess", async () => {
    let live = baseSnap({
      roots: {
        water: rootFromSeconds(7),
        sun: rootFromSeconds(3, { playableFromRoot: false }),
        fertilizer: rootFromSeconds(2, { playableFromRoot: false }),
      },
      generation: {
        anchorAt: "2026-07-25T10:00:00.000Z",
        progress: 0.28,
        frozenAt: null,
        insuranceDeadlineAt: null,
        firstTransferredRoot: null,
        transferredRoots: [],
        secondsUntilNextWholeSecond: 3,
        accumulating: true,
      },
    });

    // 1–2 generating / ready
    expect(resolveV3RootVisualState(live.roots.water, true, false)).toBe(
      "accumulating",
    );
    live = baseSnap({
      ...live,
      roots: {
        water: rootFromSeconds(8),
        sun: rootFromSeconds(4, { playableFromRoot: false }),
        fertilizer: rootFromSeconds(3, { playableFromRoot: false }),
      },
      generation: { ...live.generation, accumulating: false },
    });
    expect(resolveV3RootVisualState(live.roots.water, false, false)).toBe(
      "ready",
    );
    expect(canTransferV3Root(live.roots.water, false)).toBe(true);

    const order: EconomyV3RootKind[] = ["water", "sun", "fertilizer"];
    const transferred: EconomyV3RootKind[] = [];
    const commits: EconomyV3RootsState[] = [];

    for (const kind of order) {
      // Ensure selected root is ready
      live = unfrozenReady(live, kind);
      // Keep prior transferred
      for (const t of transferred) {
        live = {
          ...live,
          roots: {
            ...live.roots,
            [t]: {
              ...live.roots[t],
              transferred: true,
              playableFromRoot: false,
              seconds: 0,
              fullSegments: 0,
              partialSegmentSeconds: 0,
              fillFraction: 0,
            },
          },
        };
      }
      expect(resolveV3RootVisualState(live.roots[kind], false, false)).toBe(
        "ready",
      );

      const hold = { ...live.roots[kind] };
      const nextTransferred = [...transferred, kind];
      const pending = afterTransfer(live, kind, 8, nextTransferred);

      // Slow network: first call succeeds once; double-click skipped via busyRoot
      let calls = 0;
      const transferFn = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return { v3Roots: pending };
      };
      const first = await performEconomyV3RootTransfer({
        kind,
        root: hold,
        busyRoot: null,
        transferEnabled: true,
        transferFn,
      });
      const second = await performEconomyV3RootTransfer({
        kind,
        root: hold,
        busyRoot: kind,
        transferEnabled: true,
        transferFn,
      });
      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: false, skipped: true });
      expect(calls).toBe(1);

      const plan = planV3ManualTransferSuccess({
        kind,
        holdRoot: hold,
        pendingSnapshot: pending,
        reducedMotion: false,
      });
      expect(plan.mode).toBe("animate");
      if (plan.mode !== "animate") return;

      // During flight: live display, held fill, reserves not jumped
      const display = resolveV3RootsDisplaySnapshot(live, plan);
      expect(display.reserves[kind].seconds).toBe(live.reserves[kind].seconds);
      expect(display.generation.frozenAt).toBeNull();
      const held = resolveV3RootDisplayDuringTransfer(
        kind,
        display.roots[kind],
        plan,
      );
      expect(held.seconds).toBe(hold.seconds);
      expect(plan.pendingSnapshot.roots[kind].transferred).toBe(true);

      // Commit (end of flight / unmount flush)
      const commit = commitV3TransferPendingOnce({
        pending: plan,
        committedKey: null,
        onTransferred: (snap) => commits.push(snap),
      });
      expect(commit.committed).toBe(true);
      live = pending;
      transferred.push(kind);

      // Waiting on remaining playable energy; empty transferred looks idle
      for (const other of V3_ROOT_KINDS) {
        if (transferred.includes(other)) {
          expect(
            resolveV3RootVisualState(live.roots[other], false, true),
          ).toBe("empty");
          expect(canTransferV3Root(live.roots[other], false)).toBe(false);
        } else if (live.roots[other].seconds > 0) {
          expect(
            resolveV3RootVisualState(live.roots[other], false, true),
          ).toBe("waiting");
        } else {
          expect(
            resolveV3RootVisualState(live.roots[other], false, true),
          ).toBe("empty");
        }
      }

      // F5 remount at waiting/empty-transferred — no transferring chrome
      const remount = renderToStaticMarkup(
        <EconomyV3RootSystem transferEnabled reducedMotion v3Roots={live} />,
      );
      expect(remount).not.toContain("v3-root--transferring");
      expect(remount).toMatch(
        new RegExp(
          `data-v3-root="${kind}"[^>]*data-v3-root-state="empty"`,
        ),
      );
      expect(remount).toMatch(
        new RegExp(
          `data-v3-root="${kind}"[^>]*data-v3-root-clickable="false"`,
        ),
      );
    }

    expect(commits).toHaveLength(3);
    expect(live.excessGate.ordinaryFull).toBe(true);
    expect(shouldRefreshV3ExcessAfterTransfer(live)).toBe(true);
    // After transfers roots are drained — Metelka still follows excessAvailable.
    expect(live.excessGate.rootsFull).toBe(false);
    expect(
      shouldShowMetelkaCardWithV3Gate({
        excess: {
          excessSeconds: 30,
          excessCycle: 1,
          excessAvailable: true,
          excessPresetSeconds: 30,
          excessRate: 1,
        },
        v3Roots: live,
      }),
    ).toBe(true);
  });

  it("rootsFull + excessAvailable → Metelka; transfer does not hide Metelka", () => {
    const fullRoots = baseSnap({
      roots: {
        water: rootFromSeconds(25),
        sun: rootFromSeconds(25),
        fertilizer: rootFromSeconds(25),
      },
      excessGate: {
        ordinaryFull: false,
        rootsFull: true,
        reservesFull: { water: false, sun: false, fertilizer: false },
        generatingExcess: true,
      },
      metelkaCycle: {
        required: false,
        completedForCycle: false,
        transferLocked: false,
        careLocked: false,
        phase: "metelka_available",
      },
    });
    expect(canTransferV3Root(fullRoots.roots.water, false, false)).toBe(true);
    expect(
      shouldShowMetelkaCardWithV3Gate({
        excess: {
          excessSeconds: 10,
          excessCycle: 1,
          excessAvailable: true,
          excessPresetSeconds: 10,
          excessRate: 1,
        },
        v3Roots: fullRoots,
      }),
    ).toBe(true);
  });

  it("insurance elapsed and accumulating schedule a client refresh", () => {
    const frozen = baseSnap({
      generation: {
        anchorAt: "2026-07-25T10:00:00.000Z",
        progress: 0,
        frozenAt: "2026-07-25T10:05:00.000Z",
        insuranceDeadlineAt: "2026-07-25T10:06:00.000Z",
        firstTransferredRoot: "water",
        transferredRoots: ["water"],
        secondsUntilNextWholeSecond: null,
        accumulating: false,
      },
    });
    const now = Date.parse("2026-07-25T10:06:01.000Z");
    expect(shouldRefreshV3RootsFromClock(frozen, now, 0).reason).toBe(
      "insurance-elapsed",
    );
    expect(
      shouldRefreshV3RootsFromClock(frozen, now, now - 500).refresh,
    ).toBe(false);

    const accumulating = baseSnap();
    expect(
      shouldRefreshV3RootsFromClock(accumulating, 20_000, 0).reason,
    ).toBe("accumulating");
  });

  it("commit is idempotent (race / unmount + timer cannot double-apply)", () => {
    const pending = {
      kind: "water" as const,
      pendingSnapshot: afterTransfer(
        baseSnap({ roots: { water: rootFromSeconds(8), sun: rootFromSeconds(0, { playableFromRoot: false }), fertilizer: rootFromSeconds(0, { playableFromRoot: false }) } }),
        "water",
        8,
        ["water"],
      ),
    };
    const onTransferred = vi.fn();
    const key = v3TransferCommitKey(pending);
    const first = commitV3TransferPendingOnce({
      pending,
      committedKey: null,
      onTransferred,
    });
    const second = commitV3TransferPendingOnce({
      pending,
      committedKey: first.nextKey,
      onTransferred,
    });
    expect(first.committed).toBe(true);
    expect(first.nextKey).toBe(key);
    expect(second.committed).toBe(false);
    expect(onTransferred).toHaveBeenCalledTimes(1);
  });

  it("GamePage wires clock refresh + excess refresh after ordinaryFull", () => {
    expect(pageSrc).toContain("shouldRefreshV3RootsFromClock");
    expect(pageSrc).toContain("shouldRefreshV3ExcessAfterTransfer");
    expect(pageSrc).toContain("syncRootsFromServer");
    expect(rootSysSrc).toContain("commitV3TransferPendingOnce");
    expect(rootSysSrc).toContain("Unmount mid-flight");
    expect(rootSysSrc).toContain("Apply-then-unlock");
    expect(V3_TRANSFER_ANIM_MS).toBeGreaterThanOrEqual(500);
  });

  it("F5 stages: generation / ready / waiting / transferred / excess have no flight replay", () => {
    const stages = [
      baseSnap(),
      baseSnap({
        roots: {
          water: rootFromSeconds(8),
          sun: rootFromSeconds(0, { playableFromRoot: false }),
          fertilizer: rootFromSeconds(0, { playableFromRoot: false }),
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
      }),
      afterTransfer(
        baseSnap({ roots: { water: rootFromSeconds(8), sun: rootFromSeconds(4, { playableFromRoot: false }), fertilizer: rootFromSeconds(3, { playableFromRoot: false }) } }),
        "water",
        8,
        ["water"],
      ),
    ];
    for (const snap of stages) {
      const html = renderToStaticMarkup(
        <EconomyV3RootSystem transferEnabled v3Roots={snap} />,
      );
      expect(html).not.toContain("v3-root--transferring");
      expect(html).not.toContain('data-v3-transfer-flight="true"');
      expect(html.match(/data-v3-root="/g)?.length).toBe(3);
    }
  });
});
