import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatRub } from "@/lib/engine";
import type { EconomyV2ExcessResultState } from "@/lib/api";
import {
  createIncomeChestFeedback,
  formatIncomeChestFloatLabel,
  readPendingPaidIncome,
  shouldPlayIncomeChestFeedback,
} from "@/lib/incomeChestFeedback";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const css = readFileSync(join(here, "../bank.css"), "utf8");
const chestSrc = readFileSync(
  join(here, "../components/v2/V2CapitalChest.tsx"),
  "utf8",
);
const layerSrc = readFileSync(
  join(here, "../components/v2/RootEnergyLayer.tsx"),
  "utf8",
);

const pendingResult: EconomyV2ExcessResultState = {
  available: true,
  finishedAt: 1,
  reason: "time_expired",
  clearedCount: 6,
  webCount: 12,
  skill: 0.5,
  sourceSeconds: 10,
  presetSeconds: 5,
  rate: 0.014,
  xp: { max: 6, raw: 3, awarded: 3, applied: true },
  income: {
    available: true,
    reason: "ok",
    capital: 100_000,
    excessElapsedMs: 3_600_000,
    annualRate: 0.014,
    gross: 0.12,
    paymentFactor: 1,
    paid: 0.1,
    applied: false,
  },
};

describe("incomeChestFeedback helpers", () => {
  it("1. before acknowledge — no feedback amount when result missing", () => {
    expect(readPendingPaidIncome(null)).toBeNull();
    expect(readPendingPaidIncome({ ...pendingResult, available: false })).toBeNull();
  });

  it("2. pending: reads server paid, does not invent amount", () => {
    expect(readPendingPaidIncome(pendingResult)).toBe(0.1);
    expect(formatIncomeChestFloatLabel(0.1)).toBe(`+${formatRub(0.1)}`);
  });

  it("3–4. play only when paidIncomeApplied > 0 and pending paid known", () => {
    expect(shouldPlayIncomeChestFeedback(0.1, 0.1)).toBe(true);
    expect(shouldPlayIncomeChestFeedback(0, 0.1)).toBe(false);
    expect(shouldPlayIncomeChestFeedback(0.1, null)).toBe(false);
    expect(shouldPlayIncomeChestFeedback(undefined, 0.1)).toBe(false);
  });

  it("5. capital update is from response balances — not local add", () => {
    const ack = page.slice(
      page.indexOf("async function handleAcknowledgeExcessResult"),
      page.indexOf("const apples = totalApples"),
    );
    expect(ack).toContain("balance: res.balances.balance");
    expect(ack).toContain("earned: res.balances.earned");
    expect(ack).not.toMatch(/balance\s*\+\s*.*paid/i);
    expect(ack).not.toContain("currentCapital +");
  });

  it("6. chest bump class exists; lid stays closed", () => {
    expect(chestSrc).toContain("v2-chest-capital--bump");
    expect(chestSrc).toContain("v2-chest-motion--react");
    expect(chestSrc).toContain('data-lid-state="closed"');
    expect(chestSrc).not.toContain('data-lid-state="open"');
  });

  it("7–8. helper ids stay unique; label format stable", () => {
    const a = createIncomeChestFeedback(0.1);
    const b = createIncomeChestFeedback(0.1);
    expect(a.id).not.toBe(b.id);
    expect(formatIncomeChestFloatLabel(0.1)).toContain("₽");
  });

  it("9. double-click guarded by excessAckBusy", () => {
    const ack = page.slice(
      page.indexOf("async function handleAcknowledgeExcessResult"),
      page.indexOf("const apples = totalApples"),
    );
    expect(ack).toContain("if (excessAckBusy) return");
    expect(page).toContain("playCoinIncomeFeedback");
  });

  it("10. error path does not trigger income popup", () => {
    const ack = page.slice(
      page.indexOf("async function handleAcknowledgeExcessResult"),
      page.indexOf("const apples = totalApples"),
    );
    const catchIdx = ack.indexOf("} catch");
    expect(catchIdx).toBeGreaterThan(0);
    expect(ack.slice(catchIdx)).not.toContain("playCoinIncomeFeedback");
    expect(ack.slice(catchIdx)).not.toContain("setShowIncomePopup");
  });

  it("11. F5: income popup is React state only — not localStorage", () => {
    expect(page).toContain("showIncomePopup");
    expect(page).not.toMatch(/localStorage.*incomePopup|incomePopup.*localStorage/);
  });

  it("12. single beige field-income-popup — no second chest float", () => {
    expect(css).toContain("field-income-popup");
    expect(css).toContain("field-income-popup--stone");
    expect(page).toContain('data-field-income-popup="true"');
    expect(page).toContain("playCoinIncomeFeedback");
    expect(page).toContain('playCoinIncomeFeedback(moneyGained, "stone")');
    // Ported out of roots wipe-layer (clip-path was hiding tutorial +₽).
    expect(page).toContain("field-income-popup--ported");
    expect(css).toContain("field-income-popup--ported");
    expect(page).not.toContain("createIncomeChestFeedback");
    expect(page).not.toContain("setIncomeChestFeedback");
    expect(page).not.toContain("<IncomeChestFloat");
    expect(layerSrc).not.toContain("IncomeChestFloat");
  });

  it("13–14. per-click reward path uses beige popup; lid closed", () => {
    expect(page).toContain("onWebReward");
    expect(page).toContain("playCoinIncomeFeedback(credited)");
    expect(page).toContain("asPositiveRewardAmount");
    expect(page).toContain("rewardDelta?.baseIncomeAmount");
    expect(page).not.toContain("Уборка завершена");
  });
});
