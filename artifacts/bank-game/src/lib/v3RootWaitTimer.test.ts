/**
 * Economy v3 full-cycle wait timer — ~12:00 energy-unit countdown (v2 parity).
 * Must not use the 60s transfer insurance window as the main capsule.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  captureV3RootWaitTimer,
  mergeV3RootWaitTimerSnapshot,
  remainingV3InsuranceSeconds,
  remainingV3RootWaitSeconds,
  resolveV3RootWaitTimerDisplay,
  shouldShowV3RootWaitTimer,
} from "./v3RootWaitTimer";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
const compSrc = readFileSync(
  join(here, "../components/v2/V3RootWaitTimer.tsx"),
  "utf8",
);
const libSrc = readFileSync(join(here, "v3RootWaitTimer.ts"), "utf8");
const apiRootsSrc = readFileSync(
  join(here, "../../../api-server/src/services/economy-v3-roots.ts"),
  "utf8",
);

function sampleV3(
  gen: Partial<EconomyV3RootsState["generation"]> = {},
): EconomyV3RootsState {
  const now = Date.parse("2026-07-25T10:00:00.000Z");
  const until =
    gen.secondsUntilNextWholeSecond !== undefined
      ? gen.secondsUntilNextWholeSecond
      : 720;
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
      secondsUntilNextWholeSecond: until,
      nextWholeSecondAt:
        until != null
          ? new Date(now + Number(until) * 1000).toISOString()
          : null,
      cycleDurationSeconds: until != null ? 720 : null,
      accumulating: true,
      ...gen,
    },
    excessGate: {
      ordinaryFull: false,
      rootsFull: false,
      reservesFull: { water: false, sun: false, fertilizer: false },
      generatingExcess: false,
    },
  });
  if (!snap) throw new Error("snap");
  return snap;
}

describe("v3 root wait timer — full cycle semantics", () => {
  it("1. new cycle starts near 720s / 12:00", () => {
    const now = Date.parse("2026-07-25T10:00:00.000Z");
    const snap = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        accumulating: true,
        progress: 0,
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(now + 720_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: now,
      tutorialDone: true,
    });
    expect(snap?.source).toBe("cycle");
    expect(remainingV3RootWaitSeconds(snap, now)).toBeCloseTo(720, 5);
    expect(
      resolveV3RootWaitTimerDisplay({ snapshot: snap, nowMs: now }),
    ).toMatchObject({ kind: "countdown", timeLabel: "12:00" });
  });

  it("2–4. after 60s / 70s still visible near 660 / 650 — does not hide", () => {
    const t0 = Date.parse("2026-07-25T10:00:00.000Z");
    const snap = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        accumulating: true,
        progress: 0,
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(t0 + 720_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    expect(remainingV3RootWaitSeconds(snap, t0 + 60_000)).toBeCloseTo(660, 5);
    expect(remainingV3RootWaitSeconds(snap, t0 + 70_000)).toBeCloseTo(650, 5);
    expect(
      resolveV3RootWaitTimerDisplay({ snapshot: snap, nowMs: t0 + 70_000 }),
    ).toMatchObject({ kind: "countdown", timeLabel: "10:50" });
    expect(
      shouldShowV3RootWaitTimer({
        v3Roots: sampleV3({
          accumulating: true,
          secondsUntilNextWholeSecond: 650,
          nextWholeSecondAt: new Date(t0 + 720_000).toISOString(),
          cycleDurationSeconds: 720,
        }),
        capital: 100_000,
        tutorialDone: true,
        nowMs: t0 + 70_000,
      }),
    ).toBe(true);
  });

  it("5. merge does not restart on small whole-second progress sync", () => {
    const t0 = 1_000_000;
    const prev = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 700,
        nextWholeSecondAt: new Date(t0 + 700_000).toISOString(),
        cycleDurationSeconds: 720,
        progress: 20 / 720,
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    const next = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 698,
        nextWholeSecondAt: new Date(t0 + 1000 + 698_000).toISOString(),
        cycleDurationSeconds: 720,
        progress: 22 / 720,
      }),
      capital: 100_000,
      nowMs: t0 + 1000,
      tutorialDone: true,
    });
    const merged = mergeV3RootWaitTimerSnapshot({
      prev,
      next,
      nowMs: t0 + 1000,
    });
    expect(merged?.deadlineAtMs).toBe(prev?.deadlineAtMs);
  });

  it("5b. merge rejects poll that slides deadline later (~5s reset)", () => {
    const t0 = 2_000_000;
    const prev = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 717,
        nextWholeSecondAt: new Date(t0 + 717_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    // Classic bug: frozen progress republishes remaining≈720 at now+5s.
    const slid = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(t0 + 5000 + 720_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0 + 5000,
      tutorialDone: true,
    });
    const merged = mergeV3RootWaitTimerSnapshot({
      prev,
      next: slid,
      nowMs: t0 + 5000,
    });
    expect(merged?.deadlineAtMs).toBe(prev?.deadlineAtMs);
    const rem = remainingV3RootWaitSeconds(merged, t0 + 5000);
    expect(rem).toBeCloseTo(712, 5);
    expect(rem).toBeLessThan(715);
  });

  it("5c-handoff. merge keeps tutorial remaining when server resets to ~12:00", () => {
    const t0 = 3_500_000;
    const prev = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 594,
        nextWholeSecondAt: new Date(t0 + 594_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    const reset = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(t0 + 720_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    const merged = mergeV3RootWaitTimerSnapshot({
      prev,
      next: reset,
      nowMs: t0,
      protectTutorialHandoff: true,
    });
    expect(merged?.deadlineAtMs).toBe(prev?.deadlineAtMs);
  });

  it("5c. merge accepts new cycle when remaining jumps up", () => {
    const t0 = 3_000_000;
    const prev = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 2,
        nextWholeSecondAt: new Date(t0 + 2000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    const fresh = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(t0 + 3000 + 720_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0 + 3000,
      tutorialDone: true,
    });
    const merged = mergeV3RootWaitTimerSnapshot({
      prev,
      next: fresh,
      nowMs: t0 + 3000,
    });
    expect(merged?.deadlineAtMs).toBe(fresh?.deadlineAtMs);
  });

  it("6. F5 / remount keeps remaining via absolute deadline", () => {
    const t0 = Date.parse("2026-07-25T10:00:00.000Z");
    const deadline = t0 + 720_000;
    const afterF5 = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 660,
        nextWholeSecondAt: new Date(deadline).toISOString(),
        cycleDurationSeconds: 720,
        progress: 60 / 720,
      }),
      capital: 100_000,
      nowMs: t0 + 60_000,
      tutorialDone: true,
    });
    expect(remainingV3RootWaitSeconds(afterF5, t0 + 60_000)).toBeCloseTo(
      660,
      5,
    );
    expect(afterF5?.deadlineAtMs).toBe(deadline);
  });

  it("7. background/resume recomputes from deadline (not React interval)", () => {
    const t0 = 5_000_000;
    const snap = captureV3RootWaitTimer({
      v3Roots: sampleV3({
        secondsUntilNextWholeSecond: 720,
        nextWholeSecondAt: new Date(t0 + 720_000).toISOString(),
        cycleDurationSeconds: 720,
      }),
      capital: 100_000,
      nowMs: t0,
      tutorialDone: true,
    });
    // Tab hidden 120s — wall clock only
    expect(remainingV3RootWaitSeconds(snap, t0 + 120_000)).toBeCloseTo(600, 5);
    expect(libSrc).toContain("deadlineAtMs");
    expect(compSrc).toContain("nowMs");
    expect(compSrc).toContain("useMemo");
    expect(compSrc).toContain("mergeV3RootWaitTimerSnapshot");
  });

  it("8. freeze keeps cycle timer; insurance never replaces the capsule", () => {
    expect(apiRootsSrc).toMatch(/V3_TRANSFER_INSURANCE_MS\s*=\s*60_000/);
    expect(libSrc).toMatch(/freeze\/insurance must not hide/i);
    const now = Date.parse("2026-07-25T10:00:00.000Z");
    const frozen = sampleV3({
      accumulating: true,
      frozenAt: "2026-07-25T10:00:00.000Z",
      insuranceDeadlineAt: "2026-07-25T10:01:00.000Z",
      secondsUntilNextWholeSecond: 360,
      nextWholeSecondAt: new Date(now + 360_000).toISOString(),
      cycleDurationSeconds: 720,
      progress: 0.5,
    });
    const snap = captureV3RootWaitTimer({
      v3Roots: frozen,
      capital: 100_000,
      nowMs: now,
      tutorialDone: true,
    });
    expect(snap).not.toBeNull();
    expect(remainingV3RootWaitSeconds(snap, now)).toBeCloseTo(360, 0);
    // Insurance helper still sees 60s — capsule uses cycle remaining only
    expect(remainingV3InsuranceSeconds(frozen, now)).toBe(60);
    expect(compSrc).not.toContain("insuranceDeadlineAt");
  });

  it("9. at 00:00 component triggers syncRootsFromServer", () => {
    expect(compSrc).toContain("onRefreshState");
    expect(compSrc).toContain("display.seconds > 0");
    expect(pageSrc).toContain("syncRootsFromServer");
    const late = resolveV3RootWaitTimerDisplay({
      snapshot: {
        source: "cycle",
        deadlineAtMs: 0,
        totalSeconds: 720,
        capturedAtMs: 0,
      },
      nowMs: 0,
    });
    expect(late).toMatchObject({
      kind: "countdown",
      seconds: 0,
      timeLabel: "0:00",
    });
  });

  it("9b. product: timer=0 syncs roots settle; collect is separate transfer", () => {
    // Generation lands in roots via GET settle — not directly into activity buttons.
    expect(pageSrc).toContain("onRefreshState={syncRootsFromServer}");
    expect(pageSrc).toContain("<EconomyV3RootSystem");
    expect(pageSrc).toContain("transferEnabled");
    expect(compSrc).not.toContain("transferV3Root");
    const rootsSrc = readFileSync(
      join(here, "../components/v2/EconomyV3RootSystem.tsx"),
      "utf8",
    );
    expect(rootsSrc).toContain("api.transferV3Root");
    expect(rootsSrc).toContain("/game/v3/roots/transfer");
  });

  it("10. host CSS keeps capital-hourglass nested in chest (≤430 / ≤360)", () => {
    expect(cssSrc).toContain("--v3-stack-gap");
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.v3-underground-stack\s*\{[\s\S]*?gap:\s*var\(--v3-stack-gap\)/,
    );
    expect(cssSrc).toContain("v3-capital-hourglass-slot");
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.v3-capital-hourglass-slot\s*\{[\s\S]*?z-index:\s*3/,
    );
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.v3-root-wait-timer\s*\{[\s\S]*?opacity:\s*1/,
    );
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots\s*\{[\s\S]*?--v3-roots-depth:\s*83px/,
    );
    expect(pageSrc).toContain("v3-underground-stack");
    expect(pageSrc).toContain("v3-capital-chest-host--with-hourglass");
    expect(pageSrc).toContain("<CapitalChestUnderRoots");
  });

  it("Metelka cleaning freezes timer (grey, non-ticking) instead of hiding it", () => {
    expect(compSrc).toContain("frozen = false");
    expect(compSrc).toContain("v3-root-wait-timer--frozen");
    expect(compSrc).toContain('data-timer-frozen={frozen ? "true" : "false"}');
    expect(pageSrc).toContain("frozen={excessUiGrey}");
    expect(pageSrc).toContain("v3-capital-chest-host--metelka-frozen");
    expect(cssSrc).toContain(".v3-root-wait-timer--frozen");
    expect(cssSrc).toContain(".v3-capital-chest-host--metelka-frozen");
    expect(cssSrc).toContain(
      ".v3-root-wait-timer--frozen .v3-root-wait-timer-hourglass__shell",
    );
  });

  it("capsule is tall capital-hourglass; fill bottom→top", () => {
    expect(cssSrc).toContain("--care-control-size: 46px");
    expect(cssSrc).toMatch(/--v3-timer-size:\s*var\(--v3-hourglass-height\)/);
    expect(cssSrc).toContain("--v3-hourglass-width");
    expect(cssSrc).toContain("--v3-chest-top");
    expect(cssSrc).toContain("--v3-stack-gap: 6px");
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.v3-underground-stack\s*\{[\s\S]*?flex-direction:\s*column/,
    );
    expect(cssSrc).toContain("v3-root-wait-timer-hourglass");
    expect(cssSrc).toContain("v3-capital-badge--in-bulb");
    // Capital-gold flask palette (same as capital sum), not activity green.
    expect(cssSrc).toContain("--v3-flask-capital: #c9920a");
    expect(cssSrc).toMatch(
      /\.v3-root-wait-timer-hourglass__rim[\s\S]*?stroke:\s*var\(--v3-flask-rim/,
    );
    expect(cssSrc).toMatch(
      /\.v3-root-wait-timer-capsule__fill\s*\{[\s\S]*?fill:\s*var\(--v3-flask-fill/,
    );
    expect(compSrc).toContain("V3WaitTimerHourglass");
    expect(compSrc).toContain("barProgress={timer.barProgress}");
    expect(compSrc).toContain('testId="v3-root-wait-timer-capsule"');
    expect(compSrc).toContain("IDLE_TIMER");
    expect(compSrc).not.toContain("width: `${timer.barProgress * 100}%`");
  });

  it("server exposes nextWholeSecondAt + cycleDurationSeconds (v2 section parity)", () => {
    expect(apiRootsSrc).toContain("nextWholeSecondAt");
    expect(apiRootsSrc).toContain("cycleDurationSeconds");
    expect(apiRootsSrc).toContain("720 / M(K)");
    expect(libSrc).toContain("nextWholeSecondAt");
  });
});
