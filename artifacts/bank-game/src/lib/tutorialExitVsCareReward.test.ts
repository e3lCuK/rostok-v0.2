/**
 * Tutorial exit ("Начать играть" / enter game) must NOT start Care reward animations.
 * Regular Care claim (tutorialDone) must still call handleGoToRewards once.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");

function claimFnSrc(): string {
  return (
    pageSrc.match(
      /async function claimV3CareCycleOnce\([\s\S]*?\n  async function handleV3CareShovelClick/,
    )?.[0] ?? ""
  );
}

describe("tutorial exit vs Care reward animation", () => {
  it("1–4. tutorial finish/dismiss only complete tutorial (no reward queue)", () => {
    expect(pageSrc).toContain("function handleTutorialFinish()");
    expect(pageSrc).toContain("function handleTutorialDismiss()");
    expect(pageSrc).toContain("await api.tutorialComplete()");
    expect(pageSrc).toContain("tutorialDone: true");
    const finishFn =
      pageSrc.match(
        /function handleTutorialFinish\(\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(finishFn).toContain("clearCareRewardPresentationState()");
    expect(finishFn).not.toContain("handleGoToRewards");
    expect(finishFn).not.toContain("claimV3CareCycle");
    expect(finishFn).not.toContain("handleV3CareShovelClick");
    const dismissFn =
      pageSrc.match(
        /function handleTutorialDismiss\(\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(dismissFn).toContain("clearCareRewardPresentationState()");
    expect(dismissFn).not.toContain("handleGoToRewards");
  });

  it("5–11. tutorial claim path does not credit real economy — no claimAll / reward animations", () => {
    const claimFn = claimFnSrc();
    expect(claimFn).toContain("if (!tutorialDone)");
    expect(claimFn).toContain("Tutorial Care claim");
    expect(claimFn).not.toContain("await handleClaimAll(0)");
    expect(claimFn).not.toContain("handleClaimAll(");
    expect(claimFn).toContain("clearCareRewardPresentationState()");
    expect(claimFn).toContain("handleTutorialFinish()");
    // Tutorial branch returns before the regular handleGoToRewards call.
    const tutBranch =
      claimFn.match(
        /if \(!tutorialDone\) \{[\s\S]*?return "ok"; \/\/ claim applied even if ack/,
      )?.[0] ?? "";
    expect(tutBranch.length).toBeGreaterThan(40);
    expect(tutBranch).not.toContain("handleGoToRewards");
    expect(tutBranch).not.toContain("handleClaimAll");
    expect(tutBranch).toContain("clearCareRewardPresentationState()");
    expect(pageSrc).toContain("setShowGrowthAnim(false)");
    expect(pageSrc).toContain("setShowXpPopup(false)");
    expect(pageSrc).toContain("setShowApples(false)");
    expect(pageSrc).toContain("setShowIncomePopup(false)");
    expect(pageSrc).toContain("pendingXpRef.current = null");
  });

  it("12–16. regular Care claim still starts handleGoToRewards once", () => {
    const claimFn = claimFnSrc();
    expect(claimFn).toContain("handleGoToRewards(scores)");
    expect(claimFn).toContain("Only after confirmed regular Care claim");
    expect(pageSrc).toContain("if (!tutorialDone) return;");
    expect(pageSrc).toContain("setShowXpPopup(true)");
    expect(pageSrc).toContain("setShowGrowthAnim(true)");
    expect(pageSrc).toContain("setShowMmPopup(true)");
    expect(pageSrc).toContain("setShowApples(true)");
    expect(pageSrc).toContain("claimApplesAndIncome");
    // Single call site for the queue after claim (not from tutorial exit).
    const goCalls = claimFn.split("handleGoToRewards(scores)").length - 1;
    expect(goCalls).toBe(1);
  });

  it("17. Вход/finish and Уход/shovel use different handlers", () => {
    expect(pageSrc).toContain("handleTutorialFinish");
    expect(pageSrc).toContain("handleTutorialDismiss");
    expect(pageSrc).toContain("handleV3CareShovelClick");
    // Shovel wiring: tutorial complete without v3 care action → finish; else Care.
    expect(pageSrc).toMatch(
      /tutorialStep === "complete"\s*\n\s*\? handleTutorialFinish/,
    );
    expect(pageSrc).toContain("void handleV3CareShovelClick()");
  });

  it("18. F5 / remount: tutorial dismiss clears presentation before tutorialDone", () => {
    expect(pageSrc).toContain("clearCareRewardPresentationState");
    expect(pageSrc).toContain(
      "Must also idle reward presentation (no deferred XP/growth/apples replay)",
    );
    // Auto income popup on load must not be wired into tutorial dismiss.
    const dismissFn =
      pageSrc.match(
        /function handleTutorialDismiss\(\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(dismissFn).not.toContain("setShowIncomePopup(true)");
    expect(dismissFn).not.toContain("setShowGrowthAnim(true)");
  });
});
