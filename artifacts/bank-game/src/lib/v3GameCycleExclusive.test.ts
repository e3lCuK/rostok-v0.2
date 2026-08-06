/**
 * Stage 8D: when game.v3Roots.enabled, v3 is the exclusive Care/session cycle.
 * Legacy v2 Care + v1 session remain only as fallback.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "./api";
import { normalizeEconomyV3RootsSnapshot } from "./v3Roots";
import {
  isEconomyV3GameCycleEnabled,
  isV3CareUiBusy,
  mayUseLegacyCareSessionFlow,
} from "./v3GameCycle";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
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
  if (!snap) throw new Error("bad sample");
  return snap;
}

describe("Economy v3 exclusive game cycle (8D)", () => {
  it("gate helpers: enabled → exclusive; absent → legacy", () => {
    expect(isEconomyV3GameCycleEnabled(sampleV3())).toBe(true);
    expect(mayUseLegacyCareSessionFlow(sampleV3())).toBe(false);
    expect(isEconomyV3GameCycleEnabled(null)).toBe(false);
    expect(mayUseLegacyCareSessionFlow(null)).toBe(true);
    expect(isV3CareUiBusy(sampleV3())).toBe(false);
    expect(
      isV3CareUiBusy(
        sampleV3({
          careSession: {
            active: true,
            activity: "water",
            presetSeconds: 5,
            startedAt: "t",
            finishedAt: null,
            status: "active",
            skill: null,
          },
        }),
      ),
    ).toBe(true);
  });

  it("GamePage: useV3 exclusive branch; no v2 fallthrough on minigame", () => {
    expect(pageSrc).toContain("isEconomyV3GameCycleEnabled");
    expect(pageSrc).toContain("mayUseLegacyCareSessionFlow");
    expect(pageSrc).toContain("const useV3 = isEconomyV3GameCycleEnabled");
    expect(pageSrc).toContain("const useLegacyCare = mayUseLegacyCareSessionFlow");
    expect(pageSrc).toMatch(
      /v3 exclusive: no fallthrough to v2 Care \/ session\/action/,
    );
    expect(pageSrc).toMatch(
      /if\s*\(\s*!mayUseLegacyCareSessionFlow\(stateRef\.current\.game\.v3Roots\)\s*\)\s*return/,
    );
  });

  it("GamePage: handleStartSession / doAction / v2 Care guarded under v3", () => {
    expect(pageSrc).toMatch(
      /async function handleStartSession[\s\S]*?mayUseLegacyCareSessionFlow/,
    );
    expect(pageSrc).toMatch(
      /async function handleStartV2Care[\s\S]*?mayUseLegacyCareSessionFlow/,
    );
    expect(pageSrc).toMatch(
      /async function doAction[\s\S]*?mayUseLegacyCareSessionFlow/,
    );
    expect(pageSrc).toMatch(
      /async function finishV2CareOnce[\s\S]*?mayUseLegacyCareSessionFlow/,
    );
  });

  it("GamePage: recovery reads only v3 when enabled", () => {
    expect(pageSrc).toContain("v3 exclusive: apply v3Roots + excess");
    expect(pageSrc).toMatch(
      /recoverCareFromServer[\s\S]*?isEconomyV3GameCycleEnabled[\s\S]*?applyEconomyV3FromServerGame/,
    );
    expect(pageSrc).toMatch(
      /isEconomyV3GameCycleEnabled\(stateRef\.current\.game\.v3Roots\)[\s\S]*?v2CareRecoveryDoneRef/,
    );
  });

  it("GamePage: v3 does not use sessionInProgress / missedSessions for Care UI", () => {
    expect(pageSrc).toContain("careCycleActiveUi = !useLegacyCare");
    expect(pageSrc).toContain("sessionUiActive = !useLegacyCare");
    expect(pageSrc).toContain("if (useV3) return 0;");
    expect(pageSrc).toContain("activitiesLocked = !useLegacyCare");
    expect(pageSrc).toContain("v2Alloc: ActivityEnergyAllocation | null = !useLegacyCare");
  });

  it("GamePage: Metelka block is v3-only when useV3", () => {
    expect(pageSrc).toMatch(
      /metelkaBlockedByCare = useV3\s*\?\s*v3CareBlocksMetelka/,
    );
  });

  it("debug panel: hide v2 energy/roots when v3 enabled; keep excess + v3 + account", () => {
    if (!localPanel) return;
    expect(localPanel).toContain('data-debug-section={snap.v3?.enabled === true ? "economy-v3" : "economy-v2"}');
    expect(localPanel).toContain("snap.v3?.enabled !== true && (");
    expect(localPanel).toContain('data-v2-debug="energy"');
    expect(localPanel).toContain('data-v2-debug="roots"');
    expect(localPanel).toContain('data-v2-debug="excess"');
    expect(localPanel).toContain('data-v3-debug-controls="true"');
    expect(localPanel).toContain("Добавить секунды избытка");
    expect(localPanel).not.toContain("Подготовить Метёлку");
    expect(localPanel).not.toContain("Сбросить v3");
  });

  it("api surface: v1 session endpoints remain but are fallback-only from GamePage", () => {
    expect(pageSrc).toContain('api.startSession()');
    expect(pageSrc).toContain("api.doAction");
    // When v3: startSession is behind mayUseLegacyCareSessionFlow.
    const startIdx = pageSrc.indexOf("async function handleStartSession");
    const startBlock = pageSrc.slice(startIdx, startIdx + 400);
    expect(startBlock).toContain("mayUseLegacyCareSessionFlow");
    expect(startBlock).toContain("v3 owns the cycle");
  });
});

describe("Economy v3 exclusive — no v2 Care (8F)", () => {
  const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");

  it("App boot: v3 skips normalizeV2Care / completed mirror", () => {
    expect(appSrc).toContain("isEconomyV3GameCycleEnabled");
    expect(appSrc).toContain("emptyV2CareState()");
    expect(appSrc).toMatch(
      /v2Care:\s*useV3\s*\?\s*emptyV2CareState\(\)\s*:\s*normalizeV2Care/,
    );
    expect(appSrc).toMatch(
      /if\s*\(\s*!useV3\s*&&\s*userState\.game\.v2Care\?\.inProgress\s*\)/,
    );
  });

  it("GamePage: never normalize live game.v2Care when useLegacyCare is false", () => {
    expect(pageSrc).toContain("emptyV2CareState");
    expect(pageSrc).toMatch(
      /const v2Care = useLegacyCare\s*\?\s*normalizeV2Care\(game\.v2Care\)\s*:\s*emptyV2CareState\(\)/,
    );
  });

  it("GamePage: recovery / sync under v3 clears v2Care and skips applyV2CareSnapshot", () => {
    const recoverIdx = pageSrc.indexOf("async function recoverCareFromServer");
    const recoverBlock = pageSrc.slice(recoverIdx, recoverIdx + 1800);
    expect(recoverBlock).toContain("v2Care: emptyV2CareState()");
    expect(recoverBlock).toContain("applyEconomyV3FromServerGame");
    // First applyV2CareSnapshot in recover must be after the v3 early return.
    const v3Return = recoverBlock.indexOf("return;");
    const v2Snap = recoverBlock.indexOf("applyV2CareSnapshotToState");
    expect(v3Return).toBeGreaterThan(-1);
    expect(v2Snap).toBeGreaterThan(v3Return);
  });

  it("GamePage: debug energy/roots apply is a no-op under v3", () => {
    expect(pageSrc).toContain(
      "v3: never apply energy-bank / session / missedSessions patches",
    );
    expect(pageSrc).toMatch(
      /onEnergyApplied:[\s\S]*?if \(isEconomyV3GameCycleEnabled\(gNow\.v3Roots\)\) \{\s*return;/,
    );
    expect(pageSrc).toMatch(
      /onRootsApplied:[\s\S]*?if \(isEconomyV3GameCycleEnabled\(stateRef\.current\.game\.v3Roots\)\) return;/,
    );
    expect(pageSrc).toContain(
      "v3: do not expose energy bank / v2 roots counts to debug",
    );
  });

  it("GamePage: Metelka remains wired under v3 (separate from Care)", () => {
    expect(pageSrc).toContain("async function handleStartMetelka");
    expect(pageSrc).toContain("v3CareBlocksMetelka");
    expect(pageSrc).toMatch(
      /metelkaBlockedByCare = useV3\s*\?\s*v3CareBlocksMetelka/,
    );
  });
});

describe("Economy v3 — no v2 roots/bank runtime (8G)", () => {
  const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");

  it("App boot: v3 clears v2 energy bank + roots hydrate", () => {
    expect(appSrc).toContain("emptyV2RootsState()");
    expect(appSrc).toMatch(
      /v2EnergySeconds:\s*useV3\s*\?\s*0\s*:/,
    );
    expect(appSrc).toMatch(
      /v2Roots:\s*useV3\s*\?\s*emptyV2RootsState\(\)\s*:\s*normalizeV2Roots/,
    );
  });

  it("GamePage: exclusive mount — v3 → EconomyV3RootSystem; else → RootEnergyLayer", () => {
    expect(pageSrc).toContain("8G: exclusive roots");
    expect(pageSrc).toContain("useV2MockRootsLayer");
    expect(pageSrc).toMatch(
      /useV2MockRootsLayer\s*=\s*\n?\s*!useV3RootsUi/,
    );
    expect(pageSrc).toContain("{useV2MockRootsLayer && <EconomyV2MockLayer />}");
    expect(pageSrc).toContain("<EconomyV3RootSystem");
    expect(pageSrc).toContain('data-v3-roots-primary="true"');
    const rootsIdx = pageSrc.indexOf("8G: exclusive roots");
    const rootsBlock = pageSrc.slice(rootsIdx, rootsIdx + 3500);
    expect(rootsBlock).toContain("!useV3RootsUi");
    expect(rootsBlock).toContain("<RootEnergyLayer");
    expect(rootsBlock).not.toContain("<EconomyV3RootSystem");
    // collect callbacks only on RootEnergyLayer fallback branch
    expect(rootsBlock).toContain("onRootsChange");
    expect(pageSrc.indexOf("<EconomyV3RootSystem")).toBeLessThan(
      pageSrc.indexOf("<RootEnergyLayer"),
    );
  });

  it("GamePage: v3 does not read live v2EnergySeconds for Care locks", () => {
    expect(pageSrc).toContain(
      "v3: never read the live energy bank for Care locks",
    );
    expect(pageSrc).toMatch(
      /const v2EnergySeconds = useLegacyCare\s*\?\s*floorV2EnergySeconds\(game\.v2EnergySeconds\)\s*:\s*0/,
    );
    expect(pageSrc).toContain("activitiesLocked = !useLegacyCare");
    expect(pageSrc).toMatch(
      /const energyLocked =\s*!useV3 &&/,
    );
  });

  it("GamePage: v3 recovery clears bank/roots; collect API only via RootEnergyLayer fallback", () => {
    expect(pageSrc).toContain("v2Roots: emptyV2RootsState()");
    expect(pageSrc).toContain("v2EnergySeconds: 0");
    // GamePage itself never calls collectV2RootSection (only RootEnergyLayer does).
    expect(pageSrc).not.toContain("collectV2RootSection");
    expect(pageSrc).toContain("<RootEnergyLayer");
  });

  it("GamePage: debug snapshot does not expose v2 bank/roots under v3", () => {
    expect(pageSrc).toContain(
      "v3: do not expose energy bank / v2 roots counts to debug",
    );
    expect(pageSrc).toMatch(
      /if \(v3\?\.enabled === true\) \{\s*return \{\s*energySeconds: 0,\s*readyCount: 0,/,
    );
    expect(pageSrc).toMatch(
      /onEnergyApplied:[\s\S]*?if \(isEconomyV3GameCycleEnabled\(gNow\.v3Roots\)\) \{\s*return;/,
    );
    expect(pageSrc).toMatch(
      /onRootsApplied:[\s\S]*?if \(isEconomyV3GameCycleEnabled\(stateRef\.current\.game\.v3Roots\)\) return;/,
    );
  });

  it("fallback flags and Metelka / Tutorial v3 remain present", () => {
    expect(pageSrc).toContain("ENABLE_ECONOMY_V2_ROOT_COLLECTION &&");
    expect(pageSrc).toContain("mayUseLegacyCareSessionFlow");
    expect(pageSrc).toContain("handleStartMetelka");
    expect(pageSrc).toContain("prepareTutorialV3");
    expect(pageSrc).toContain("isV3TutorialRootStep");
  });
});
