import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  energyWaitSecondsForCapital,
  formatEnergyWaitMinutes,
  VAULT_CAPITAL_CURVE_MARKS,
} from "./vaultCapitalCurve";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const vaultSrc = readFileSync(join(here, "../components/VaultWidget.tsx"), "utf8");
const modalSrc = readFileSync(
  join(here, "../components/v2/VaultCapitalHelpModal.tsx"),
  "utf8",
);

describe("vault capital energy-wait help", () => {
  it("T(K) landmarks: 0 → 60 мин, 100k → 12 мин", () => {
    expect(energyWaitSecondsForCapital(0)).toBe(3600);
    expect(energyWaitSecondsForCapital(100_000)).toBe(720);
    expect(formatEnergyWaitMinutes(0)).toBe("60 мин");
    expect(formatEnergyWaitMinutes(100_000)).toBe("12 мин");
    expect(VAULT_CAPITAL_CURVE_MARKS.map((m) => m.capital)).toEqual([
      0, 10_000, 100_000, 1_000_000,
    ]);
  });

  it("safe itself opens help; modal has Время / Элементы tabs like tree stages", () => {
    expect(vaultSrc).toContain("onHelpClick");
    expect(vaultSrc).toContain("vault-badge--help");
    expect(vaultSrc).toContain('data-testid="vault-capital-help"');
    expect(vaultSrc).toContain("canOpenHelp");
    expect(vaultSrc).not.toContain("vault-help-hit");
    expect(pageSrc).toContain("VaultCapitalHelpModal");
    expect(pageSrc).toContain("setShowVaultCapitalHelp(true)");
    expect(pageSrc).toContain("treeCapital=");
    expect(modalSrc).toContain("Капитал и энергия");
    expect(modalSrc).toContain('label: "Время"');
    expect(modalSrc).toContain('label: "Элементы"');
    expect(modalSrc).toContain("tree-stages-list");
    expect(modalSrc).toContain("tree-stage-row");
    expect(modalSrc).toContain("tree-stage-badge");
    expect(modalSrc).toContain("Сейф");
    expect(modalSrc).toContain("Сундук дерева");
    expect(modalSrc).toContain("Новые элементы");
    expect(modalSrc).not.toContain("Гнёзда");
    expect(modalSrc).not.toContain("vaultEnergyWaitCurvePoints");
    expect(modalSrc).not.toContain("CurveChart");
  });
});
