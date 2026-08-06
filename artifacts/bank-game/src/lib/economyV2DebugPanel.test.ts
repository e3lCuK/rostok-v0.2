import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  bumpEconomyV2ExcessDebugMutationSeq,
  getEconomyV2DebugBridge,
  notifyEconomyV2DebugSnapshot,
  readEconomyV2DebugSnapshot,
  readEconomyV2ExcessDebugMutationSeq,
  registerEconomyV2DebugBridge,
  subscribeEconomyV2DebugSnapshot,
} from "./economyV2DebugBridge";
import {
  formatBankDebugLabel,
  formatExcessDebugLabel,
  formatRootsDebugLabel,
  parseNonNegativeIntInput,
  parsePositiveIntInput,
  parsePositiveSecondsInput,
} from "./economyV2DebugInputs";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const apiSrc = readFileSync(join(here, "api.ts"), "utf8");
const localPanelPath = join(here, "../local/debug-panel.tsx");
const localPanel = existsSync(localPanelPath)
  ? readFileSync(localPanelPath, "utf8")
  : "";

describe("Economy v2 debug moved to right panel", () => {
  it("1. left EconomyV2EnergyDebugControls is not mounted", () => {
    expect(page).not.toContain("<EconomyV2EnergyDebugControls");
    expect(page).toContain("registerEconomyV2DebugBridge");
    expect(page).toContain("notifyEconomyV2DebugSnapshot");
  });

  it("debug excess mutation seq guards stale syncRootsFromServer", () => {
    const before = readEconomyV2ExcessDebugMutationSeq();
    expect(bumpEconomyV2ExcessDebugMutationSeq()).toBe(before + 1);
    expect(readEconomyV2ExcessDebugMutationSeq()).toBe(before + 1);
    expect(page).toContain("bumpEconomyV2ExcessDebugMutationSeq");
    expect(page).toContain("readEconomyV2ExcessDebugMutationSeq");
    expect(page).toContain("keepLocalExcess");
    expect(page).toContain("excessSeqAtStart");
  });

  it("2. right panel shows bank / roots / excess value labels", () => {
    expect(localPanel).toContain("formatBankDebugParts");
    expect(localPanel).toContain("formatRootsDebugParts");
    expect(localPanel).toContain("Текущий пресет:");
    expect(localPanel).toContain("Финансовое время:");
    expect(localPanel).not.toContain("Ledger:");
    expect(formatBankDebugLabel(12.5)).toBe("Банк: 12.50 / 60 сек");
    expect(formatRootsDebugLabel(7)).toBe("Готовые секции: 7 / 60");
    expect(formatExcessDebugLabel(3.25)).toBe("Ledger: 3.25 сек");
    expect(formatExcessDebugLabel(3.25, 5)).toBe("Ledger: 3.25 сек · live T=5");
  });

  it("3. arbitrary bank value is sent as deltaSeconds", () => {
    expect(localPanel).toContain("deltaSeconds: n");
    expect(parsePositiveSecondsInput("7")).toBe(7);
    expect(parsePositiveSecondsInput("7.5")).toBe(7.5);
  });

  it("4. bank reset uses setSeconds: 0", () => {
    expect(localPanel).toContain("setSeconds: 0");
    expect(localPanel).toContain("Сбросить банк");
  });

  it("5. roots accepts only positive integers", () => {
    expect(parsePositiveIntInput("3")).toBe(3);
    expect(parsePositiveIntInput("3.5")).toBeNull();
    expect(parsePositiveIntInput("0")).toBeNull();
    expect(parsePositiveIntInput("-1")).toBeNull();
    expect(parsePositiveIntInput("")).toBeNull();
    expect(localPanel).toContain("parsePositiveIntInput");
  });

  it("6. roots reset uses action reset", () => {
    expect(localPanel).toContain('action: "reset"');
    expect(localPanel).toContain("Сбросить секции");
    expect(localPanel).toContain("debugEconomyV2Roots");
  });

  it("7. excess uses single addPresetSeconds input", () => {
    expect(localPanel).toContain('action: "addPresetSeconds"');
    expect(localPanel).toContain("Добавить секунды избытка");
    expect(localPanel).toContain("Текущий пресет:");
    expect(localPanel).toContain("Финансовое время:");
    expect(localPanel).toContain("formatExcessElapsedReadout");
    expect(localPanel).toContain("liveExcessElapsedMs");
    expect(localPanel).toContain("excessFinancialAnchorAt");
    expect(localPanel).toContain("previewMetelkaDebugReward");
    expect(localPanel).toContain("METELKA_MAX_PRESET_STATUS");
    expect(localPanel).toContain("METELKA_MAX_PRESET_FINANCE_HINT");
    expect(localPanel).toContain("isMetelkaMaxGamePreset");
    // addPresetSeconds response fills roots — apply v3Roots via bridge.
    expect(localPanel).toContain("res.v3Roots ?? res.game?.v3Roots");
    expect(localPanel).toContain("applyV3Snapshot");
    expect(localPanel).not.toContain("Ledger:");
    expect(localPanel).not.toContain("Скорость генерации:");
    expect(localPanel).not.toContain("formatLedgerGenerationRate");
    expect(localPanel).not.toContain("METELKA_DEBUG_PRESET_VS_FINANCE_HINT");
    expect(localPanel).not.toContain("Сбросить сессию Метёлки");
    expect(localPanel).not.toContain("Установить пресет Метёлки");
    expect(localPanel).not.toContain("Advanced: добавить ledger");
    expect(localPanel).not.toContain('action: "setElapsed"');
    expect(localPanel).not.toContain('action: "setPreset"');
    expect(parsePositiveSecondsInput("11")).toBe(11);
  });

  it("8. excess reset uses action reset", () => {
    expect(localPanel).toContain("Сбросить избыток и сессию");
    expect(localPanel).toMatch(
      /debugEconomyV2Excess\(\{\s*action:\s*"reset"\s*\}\)/,
    );
  });

  it("9. legacy paired financial / setElapsed controls are gone", () => {
    expect(localPanel).not.toContain("Тест дохода: 10 сек / 1 час");
    expect(localPanel).not.toContain('action: "setFinancial"');
    expect(localPanel).not.toContain('action: "setElapsed"');
    expect(localPanel).not.toContain("elapsedMs = 0");
  });

  it("10. quick +1ч…+5ч for excess financial time; energy chips stay separate", () => {
    expect(localPanel).toContain('label: "+1ч"');
    expect(localPanel).toContain('label: "+5ч"');
    expect(localPanel).toContain("seconds: 5");
    expect(localPanel).toContain("seconds: 25");
    expect(localPanel).not.toContain("[5, 10, 15, 20, 25]");
    expect(localPanel).not.toContain("`+${n}`");
    expect(localPanel).not.toContain("+1 сек");
    expect(localPanel).not.toContain("+15 секций");
  });

  it("11. success applies snapshot via bridge without reload", () => {
    expect(localPanel).toContain("onEnergyApplied");
    expect(localPanel).toContain("onRootsApplied");
    expect(localPanel).toContain("onExcessApplied");
    expect(localPanel).not.toMatch(
      /debugEconomyV2Energy[\s\S]{0,200}reload\(\)/,
    );
    const applied: unknown[] = [];
    registerEconomyV2DebugBridge({
      getSnapshot: () => ({
        energySeconds: 10,
        readyCount: 2,
        excessSeconds: 1,
        excessPresetSeconds: 5,
        excessElapsedMs: 0,
        excessFinancialAnchorAt: null,
        capital: 1000,
        sessionActive: false,
        sessionPresetSeconds: null,
        v3: null,
      }),
      onEnergyApplied: (p) => applied.push(p),
      onRootsApplied: () => {},
      onExcessApplied: () => {},
      onV3RootsApplied: () => {},
    });
    expect(readEconomyV2DebugSnapshot().energySeconds).toBe(10);
    getEconomyV2DebugBridge()?.onEnergyApplied({
      v2EnergySeconds: 17,
      v2EnergyAnchorAt: 1,
      lastSessionTime: null,
      missedSessions: 0,
      v2Roots: {
        readyMask: "0",
        readyCount: 0,
        generationProgress: 0,
        secondsPerSection: 720,
        secondsUntilNextSection: null,
        isFull: false,
      },
    });
    expect(applied).toHaveLength(1);
    registerEconomyV2DebugBridge(null);
  });

  it("12. invalid input does not parse to a request value", () => {
    expect(parsePositiveSecondsInput("")).toBeNull();
    expect(parsePositiveSecondsInput("0")).toBeNull();
    expect(parsePositiveSecondsInput("-2")).toBeNull();
    expect(parsePositiveSecondsInput("  ")).toBeNull();
    expect(parsePositiveSecondsInput("abc")).toBeNull();
  });

  it("13. busyKey / disabled pattern blocks double click", () => {
    expect(localPanel).toContain("busyKey");
    expect(localPanel).toContain("if (busyKey != null) return");
    expect(localPanel).toContain("disabled={busy || energyAdd == null}");
  });

  it("14. errors render in panel (not silent catch only)", () => {
    expect(localPanel).toContain('data-debug-error="true"');
    expect(localPanel).toContain('data-v2-excess-error="true"');
    expect(localPanel).toContain("setError(formatApiError(e))");
    // Excess errors must show even when Economy v3 panel is active.
    expect(localPanel).not.toContain(
      "error && snap.v3?.enabled !== true",
    );
  });

  it("15. other right-panel account buttons remain", () => {
    expect(localPanel).toContain("+ опыт");
    expect(localPanel).toContain("+ мм дереву");
    expect(localPanel).toContain("+ яблок");
    expect(localPanel).toContain("Увеличить день");
    expect(localPanel).toContain("Сброс роста");
    expect(localPanel).toContain("Сброс туториала");
    expect(localPanel).toContain("Сброс аккаунта");
    expect(localPanel).toContain("Удалить аккаунт");
  });

  it("layout: bank input + Добавить share one row", () => {
    expect(localPanel).toContain('data-v2-energy-row="true"');
    const energy = localPanel.slice(
      localPanel.indexOf('data-v2-debug="energy"'),
      localPanel.indexOf('data-v2-debug="roots"'),
    );
    expect(energy).toMatch(
      /data-v2-energy-row[\s\S]*data-v2-energy-input[\s\S]*Добавить/,
    );
    expect(energy).not.toContain("Добавить секунд");
  });

  it("layout: roots input + Добавить share one row", () => {
    expect(localPanel).toContain('data-v2-roots-row="true"');
    const roots = localPanel.slice(
      localPanel.indexOf('data-v2-debug="roots"'),
      localPanel.indexOf('data-v2-debug="excess"'),
    );
    expect(roots).toMatch(
      /data-v2-roots-row[\s\S]*data-v2-roots-input[\s\S]*Добавить/,
    );
    expect(roots).not.toContain("Добавить секций");
    expect(roots).toContain('placeholder="секции"');
  });

  it("layout: excess uses addPresetSeconds row + readout", () => {
    expect(localPanel).toContain('data-v2-excess-add-row="true"');
    const excess = localPanel.slice(
      localPanel.indexOf('data-v2-debug="excess"'),
      localPanel.indexOf("data-debug-error"),
    );
    expect(excess).toMatch(
      /data-v2-excess-add-row[\s\S]*data-v2-excess-add-input[\s\S]*Добавить/,
    );
    expect(excess).toContain("Добавить секунды избытка");
    expect(excess).toContain("Текущий пресет:");
    expect(excess).toContain("Финансовое время:");
    expect(excess).toContain("liveExcessElapsedMs");
    expect(excess).not.toContain("Ledger:");
    expect(excess).not.toContain("Скорость генерации:");
    expect(excess).not.toContain("Advanced: добавить ledger");
    expect(excess).not.toContain("Установить пресет Метёлки");
  });

  it("layout: no full-width add labels; resets remain", () => {
    expect(localPanel).not.toContain("Добавить секций");
    expect(localPanel).toContain("Сбросить банк");
    expect(localPanel).toContain("Сбросить секции");
    expect(localPanel).toContain("Сбросить избыток и сессию");
  });

  it("layout: panel has max-height and overflow-y", () => {
    expect(localPanel).toContain('maxHeight: "calc(100vh - 84px)"');
    expect(localPanel).toContain('maxHeight: "calc(100vh - 130px)"');
    expect(localPanel).toContain('overflowY: "auto"');
  });

  it("bridge subscribe notifies listeners only when snapshot changes", () => {
    registerEconomyV2DebugBridge(null);
    const fn = vi.fn();
    const unsub = subscribeEconomyV2DebugSnapshot(fn);
    notifyEconomyV2DebugSnapshot(); // no-op — still empty
    expect(fn).not.toHaveBeenCalled();
    registerEconomyV2DebugBridge({
      getSnapshot: () => ({
        energySeconds: 3,
        readyCount: 1,
        excessSeconds: 0,
        excessPresetSeconds: 5,
        excessElapsedMs: 0,
        excessFinancialAnchorAt: null,
        capital: 0,
        sessionActive: false,
        sessionPresetSeconds: null,
        v3: null,
      }),
      onEnergyApplied: () => {},
      onRootsApplied: () => {},
      onExcessApplied: () => {},
      onV3RootsApplied: () => {},
    });
    expect(fn).toHaveBeenCalledTimes(1);
    notifyEconomyV2DebugSnapshot(); // same values — no-op
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    registerEconomyV2DebugBridge(null);
  });

  it("readEconomyV2DebugSnapshot is referentially stable when values unchanged", () => {
    registerEconomyV2DebugBridge({
      getSnapshot: () => ({
        energySeconds: 5,
        readyCount: 2,
        excessSeconds: 1,
        excessPresetSeconds: 5,
        excessElapsedMs: 0,
        excessFinancialAnchorAt: null,
        capital: 1000,
        sessionActive: false,
        sessionPresetSeconds: null,
        v3: null,
      }),
      onEnergyApplied: () => {},
      onRootsApplied: () => {},
      onExcessApplied: () => {},
      onV3RootsApplied: () => {},
    });
    const a = readEconomyV2DebugSnapshot();
    const b = readEconomyV2DebugSnapshot();
    expect(a).toBe(b);
    registerEconomyV2DebugBridge(null);
  });

  it("v3 readout is visible in right panel only when enabled", () => {
    expect(localPanel).toContain('data-v3-debug="roots-readout"');
    expect(localPanel).toContain("snap.v3?.enabled === true");
    expect(localPanel).toContain("Корень воды:");
    expect(localPanel).toContain("Корень солнца:");
    expect(localPanel).toContain("Корень удобрения:");
    expect(localPanel).toContain("Запас воды:");
    expect(localPanel).toContain("Запас солнца:");
    expect(localPanel).toContain("Запас удобрения:");
    expect(localPanel).toContain("Корни</div>");
    expect(localPanel).toContain("Запасы</div>");
    expect(localPanel).toContain("Система готова");
    expect(localPanel).toContain("Обычные запасы заполнены");
    expect(localPanel).toContain("Накапливается избыток");
    expect(localPanel).toContain("Избыток доступен");
    expect(localPanel).toContain("Корни заморожены");
    expect(localPanel).toContain("Корни накапливаются");
    expect(localPanel).toContain("Уход активен");
    expect(localPanel).toContain('data-v3-debug-excess-gate=');
    expect(localPanel).not.toContain("Water root:");
    expect(localPanel).not.toContain("Care cycle status:");
    expect(localPanel).not.toContain("ordinaryFull:");
    expect(localPanel).not.toContain("generatingExcess:");
    expect(localPanel).not.toContain("excessAvailable:");
    expect(localPanel).not.toContain("Economy v3");
    expect(localPanel).not.toContain("transferV3Root");
  });

  it("v3 debug controls: set roots/reserves without reload; no reset button", () => {
    expect(localPanel).toContain('data-v3-debug-controls="true"');
    expect(localPanel).toContain("debugEconomyV3Roots");
    expect(localPanel).toContain('action: "set"');
    expect(localPanel).not.toMatch(
      /debugEconomyV3Roots\(\{\s*action:\s*"reset"/,
    );
    expect(localPanel).toContain("onV3RootsApplied");
    expect(localPanel).toContain("parseNonNegativeIntInput");
    expect(localPanel).toContain("Установить");
    expect(localPanel).not.toContain("Сбросить v3");
    expect(localPanel).not.toContain("Сбросить V3");
    expect(localPanel).not.toContain("Reset V3");
    expect(localPanel).not.toContain("function resetV3");
    expect(localPanel).toContain("data-v3-debug-error");
    expect(localPanel).toContain("applyV3Snapshot");
    expect(localPanel).toContain('color: "#89b4fa"');
    expect(localPanel).not.toContain("#f9e2af");
    expect(localPanel).not.toMatch(
      /debugEconomyV3Roots[\s\S]{0,200}window\.location\.reload/,
    );
    expect(page).toContain("onV3RootsApplied");
    expect(page).toContain("applyEconomyV3RootsToState");
    expect(parseNonNegativeIntInput("0")).toBe(0);
    expect(parseNonNegativeIntInput("7")).toBe(7);
    expect(parseNonNegativeIntInput("-1")).toBeNull();
    expect(parseNonNegativeIntInput("1.5")).toBeNull();
    expect(parseNonNegativeIntInput("")).toBeNull();
  });

  it("v3 excess creation: single addPresetSeconds path (no prepare Metelka)", () => {
    expect(localPanel).not.toContain("debugEconomyV3PrepareMetelka");
    expect(localPanel).not.toContain("Подготовить Метёлку");
    expect(localPanel).not.toContain("Подготовить избыток");
    expect(localPanel).not.toContain("Подготовить 5 секунд");
    expect(localPanel).not.toContain(
      "Заполняет корни до вместимости и создаёт избыток 5 сек",
    );
    expect(localPanel).not.toContain('data-v3-debug-prepare-metelka="true"');
    expect(localPanel).not.toContain("/game/debug/economy-v3/prepare-metelka");
    expect(localPanel).toContain("Добавить секунды избытка");
    expect(localPanel).toContain('action: "addPresetSeconds"');
    expect(localPanel).toContain("addExcessPresetSeconds");
    expect(localPanel).toContain("data-v2-excess-add-row");
    expect(localPanel).toContain("data-v2-excess-add-quick");
    expect(localPanel).toContain("Сбросить избыток и сессию");
    expect(localPanel).toContain('action: "fillToCapacity"');
    expect(localPanel).toContain("Заполнить корни");
    expect(localPanel).not.toContain("Заполнить активности");
    expect(localPanel).not.toContain("fillV3ReservesToCapacity");
    expect(localPanel).not.toContain("setV3Reserve");
    expect(localPanel).not.toContain("data-v3-reserve-input");
    expect(localPanel).toContain("Вместимость =");
    expect(localPanel).not.toContain("capacity =");
    expect(localPanel).not.toContain("(effectivePreset)");
    expect(localPanel).toContain("v3CapPlaceholder");
    expect(localPanel).toContain("effectivePresetSeconds");
    expect(localPanel).not.toContain('placeholder="0–25"');
    expect(localPanel).not.toContain('data-v3-debug-excess-hint="true"');
    // One Add applies roots + excess (no reload, no separate fill).
    expect(localPanel).toMatch(
      /addExcessPresetSeconds[\s\S]*?debugEconomyV2Excess[\s\S]*?applyExcessResponse/,
    );
    expect(localPanel).toContain("onExcessApplied");
    expect(localPanel).toContain("onV3RootsApplied");
    expect(localPanel).not.toMatch(
      /addExcessPresetSeconds[\s\S]{0,300}window\.location\.reload/,
    );
    expect(apiSrc).not.toContain("debugEconomyV3PrepareMetelka");
    expect(apiSrc).not.toContain("/game/debug/economy-v3/prepare-metelka");
  });

  it("8D: when v3 enabled, hide v2 energy/roots debug; keep excess", () => {
    expect(localPanel).toContain(
      'data-debug-section={snap.v3?.enabled === true ? "economy-v3" : "economy-v2"}',
    );
    expect(localPanel).toContain("snap.v3?.enabled !== true && (");
    expect(localPanel).toContain('data-v2-debug="excess"');
  });

  it("v3 debug panel mounts only outside production build", () => {
    expect(localPanel).toContain("!import.meta.env.PROD");
    expect(localPanel).toMatch(
      /if\s*\(\s*!import\.meta\.env\.PROD\s*\)\s*\{/,
    );
  });
});
