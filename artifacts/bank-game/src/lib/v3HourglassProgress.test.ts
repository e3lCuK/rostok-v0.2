import { describe, expect, it } from "vitest";
import {
  segmentFillPct,
  splitV3HourglassProgress,
  v3HourglassLidCutY,
} from "./v3HourglassProgress";

describe("v3HourglassProgress", () => {
  const cutY = v3HourglassLidCutY(46, 112);

  it("maps lid cut from tuck/height like the live hourglass", () => {
    expect(cutY).toBeCloseTo(140 * (1 - 46 / 112), 5);
  });

  it("fills button → mid → upper sequentially", () => {
    const empty = splitV3HourglassProgress({ barProgress: 0, cutY });
    expect(empty).toMatchObject({ button: 0, mid: 0, upper: 0, overall: 0 });

    const early = splitV3HourglassProgress({ barProgress: 0.1, cutY });
    expect(early.button).toBeGreaterThan(0);
    expect(early.button).toBeLessThan(1);
    expect(early.mid).toBe(0);
    expect(early.upper).toBe(0);

    const afterButton = splitV3HourglassProgress({ barProgress: 0.35, cutY });
    expect(afterButton.button).toBe(1);
    expect(afterButton.mid).toBeGreaterThan(0);
    expect(afterButton.upper).toBe(0);

    const late = splitV3HourglassProgress({ barProgress: 0.7, cutY });
    expect(late.button).toBe(1);
    expect(late.mid).toBe(1);
    expect(late.upper).toBeGreaterThan(0);
    expect(late.upper).toBeLessThan(1);

    const full = splitV3HourglassProgress({ barProgress: 1, cutY });
    expect(full).toMatchObject({ button: 1, mid: 1, upper: 1, overall: 1 });
  });

  it("formats CSS percentages", () => {
    expect(segmentFillPct(0)).toBe("0%");
    expect(segmentFillPct(1)).toBe("100%");
    expect(segmentFillPct(0.355)).toBe("35.5%");
  });
});
