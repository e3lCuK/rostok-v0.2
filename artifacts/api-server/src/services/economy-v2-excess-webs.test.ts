import { describe, expect, it } from "vitest";
import {
  appendClearedExcessWebId,
  computeExcessWebCount,
  createExcessWebLayoutSeed,
  EXCESS_FINISH_CLIENT_SKEW_MS,
  EXCESS_WEB_PLAYABLE,
  EXCESS_WEB_ROTATION_MAX,
  EXCESS_WEB_ROTATION_MIN,
  EXCESS_WEB_SIZE_MAX,
  EXCESS_WEB_SIZE_MIN,
  generateExcessWebLayout,
  isCenterInAnyExclusion,
  isExcessSessionFinishableByTime,
  isExcessSessionTimeExpired,
  isExcessWebCleared,
  validateExcessWebId,
} from "./economy-v2-excess-webs";

/** Expected table from N = round(2.4 × T) for T = 5…25. */
const EXPECTED_WEB_COUNTS: Record<number, number> = {
  5: 12,
  6: 14,
  7: 17,
  8: 19,
  9: 22,
  10: 24,
  11: 26,
  12: 29,
  13: 31,
  14: 34,
  15: 36,
  16: 38,
  17: 41,
  18: 43,
  19: 46,
  20: 48,
  21: 50,
  22: 53,
  23: 55,
  24: 58,
  25: 60,
};

describe("computeExcessWebCount (GDD §19.7)", () => {
  it("1–6. all presets 5–25 match round(2.4×T)", () => {
    for (let t = 5; t <= 25; t++) {
      expect(computeExcessWebCount(t)).toBe(EXPECTED_WEB_COUNTS[t]);
    }
  });

  it("clamps outside 5…25", () => {
    expect(computeExcessWebCount(1)).toBe(12);
    expect(computeExcessWebCount(100)).toBe(60);
  });
});

describe("generateExcessWebLayout", () => {
  it("14. deterministic for same seed/count", () => {
    const a = generateExcessWebLayout({ seed: 42, webCount: 24, presetSeconds: 10 });
    const b = generateExcessWebLayout({ seed: 42, webCount: 24, presetSeconds: 10 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(24);
  });

  it("different seeds differ", () => {
    const a = generateExcessWebLayout({ seed: 1, webCount: 12 });
    const b = generateExcessWebLayout({ seed: 2, webCount: 12 });
    expect(a).not.toEqual(b);
  });

  it("11–13. coords / size / rotation / exclusions for dense layout", () => {
    const layout = generateExcessWebLayout({
      seed: 99_001,
      webCount: 60,
      presetSeconds: 25,
    });
    expect(layout).toHaveLength(60);
    for (const w of layout) {
      expect(w.x).toBeGreaterThanOrEqual(EXCESS_WEB_PLAYABLE.x0);
      expect(w.x).toBeLessThanOrEqual(EXCESS_WEB_PLAYABLE.x1);
      expect(w.y).toBeGreaterThanOrEqual(EXCESS_WEB_PLAYABLE.y0);
      expect(w.y).toBeLessThanOrEqual(EXCESS_WEB_PLAYABLE.y1);
      expect(isCenterInAnyExclusion(w.x, w.y)).toBe(false);
      expect(w.size).toBeGreaterThanOrEqual(EXCESS_WEB_SIZE_MIN - 0.001);
      expect(w.size).toBeLessThanOrEqual(EXCESS_WEB_SIZE_MAX + 0.001);
      expect(w.rotation).toBeGreaterThanOrEqual(EXCESS_WEB_ROTATION_MIN - 0.001);
      expect(w.rotation).toBeLessThanOrEqual(EXCESS_WEB_ROTATION_MAX + 0.001);
      expect(w.id).toMatch(/^web-\d+$/);
    }
  });

  it("createExcessWebLayoutSeed returns uint32-ish number", () => {
    const s = createExcessWebLayoutSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("excess web id helpers", () => {
  it("validateExcessWebId accepts web-N in range", () => {
    expect(validateExcessWebId("web-0", 12)).toBe(0);
    expect(validateExcessWebId("web-11", 12)).toBe(11);
    expect(validateExcessWebId("web-12", 12)).toBeNull();
    expect(validateExcessWebId("web--1", 12)).toBeNull();
    expect(validateExcessWebId("WEB-1", 12)).toBeNull();
    expect(validateExcessWebId("web-1.5", 12)).toBeNull();
  });

  it("cleared helpers are duplicate-safe", () => {
    expect(isExcessWebCleared("web-1", ["web-1"])).toBe(true);
    expect(appendClearedExcessWebId(["web-0"], "web-0")).toEqual(["web-0"]);
    expect(appendClearedExcessWebId(["web-0"], "web-1")).toEqual([
      "web-0",
      "web-1",
    ]);
  });

  it("time expiry uses startedAt + preset", () => {
    const started = 1_000_000;
    expect(isExcessSessionTimeExpired(started, 5, started + 4999)).toBe(false);
    expect(isExcessSessionTimeExpired(started, 5, started + 5000)).toBe(true);
  });

  it("finishable-by-time allows small client-ahead skew; clear stays strict", () => {
    const started = 1_000_000;
    const endAt = started + 5_000;
    // Strict clear/expiry: still not expired 1ms before end.
    expect(isExcessSessionTimeExpired(started, 5, endAt - 1)).toBe(false);
    // Finish accepts up to skew ms early so UI=0 is not stuck on 409.
    expect(
      isExcessSessionFinishableByTime(started, 5, endAt - EXCESS_FINISH_CLIENT_SKEW_MS),
    ).toBe(true);
    expect(
      isExcessSessionFinishableByTime(
        started,
        5,
        endAt - EXCESS_FINISH_CLIENT_SKEW_MS - 1,
      ),
    ).toBe(false);
  });
});
