import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import V3WaitTimerHourglass, {
  V3_HOURGLASS_OUTER_PATH,
} from "./V3WaitTimerHourglass";

const here = dirname(fileURLToPath(import.meta.url));

describe("V3WaitTimerHourglass", () => {
  it("renders visible upper flask with narrow neck + centered energy/time", () => {
    const html = renderToStaticMarkup(
      <V3WaitTimerHourglass
        barProgress={0.35}
        timeLabel="08:24"
        ariaLabel="До следующего накопления"
      />,
    );
    expect(html).toContain('data-timer-shape="hourglass"');
    expect(html).toContain('data-v3-hourglass-part="upper"');
    expect(html).toContain('data-timer-fill="true"');
    expect(html).toContain('data-v3-hourglass-fill="upper"');
    expect(html).toContain('data-timer-energy-icon="true"');
    expect(html).toContain("v3-root-wait-timer-icon");
    expect(html).toContain('data-timer-upper="true"');
    expect(html).toContain(V3_HOURGLASS_OUTER_PATH);
    // Upper silhouette path (shell + rim + clip) — mid/button live elsewhere.
    expect(html.split(V3_HOURGLASS_OUTER_PATH).length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toContain("08:24");
    expect(html).toContain('aria-valuenow="35"');
    expect(html).not.toContain("data-capital-chest-hit");
  });

  it("CSS: three-part flask — upper slot, mid behind chest, button fill", () => {
    const css = readFileSync(join(here, "../../bank.css"), "utf8");
    expect(css).toContain("v3-capital-hourglass-slot");
    expect(css).toContain("v3-hourglass-mid");
    expect(css).toContain("--v3-hourglass-upper-height");
    expect(css).toContain("--v3-hourglass-mid-height");
    expect(css).toContain("v3-capital-badge--in-bulb");
    expect(css).toContain("v3-capital-badge__bulb");
    expect(css).toContain("--v3-hourglass-paint-width");
    expect(css).toMatch(
      /\.v3-capital-badge--in-bulb\s*\{[\s\S]*?width:\s*var\(--v3-hourglass-paint-width/,
    );
    expect(css).toMatch(
      /\.v3-capital-badge--in-bulb\s*\{[\s\S]*?33 \/ 140/,
    );
    expect(css).not.toMatch(
      /\.v3-capital-badge--in-bulb\s*\{[\s\S]*?border-radius:\s*40%\s*\/\s*48%/,
    );
    expect(css).toMatch(
      /\.v3-capital-badge__fill\s*\{[\s\S]*?--v3-hg-fill-button/,
    );
    expect(css).toMatch(
      /\.v3-hourglass-mid__fill\s*\{[\s\S]*?--v3-hg-fill-mid/,
    );
    expect(css).toMatch(
      /\.v3-capital-hourglass-slot\s*\{[\s\S]*?z-index:\s*3/,
    );
    expect(css).toMatch(
      /\.v3-capital-hourglass-slot\s*\{[\s\S]*?--v3-hourglass-upper-height/,
    );
    expect(css).toContain("--v3-hourglass-lid-foot");
    expect(css).toContain("v3-root-wait-timer-hourglass__lid-foot");
    expect(css).toContain(
      "font-size: var(--capital-label-fs, var(--v3-flask-font-size, 11px))",
    );
    expect(css).toMatch(
      /\.v3-root-wait-timer-icon svg\s*\{[\s\S]*?width:\s*1em/,
    );
    const hgSrc = readFileSync(join(here, "V3WaitTimerHourglass.tsx"), "utf8");
    expect(hgSrc).not.toContain("Zap size={13}");
    expect(hgSrc).toContain("<Zap strokeWidth={2.25}");
  });
});
