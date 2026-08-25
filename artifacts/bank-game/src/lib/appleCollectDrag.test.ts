import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APPLE_BASKET_HOST_SELECTOR,
  APPLE_BASKET_SELECTOR,
  CAPITAL_CHEST_HOST_SELECTOR,
  TREE_REWARD_AUTO_COLLECT_MS,
  pointHitsAppleBasket,
  pointHitsCapitalChest,
  resolveAppleBasketEl,
  resolveCapitalChestEl,
} from "@/lib/appleCollectDrag";

const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(resolve(root, "bank.css"), "utf8");
const basketSrc = readFileSync(
  resolve(root, "components/AppleBasket.tsx"),
  "utf8",
);
const metelkaSrc = readFileSync(
  resolve(root, "components/v2/MetelkaRewardCoin.tsx"),
  "utf8",
);

function fakeDoc(
  selectorMatch: string,
  rect: { left: number; top: number; right: number; bottom: number },
): Document {
  const el = {
    getAttribute: () => "true",
    getBoundingClientRect: () => ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  };
  return {
    querySelector: (sel: string) =>
      sel.includes(selectorMatch) ? el : null,
  } as unknown as Document;
}

describe("appleCollectDrag helpers", () => {
  it("exports basket + chest selectors", () => {
    expect(APPLE_BASKET_SELECTOR).toContain("data-apple-basket");
    expect(APPLE_BASKET_HOST_SELECTOR).toContain("data-apple-basket-host");
    expect(CAPITAL_CHEST_HOST_SELECTOR).toContain("data-v3-capital-chest-host");
  });

  it("resolveAppleBasketEl / resolveCapitalChestEl", () => {
    const basketDoc = fakeDoc("data-apple-basket", {
      left: 0,
      top: 0,
      right: 10,
      bottom: 10,
    });
    expect(resolveAppleBasketEl(basketDoc)).toBeTruthy();

    const chestDoc = fakeDoc("capital-chest", {
      left: 0,
      top: 0,
      right: 10,
      bottom: 10,
    });
    expect(resolveCapitalChestEl(chestDoc)).toBeTruthy();
  });

  it("pointHitsAppleBasket / pointHitsCapitalChest use padded rect", () => {
    const basketDoc = fakeDoc("data-apple-basket", {
      left: 100,
      top: 200,
      right: 150,
      bottom: 250,
    });
    expect(pointHitsAppleBasket(125, 225, basketDoc)).toBe(true);
    expect(pointHitsAppleBasket(95, 225, basketDoc)).toBe(true);
    expect(pointHitsAppleBasket(80, 225, basketDoc)).toBe(false);

    const chestDoc = fakeDoc("capital-chest", {
      left: 100,
      top: 200,
      right: 150,
      bottom: 250,
    });
    expect(pointHitsCapitalChest(125, 225, chestDoc)).toBe(true);
    expect(pointHitsCapitalChest(80, 225, chestDoc)).toBe(false);
  });
});

describe("care reward click collect wiring", () => {
  it("apples and Care coins collect on click via handleAppleClick", () => {
    expect(pageSrc).toContain("handleAppleClick");
    expect(pageSrc).toContain("pulseRewardCollect");
    expect(pageSrc).toContain("appleDropTargetActive");
    expect(pageSrc).toContain("coinDropTargetActive");
    expect(pageSrc).toContain("onClick={() => handleAppleClick(i)}");
    expect(pageSrc).toContain("dropHighlight={coinDropTargetActive}");
    expect(pageSrc).not.toContain("draggingAppleIdx");
    expect(pageSrc).not.toContain("whileDrag");
    expect(pageSrc).not.toContain("tree-apple-drag-ghost");
    // Defer collected unmount so AnimatePresence exit sees custom.manual (fly).
    expect(pageSrc).toContain("requestAnimationFrame");
    expect(pageSrc).toContain(
      "setCollectedAppleIndices([...collectedAppleIndicesRef.current])",
    );
  });

  it("Metelka coin click-to-claim matches Care coin", () => {
    expect(metelkaSrc).toContain("onClick");
    expect(metelkaSrc).toContain("onClaim()");
    expect(metelkaSrc).toContain('aria-label="Забрать награду Метёлки"');
    expect(metelkaSrc).not.toContain("onDragStart");
    expect(metelkaSrc).not.toContain("onDragEnd");
    expect(metelkaSrc).not.toContain("onDragActiveChange");
    expect(metelkaSrc).not.toContain("tree-apple-drag-ghost");
    expect(pageSrc).toContain('pulseRewardCollect("stone-coin")');
    expect(pageSrc).toContain("handleClaimMetelkaPendingReward");
    expect(pageSrc).not.toContain("draggingMetelkaCoin");
  });

  it("basket pulses art only; coin pulses only chest lock/clasp", () => {
    expect(basketSrc).toContain("dropHighlight");
    expect(basketSrc).toContain("apple-basket-art-wrap--drop-target");
    expect(basketSrc).not.toContain("apple-basket--drop-target");
    expect(cssSrc).toContain("apple-basket-art-wrap--drop-target");
    expect(cssSrc).toContain("apple-basket-drop-pulse");
    expect(cssSrc).not.toContain(".apple-basket--drop-target");
    const basketPulse =
      cssSrc.match(
        /@keyframes apple-basket-drop-pulse\s*\{[\s\S]*?\n\}/,
      )?.[0] ?? "";
    expect(basketPulse).toContain("drop-shadow");
    expect(basketPulse).not.toContain("scale(");
    expect(cssSrc).toContain("v2-chest-clasp--drop-target");
    expect(cssSrc).toContain("v2-chest-clasp-drop-pulse");
    expect(cssSrc).toContain("v2-chest-clasp--drop-target-stone");
    expect(cssSrc).toContain("v2-chest-clasp-drop-pulse-stone");
    // Soft glow only — no scale (scale made the clasp jump off the lid).
    const claspPulse =
      cssSrc.match(
        /@keyframes v2-chest-clasp-drop-pulse\s*\{[\s\S]*?\n\}/,
      )?.[0] ?? "";
    expect(claspPulse).toContain("drop-shadow");
    expect(claspPulse).not.toContain("scale(");
    expect(cssSrc).not.toContain("v3-capital-chest-host--drop-target");
    const chestSrc = readFileSync(
      resolve(root, "components/v2/V2CapitalChest.tsx"),
      "utf8",
    );
    expect(chestSrc).toContain('data-chest-clasp="true"');
    expect(chestSrc).toContain("v2-chest-clasp--drop-target");
    expect(chestSrc).toContain("drop-target-stone");
    expect(pageSrc).toContain('collectingMetelkaCoin ? "stone"');
  });

  it("auto-collects tree apples and Care coins 60s after appearance", () => {
    expect(TREE_REWARD_AUTO_COLLECT_MS).toBe(60_000);
    expect(pageSrc).toContain("TREE_REWARD_AUTO_COLLECT_MS");
    expect(pageSrc).toContain("scheduleTreeRewardAutoCollect()");
    expect(pageSrc).toContain("autoCollectRemainingTreeRewards");
    expect(pageSrc).not.toContain("}, 60000);");
  });

  it("idle pulse on token; click collect raises tree layer", () => {
    expect(cssSrc).toContain("apple-collect-idle-pulse");
    expect(cssSrc).toContain("coin-collect-idle-pulse");
    expect(cssSrc).toContain("game-tree-wrap--reward-drag");
    expect(cssSrc).toContain("game-tree-wrap--reward-drag");
    expect(pageSrc).toContain("rewardCollecting");
    expect(pageSrc).not.toContain("game-tree-wrap--reward-drag");
    expect(cssSrc).toContain("cursor: pointer");
    expect(pageSrc).not.toContain("game-area--reward-dragging");
    expect(cssSrc).not.toContain(".game-area--reward-dragging");
  });
});
