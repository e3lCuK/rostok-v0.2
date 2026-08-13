import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isV3TutorialPreEnergyStep,
  resolveV3TutorialStepFromServer,
  tutorialStepAfterWelcome,
  v3TutorialOverlayConfig,
} from "./tutorialFlow";

const here = __dirname;
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const flowSrc = readFileSync(join(here, "tutorialFlow.ts"), "utf8");

describe("tutorial capital vault / plant sprout", () => {
  it("welcome advances to plant-sprout", () => {
    expect(tutorialStepAfterWelcome(true)).toBe("plant-sprout");
    expect(isV3TutorialPreEnergyStep("plant-sprout")).toBe(true);
    expect(isV3TutorialPreEnergyStep("capital-transfer")).toBe(true);
    expect(isV3TutorialPreEnergyStep("intro")).toBe(false);
  });

  it("overlays cover plant and capital-transfer", () => {
    expect(v3TutorialOverlayConfig("plant-sprout")?.text).toBe("Посадите росток");
    expect(v3TutorialOverlayConfig("capital-transfer")?.text).toMatch(
      /капитал/i,
    );
  });

  it("resolve returns capital-transfer when sprout planted and vault full", () => {
    const step = resolveV3TutorialStepFromServer({
      tutorialDone: false,
      sproutPlanted: true,
      vaultBalance: 100_000,
      v3Roots: {
        enabled: true,
        roots: {
          water: { seconds: 0, transferred: false },
          sun: { seconds: 0, transferred: false },
          fertilizer: { seconds: 0, transferred: false },
        },
        reserves: {
          water: { seconds: 0 },
          sun: { seconds: 0 },
          fertilizer: { seconds: 0 },
        },
        generation: { transferredRoots: [] },
      } as any,
    });
    expect(step).toBe("capital-transfer");
  });

  it("resolve resumes intro after vault emptied", () => {
    const step = resolveV3TutorialStepFromServer({
      tutorialDone: false,
      sproutPlanted: true,
      vaultBalance: 0,
      v3Roots: {
        enabled: true,
        roots: {
          water: { seconds: 0, transferred: false },
          sun: { seconds: 0, transferred: false },
          fertilizer: { seconds: 0, transferred: false },
        },
        reserves: {
          water: { seconds: 0 },
          sun: { seconds: 0 },
          fertilizer: { seconds: 0 },
        },
        generation: { transferredRoots: [] },
      } as any,
    });
    expect(step).toBe("intro");
  });

  it("GamePage wires plant pad, vault widget, and APIs", () => {
    expect(pageSrc).toContain("VaultWidget");
    expect(pageSrc).toContain("totalCapital=");
    expect(pageSrc).toContain("vaultBalance + Math.max(0, Number(balances.balance)");
    // Not on welcome / plant-sprout — only from capital-transfer onward.
    expect(pageSrc).toContain('tutorialStep !== "welcome"');
    expect(pageSrc).toContain('tutorialStep !== "plant-sprout"');
    expect(pageSrc).toContain("tutorial-plant-pad");
    expect(pageSrc).toContain("plantTutorialSprout");
    expect(pageSrc).toContain("transferTutorialCapitalVault");
    expect(pageSrc).toContain("tutorialStepAfterWelcome");
    expect(pageSrc).toContain("isV3TutorialPreEnergyStep");
    expect(flowSrc).toContain('"plant-sprout"');
    expect(flowSrc).toContain('"capital-transfer"');
  });

  it("vault label is unused/total compact (100к/100к → 0/100к)", async () => {
    const { formatVaultAmount, formatVaultChestLabel } = await import(
      "@/components/VaultWidget"
    );
    expect(formatVaultAmount(0)).toBe("0");
    expect(formatVaultAmount(100_000)).toBe("100к");
    // Before transfer: all unused, total = chosen deposit.
    expect(formatVaultChestLabel(100_000, 100_000)).toBe("100к/100к");
    // After transfer: none left in vault.
    expect(formatVaultChestLabel(0, 100_000)).toBe("0/100к");
  });

  it("vault keeps classic gold safe chrome", () => {
    const vaultSrc = readFileSync(
      join(here, "../components/VaultWidget.tsx"),
      "utf8",
    );
    expect(vaultSrc).toContain('const FLASK_GOLD = "#c9920a"');
    expect(vaultSrc).not.toContain('const COLOR = "#2f5c0e"');
    expect(vaultSrc).toContain("VaultSafeSvg");
    expect(vaultSrc).toContain("vault-badge-amount");
    expect(vaultSrc).toContain('data-vault-amount="true"');
    expect(vaultSrc).not.toContain("vault-safe-bottom-cut");
    // Crop flush to painted shell — no empty SVG pad under the safe.
    expect(vaultSrc).toContain('viewBox="7.5 11.5 41 33.3"');
    // Same flask caption type as apple / mm counters.
    expect(vaultSrc).toContain('className="field-caption-value vault-badge-amount"');
    const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
    // Same under-icon gap as «УРОВЕНЬ» (.lvl-badge-caption).
    expect(cssSrc).toMatch(
      /\.lvl-badge-caption\s*\{[^}]*bottom:\s*5px/s,
    );
    expect(cssSrc).toMatch(
      /\.vault-badge-amount\s*\{[^}]*bottom:\s*5px/s,
    );
    // Aspect-matched box so letterboxing cannot reopen a gap under the safe.
    expect(cssSrc).toMatch(
      /\.vault-badge-svg[^{]*\{[^}]*height:\s*45px/s,
    );
  });
});


