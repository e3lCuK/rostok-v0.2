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
    expect(pageSrc).toContain("tutorial-plant-pad");
    expect(pageSrc).toContain("plantTutorialSprout");
    expect(pageSrc).toContain("transferTutorialCapitalVault");
    expect(pageSrc).toContain("tutorialStepAfterWelcome");
    expect(pageSrc).toContain("isV3TutorialPreEnergyStep");
    expect(flowSrc).toContain('"plant-sprout"');
    expect(flowSrc).toContain('"capital-transfer"');
  });
});
