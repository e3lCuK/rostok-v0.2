/**
 * Guards apple basket sync: Care reward credits must update state.game.totalApples
 * (not only React badge state), and claimAll must reconcile from server totalApples.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSrc = readFileSync(
  resolve(__dirname, "../pages/GamePage.tsx"),
  "utf8",
);

describe("apple counter sync (Care reward wave)", () => {
  it("tracks applesCreditedThisWaveRef to avoid double-count", () => {
    expect(pageSrc).toContain("applesCreditedThisWaveRef");
    expect(pageSrc).toContain("applesCreditedThisWaveRef.current = 0");
    expect(pageSrc).toContain(
      "redsInWave - applesCreditedThisWaveRef.current",
    );
  });

  it("manual red apple credit commits state.game.totalApples", () => {
    expect(pageSrc).toContain("applesCreditedThisWaveRef.current += 1");
    expect(pageSrc).toContain("applesCreditedThisWaveRef.current < redsInWave");
    // Live red path mirrors tutorial: badge + stateRef stay aligned.
    expect(pageSrc).toMatch(
      /applesCreditedThisWaveRef\.current \+= 1;\s*setTotalApples\(nextApples\);\s*commitState\(\{[\s\S]*?totalApples: nextApples/,
    );
  });

  it("handleClaimAll reconciles absolute totalApples from server", () => {
    const claim =
      pageSrc.match(
        /async function handleClaimAll\(applesCollected = 0\) \{[\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(claim).toContain("result.totalApples");
    expect(claim).toContain("totalApples: claimedApples");
    expect(claim).toContain("setTotalApples(claimedApples)");
    // Coin / claimAll must not accrue tree mm (that is growth-timer Step 5 only).
    expect(claim).not.toContain("treeGrowthMM:");
    expect(claim).not.toContain("treeGrowthRemainder:");
  });

  it("claimApplesAndIncome credits apples only when creditRemainingApples is set", () => {
    const fn =
      pageSrc.match(
        /function claimApplesAndIncome\([\s\S]*?\n  \}/,
      )?.[0] ?? "";
    expect(fn).toContain("creditRemainingApples");
    expect(fn).toContain("redsToCredit");
    expect(fn).toContain("void handleClaimAll(redsInWave)");
    // Coin path must not always credit remaining reds.
    expect(fn).toMatch(
      /const creditRemainingApples = opts\?\.creditRemainingApples === true/,
    );
  });

  it("coin drag does not request apple credit", () => {
    expect(pageSrc).toMatch(
      /\/\/ Income only[\s\S]*?claimApplesAndIncome\(\);/,
    );
    expect(pageSrc).toContain(
      "claimApplesAndIncome({ creditRemainingApples: true })",
    );
  });
});
