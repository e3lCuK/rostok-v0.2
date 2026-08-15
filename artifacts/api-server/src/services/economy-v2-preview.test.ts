import { describe, expect, it } from "vitest";
import { calculateEconomyV2Preview } from "./economy-v2-preview";
import {
  V2_REFERENCE_CAPITAL,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
} from "./economy-v2";

const REF = V2_REFERENCE_CAPITAL;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("calculateEconomyV2Preview", () => {
  it("treats missing last session as zero elapsed energy", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: null,
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.freshnessCoefficient).toBe(1);
    expect(result.usableEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("maps exactly 12 minutes at reference capital to +1 energy", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "2026-07-17T11:48:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBeCloseTo(1, 10);
    expect(result.freshnessCoefficient).toBe(1);
    expect(result.usableEnergy).toBeCloseTo(1, 10);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("maps 14×12 minutes at reference capital to duration 14", () => {
    const start = Date.parse("2026-07-17T12:00:00.000Z") - 14 * T * 1000;
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: new Date(start).toISOString(),
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBeCloseTo(14, 10);
    expect(result.usableEnergy).toBeCloseTo(14, 10);
    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
  });

  it("keeps fractional elapsed seconds without rounding", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "2026-07-17T11:59:58.500Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBeCloseTo(1.5 / T, 10);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("applies freshnessCoefficient 0.5", () => {
    const start = Date.parse("2026-07-17T12:00:00.000Z") - 14 * T * 1000;
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: new Date(start).toISOString(),
      currentTime: "2026-07-17T12:00:00.000Z",
      freshnessCoefficient: 0.5,
    });

    expect(result.rawEnergy).toBeCloseTo(14, 10);
    expect(result.freshnessCoefficient).toBe(0.5);
    expect(result.usableEnergy).toBeCloseTo(7, 10);
    expect(result.activityDuration).toBe(7);
    expect(result.maxXp).toBe(28);
  });

  it("clamps freshnessCoefficient above 1", () => {
    const start = Date.parse("2026-07-17T12:00:00.000Z") - 14 * T * 1000;
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: new Date(start).toISOString(),
      currentTime: "2026-07-17T12:00:00.000Z",
      freshnessCoefficient: 2,
    });

    expect(result.freshnessCoefficient).toBe(1);
    expect(result.usableEnergy).toBeCloseTo(result.rawEnergy);
    expect(result.activityDuration).toBe(14);
    expect(result.maxXp).toBe(56);
  });

  it("treats NaN freshness as zero usable energy", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "2026-07-17T11:48:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
      freshnessCoefficient: NaN,
    });

    expect(result.freshnessCoefficient).toBe(0);
    expect(result.usableEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("clamps future last session to zero elapsed energy", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "2026-07-17T13:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.usableEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns minimum activity for invalid currentTime string", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "2026-07-17T04:00:00.000Z",
      currentTime: "invalid-date",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns minimum activity for invalid lastSessionTime string", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "invalid-date",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns minimum activity for Invalid Date currentTime object", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "2026-07-17T04:00:00.000Z",
      currentTime: new Date("invalid-date"),
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns minimum activity for Invalid Date lastSessionTime object", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: new Date("invalid-date"),
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("accepts valid Date objects for a 12-minute window", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: new Date("2026-07-17T11:48:00.000Z"),
      currentTime: new Date("2026-07-17T12:00:00.000Z"),
    });

    expect(result.rawEnergy).toBeCloseTo(1, 10);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns minimum activity for negative capital", () => {
    const result = calculateEconomyV2Preview({
      capital: -1000,
      lastSessionTime: "2026-07-17T04:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns minimum activity for NaN capital", () => {
    const result = calculateEconomyV2Preview({
      capital: NaN,
      lastSessionTime: "2026-07-17T04:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns minimum activity for Infinity capital", () => {
    const result = calculateEconomyV2Preview({
      capital: Infinity,
      lastSessionTime: "2026-07-17T04:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBe(0);
    expect(result.activityDuration).toBe(5);
    expect(result.maxXp).toBe(20);
  });

  it("returns energy at K=0 (60 min/sec) with long elapsed time", () => {
    const result = calculateEconomyV2Preview({
      capital: 0,
      lastSessionTime: "2026-07-01T12:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    // 16 days / 3600 s per energy
    const expected = (16 * 24 * 60 * 60) / 3600;
    expect(result.rawEnergy).toBeCloseTo(expected, 10);
    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
  });

  it("does not cap elapsedSeconds at eight hours in the adapter", () => {
    const result = calculateEconomyV2Preview({
      capital: 1,
      lastSessionTime: "2026-07-17T00:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    const t =
      3600 / (1 + 4 * Math.pow(1 / REF, 0.15));
    const expected = (12 * 60 * 60) / t;
    expect(result.rawEnergy).toBeCloseTo(expected, 10);
    expect(result.usableEnergy).toBeCloseTo(expected, 10);
    expect(result.activityDuration).toBe(Math.min(25, Math.max(5, Math.floor(expected))));
  });

  it("caps only activity duration for very large elapsed time", () => {
    const result = calculateEconomyV2Preview({
      capital: REF,
      lastSessionTime: "2026-07-01T12:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
    });

    expect(result.rawEnergy).toBeGreaterThan(25);
    expect(result.activityDuration).toBe(25);
    expect(result.maxXp).toBe(100);
  });

  it("does not mutate the input object", () => {
    const input = {
      capital: REF,
      lastSessionTime: "2026-07-17T08:00:00.000Z",
      currentTime: "2026-07-17T12:00:00.000Z",
      freshnessCoefficient: 0.5,
    };
    const before = { ...input };

    calculateEconomyV2Preview(input);

    expect(input).toEqual(before);
  });
});
