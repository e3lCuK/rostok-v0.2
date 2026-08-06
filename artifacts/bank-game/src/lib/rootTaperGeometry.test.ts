import { describe, expect, it } from "vitest";
import {
  buildTaperedRootFill,
  MAJOR_ROOT_BASE_WIDTH,
  taperWidthFactor,
} from "@/components/v2/rootTaperGeometry";
import {
  MAJOR_MOCK_BRANCH_CATALOG,
  MAJOR_TAPER_FILL_BY_ID,
} from "@/components/v2/rootMajorMockBranches";

describe("root taper geometry", () => {
  it("follows the soft width profile keypoints", () => {
    expect(taperWidthFactor(0)).toBeCloseTo(1.0, 3);
    expect(taperWidthFactor(0.25)).toBeGreaterThanOrEqual(0.92);
    expect(taperWidthFactor(0.25)).toBeLessThanOrEqual(0.95);
    expect(taperWidthFactor(0.5)).toBeGreaterThanOrEqual(0.8);
    expect(taperWidthFactor(0.5)).toBeLessThanOrEqual(0.85);
    expect(taperWidthFactor(0.75)).toBeGreaterThanOrEqual(0.65);
    expect(taperWidthFactor(0.75)).toBeLessThanOrEqual(0.7);
    expect(taperWidthFactor(1)).toBeGreaterThanOrEqual(0.45);
    expect(taperWidthFactor(1)).toBeLessThanOrEqual(0.55);
  });

  it("emerge profile is thin at trunk and swells along the root", () => {
    expect(taperWidthFactor(0, "emerge")).toBeLessThan(0.2);
    expect(taperWidthFactor(0.35, "emerge")).toBeGreaterThan(
      taperWidthFactor(0.12, "emerge"),
    );
    expect(taperWidthFactor(0.6, "emerge")).toBeCloseTo(1.0, 2);
    expect(taperWidthFactor(1, "emerge")).toBeLessThan(0.55);
  });

  it("builds a closed fill for every major centerline", () => {
    for (const branch of MAJOR_MOCK_BRANCH_CATALOG) {
      const fill = buildTaperedRootFill(branch.d, MAJOR_ROOT_BASE_WIDTH);
      expect(fill).toBeTruthy();
      expect(fill!.startsWith("M ")).toBe(true);
      expect(fill!.endsWith("Z")).toBe(true);
      expect(MAJOR_TAPER_FILL_BY_ID.get(branch.id)).toBe(fill);
      // Centerline catalog entry must stay the cubic stroke path (unchanged).
      expect(branch.d.startsWith("M 100 1 C")).toBe(true);
    }
  });
});
