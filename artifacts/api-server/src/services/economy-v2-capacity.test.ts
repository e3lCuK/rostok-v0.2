import { describe, expect, it } from "vitest";
import {
  CAPACITY_EPSILON,
  computeV2StorageCapacity,
  maxAddableReadySections,
  maxBankSecondsUnderStorageCap,
  maxWholeReadySectionsFitting,
  normalizeFractionalProgress,
  wholeProgressUnits,
  V2_TOTAL_STORAGE_CAP,
} from "./economy-v2-capacity";

describe("computeV2StorageCapacity", () => {
  it("bank=59 ready=0 progress=0 → freeCapacity=1, storageFull=false", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 59,
      readyCount: 0,
      generationProgress: 0,
    });
    expect(c.occupied).toBe(59);
    expect(c.freeCapacity).toBe(1);
    expect(c.storageFull).toBe(false);
  });

  it("occupied = bank + ready + progress", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 30,
      readyCount: 20,
      generationProgress: 0.5,
    });
    expect(c.occupied).toBeCloseTo(50.5, 10);
    expect(c.freeCapacity).toBeCloseTo(9.5, 10);
    expect(c.storageFull).toBe(false);
    expect(c.overCapacity).toBe(false);
  });

  it("does not floor fractional bank", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 59.4,
      readyCount: 0,
      generationProgress: 0.3,
    });
    expect(c.occupied).toBeCloseTo(59.7, 10);
    expect(c.freeCapacity).toBeCloseTo(0.3, 10);
  });

  it("bank 0 + ready 60 → full", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 0,
      readyCount: 60,
      generationProgress: 0,
    });
    expect(c.occupied).toBe(60);
    expect(c.freeCapacity).toBe(0);
    expect(c.storageFull).toBe(true);
  });

  it("bank 30 + ready 30 → full", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 30,
      readyCount: 30,
      generationProgress: 0,
    });
    expect(c.storageFull).toBe(true);
    expect(c.freeCapacity).toBe(0);
  });

  it("5. bank=59.4 + progress=0.6 → occupied 60 without float overflow", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 59.4,
      readyCount: 0,
      generationProgress: 0.6,
    });
    expect(c.occupied).toBeCloseTo(60, 10);
    expect(c.storageFull).toBe(true);
    expect(c.freeCapacity).toBeLessThanOrEqual(CAPACITY_EPSILON);
    expect(c.overCapacity).toBe(false);
  });

  it("6. near-1 progress is not wiped by normalize", () => {
    expect(normalizeFractionalProgress(0.999999999)).toBeCloseTo(0.999999999, 9);
    expect(wholeProgressUnits(0.999999999)).toBe(1);
    expect(wholeProgressUnits(0.9)).toBe(0);
  });

  it("over-capacity is flagged without wiping values", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 40,
      readyCount: 30,
      generationProgress: 0.2,
    });
    expect(c.occupied).toBeCloseTo(70.2, 10);
    expect(c.overCapacity).toBe(true);
    expect(c.freeCapacity).toBe(0);
    expect(c.bankSeconds).toBe(40);
    expect(c.readyCount).toBe(30);
  });

  it("cap constant is 60", () => {
    expect(V2_TOTAL_STORAGE_CAP).toBe(60);
  });
});

describe("maxAddableReadySections / maxBankSecondsUnderStorageCap", () => {
  it("debug +15 respects free capacity", () => {
    expect(
      maxAddableReadySections(
        { energySeconds: 50, readyCount: 5, generationProgress: 0 },
        15,
      ),
    ).toBe(5);
  });

  it("whole-section room ignores fractional progress dust", () => {
    expect(
      maxWholeReadySectionsFitting({
        energySeconds: 59,
        readyCount: 0,
        want: 1,
      }),
    ).toBe(1);
  });

  it("fill bank accounts for ready + progress", () => {
    expect(
      maxBankSecondsUnderStorageCap({
        readyCount: 20,
        generationProgress: 0,
      }),
    ).toBe(40);
    expect(
      maxBankSecondsUnderStorageCap({
        readyCount: 20,
        generationProgress: 0.5,
      }),
    ).toBeCloseTo(39.5, 10);
  });
});
