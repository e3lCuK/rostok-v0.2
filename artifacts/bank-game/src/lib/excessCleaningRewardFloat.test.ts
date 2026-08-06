import { describe, expect, it } from "vitest";
import {
  asPositiveRewardAmount,
  buildClearRewardFloatsFromResponse,
  clampExcessRewardOrigin,
  createBaseIncomeRewardFloat,
  createExcessRewardFloat,
  createRegularWebRewardFloats,
  EXCESS_REWARD_FLOAT_MS,
  EXCESS_REWARD_RISE_DY,
  formatExcessMicroMoneyFloatLabel,
  formatExcessMoneyFloatLabel,
  formatExcessXpFloatLabel,
  isPositiveRewardAmount,
} from "./excessCleaningRewardFloat";

describe("excessCleaningRewardFloat", () => {
  it("formats XP (integer + fractional) and money labels", () => {
    expect(formatExcessXpFloatLabel(2)).toBe("+2 XP");
    expect(formatExcessXpFloatLabel(0.51)).toMatch(/\+0[,.]51 XP/);
    expect(formatExcessMoneyFloatLabel(0.1)).toMatch(/^\+/);
    expect(formatExcessMoneyFloatLabel(0.1)).toContain("₽");
  });

  it("micro-money formatter uses kopecks below 0.01 ₽", () => {
    expect(formatExcessMicroMoneyFloatLabel(0.12)).toMatch(/₽/);
    expect(formatExcessMicroMoneyFloatLabel(0.12)).not.toContain("коп");
    expect(formatExcessMicroMoneyFloatLabel(0.005)).toMatch(/коп/);
    expect(formatExcessMicroMoneyFloatLabel(0.005)).not.toMatch(/0,00\s*₽/);
    expect(formatExcessMicroMoneyFloatLabel(0.0012)).toMatch(/коп/);
    expect(formatExcessMicroMoneyFloatLabel(0.0012)).not.toMatch(/0,00\s*₽/);
  });

  it("positive micro amounts are not dropped", () => {
    expect(isPositiveRewardAmount(0.0012)).toBe(true);
    expect(asPositiveRewardAmount(0.0012)).toBeCloseTo(0.0012, 10);
    expect(asPositiveRewardAmount(0)).toBe(0);
    expect(asPositiveRewardAmount("0.005")).toBeCloseTo(0.005, 10);
  });

  it("clamps origins near viewport edges", () => {
    const nearCorner = clampExcessRewardOrigin(2, 3, { width: 400, height: 800 });
    expect(nearCorner.x).toBeGreaterThanOrEqual(40);
    expect(nearCorner.y).toBeGreaterThanOrEqual(40);
    const far = clampExcessRewardOrigin(399, 799, { width: 400, height: 800 });
    expect(far.x).toBeLessThanOrEqual(360);
    expect(far.y).toBeLessThanOrEqual(760);
  });

  it("white web stacks XP above bonus with local rise", () => {
    const floats = createRegularWebRewardFloats({
      clientX: 200,
      clientY: 300,
      xpLabel: "+0,5 XP",
      moneyLabel: "+0,12 ₽",
    });
    expect(floats).toHaveLength(2);
    expect(floats[0].kind).toBe("xp");
    expect(floats[1].kind).toBe("money");
    expect(floats[0].startX).toBe(floats[1].startX);
    expect(floats[1].startY).toBeGreaterThan(floats[0].startY);
    expect(floats.every((f) => f.motion === "rise")).toBe(true);
    expect(floats.every((f) => f.dx === 0)).toBe(true);
    expect(floats.every((f) => f.dy === EXCESS_REWARD_RISE_DY)).toBe(true);
  });

  it("1–2. red successful clear creates money feedback only (no XP)", () => {
    const floats = buildClearRewardFloatsFromResponse({
      clientX: 120,
      clientY: 400,
      reward: { kind: "base_income", xpGained: 0, moneyGained: 10 },
      rewardDelta: {
        kind: "base_income",
        baseIncomeAmount: 10,
        collectionMode: "manual",
      } as any,
    });
    expect(floats).toHaveLength(1);
    expect(floats[0].kind).toBe("money");
    expect(floats[0].size).toBe("large");
    expect(floats[0].motion).toBe("to-chest");
    expect(floats[0].label).toMatch(/₽|коп/);
    expect(floats.some((f) => f.kind === "xp")).toBe(false);
  });

  it("3. white successful clear creates XP and bonus feedback from rewardDelta", () => {
    const floats = buildClearRewardFloatsFromResponse({
      clientX: 200,
      clientY: 300,
      reward: { kind: "regular", xpGained: 1, moneyGained: 0 },
      rewardDelta: {
        kind: "regular",
        xpRawDelta: 0.5,
        bonusRawDelta: 0.12,
      },
    });
    expect(floats).toHaveLength(2);
    expect(floats[0].kind).toBe("xp");
    expect(floats[1].kind).toBe("money");
    expect(floats[0].label).toMatch(/XP/);
    expect(floats[1].label).toMatch(/₽|коп/);
  });

  it("4. positive amount below one kopeck is not hidden", () => {
    const floats = buildClearRewardFloatsFromResponse({
      clientX: 100,
      clientY: 100,
      reward: { kind: "regular", xpGained: 0, moneyGained: 0 },
      rewardDelta: {
        kind: "regular",
        xpRawDelta: 0.01,
        bonusRawDelta: 0.0012,
      },
    });
    expect(floats).toHaveLength(2);
    expect(floats[1].label).toMatch(/коп/);
    expect(floats[1].label).not.toMatch(/0,00\s*₽/);
  });

  it("5–6. missing reward / empty deltas create no feedback", () => {
    expect(
      buildClearRewardFloatsFromResponse({
        clientX: 1,
        clientY: 1,
        reward: null,
        rewardDelta: null,
      }),
    ).toEqual([]);
    expect(
      buildClearRewardFloatsFromResponse({
        clientX: 1,
        clientY: 1,
        reward: { kind: "regular", xpGained: 0, moneyGained: 0 },
        rewardDelta: { kind: "regular", xpRawDelta: 0, bonusRawDelta: 0 },
      }),
    ).toEqual([]);
    expect(
      buildClearRewardFloatsFromResponse({
        clientX: 1,
        clientY: 1,
        reward: { kind: "progress", xpGained: 0, moneyGained: 0 },
        rewardDelta: { kind: "progress", xpRawDelta: 0, bonusRawDelta: 0 },
      }),
    ).toEqual([]);
  });

  it("float duration is within 500–700 ms", () => {
    expect(EXCESS_REWARD_FLOAT_MS).toBeGreaterThanOrEqual(500);
    expect(EXCESS_REWARD_FLOAT_MS).toBeLessThanOrEqual(700);
  });

  it("createExcessRewardFloat computes fly delta toward target", () => {
    const f = createExcessRewardFloat({
      kind: "xp",
      label: "+1 XP",
      startX: 100,
      startY: 200,
      targetX: 150,
      targetY: 50,
      motion: "to-chest",
    });
    expect(f.dx).toBe(50);
    expect(f.dy).toBe(-150);
  });

  it("red base-income float is larger and moves toward chest", () => {
    const f = createBaseIncomeRewardFloat({
      clientX: 100,
      clientY: 400,
      moneyLabel: "+10,00₽",
      chestX: 50,
      chestY: 80,
    });
    expect(f.size).toBe("large");
    expect(f.motion).toBe("to-chest");
  });
});
