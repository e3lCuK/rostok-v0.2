/**
 * Tutorial exit ("Начать играть") must NOT start the regular Care reward queue.
 * Tutorial shovel runs XP flash (claimed skill XP) → growth → +1мм → apple+coin.
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
  it("1–4. tutorial finish/dismiss only complete tutorial (no regular reward queue)", () => {
    expect(pageSrc).toContain("function handleTutorialFinish()");
    expect(pageSrc).toContain("function handleTutorialDismiss()");
    expect(pageSrc).toContain("await api.tutorialComplete({ generationAnchorAt })");
    expect(pageSrc).toContain("resolveTutorialGenerationAnchorAt");
    expect(pageSrc).toContain("tutorialDone: true");
    const finishFn =
      pageSrc.match(
        /function handleTutorialFinish\(\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(finishFn).toContain("keepSpentActivities: true");
    expect(finishFn).toContain("keepTutorialFieldChrome: true");
    expect(finishFn).not.toContain("handleGoToRewards");
    expect(finishFn).not.toContain("claimV3CareCycle");
    expect(finishFn).not.toContain("handleV3CareShovelClick");
    const dismissFn =
      pageSrc.match(
        /function handleTutorialDismiss\(\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(dismissFn).toContain("clearCareRewardPresentationState()");
    expect(dismissFn).not.toContain("handleGoToRewards");
    // Server/local keep tutorial collectibles — do not force zero counters.
    expect(dismissFn).not.toContain("demo.money");
    expect(dismissFn).toContain("data.balances?.balance");
    expect(dismissFn).not.toContain("treeGrowthMM: 0");
    expect(dismissFn).not.toContain("totalApples: 0");
    expect(dismissFn).not.toContain("earned: 0");
  });

  it("5–11. tutorial claim runs XP + demo reward beat (no claimAll / handleGoToRewards)", () => {
    const claimFn = claimFnSrc();
    expect(claimFn).toContain("if (!tutorialDone)");
    expect(claimFn).toContain("Tutorial Care claim");
    expect(claimFn).not.toContain("await handleClaimAll(0)");
    expect(claimFn).not.toContain("handleClaimAll(");
    expect(claimFn).toContain("handleTutorialCareRewards(scoresForQueue");
    // Tutorial branch returns before the regular handleGoToRewards call.
    const tutBranch =
      claimFn.match(
        /if \(!tutorialDone\) \{[\s\S]*?return "ok"; \/\/ claim applied even if ack/,
      )?.[0] ?? "";
    expect(tutBranch.length).toBeGreaterThan(40);
    expect(tutBranch).not.toContain("handleGoToRewards");
    expect(tutBranch).not.toContain("handleClaimAll");
    expect(tutBranch).toContain("handleTutorialCareRewards(scoresForQueue");
    // Legacy non-v3 still finishes immediately; v3 uses the demo beat.
    expect(tutBranch).toContain("if (useV3)");
    expect(pageSrc).toContain("function handleTutorialCareRewards(");
    expect(pageSrc).toContain("setTutorialShowGrowthBadge(true)");
    expect(pageSrc).toContain("setTutorialShowAppleBadge(true)");
    expect(pageSrc).toContain("setTutorialShowLevelBadge(true)");
    expect(pageSrc).toContain("tutorialShowLevelBadge");
    expect(pageSrc).toContain("maybeFinishTutorialRewards");
    expect(pageSrc).toContain("playCoinIncomeFeedback");
    expect(pageSrc).toContain("field-income-popup");
    // XP flash uses claimed skill XP (preset 10 → max 40/activity, 120/cycle).
    const tutRewards =
      pageSrc.match(
        /function handleTutorialCareRewards\([\s\S]*?\n  function maybeFinishTutorialRewards/,
      )?.[0] ?? "";
    expect(tutRewards).toContain("setShowXpPopup(true)");
    expect(tutRewards).toContain("setXpGainAmount(xpAmt)");
    expect(tutRewards).toContain("T=10 → max 40/activity, 120/cycle");
    // Tutorial apple/coin/mm mutate real counters (not demo-only).
    const appleClick =
      pageSrc.match(
        /function handleAppleClick\(appleIdx: number\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(appleClick).toContain("tutorialRewardActiveRef.current");
    expect(appleClick).toContain("totalApples: nextApples");
    expect(appleClick).toContain("balance: cur.balances.balance + 1");
    expect(appleClick).toContain("playCoinIncomeFeedback(1)");
    // Exit fly needs a frame with flying before collected unmounts.
    expect(appleClick).toContain("requestAnimationFrame");
    expect(pageSrc).toContain("treeGrowthMM: toMM");
    expect(pageSrc).toContain("setShowGrowthAnim(false)");
    expect(pageSrc).toContain("setShowXpPopup(false)");
    expect(pageSrc).toContain("setShowApples(false)");
    expect(pageSrc).toContain("setShowIncomePopup(false)");
    expect(pageSrc).toContain("pendingXpRef.current = null");
    // After «Уход»: pause → smooth diverge → inactive ghost; after apple+coin: longer finish hold.
    expect(pageSrc).toContain("TUTORIAL_CARE_GHOST_DELAY_MS");
    expect(pageSrc).toContain("beginCareShovelDiverge()");
    expect(pageSrc).toContain("TUTORIAL_REWARD_TO_FINISH_MS");
    // Spent cubes stay muted through congrats (no active flash).
    expect(pageSrc).toContain("tutorialActivitiesExhausted");
    expect(pageSrc).toContain("keepSpentActivities: true");
    expect(pageSrc).toContain("showSpentActivityGhost");
  });



  it("tutorial chrome: eye / gear / apple / mm / level badges gated", () => {
    expect(pageSrc).toContain(
      "useUndergroundRootsScene && tutorialDone && !excessCleaning",
    );
    // Gear appears only after tutorial (same gate family as eye).
    const gearGate = pageSrc.indexOf("{tutorialDone && (");
    const gearHost = pageSrc.indexOf('data-settings-gear="true"');
    expect(gearGate).toBeGreaterThan(-1);
    expect(gearHost).toBeGreaterThan(gearGate);
    expect(pageSrc).toContain("tutorialDone || tutorialShowAppleBadge");
    expect(pageSrc).toContain("tutorialDone || tutorialShowGrowthBadge");
    // Level widget appears with Care XP flash (tutorialShowLevelBadge), not only apples.
    // Vault stays in field-level-host even when level is hidden.
    expect(pageSrc).toContain("data-field-level-host=\"true\"");
    expect(pageSrc).toContain(
      "tutorialDone || tutorialShowLevelBadge || tutorialShowAppleBadge",
    );
    expect(pageSrc).toContain("<LevelWidget");
    expect(pageSrc).toContain("VaultWidget");
    // After collecting rewards, chrome stays through congrats (not cleared).
    expect(pageSrc).toContain("keepTutorialFieldChrome: true");
    expect(pageSrc).toContain("Keep level / basket / mm chrome once revealed");
  });

  it("12–16. regular Care claim still starts handleGoToRewards once", () => {
    const claimFn = claimFnSrc();
    expect(claimFn).toContain("handleGoToRewards(scoresForQueue)");
    expect(claimFn).toContain("Existing project sequence:");
    // Rewards must not be gated on acknowledge success.
    expect(claimFn).not.toContain("if (!acked)");
    expect(pageSrc).toContain("if (!tutorialDone) return;");
    expect(pageSrc).toContain("setShowXpPopup(true)");
    expect(pageSrc).toContain("setShowGrowthAnim(true)");
    expect(pageSrc).toContain("setShowMmPopup(true)");
    expect(pageSrc).toContain("setShowApples(true)");
    expect(pageSrc).toContain("claimApplesAndIncome");
    // Single call site for the queue after claim (not from tutorial exit).
    const goCalls = claimFn.split("handleGoToRewards(scoresForQueue)").length - 1;
    expect(goCalls).toBe(1);
  });

  it("17. Вход/finish and Уход/shovel use different handlers", () => {
    expect(pageSrc).toContain("handleTutorialFinish");
    expect(pageSrc).toContain("handleTutorialDismiss");
    expect(pageSrc).toContain("handleV3CareShovelClick");
    expect(pageSrc).toContain("handleTutorialCareRewards");
    // Shovel wiring: v3 always uses Care shovel handler (no silent tutorial-finish fallback).
    expect(pageSrc).toContain("void handleV3CareShovelClick()");
    expect(pageSrc).toMatch(
      /useV3\s*\n\s*\?\s*\(\)\s*=>\s*\{\s*\n\s*void handleV3CareShovelClick\(\)/,
    );
  });

  it("18. dismiss: tutorialDone before chrome clear (no level/basket blink)", () => {
    expect(pageSrc).toContain("clearCareRewardPresentationState");
    expect(pageSrc).toContain(
      "Must also idle reward presentation (no deferred XP/growth/apples replay)",
    );
    const dismissFn =
      pageSrc.match(
        /function handleTutorialDismiss\(\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(dismissFn).not.toContain("setShowIncomePopup(true)");
    expect(dismissFn).not.toContain("setShowGrowthAnim(true)");
    // Live gates first, then clear temporary badges — avoids unmount blink.
    const doneIdx = dismissFn.indexOf("setTutorialDone(true)");
    const clearIdx = dismissFn.indexOf("clearCareRewardPresentationState()");
    expect(doneIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(-1);
    expect(doneIdx).toBeLessThan(clearIdx);
    expect(dismissFn).toContain(
      "Unlock live chrome gates BEFORE clearing temporary tutorial badges",
    );
  });
});
