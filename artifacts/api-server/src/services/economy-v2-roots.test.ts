import { describe, expect, it } from "vitest";
import {
  V2_REFERENCE_CAPITAL,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
} from "./economy-v2";
import { computeV2StorageCapacity } from "./economy-v2-capacity";
import {
  buildEconomyV2RootsPublicState,
  clearSectionReady,
  collectRootSectionPure,
  countReadySections,
  isSectionReady,
  maskToString,
  placeMaturedSections,
  setSectionReady,
  settleEconomyV2Roots,
  V2_ROOT_SECTION_COUNT,
} from "./economy-v2-roots";

const REF = V2_REFERENCE_CAPITAL;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;
const NOW = 1_700_000_000_000;

function maskWithReady(n: number): bigint {
  return placeMaturedSections(0n, n).mask;
}

describe("placeMaturedSections / mask holes", () => {
  it("fills first free section", () => {
    const { mask, placed } = placeMaturedSections(0n, 1);
    expect(placed).toBe(1);
    expect(isSectionReady(mask, 0)).toBe(true);
    expect(countReadySections(mask)).toBe(1);
  });

  it("fills holes after collection (2,5,7 empty)", () => {
    let mask = 0n;
    for (let i = 0; i < 10; i++) mask = setSectionReady(mask, i);
    mask = clearSectionReady(mask, 2);
    mask = clearSectionReady(mask, 5);
    mask = clearSectionReady(mask, 7);
    const next = placeMaturedSections(mask, 3);
    expect(isSectionReady(next.mask, 2)).toBe(true);
    expect(isSectionReady(next.mask, 5)).toBe(true);
    expect(isSectionReady(next.mask, 7)).toBe(true);
    expect(next.placed).toBe(3);
  });

  it("cannot place a 61st section", () => {
    let mask = 0n;
    for (let i = 0; i < V2_ROOT_SECTION_COUNT; i++) {
      mask = setSectionReady(mask, i);
    }
    const next = placeMaturedSections(mask, 5);
    expect(next.placed).toBe(0);
    expect(countReadySections(next.mask)).toBe(60);
  });
});

describe("settleEconomyV2Roots", () => {
  it("1. progress 0 + generated 0.5 → mask unchanged, progress 0.5", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 10,
      energyAnchorAt: NOW - 0.5 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.rootReadyMask).toBe(0n);
    expect(r.rootGenerationProgress).toBeCloseTo(0.5, 10);
    expect(r.energySeconds).toBe(10);
    expect(r.placedSections).toBe(0);
  });

  it("2. progress 0.5 + generated 0.5 → one ready section", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - 0.5 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0.5,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.placedSections).toBe(1);
    expect(isSectionReady(r.rootReadyMask, 0)).toBe(true);
    expect(r.rootGenerationProgress).toBeCloseTo(0, 10);
    expect(r.energySeconds).toBe(0);
  });

  it("3. generated 3.4 → three ready, progress 0.4", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 5,
      energyAnchorAt: NOW - 3.4 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.placedSections).toBe(3);
    expect(countReadySections(r.rootReadyMask)).toBe(3);
    expect(r.rootGenerationProgress).toBeCloseTo(0.4, 10);
    expect(r.energySeconds).toBe(5);
  });

  it("4. fills first free section when earlier bits set", () => {
    const mask = setSectionReady(0n, 0);
    const r = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - T * 1000,
      rootReadyMask: mask,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(isSectionReady(r.rootReadyMask, 0)).toBe(true);
    expect(isSectionReady(r.rootReadyMask, 1)).toBe(true);
    expect(r.placedSections).toBe(1);
  });

  it("6. 60 ready → new generated does not create 61st; progress 0", () => {
    let mask = 0n;
    for (let i = 0; i < 60; i++) mask = setSectionReady(mask, i);
    const r = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - 5 * T * 1000,
      rootReadyMask: mask,
      rootGenerationProgress: 0.3,
      capital: REF,
      nowMs: NOW,
    });
    expect(countReadySections(r.rootReadyMask)).toBe(60);
    expect(r.placedSections).toBe(0);
    expect(r.rootGenerationProgress).toBe(0);
    expect(r.energySeconds).toBe(0);
    expect(r.rootsFull).toBe(true);
    expect(r.storageFull).toBe(true);
  });

  it("7. two sequential settles do not double-mature same window", () => {
    const first = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(first.placedSections).toBe(1);
    const second = settleEconomyV2Roots({
      energySeconds: first.energySeconds,
      energyAnchorAt: first.energyAnchorAt,
      rootReadyMask: first.rootReadyMask,
      rootGenerationProgress: first.rootGenerationProgress,
      capital: REF,
      nowMs: NOW,
    });
    expect(second.generatedEnergy).toBe(0);
    expect(second.placedSections).toBe(0);
    expect(countReadySections(second.rootReadyMask)).toBe(1);
  });

  it("8. settle never increases v2_energy_seconds", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 7.25,
      energyAnchorAt: NOW - 10 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.energySeconds).toBe(7.25);
    expect(r.placedSections).toBe(10);
  });

  it("missing anchor → no backfill", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 4,
      energyAnchorAt: null,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.placedSections).toBe(0);
    expect(r.energySeconds).toBe(4);
    expect(r.energyAnchorAt).toBe(NOW);
  });
});

describe("shared storage capacity (settle)", () => {
  it("1. bank 0 + ready 60 → generation stopped; excess accumulates", () => {
    const elapsedMs = 10 * T * 1000;
    const r = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - elapsedMs,
      rootReadyMask: maskWithReady(60),
      rootGenerationProgress: 0,
      excessSeconds: 1.25,
      excessElapsedMs: 100,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.placedSections).toBe(0);
    expect(r.usableGeneratedEnergy).toBe(0);
    expect(r.storageFull).toBe(true);
    expect(r.energyAnchorAt).toBe(NOW);
    expect(r.excessGenerated).toBeCloseTo(10, 10);
    expect(r.excessSeconds).toBeCloseTo(11.25, 10);
    // Full storage → all wall-clock to t_excess
    expect(r.excessElapsedMsGenerated).toBe(elapsedMs);
    expect(r.excessElapsedMs).toBe(100 + elapsedMs);
  });

  it("partial overflow → proportional excessElapsedMs", () => {
    // bank 57 + ready 0 + progress 0 → free 3; generate 5 → excess 2 of 5
    const elapsedMs = 5 * T * 1000;
    const r = settleEconomyV2Roots({
      energySeconds: 57,
      energyAnchorAt: NOW - elapsedMs,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.generatedEnergy).toBeCloseTo(5, 10);
    expect(r.excessGenerated).toBeCloseTo(2, 10);
    expect(r.excessElapsedMsGenerated).toBeCloseTo(elapsedMs * (2 / 5), 8);
  });

  it("repeat settle does not double-count elapsed", () => {
    const elapsedMs = 10 * T * 1000;
    const first = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - elapsedMs,
      rootReadyMask: maskWithReady(60),
      rootGenerationProgress: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(first.excessElapsedMsGenerated).toBe(elapsedMs);
    const second = settleEconomyV2Roots({
      energySeconds: first.energySeconds,
      energyAnchorAt: first.energyAnchorAt,
      rootReadyMask: first.rootReadyMask,
      rootGenerationProgress: first.rootGenerationProgress,
      excessSeconds: first.excessSeconds,
      excessElapsedMs: first.excessElapsedMs,
      capital: REF,
      nowMs: NOW + 1,
    });
    // Tiny 1ms window may generate near-zero; no double of first window
    expect(second.excessElapsedMs).toBeLessThan(
      first.excessElapsedMs + elapsedMs * 0.5,
    );
    expect(second.excessElapsedMs).toBeGreaterThanOrEqual(first.excessElapsedMs);
  });

  it("capital change between settles does not rewrite past elapsed", () => {
    const elapsedMs = 8 * T * 1000;
    const first = settleEconomyV2Roots({
      energySeconds: 0,
      energyAnchorAt: NOW - elapsedMs,
      rootReadyMask: maskWithReady(60),
      rootGenerationProgress: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      capital: REF,
      nowMs: NOW,
    });
    const pastElapsed = first.excessElapsedMs;
    const second = settleEconomyV2Roots({
      energySeconds: first.energySeconds,
      energyAnchorAt: first.energyAnchorAt,
      rootReadyMask: first.rootReadyMask,
      rootGenerationProgress: first.rootGenerationProgress,
      excessSeconds: first.excessSeconds,
      excessElapsedMs: pastElapsed,
      capital: REF * 10,
      nowMs: NOW, // same now → zero new elapsed
    });
    expect(second.excessElapsedMs).toBe(pastElapsed);
    expect(second.excessElapsedMsGenerated).toBe(0);
  });

  it("2. bank 30 + ready 30 → generation stopped; excess grows", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 30,
      energyAnchorAt: NOW - 10 * T * 1000,
      rootReadyMask: maskWithReady(30),
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.placedSections).toBe(0);
    expect(r.usableGeneratedEnergy).toBe(0);
    expect(r.storageFull).toBe(true);
    expect(countReadySections(r.rootReadyMask)).toBe(30);
    expect(r.energySeconds).toBe(30);
    expect(r.excessGenerated).toBeCloseTo(10, 10);
    expect(r.excessSeconds).toBeCloseTo(10, 10);
  });

  it("3. bank 30 + ready 20 → at most 10 ordinary; rest to excess", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 30,
      energyAnchorAt: NOW - 20 * T * 1000,
      rootReadyMask: maskWithReady(20),
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.usableGeneratedEnergy).toBeCloseTo(10, 10);
    expect(r.placedSections).toBe(10);
    expect(countReadySections(r.rootReadyMask)).toBe(30);
    expect(r.rootGenerationProgress).toBeCloseTo(0, 10);
    expect(r.excessGenerated).toBeCloseTo(10, 10);
    expect(r.excessSeconds).toBeCloseTo(10, 10);
    const occ = computeV2StorageCapacity({
      energySeconds: r.energySeconds,
      readyCount: countReadySections(r.rootReadyMask),
      generationProgress: r.rootGenerationProgress,
    });
    expect(occ.occupied).toBeCloseTo(60, 10);
  });

  it("B. occupied 58 + generated 5 → ordinary 2, excess 3", () => {
    // bank 40 + ready 18 = 58, free 2; generate 5 → ordinary 2, excess 3
    const r = settleEconomyV2Roots({
      energySeconds: 40,
      energyAnchorAt: NOW - 5 * T * 1000,
      rootReadyMask: maskWithReady(18),
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.usableGeneratedEnergy).toBeCloseTo(2, 10);
    expect(r.excessGenerated).toBeCloseTo(3, 10);
    expect(r.excessSeconds).toBeCloseTo(3, 10);
    const occ = computeV2StorageCapacity({
      energySeconds: r.energySeconds,
      readyCount: countReadySections(r.rootReadyMask),
      generationProgress: r.rootGenerationProgress,
    });
    expect(occ.occupied).toBeCloseTo(60, 10);
  });

  it("4. bank 59 + ready 1 → collect keeps total 60", () => {
    const mask = maskWithReady(1);
    const before = computeV2StorageCapacity({
      energySeconds: 59,
      readyCount: 1,
      generationProgress: 0,
    });
    expect(before.occupied).toBe(60);
    const collected = collectRootSectionPure({
      energySeconds: 59,
      rootReadyMask: mask,
      sectionIndex: 0,
    });
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    expect(collected.energySeconds).toBe(60);
    expect(countReadySections(collected.rootReadyMask)).toBe(0);
    const after = computeV2StorageCapacity({
      energySeconds: collected.energySeconds,
      readyCount: 0,
      generationProgress: 0,
    });
    expect(after.occupied).toBe(60);
  });

  it("5+6. Care spend frees capacity; excess retained; no backfill", () => {
    const mask = maskWithReady(15);
    const full = settleEconomyV2Roots({
      energySeconds: 45,
      energyAnchorAt: NOW - 100 * T * 1000,
      rootReadyMask: mask,
      rootGenerationProgress: 0,
      excessSeconds: 8,
      capital: REF,
      nowMs: NOW,
    });
    expect(full.placedSections).toBe(0);
    expect(full.usableGeneratedEnergy).toBe(0);
    expect(full.energyAnchorAt).toBe(NOW);
    expect(full.excessSeconds).toBeCloseTo(8 + 100, 8);
    const excessAfterFull = full.excessSeconds;

    const resumed = settleEconomyV2Roots({
      energySeconds: 35,
      energyAnchorAt: full.energyAnchorAt,
      rootReadyMask: full.rootReadyMask,
      rootGenerationProgress: full.rootGenerationProgress,
      excessSeconds: excessAfterFull,
      capital: REF,
      nowMs: NOW + 3 * T * 1000,
    });
    expect(resumed.placedSections).toBe(3);
    expect(resumed.usableGeneratedEnergy).toBeCloseTo(3, 10);
    expect(countReadySections(resumed.rootReadyMask)).toBe(18);
    // Already-accumulated excess is not moved into roots; only new overflow would add.
    expect(resumed.excessSeconds).toBeCloseTo(excessAfterFull, 10);
    expect(resumed.excessGenerated).toBe(0);
  });

  it("7+8. fractional bank + progress; fractional excess preserved", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59.4,
      energyAnchorAt: NOW - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0.3,
      excessSeconds: 4.37,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.usableGeneratedEnergy).toBeCloseTo(0.3, 10);
    expect(r.placedSections).toBe(0);
    expect(r.rootGenerationProgress).toBeCloseTo(0.6, 10);
    expect(r.energySeconds).toBeCloseTo(59.4, 10);
    expect(r.excessGenerated).toBeCloseTo(0.7, 10);
    expect(r.excessSeconds).toBeCloseTo(5.07, 10);
  });

  it("11+12. over-capacity legacy: stop ordinary; still accumulate excess", () => {
    const mask = maskWithReady(30);
    const r = settleEconomyV2Roots({
      energySeconds: 40,
      energyAnchorAt: NOW - 20 * T * 1000,
      rootReadyMask: mask,
      rootGenerationProgress: 0.5,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.storageOverCapacity).toBe(true);
    expect(r.placedSections).toBe(0);
    expect(r.usableGeneratedEnergy).toBe(0);
    expect(r.energySeconds).toBe(40);
    expect(countReadySections(r.rootReadyMask)).toBe(30);
    expect(r.rootGenerationProgress).toBeCloseTo(0.5, 10);
    expect(r.energyAnchorAt).toBe(NOW);
    expect(r.excessGenerated).toBeCloseTo(20, 10);
    expect(r.excessSeconds).toBeCloseTo(20, 10);
  });

  it("15. ordinary occupied never exceeds 60 after settle", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 50,
      energyAnchorAt: NOW - 40 * T * 1000,
      rootReadyMask: maskWithReady(5),
      rootGenerationProgress: 0.2,
      capital: REF,
      nowMs: NOW,
    });
    const occ = computeV2StorageCapacity({
      energySeconds: r.energySeconds,
      readyCount: countReadySections(r.rootReadyMask),
      generationProgress: r.rootGenerationProgress,
    });
    expect(occ.occupied).toBeLessThanOrEqual(60 + 1e-9);
    expect(r.excessSeconds).toBeGreaterThan(0);
  });

  it("7. sequential settle does not double-count elapsed into excess", () => {
    const first = settleEconomyV2Roots({
      energySeconds: 60,
      energyAnchorAt: NOW - 5 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(first.excessGenerated).toBeCloseTo(5, 10);
    const second = settleEconomyV2Roots({
      energySeconds: 60,
      energyAnchorAt: first.energyAnchorAt,
      rootReadyMask: first.rootReadyMask,
      rootGenerationProgress: first.rootGenerationProgress,
      excessSeconds: first.excessSeconds,
      capital: REF,
      nowMs: NOW,
    });
    expect(second.generatedEnergy).toBe(0);
    expect(second.excessGenerated).toBe(0);
    expect(second.excessSeconds).toBeCloseTo(first.excessSeconds, 10);
  });

  it("public state nulls countdown when storage full", () => {
    const pub = buildEconomyV2RootsPublicState({
      rootReadyMask: maskWithReady(30),
      rootGenerationProgress: 0.2,
      capital: REF,
      energySeconds: 30,
    });
    expect(pub.storageFull).toBe(true);
    expect(pub.secondsUntilNextSection).toBeNull();
    expect(pub.isFull).toBe(false);
  });
});

describe("collectRootSectionPure", () => {
  it("9. ready section → bit clear, energy +1", () => {
    const mask = setSectionReady(0n, 3);
    const r = collectRootSectionPure({
      energySeconds: 10,
      rootReadyMask: mask,
      sectionIndex: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.energySeconds).toBe(11);
    expect(isSectionReady(r.rootReadyMask, 3)).toBe(false);
  });

  it("10. empty section → no +1", () => {
    const r = collectRootSectionPure({
      energySeconds: 10,
      rootReadyMask: 0n,
      sectionIndex: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("section_not_ready");
  });

  it("13/15. bank full / fractional 59.4 blocks (+1 would exceed 60)", () => {
    const mask = setSectionReady(0n, 0);
    expect(
      collectRootSectionPure({
        energySeconds: 60,
        rootReadyMask: mask,
        sectionIndex: 0,
      }).ok,
    ).toBe(false);
    expect(
      collectRootSectionPure({
        energySeconds: 59.4,
        rootReadyMask: mask,
        sectionIndex: 0,
      }).ok,
    ).toBe(false);
  });

  it("14. bank 59 → collection → 60", () => {
    const mask = setSectionReady(0n, 1);
    const r = collectRootSectionPure({
      energySeconds: 59,
      rootReadyMask: mask,
      sectionIndex: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.energySeconds).toBe(60);
  });

  it("mask string round-trip preserves bits past 53", () => {
    const mask = setSectionReady(0n, 55);
    const s = maskToString(mask);
    expect(s).toBe((1n << 55n).toString(10));
    expect(isSectionReady(BigInt(s), 55)).toBe(true);
  });
});

describe("near-cap last second (no deadlock at 59)", () => {
  it("1. bank=59 ready=0 progress=0 → generation continues", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - 0.5 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.storageFull).toBe(false);
    expect(r.usableGeneratedEnergy).toBeCloseTo(0.5, 10);
    expect(r.rootGenerationProgress).toBeCloseTo(0.5, 10);
    expect(countReadySections(r.rootReadyMask)).toBe(0);
  });

  it("2. bank=59 progress=0.9 + generated=0.1 → one ready, progress 0, occupied 60", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - 0.1 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0.9,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.placedSections).toBe(1);
    expect(countReadySections(r.rootReadyMask)).toBe(1);
    expect(r.rootGenerationProgress).toBeCloseTo(0, 10);
    const occ = computeV2StorageCapacity({
      energySeconds: r.energySeconds,
      readyCount: 1,
      generationProgress: r.rootGenerationProgress,
    });
    expect(occ.occupied).toBeCloseTo(60, 10);
    expect(occ.storageFull).toBe(true);
  });

  it("3. bank=59 ready=1 progress=0 → ordinary stopped; ready collectable", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - 5 * T * 1000,
      rootReadyMask: maskWithReady(1),
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.usableGeneratedEnergy).toBe(0);
    expect(r.storageFull).toBe(true);
    expect(countReadySections(r.rootReadyMask)).toBe(1);
    expect(r.excessGenerated).toBeCloseTo(5, 10);
  });

  it("4. collect last ready → bank 60, ready 0", () => {
    const mask = setSectionReady(0n, 0);
    const collected = collectRootSectionPure({
      energySeconds: 59,
      rootReadyMask: mask,
      sectionIndex: 0,
    });
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    expect(collected.energySeconds).toBe(60);
    expect(countReadySections(collected.rootReadyMask)).toBe(0);
  });

  it("6. bank=59.999999999 near-1 progress → flush ready, no eternal stuck", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59.999999999,
      energyAnchorAt: NOW,
      rootReadyMask: 0n,
      rootGenerationProgress: 0.999999999,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    // Either placed the last section (occupied≈60.999→clamped path) or cleared dust.
    // With bank≈60 already, room for ready is 0 → progress must not stay near-1 forever.
    expect(r.rootGenerationProgress).toBeLessThan(0.5);
    const occ = computeV2StorageCapacity({
      energySeconds: r.energySeconds,
      readyCount: countReadySections(r.rootReadyMask),
      generationProgress: r.rootGenerationProgress,
    });
    // Must not be: bank<60, ready=0, progress≈1, storageFull with no action.
    const stuck =
      r.energySeconds < 60 - 1e-6 &&
      countReadySections(r.rootReadyMask) === 0 &&
      r.rootGenerationProgress > 0.99 &&
      occ.storageFull;
    expect(stuck).toBe(false);
  });

  it("7. near-1 progress flush creates ready before storageFull gate", () => {
    // Classic deadlock repro: bank=59, progress≈1, freeCapacity≈0 under old epsilon.
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0.999999999,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(countReadySections(r.rootReadyMask)).toBe(1);
    expect(r.rootGenerationProgress).toBeCloseTo(0, 10);
    expect(r.placedSections).toBeGreaterThanOrEqual(1);
    // Further generation in same settle goes to excess (cap full after flush).
    expect(r.excessGenerated).toBeCloseTo(1, 10);
  });

  it("8. overflow beyond 60 still goes to excess", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - 3 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 2,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.usableGeneratedEnergy).toBeCloseTo(1, 10);
    expect(r.placedSections).toBe(1);
    expect(r.excessGenerated).toBeCloseTo(2, 10);
    expect(r.excessSeconds).toBeCloseTo(4, 10);
  });
});
