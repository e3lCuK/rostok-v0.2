import { describe, expect, it } from "vitest";
import {
  canClickExcessWeb,
  excessWebExitDurationMs,
  excessWebIndexLabel,
  filterVisibleExcessWebs,
} from "./excessWebClearUi";

describe("excessWebClearUi", () => {
  it("filters cleared unless exiting", () => {
    const webs = [
      { id: "web-0", x: 0, y: 0, size: 1, rotation: 0, cleared: false },
      { id: "web-1", x: 0, y: 0, size: 1, rotation: 0, cleared: true },
    ];
    expect(filterVisibleExcessWebs(webs, new Set()).map((w) => w.id)).toEqual([
      "web-0",
    ]);
    expect(
      filterVisibleExcessWebs(webs, new Set(["web-1"])).map((w) => w.id),
    ).toEqual(["web-0", "web-1"]);
  });

  it("click rules", () => {
    expect(
      canClickExcessWeb({
        remainingSeconds: 3,
        cleared: false,
        inFlight: false,
        exiting: false,
      }),
    ).toBe(true);
    expect(
      canClickExcessWeb({
        remainingSeconds: 0,
        cleared: false,
        inFlight: false,
        exiting: false,
      }),
    ).toBe(false);
    expect(
      canClickExcessWeb({
        remainingSeconds: 3,
        cleared: true,
        inFlight: false,
        exiting: false,
      }),
    ).toBe(false);
  });

  it("aria index + exit duration", () => {
    expect(excessWebIndexLabel("web-7")).toBe(7);
    expect(excessWebIndexLabel("bad")).toBeNull();
    expect(excessWebExitDurationMs(false)).toBe(240);
    expect(excessWebExitDurationMs(true)).toBe(0);
  });
});
