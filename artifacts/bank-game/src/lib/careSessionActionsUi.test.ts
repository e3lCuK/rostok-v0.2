import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EconomyV2ExcessState } from "@/lib/api";
import {
  allActivitiesDone,
  careCycleBlocksMetelka,
  isWaitingForCareShovel,
  resolveCareReadyRowMode,
  shouldExitPostCareUi,
  shouldRestoreCareShovelOnRecovery,
  shouldShowCareShovelButton,
} from "./careSessionActionsUi";

const excessAvailable: EconomyV2ExcessState = {
  excessSeconds: 20,
  excessAvailable: true,
  excessPresetSeconds: 5,
  capacitySeconds: 60,
  fillRatio: 0.3,
  session: {
    active: false,
    startedAt: null,
    sourceSeconds: null,
    presetSeconds: null,
    rate: null,
  },
  result: { available: false },
};

describe("careSessionActionsUi — Care shovel vs activities vs Metelka", () => {
  it("1. only one activity done → still activity trio, no shovel", () => {
    const completed = { water: true, sun: false, fertilizer: false };
    expect(allActivitiesDone(completed)).toBe(false);
    expect(
      isWaitingForCareShovel({
        allActivitiesDone: false,
        showCompletionStage: false,
        showCareButton: false,
        showActivityGhost: false,
      }),
    ).toBe(false);
    expect(
      shouldShowCareShovelButton({ showCareButton: false, showRewards: false }),
    ).toBe(false);
  });

  it("2. two activities done → still no «Уход»", () => {
    const completed = { water: true, sun: true, fertilizer: false };
    expect(allActivitiesDone(completed)).toBe(false);
    expect(
      isWaitingForCareShovel({
        allActivitiesDone: false,
        showCompletionStage: false,
        showCareButton: false,
        showActivityGhost: false,
      }),
    ).toBe(false);
  });

  it("3. all three done → waiting for «Уход»", () => {
    const completed = { water: true, sun: true, fertilizer: true };
    expect(allActivitiesDone(completed)).toBe(true);
    expect(
      isWaitingForCareShovel({
        allActivitiesDone: true,
        showCompletionStage: false,
        showCareButton: false,
        showActivityGhost: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCareShovelButton({ showCareButton: true, showRewards: false }),
    ).toBe(true);
  });

  it("4. all three done + excess → «Уход» / Care blocks Metelka", () => {
    const blocks = careCycleBlocksMetelka({
      careInProgress: true,
      allActivitiesDone: true,
      showCompletionStage: true,
      showCareButton: false,
      showActivityGhost: false,
      hasUnclaimedPending: true,
    });
    expect(blocks).toBe(true);
    expect(
      resolveCareReadyRowMode({
        excess: excessAvailable,
        careBlocksMetelka: blocks,
      }),
    ).toBe("care");
  });

  it("5. after «Уход» rewards path — exit only once showRewards + pending cleared", () => {
    expect(
      shouldExitPostCareUi({
        tutorialDone: true,
        pendingBase: 0,
        pendingBonus: 0,
        showCompletionStage: true,
        showActivityGhost: false,
        showCareButton: true,
        showRewards: false,
      }),
    ).toBe(false);

    expect(
      shouldExitPostCareUi({
        tutorialDone: true,
        pendingBase: 0,
        pendingBonus: 0,
        showCompletionStage: true,
        showActivityGhost: false,
        showCareButton: true,
        showRewards: true,
      }),
    ).toBe(true);

    // Hold muted cubes while capital +₽ flash plays (no active blink).
    expect(
      shouldExitPostCareUi({
        tutorialDone: true,
        pendingBase: 0,
        pendingBonus: 0,
        showCompletionStage: true,
        showActivityGhost: true,
        showCareButton: true,
        showRewards: true,
        showIncomePopup: true,
      }),
    ).toBe(false);
  });

  it("5b. GamePage holds muted cubes for income flash + tail (no double hide race)", () => {
    const page = readFileSync(
      new URL("../pages/GamePage.tsx", import.meta.url),
      "utf8",
    );
    expect(page).toContain("incomeUiHold");
    expect(page).toContain("scheduleIncomePopupHide");
    expect(page).toContain("showIncomePopup: showIncomePopup || incomeUiHold");
    expect(page).toContain(
      "showActivityGhost || tutorialActivitiesExhausted || incomeUiHold",
    );
    // Ghost stays mounted while showRewards (covers incomeUiHold→exit gap).
    expect(page).toContain(
      "(showSpentActivityGhost || showRewards) && !careDiverging",
    );
    expect(page).not.toContain("showRewards ? null");
    // Competing setTimeout that cleared +₽ early (flashed active cubes) must stay gone.
    expect(page).not.toContain(
      "setTimeout(() => { setShowIncomePopup(false); setShowApplePopup(false); }, 1500)",
    );
  });

  it("6. after Care chrome cleared, excess may show Metelka", () => {
    const blocks = careCycleBlocksMetelka({
      careInProgress: false,
      allActivitiesDone: false,
      showCompletionStage: false,
      showCareButton: false,
      showActivityGhost: false,
      hasUnclaimedPending: false,
    });
    expect(blocks).toBe(false);
    expect(
      resolveCareReadyRowMode({
        excess: excessAvailable,
        careBlocksMetelka: blocks,
      }),
    ).toBe("metelka");
  });

  it("7. active cleaning mode stays cleaning (tutorial shovel path independent)", () => {
    const cleaning: EconomyV2ExcessState = {
      ...excessAvailable,
      excessAvailable: false,
      session: {
        active: true,
        startedAt: Date.now(),
        sourceSeconds: 20,
        presetSeconds: 5,
        rate: 0.01,
      },
    };
    expect(
      resolveCareReadyRowMode({
        excess: cleaning,
        careBlocksMetelka: false,
      }),
    ).toBe("cleaning");

    // Zero pending must not wipe shovel before rewards animation
    expect(
      shouldExitPostCareUi({
        tutorialDone: true,
        pendingBase: 0,
        pendingBonus: 0,
        showCompletionStage: true,
        showActivityGhost: false,
        showCareButton: false,
        showRewards: false,
      }),
    ).toBe(false);
  });

  it("8. F5 after three completed activities restores shovel path", () => {
    expect(
      shouldRestoreCareShovelOnRecovery({
        allCompleted: true,
        hasUnclaimedPending: false,
      }),
    ).toBe(true);
    expect(
      shouldRestoreCareShovelOnRecovery({
        allCompleted: false,
        hasUnclaimedPending: true,
      }),
    ).toBe(true);
    expect(
      shouldRestoreCareShovelOnRecovery({
        allCompleted: false,
        hasUnclaimedPending: false,
      }),
    ).toBe(false);
  });
});
