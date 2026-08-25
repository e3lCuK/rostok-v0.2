import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import MetelkaRewardCoin from "@/components/v2/MetelkaRewardCoin";
import {
  applyMetelkaClaimToGameState,
  clearMetelkaXpAnimationShownForTests,
  formatMetelkaCoinAmountLabel,
  hasMetelkaXpAnimationShown,
  isMetelkaPendingRewardActive,
  markMetelkaXpAnimationShown,
  metelkaPendingClaimToken,
  metelkaXpShownStorageKey,
  normalizeMetelkaPendingReward,
  shouldShowMetelkaFinishXpAnimation,
  unmarkMetelkaXpAnimationShown,
} from "@/lib/metelkaPendingRewardUi";
import { formatRub } from "@/lib/engine";
import { buildClearRewardFloatsFromResponse } from "@/lib/excessCleaningRewardFloat";

const here = dirname(fileURLToPath(import.meta.url));

function activePending(overrides: Record<string, unknown> = {}) {
  return normalizeMetelkaPendingReward({
    active: true,
    baseAmount: 1.0,
    bonusAmount: 0.42,
    totalAmount: 1.42,
    xpAmount: 5,
    createdAt: 1_700_000_000_000,
    claimToken: "tok-finish-1",
    claimedAt: null,
    ...overrides,
  })!;
}

describe("metelkaPendingRewardUi", () => {
  afterEach(() => {
    clearMetelkaXpAnimationShownForTests();
  });

  it("coin label shows total only via project rub format", () => {
    expect(formatMetelkaCoinAmountLabel(1.42)).toBe(`+${formatRub(1.42)}`);
    expect(formatMetelkaCoinAmountLabel(1.42)).not.toMatch(/base|bonus|XP/i);
  });

  it("active pending visibility", () => {
    expect(isMetelkaPendingRewardActive(activePending())).toBe(true);
    expect(
      isMetelkaPendingRewardActive(
        activePending({ active: false, claimedAt: Date.now() }),
      ),
    ).toBe(false);
    expect(
      isMetelkaPendingRewardActive(activePending({ totalAmount: 0 })),
    ).toBe(false);
    expect(
      isMetelkaPendingRewardActive(activePending({ totalAmount: 0.01 })),
    ).toBe(true);
    expect(metelkaPendingClaimToken(activePending())).toBe("tok-finish-1");
  });

  it("XP animation still works when money is zero", () => {
    const p = activePending({ totalAmount: 0, xpAmount: 5 });
    expect(isMetelkaPendingRewardActive(p)).toBe(false);
    expect(shouldShowMetelkaFinishXpAnimation(p)).toBe(true);
  });

  it("XP animation guard: one claimToken once per UI session", () => {
    const p = activePending({ xpAmount: 7 });
    expect(shouldShowMetelkaFinishXpAnimation(p)).toBe(true);
    markMetelkaXpAnimationShown("tok-finish-1");
    expect(hasMetelkaXpAnimationShown("tok-finish-1")).toBe(true);
    expect(shouldShowMetelkaFinishXpAnimation(p)).toBe(false);
    expect(metelkaXpShownStorageKey("tok-finish-1")).toBe(
      "metelka-xp-shown:tok-finish-1",
    );
  });

  it("new claimToken is not blocked by previous marker", () => {
    markMetelkaXpAnimationShown("tok-old");
    expect(
      shouldShowMetelkaFinishXpAnimation(
        activePending({ claimToken: "tok-new", xpAmount: 4 }),
      ),
    ).toBe(true);
  });

  it("unmark allows Strict Mode retry before commit", () => {
    markMetelkaXpAnimationShown("tok-strict");
    unmarkMetelkaXpAnimationShown("tok-strict");
    expect(hasMetelkaXpAnimationShown("tok-strict")).toBe(false);
  });

  it("XP = 0 skips animation", () => {
    expect(
      shouldShowMetelkaFinishXpAnimation(activePending({ xpAmount: 0 })),
    ).toBe(false);
  });

  it("inactive / missing token skips animation", () => {
    expect(
      shouldShowMetelkaFinishXpAnimation(
        activePending({ active: false, claimedAt: 1 }),
      ),
    ).toBe(false);
    expect(
      shouldShowMetelkaFinishXpAnimation(
        activePending({ claimToken: null }),
      ),
    ).toBe(false);
  });
});

describe("MetelkaRewardCoin", () => {
  it("reuses Care coin classes; no amount text; claiming blocks pointer", () => {
    const html = renderToStaticMarkup(
      <MetelkaRewardCoin
        overlayWidth={100}
        overlayHeight={120}
        xPct={46}
        yPct={16}
        radius={Math.round(5 * 1.3)}
        claiming={true}
        onClaim={() => {}}
      />,
    );
    expect(html).toContain("data-metelka-reward-coin");
    expect(html).toContain("tree-apple");
    expect(html).toContain("tree-apple-pending");
    expect(html).toContain("tree-apple-coin");
    expect(html).toContain("tree-apple-coin--stone");
    expect(html).toContain('data-reward-tone="stone"');
    expect(html).toContain('data-metelka-reward-claiming="true"');
    expect(html).not.toMatch(/₽|base|bonus|\+1/);
    expect(html).not.toContain("metelka-reward-coin-amount");
  });

  it("shows error without hiding coin", () => {
    const html = renderToStaticMarkup(
      <MetelkaRewardCoin
        overlayWidth={100}
        overlayHeight={120}
        xPct={46}
        yPct={16}
        radius={7}
        claiming={false}
        error="Сеть или сервер недоступны. Попробуйте ещё раз."
        onClaim={() => {}}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("data-metelka-reward-coin-btn");
    expect(html).toContain("tree-apple-coin");
  });
});

describe("Metelka clear / finish / claim wiring (source)", () => {
  const page = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
  const apiSrc = readFileSync(join(here, "api.ts"), "utf8");
  const css = readFileSync(join(here, "../bank.css"), "utf8");

  it("GamePage: auto-claims Metelka coin after METELKA_COIN_AUTO_CLAIM_MS if untouched", () => {
    const uiSrc = readFileSync(join(here, "metelkaPendingRewardUi.ts"), "utf8");
    expect(uiSrc).toContain("METELKA_COIN_AUTO_CLAIM_MS = 60_000");
    expect(page).toContain("metelkaCoinAutoClaimTimerRef");
    expect(page).toContain("claimMetelkaCoinRef");
    expect(page).toContain("METELKA_COIN_AUTO_CLAIM_MS");
    expect(page).toContain("metelkaPendingActive");
  });

  it("progress clear creates no money/XP floats", () => {
    expect(
      buildClearRewardFloatsFromResponse({
        clientX: 10,
        clientY: 10,
        reward: { kind: "progress", xpGained: 0, moneyGained: 0 },
        rewardDelta: { kind: "progress", xpRawDelta: 0, bonusRawDelta: 0 },
      }),
    ).toEqual([]);
  });

  it("GamePage: finish stores metelkaPendingReward; XP flash path; no Care coin", () => {
    expect(page).toContain("metelkaPendingReward: res.metelkaPendingReward");
    expect(page).toContain("normalizeMetelkaPendingReward");
    expect(page).toContain("MetelkaRewardCoin");
    expect(page).toContain("claimMetelkaPendingReward");
    expect(page).toContain("shouldShowMetelkaFinishXpAnimation");
    expect(page).toContain("setShowXpPopup(true)");
    expect(page).toContain("setXpFlashAmount(xp)");
    expect(page).toContain("markMetelkaXpAnimationShown");
    expect(page).toContain("unmarkMetelkaXpAnimationShown");
    expect(page).toContain("applyMetelkaClaimToGameState");
    // Paid Metelka must wipe / sync live financial clock (no stuck excess timer).
    expect(page).toMatch(
      /applyFinishSuccess[\s\S]*?resetMetelkaFinancialLive|adoptMetelkaFinancialLiveMs/,
    );
    expect(page).toContain("paidElapsedMs");
    expect(page).not.toMatch(
      /finishEconomyV2ExcessSession[\s\S]{0,800}setShowApples\(true\)/,
    );
    expect(page).not.toMatch(
      /handleClaimMetelkaPendingReward[\s\S]{0,1200}claimAll/,
    );
  });

  it("GamePage: record-only clear skips XP/money credit UI", () => {
    expect(page).toContain('reward.rewardDelta?.kind === "progress"');
    expect(page).toContain("Record-only clear (v2): progress only");
    // Metelka finish uses pending coin, not Care apple overlay.
    expect(page).toContain("MetelkaRewardCoin");
    expect(page).not.toMatch(
      /finishEconomyV2ExcessSession[\s\S]{0,800}setShowApples\(true\)/,
    );
  });

  it("API + CSS: Metelka coin reuses Care tree-apple-coin + click-to-claim", () => {
    expect(apiSrc).toContain("/game/v2/excess/metelka/claim");
    expect(apiSrc).toContain("claimMetelkaPendingReward");
    expect(css).toContain(".tree-apple-coin");
    expect(css).toContain(".tree-apple-coin--stone");
    expect(css).toContain("coin-collect-idle-pulse-stone");
    expect(css).toContain(".metelka-reward-coin-error");
    expect(css).not.toContain(".metelka-reward-coin-face");
    expect(css).not.toContain(".metelka-reward-coin-amount");
    const coinSrc = readFileSync(
      join(here, "../components/v2/MetelkaRewardCoin.tsx"),
      "utf8",
    );
    expect(coinSrc).toContain("tree-apple-coin");
    expect(coinSrc).toContain('tone="stone"');
    expect(coinSrc).toContain("tree-apple-pending");
    expect(coinSrc).toContain("onClick");
    expect(coinSrc).toContain("onClaim()");
    expect(coinSrc).not.toContain("onDragStart");
    expect(coinSrc).not.toContain("onDragActiveChange");
    expect(page).toContain('pulseRewardCollect("stone-coin")');
    expect(page).not.toContain("draggingMetelkaCoin");
    expect(coinSrc).not.toContain("formatMetelkaCoinAmountLabel");
    expect(css).toContain("gold-pulse");
  });

  it("Care regression: showApples / claimAll still present", () => {
    expect(page).toContain("showApples");
    expect(page).toContain("setShowApples(true)");
    expect(page).toContain("handleClaimAll");
    expect(page).toContain("api.claimAll");
    expect(page).toContain("tree-apple-coin");
  });
});

describe("applyMetelkaClaimToGameState", () => {
  it("writes playerXP field that LevelWidget reads", () => {
    const next = applyMetelkaClaimToGameState(
      {
        playerXP: 40,
        playerLevel: 1,
        metelkaPendingReward: activePending(),
      },
      {
        playerXp: 46,
        playerLevel: 1,
        metelkaPendingReward: activePending({
          active: false,
          claimedAt: 1_700_000_000_000,
        }),
      },
    );
    expect(next.playerXP).toBe(46);
    expect(next.playerLevel).toBe(1);
    expect(next.metelkaPendingReward?.active).toBe(false);
  });

  it("unlocks grey Metelka root lock immediately on claim", () => {
    const next = applyMetelkaClaimToGameState(
      {
        playerXP: 10,
        playerLevel: 1,
        metelkaPendingReward: activePending(),
        v3Roots: {
          enabled: true,
          metelkaCycle: {
            required: true,
            completedForCycle: false,
            transferLocked: true,
            careLocked: true,
            phase: "metelka_pending_result",
          },
        } as any,
      },
      {
        playerXp: 15,
        playerLevel: 1,
        metelkaPendingReward: activePending({
          active: false,
          claimedAt: 1,
        }),
      },
    );
    expect(next.v3Roots?.metelkaCycle?.careLocked).toBe(false);
    expect(next.v3Roots?.metelkaCycle?.transferLocked).toBe(false);
    expect(next.v3Roots?.metelkaCycle?.completedForCycle).toBe(true);
    expect(next.v3Roots?.metelkaCycle?.required).toBe(false);
  });
});

describe("GamePage Metelka root thaw timing", () => {
  it("keeps roots grey while Metelka coin is pending; unlocks on claim helper", () => {
    const page = readFileSync(
      join(here, "../pages/GamePage.tsx"),
      "utf8",
    );
    expect(page).toContain("metelkaPendingActive ||");
    expect(page).toContain("!metelkaPendingActive &&");
    expect(page).toContain("applyMetelkaClaimToGameState(cur.game, res)");
    expect(page).toContain("void syncRootsFromServer()");
  });
});

describe("Metelka pending restore contract", () => {
  it("reload before claim: active pending keeps coin amount", () => {
    const fromState = normalizeMetelkaPendingReward({
      active: true,
      baseAmount: 1.0,
      bonusAmount: 0.42,
      totalAmount: 1.42,
      xpAmount: 5,
      createdAt: 1,
      claimToken: "tok-reload",
      claimedAt: null,
    });
    expect(isMetelkaPendingRewardActive(fromState)).toBe(true);
    expect(formatMetelkaCoinAmountLabel(fromState!.totalAmount)).toBe(
      `+${formatRub(1.42)}`,
    );
  });

  it("reload after claim: inactive pending hides coin", () => {
    const fromState = normalizeMetelkaPendingReward({
      active: false,
      baseAmount: 1.0,
      bonusAmount: 0.42,
      totalAmount: 1.42,
      xpAmount: 5,
      createdAt: 1,
      claimToken: "tok-reload",
      claimedAt: 2,
    });
    expect(isMetelkaPendingRewardActive(fromState)).toBe(false);
  });
});
