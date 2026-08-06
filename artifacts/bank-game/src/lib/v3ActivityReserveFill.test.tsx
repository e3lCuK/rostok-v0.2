/**
 * Continuous v3 activity reserve fill — replaces five-cell meter in production UI.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import V3ActivityReserveFill, {
  V3_ACTIVITY_RESERVE_FILL_COLORS,
} from "@/components/v2/V3ActivityReserveFill";
import { v3ActivityReserveFillPercent } from "@/lib/v3ActivityCards";

describe("V3ActivityReserveFill component", () => {
  it("renders one fill layer per card — no five segments", () => {
    const html = renderToStaticMarkup(
      createElement(V3ActivityReserveFill, {
        kind: "water",
        fillPercent: v3ActivityReserveFillPercent(5, 25),
      }),
    );
    expect(html).toContain('data-v3-activity-reserve-fill="water"');
    expect(html).toContain('data-v3-activity-reserve-pct="20"');
    expect(html).not.toContain("data-v3-activity-segment");
    expect(html).not.toContain("v3-activity-reserve-segment");
    expect(html.match(/data-v3-activity-reserve-fill=/g)?.length).toBe(1);
  });

  it("uses distinct bright colors per activity", () => {
    expect(V3_ACTIVITY_RESERVE_FILL_COLORS.water).toContain("43, 127, 255");
    expect(V3_ACTIVITY_RESERVE_FILL_COLORS.sun).toContain("255, 193, 7");
    expect(V3_ACTIVITY_RESERVE_FILL_COLORS.fertilizer).toContain("240, 160, 32");
    const sun = renderToStaticMarkup(
      createElement(V3ActivityReserveFill, {
        kind: "sun",
        fillPercent: 36,
      }),
    );
    expect(sun).toContain('data-v3-activity-reserve-fill="sun"');
    expect(sun).toContain(V3_ACTIVITY_RESERVE_FILL_COLORS.sun);
  });

  it("muted disabled fill stays visible; F5 starts without animate class", () => {
    const html = renderToStaticMarkup(
      createElement(V3ActivityReserveFill, {
        kind: "fertilizer",
        fillPercent: 80,
        muted: true,
      }),
    );
    expect(html).toContain("v3-activity-reserve-fill--muted");
    // First SSR/paint: animate flag false so F5 does not tween from 0.
    expect(html).toContain('data-v3-activity-reserve-animate="false"');
    expect(html).not.toContain("v3-activity-reserve-fill--animate");
    expect(html).toContain("height:80%");
  });
});
