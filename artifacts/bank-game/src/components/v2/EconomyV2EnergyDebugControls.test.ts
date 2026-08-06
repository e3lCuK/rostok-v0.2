import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserState } from "@/lib/engine";
import {
  applyEconomyV2EnergyToState,
  applyEconomyV2ExcessDebugToState,
  applyEconomyV2RootsDebugToState,
  formatExcessCycleDisplay,
  formatExcessRatePercent,
  formatExcessSecondsDisplay,
  formatExcessSessionStartedAt,
  isExcessResetSessionEnabled,
  isExcessStartEnabled,
  normalizeV2Excess,
} from "./EconomyV2EnergyDebugControls";
import type { EconomyV2ExcessState } from "@/lib/api";

const here = dirname(fileURLToPath(import.meta.url));

function baseState(): UserState {
  return {
    balances: {
      balance: 100_000,
      startDate: "2026-01-01",
    },
    game: {
      v2EnergySeconds: 10,
      v2EnergyAnchorAt: 1_000,
      v2Roots: {
        readyMask: "0",
        readyCount: 0,
        generationProgress: 0,
        secondsPerSection: 720,
        secondsUntilNextSection: 720,
        isFull: false,
      },
      v2Excess: {
        excessSeconds: 0,
        excessCycle: 0,
        excessAvailable: false,
        excessPresetSeconds: 5,
        excessRate: 0.015,
      },
      lastSessionTime: null,
      missedSessions: 0,
    },
  } as UserState;
}

describe("Economy v2 debug roots — server mask only", () => {
  it("applyEconomyV2RootsDebugToState takes readyMask from server patch", () => {
    const next = applyEconomyV2RootsDebugToState(baseState(), {
      v2Roots: {
        readyMask: "32767",
        readyCount: 15,
        generationProgress: 0.2,
        secondsPerSection: 720,
        secondsUntilNextSection: 500,
        isFull: false,
      },
      v2EnergySeconds: 10,
      v2EnergyAnchorAt: 1_000,
    });
    expect(next.game.v2Roots?.readyMask).toBe("32767");
    expect(next.game.v2Roots?.readyCount).toBe(15);
    expect(next.game.v2EnergySeconds).toBe(10);
  });

  it("energy debug apply replaces roots atomically (no bank-only partial)", () => {
    const next = applyEconomyV2EnergyToState(baseState(), {
      v2EnergySeconds: 60,
      v2EnergyAnchorAt: 2_000,
      lastSessionTime: null,
      missedSessions: 0,
      v2Roots: {
        readyMask: "0",
        readyCount: 0,
        generationProgress: 0,
        secondsPerSection: 720,
        secondsUntilNextSection: null,
        isFull: false,
        storageFull: true,
        storageOccupied: 60,
        storageFree: 0,
      },
    });
    expect(next.game.v2Roots?.readyMask).toBe("0");
    expect(next.game.v2EnergySeconds).toBe(60);
    expect(next.game.v2Roots?.storageFull).toBe(true);
    expect(next.game.v2Roots?.secondsUntilNextSection).toBeNull();
  });

  it("source has no local readyMask override / local↔server picker", () => {
    const panel = readFileSync(
      join(here, "EconomyV2EnergyDebugControls.tsx"),
      "utf8",
    );
    const layer = readFileSync(join(here, "RootEnergyLayer.tsx"), "utf8");
    const page = readFileSync(
      join(here, "../../pages/GamePage.tsx"),
      "utf8",
    );

    for (const src of [panel, layer, page]) {
      expect(src).not.toMatch(/debugReadyMaskOverride/);
      expect(src).not.toMatch(/localReadyMask/);
      expect(src).not.toMatch(/MASK_PRESETS/);
      expect(src).not.toMatch(/Использовать состояние сервера/);
      expect(src).not.toMatch(/localMask\s*\?\?/);
      expect(src).not.toMatch(/effectiveMask/);
    }

    expect(panel).toContain("Отладка корней");
    expect(panel).toContain("Готово секций:");
    expect(panel).toContain("Сбросить секции");
    expect(panel).toContain("+1 секция");
    expect(panel).toContain("+15 секций");
    expect(panel).toContain("debugEconomyV2Roots");
    expect(panel).toContain('action: "reset"');
    expect(panel).toContain("count: 1");
    expect(panel).toContain("count: 15");
  });
});

describe("Economy v2 debug excess panel", () => {
  const panel = readFileSync(
    join(here, "EconomyV2EnergyDebugControls.tsx"),
    "utf8",
  );
  const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
  const flags = readFileSync(
    join(here, "../../lib/featureFlags.ts"),
    "utf8",
  );

  it("1. legacy component still has Избыток; GamePage uses bridge not left mount", () => {
    expect(panel).toContain("Избыток");
    expect(panel).toContain('data-debug-section="excess"');
    expect(page).toContain("registerEconomyV2DebugBridge");
    expect(page).toContain("onExcessApplied");
    expect(page).not.toContain("<EconomyV2EnergyDebugControls");
  });

  it("2+3. displays separated ledger vs Metelka T fields", () => {
    expect(panel).toContain("formatExcessSecondsDisplay");
    expect(panel).toContain("data-excess-seconds");
    expect(panel).toContain("data-excess-preset");
    expect(panel).toContain("data-excess-cycle");
    expect(panel).toContain("SHOW_EXCESS_SESSION_DEBUG_UI = true");
    expect(panel).toContain("Ledger (игр.сек, ∞)");
    expect(panel).toContain("Пресет Метёлки T:");
    expect(formatExcessSecondsDisplay(12.5)).toBe("12.50 сек");
    expect(formatExcessCycleDisplay(0.208333)).toBe("0.208");
    expect(formatExcessRatePercent(0.0149)).toBe("1.49%");
  });

  it("4–7. addPresetSeconds quick buttons + reset", () => {
    expect(panel).toContain("debugEconomyV2Excess");
    expect(panel).toContain('action: "addPresetSeconds"');
    expect(panel).toContain('label: "+1ч"');
    expect(panel).toContain('label: "+5ч"');
    expect(panel).toContain("seconds: 25");
    expect(panel).toContain('{ action: "reset" }');
    expect(panel).toContain('label: "Сбросить избыток и сессию"');
    expect(panel).not.toContain('label: "Ledger +25 (не длительность)"');
    expect(panel).not.toContain("Advanced ledger");
  });

  it("8. successful response updates state via apply helper", () => {
    const next = applyEconomyV2ExcessDebugToState(baseState(), {
      v2Excess: {
        excessSeconds: 6,
        excessCycle: 0.1,
        excessAvailable: true,
        excessPresetSeconds: 6,
        excessRate: 0.0144,
      },
    });
    expect(next.game.v2Excess?.excessSeconds).toBe(6);
    expect(next.game.v2Excess?.excessAvailable).toBe(true);
    expect(next.game.v2EnergySeconds).toBe(10);
  });

  it("acknowledge response updates balances from server snapshot", () => {
    const next = applyEconomyV2ExcessDebugToState(baseState(), {
      v2Excess: {
        excessSeconds: 3,
        excessCycle: 0.05,
        excessAvailable: true,
        excessPresetSeconds: 5,
        excessRate: 0.014,
        result: {
          available: false,
          finishedAt: null,
          reason: null,
          clearedCount: null,
          webCount: null,
          skill: null,
          sourceSeconds: null,
          presetSeconds: null,
          rate: null,
        },
      },
      balances: { balance: 100_075, earned: 125 },
    });
    expect(next.balances.balance).toBe(100_075);
    expect(next.balances.earned).toBe(125);
    expect(next.game.v2Excess?.result?.available).toBe(false);
    expect(next.game.v2Excess?.excessSeconds).toBe(3);
  });

  it("9. error path does not call onExcessApplied (no optimistic update)", () => {
    expect(panel).toContain("onExcessApplied");
    // update only inside try after await — catch only setError
    const runIdx = panel.indexOf("async function runExcess");
    const tryIdx = panel.indexOf("try {", runIdx);
    const appliedIdx = panel.indexOf("onExcessApplied", tryIdx);
    const catchIdx = panel.indexOf("} catch", tryIdx);
    expect(appliedIdx).toBeGreaterThan(tryIdx);
    expect(appliedIdx).toBeLessThan(catchIdx);
    expect(panel.slice(catchIdx, catchIdx + 200)).not.toContain("onExcessApplied");
  });

  it("10. double-click guarded by busyKey early return + disabled", () => {
    expect(panel).toContain("if (busyKey != null) return");
    expect(panel).toContain("disabled={busy}");
    expect(panel).toContain("setBusyKey(key)");
  });

  it("11. production / debug-off: legacy left component gated; GamePage does not mount it", () => {
    expect(page).toContain("registerEconomyV2DebugBridge");
    expect(flags).toContain("VITE_SHOW_ECONOMY_V2_MOCKS");
    expect(page).not.toContain("<EconomyV2EnergyDebugControls");
    expect(panel).not.toContain("Метёлка»");
  });

  it("normalizeV2Excess defaults safely", () => {
    expect(normalizeV2Excess(null).excessSeconds).toBe(0);
    expect(normalizeV2Excess(undefined).excessAvailable).toBe(false);
    expect(normalizeV2Excess(null).excessPresetSeconds).toBe(5);
    expect(normalizeV2Excess(null).session).toEqual({
      active: false,
      version: null,
      startedAt: null,
      sourceSeconds: null,
      sourceElapsedMs: null,
      capital: null,
      baseIncome: null,
      baseWebCleared: false,
      baseWebCollectionMode: null,
      presetSeconds: null,
      rate: null,
      webCount: null,
      whiteWebCount: null,
      layoutSeed: null,
      clearedWebIds: [],
      clearedWebCount: 0,
      remainingWebCount: 0,
      webs: [],
      specialWebId: null,
      baseWebId: null,
      specialCleared: false,
      bonusRawUnlocked: null,
      xpAwarded: null,
    });
    expect(normalizeV2Excess(null).result).toEqual({
      available: false,
      sessionVersion: null,
      finishedAt: null,
      reason: null,
      clearedCount: null,
      clearedWhiteCount: null,
      webCount: null,
      whiteWebCount: null,
      skill: null,
      sourceSeconds: null,
      presetSeconds: null,
      rate: null,
      xp: {
        max: null,
        raw: null,
        awarded: null,
        applied: false,
      },
      income: {
        available: false,
        reason: null,
        capital: null,
        excessElapsedMs: null,
        annualRate: null,
        gross: null,
        paymentFactor: null,
        paid: null,
        applied: false,
        base: { amount: null, collectionMode: null, applied: false },
        bonus: { gross: null, skill: null, paid: null, applied: false },
        total: { paid: null, applied: false },
      },
    });
    expect(normalizeV2Excess(null).excessElapsedMs).toBe(0);
    expect(normalizeV2Excess(null).excessBaseIncome).toBe(0);
    expect(normalizeV2Excess(null).excessFinanciallyValid).toBe(true);
  });

  it("normalizeV2Excess derives T from ledger; ignores stale excessPresetSeconds", () => {
    const stale = normalizeV2Excess({
      excessSeconds: 25,
      excessElapsedMs: 0,
      excessBaseIncome: 0,
      excessFinanciallyValid: false,
      excessCycle: 999,
      excessAvailable: false,
      excessPresetSeconds: 25, // wrong — must become T(25/60)=5
      excessRate: 0.99,
      session: {
        active: false,
        startedAt: null,
        sourceSeconds: null,
        presetSeconds: null,
        rate: null,
      },
    });
    expect(stale.excessPresetSeconds).toBe(5);
    expect(stale.excessCycle).toBeCloseTo(25 / 60, 10);
    expect(stale.excessAvailable).toBe(true);
    expect(stale.excessRate).toBeLessThan(0.015);
    expect(stale.excessRate).toBeGreaterThan(0.005);

    const forT25 = normalizeV2Excess({
      excessSeconds: 3690,
      excessElapsedMs: 1,
      excessBaseIncome: 0,
      excessFinanciallyValid: true,
      excessCycle: 0,
      excessAvailable: false,
      excessPresetSeconds: 5,
      excessRate: 0.015,
      session: {
        active: false,
        startedAt: null,
        sourceSeconds: null,
        presetSeconds: null,
        rate: null,
      },
    });
    expect(forT25.excessPresetSeconds).toBe(25);
    expect(forT25.excessAvailable).toBe(true);
  });
});

describe("Economy v2 debug excess Metelka session", () => {
  const panel = readFileSync(
    join(here, "EconomyV2EnergyDebugControls.tsx"),
    "utf8",
  );
  const apiSrc = readFileSync(join(here, "../../lib/api.ts"), "utf8");
  const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
  const flags = readFileSync(
    join(here, "../../lib/featureFlags.ts"),
    "utf8",
  );

  function excessState(
    overrides: Partial<EconomyV2ExcessState> = {},
  ): EconomyV2ExcessState {
    return normalizeV2Excess({
      excessSeconds: 0,
      excessCycle: 0,
      excessAvailable: false,
      excessPresetSeconds: 5,
      excessRate: 0.015,
      session: {
        active: false,
        startedAt: null,
        sourceSeconds: null,
        presetSeconds: null,
        rate: null,
      },
      ...overrides,
    });
  }

  it("1. Metelka session UI remains available behind debug flag", () => {
    expect(panel).toContain("SHOW_EXCESS_SESSION_DEBUG_UI = true");
    expect(panel).toContain("Сессия Метёлки");
    expect(panel).toContain('data-excess-session-status="true"');
    const inactive = excessState();
    expect(inactive.session?.active).toBe(false);
  });

  it("2. start disabled when excess < 5", () => {
    const e = excessState({
      excessSeconds: 4,
      excessAvailable: false,
    });
    expect(isExcessStartEnabled(e, false)).toBe(false);
  });

  it("3. start enabled when excess >= 5 and session inactive", () => {
    const e = excessState({
      excessSeconds: 5,
      excessAvailable: true,
      session: {
        active: false,
        startedAt: null,
        sourceSeconds: null,
        presetSeconds: null,
        rate: null,
      },
    });
    expect(isExcessStartEnabled(e, false)).toBe(true);
  });

  it("4. start calls real /api/game/v2/excess/start", () => {
    expect(apiSrc).toContain('"/game/v2/excess/start"');
    expect(apiSrc).toContain("startEconomyV2ExcessSession");
    expect(panel).toContain("startEconomyV2ExcessSession");
    const startFn = panel.indexOf("async function runExcessStart");
    const startBody = panel.slice(startFn, panel.indexOf("async function runExcessResetSession"));
    expect(startBody).toContain("api.startEconomyV2ExcessSession");
    expect(startBody).not.toContain("debugEconomyV2Excess");
  });

  it("5. after start applies server session source/preset/rate", () => {
    const next = applyEconomyV2ExcessDebugToState(baseState(), {
      v2Excess: {
        excessSeconds: 5,
        excessCycle: 5 / 60,
        excessAvailable: true,
        excessPresetSeconds: 5,
        excessRate: 0.0149,
        session: {
          active: true,
          startedAt: 1_700_000_000_000,
          sourceSeconds: 5,
          presetSeconds: 5,
          rate: 0.0149,
        },
      },
    });
    expect(next.game.v2Excess?.session?.active).toBe(true);
    expect(next.game.v2Excess?.session?.sourceSeconds).toBe(5);
    expect(next.game.v2Excess?.session?.presetSeconds).toBe(5);
    expect(next.game.v2Excess?.session?.rate).toBeCloseTo(0.0149, 10);
    expect(panel).toContain("data-excess-session-source");
    expect(panel).toContain("data-excess-session-preset");
    expect(panel).toContain("data-excess-session-rate");
    expect(panel).toContain("onExcessApplied");
    expect(panel).toContain("normalizeV2Excess(res.excess)");
  });

  it("6. start disabled while session active", () => {
    const e = excessState({
      excessSeconds: 25,
      excessAvailable: true,
      session: {
        active: true,
        startedAt: 1,
        sourceSeconds: 12,
        presetSeconds: 5,
        rate: 0.014,
      },
    });
    expect(isExcessStartEnabled(e, false)).toBe(false);
    expect(isExcessResetSessionEnabled(e, false)).toBe(true);
  });

  it("7. reset calls debug resetSession", () => {
    expect(panel).toContain('action: "resetSession"');
    expect(panel).toContain("Сбросить сессию");
    expect(panel).toContain('data-excess-action="resetSession"');
    const resetFn = panel.indexOf("async function runExcessResetSession");
    const resetBody = panel.slice(resetFn, resetFn + 600);
    expect(resetBody).toContain('action: "resetSession"');
    expect(resetBody).toContain("debugEconomyV2Excess");
  });

  it("8. reset does not change excessSeconds (server snapshot)", () => {
    const before = baseState();
    before.game.v2Excess = excessState({
      excessSeconds: 22,
      excessAvailable: true,
      session: {
        active: true,
        startedAt: 1,
        sourceSeconds: 12,
        presetSeconds: 5,
        rate: 0.014,
      },
    });
    const next = applyEconomyV2ExcessDebugToState(before, {
      v2Excess: {
        excessSeconds: 22,
        excessCycle: 22 / 60,
        excessAvailable: true,
        excessPresetSeconds: 5,
        excessRate: 0.014,
        session: {
          active: false,
          startedAt: null,
          sourceSeconds: null,
          presetSeconds: null,
          rate: null,
        },
      },
    });
    expect(next.game.v2Excess?.excessSeconds).toBe(22);
  });

  it("9. after reset session shows inactive", () => {
    const next = applyEconomyV2ExcessDebugToState(baseState(), {
      v2Excess: excessState({ excessSeconds: 22, excessAvailable: true }),
    });
    expect(next.game.v2Excess?.session?.active).toBe(false);
    expect(formatExcessSessionStartedAt(null)).toBe("—");
  });

  it("10. double-click guarded — one busyKey for start/reset", () => {
    expect(panel).toContain('runExcessStart("xstart")');
    expect(panel).toContain('runExcessResetSession("xresetSession")');
    const startFn = panel.indexOf("async function runExcessStart");
    const startBody = panel.slice(
      startFn,
      panel.indexOf("async function runExcessResetSession"),
    );
    expect(startBody).toContain("if (busyKey != null) return");
    expect(startBody).toContain('setBusyKey(key)');
    expect(panel).toContain("disabled={!canStart}");
    expect(panel).toContain("disabled={!canResetSession}");
    expect(isExcessStartEnabled(excessState({ excessAvailable: true }), true)).toBe(
      false,
    );
    expect(
      isExcessResetSessionEnabled(
        excessState({
          session: {
            active: true,
            startedAt: 1,
            sourceSeconds: 5,
            presetSeconds: 5,
            rate: 0.01,
          },
        }),
        true,
      ),
    ).toBe(false);
  });

  it("11. business errors refresh snapshot; no local fake session in catch", () => {
    expect(panel).toContain("refreshExcessFromState");
    expect(panel).toContain("api.getState");
    const startFn = panel.indexOf("async function runExcessStart");
    const startBody = panel.slice(
      startFn,
      panel.indexOf("async function runExcessResetSession"),
    );
    expect(startBody).toContain("excess_not_available");
    expect(startBody).toContain("excess_session_already_active");
    expect(startBody).toContain("refreshExcessFromState");
    const catchIdx = startBody.indexOf("} catch");
    const catchPart = startBody.slice(catchIdx);
    // catch must not invent session.active = true locally
    expect(catchPart).not.toMatch(/session:\s*\{\s*active:\s*true/);
    expect(catchPart).not.toContain("sourceSeconds: excess.excessSeconds");
  });

  it("12. production / debug-off: Metelka session UI only behind panel gate", () => {
    expect(page).toContain("registerEconomyV2DebugBridge");
    expect(flags).toContain("VITE_SHOW_ECONOMY_V2_MOCKS");
    expect(page).not.toContain("Запустить Метёлку");
    expect(page).not.toContain("Сбросить сессию");
    expect(panel).toContain("SHOW_EXCESS_SESSION_DEBUG_UI = true");
    expect(panel).toContain("Запустить Метёлку");
    expect(panel).toContain("Сбросить сессию");
  });

  it("Избыток UI uses addPresetSeconds; keeps ledger/preset readout", () => {
    expect(panel).toContain("SHOW_EXCESS_SESSION_DEBUG_UI = true");
    expect(panel).toContain('action: "addPresetSeconds"');
    expect(panel).toContain('data-debug-section="excess"');
    expect(panel).toContain("data-excess-seconds");
    expect(panel).toContain("data-excess-preset");
    expect(panel).toContain("Ledger (игр.сек, ∞)");
    expect(panel).toContain("Пресет Метёлки T:");
    expect(panel).toContain("Добавить секунды избытка");
    expect(panel).toContain("Отладка · энергия");
    expect(panel).toContain("Отладка корней");
    expect(panel).toContain("debugEconomyV2Energy");
    expect(panel).toContain("debugEconomyV2Roots");
  });

  it("excess-base debug comes from server; no red web / result rewrite", () => {
    expect(panel).toContain("data-excess-base-income");
    expect(panel).toContain("excess.excessBaseIncome");
    expect(panel).not.toMatch(/computeBaseIncomeForElapsedMs|V2_BASE_APR\s*\*/);
    expect(page).not.toContain("base-income-web");
    expect(apiSrc).toContain("excessBaseIncome");
  });
});
