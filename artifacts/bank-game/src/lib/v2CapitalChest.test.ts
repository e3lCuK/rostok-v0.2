import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  V2CapitalChest,
  formatV2ChestCapital,
  fitCapitalFontSize,
  fitCapitalFontSizeToWidth,
  resolveFlaskFontSizePx,
  CAPITAL_FACE_MAX_FS,
  CAPITAL_FACE_MIN_FS,
  CAPITAL_FACE_FS_VAR,
  CAPITAL_FACE_WIDTH_RATIO,
  V2_CHEST_LABEL_MAX_W,
  V2_CHEST_LABEL_MAX_W_PREV,
} from "../components/v2/V2CapitalChest";
import RootEnergySystem from "../components/v2/RootEnergySystem";

const here = dirname(fileURLToPath(import.meta.url));

describe("formatV2ChestCapital", () => {
  it("matches HUD-style ru-RU flooring", () => {
    const s = formatV2ChestCapital(100012.9);
    expect(s).toMatch(/100/);
    expect(s).toMatch(/012/);
    expect(s).toContain("₽");
    expect(formatV2ChestCapital(42)).toMatch(/42/);
    expect(formatV2ChestCapital(42)).toContain("₽");
  });

  it("shrinks font when the label is wider than the face", () => {
    const tight = fitCapitalFontSize("100 012 ₽", 36, 11, 6.5);
    const roomy = fitCapitalFontSize("100 012 ₽", 120, 11, 6.5);
    expect(tight).toBeLessThan(roomy);
    expect(tight).toBeGreaterThanOrEqual(6.5);
    expect(roomy).toBe(11);
  });

  it("capital face max is the timer size; width ratio uses the oval", () => {
    expect(CAPITAL_FACE_MAX_FS).toBe(11);
    expect(CAPITAL_FACE_FS_VAR).toBe("--capital-label-fs");
    expect(CAPITAL_FACE_WIDTH_RATIO).toBeGreaterThan(0.7);
    expect(CAPITAL_FACE_WIDTH_RATIO).toBeLessThanOrEqual(0.85);
    expect(resolveFlaskFontSizePx("11px")).toBe(11);
    expect(resolveFlaskFontSizePx("")).toBe(CAPITAL_FACE_MAX_FS);
    const fitted = fitCapitalFontSizeToWidth(
      (fs) => fs * 5,
      40,
      CAPITAL_FACE_MAX_FS,
      CAPITAL_FACE_MIN_FS,
    );
    expect(fitted).toBeLessThan(CAPITAL_FACE_MAX_FS);
    expect(fitted).toBeGreaterThan(CAPITAL_FACE_MIN_FS);
    expect(fitted * 5).toBeLessThanOrEqual(40 + 0.4);
  });
});

describe("V2CapitalChest SVG", () => {
  it("renders basket-style flat wood chest + gold capital without fantasy gold trim", () => {
    const html = renderToStaticMarkup(
      createElement(V2CapitalChest, { capital: 100_012, layer: "all" }),
    );
    expect(html).toContain("v2-capital-chest");
    expect(html).toContain('data-capital-chest="true"');
    expect(html).toContain("v2-capital-chest--svg");
    expect(html).toContain('data-chest-part="body"');
    expect(html).toContain('data-chest-part="lid"');
    expect(html).toContain('data-chest-part="interior"');
    expect(html).toContain('data-chest-part="seam"');
    expect(html).toContain('data-chest-part="panels"');
    expect(html).toContain('data-chest-part="clasp"');
    expect(html).toContain('data-chest-part="capital-label"');
    expect(html).toContain('data-chest-part="label-zone"');
    // Ears merged into lid; no separate frames / painted soil wedges
    expect(html).not.toContain("data-soil-gap");
    expect(html).not.toContain('data-chest-part="seam-frame-left"');
    expect(html).not.toContain('data-chest-part="seam-frame-right"');
    // Same wood palette as AppleBasket + topbar deposit gold on the sum
    expect(html).toContain("#8b623e");
    expect(html).toContain("#a67845");
    expect(html).toContain("#A67845");
    expect(html).not.toContain("#dcc4a0");
    expect(html).toContain("#c9920a");
    expect(html).not.toContain("#5a9e1e");
    expect(html).not.toContain("#c4785a");
    expect(html).not.toContain("#e0c070");
    expect(html).not.toContain("linearGradient");
    expect(html).not.toContain('data-chest-part="studs"');
    expect(html).not.toContain("metal-band");
    expect(html).not.toContain('data-chest-part="metal-band"');
    expect(html).not.toMatch(/\.(png|jpe?g|webp|gif)/i);
    expect(html).not.toContain("<img");
  });

  it("widens the capital label zone vs previous layout", () => {
    expect(V2_CHEST_LABEL_MAX_W).toBeGreaterThan(V2_CHEST_LABEL_MAX_W_PREV);
    expect(V2_CHEST_LABEL_MAX_W / V2_CHEST_LABEL_MAX_W_PREV).toBeGreaterThan(1.1);
    const html = renderToStaticMarkup(
      createElement(V2CapitalChest, {
        capital: 100_012,
        layer: "label",
      }),
    );
    expect(html).toContain(`data-label-max-w="${V2_CHEST_LABEL_MAX_W}"`);
    expect(html).toContain('text-anchor="middle"');
    expect(html).toContain("100");
    expect(html).toContain("₽");
  });

  it("keeps long values centered and within the fitted font zone", () => {
    const long = "12 345 678 ₽";
    const html = renderToStaticMarkup(
      createElement(V2CapitalChest, {
        formattedCapital: long,
        layer: "label",
      }),
    );
    expect(html).toContain(long);
    expect(html).toContain('text-anchor="middle"');
    const fontMatch = html.match(/font-size="([0-9.]+)"/);
    expect(fontMatch).toBeTruthy();
    const fontSize = Number(fontMatch![1]);
    expect(fontSize).toBeLessThanOrEqual(9.5);
    expect(fontSize).toBeGreaterThanOrEqual(6.2);
  });

  it("prefers formattedCapital prop over raw capital", () => {
    const html = renderToStaticMarkup(
      createElement(V2CapitalChest, {
        capital: 1,
        formattedCapital: "9 999 ₽",
        layer: "label",
      }),
    );
    expect(html).toContain("9 999 ₽");
    expect(html).not.toContain(">1 ₽<");
  });

  it("keeps lid permanently closed — no open state", () => {
    const html = renderToStaticMarkup(
      createElement(V2CapitalChest, { capital: 50, layer: "body" }),
    );
    expect(html).toContain('data-lid-state="closed"');
    expect(html).not.toContain('data-lid-state="open"');
    expect(html).not.toContain("data-chest-open");
    expect(html).not.toContain("lid-open");
  });

  it("does not intercept pointer events", () => {
    const html = renderToStaticMarkup(
      createElement(V2CapitalChest, { capital: 10, layer: "all" }),
    );
    expect(html).toMatch(/v2-capital-chest[^>]*pointer-events="none"/);
  });

  it("old CapitalChest file is only a re-export alias", () => {
    const src = readFileSync(
      join(here, "../components/v2/CapitalChest.tsx"),
      "utf8",
    );
    expect(src).toContain('from "./V2CapitalChest"');
    expect(src).not.toContain("ChestWalletIcon");
    expect(src).not.toContain("<img");
  });
});

describe("V2CapitalChest value-change animation", () => {
  it("wires brief bump state on capital change in component source", () => {
    const src = readFileSync(
      join(here, "../components/v2/V2CapitalChest.tsx"),
      "utf8",
    );
    expect(src).toContain("animateValueChange");
    expect(src).toContain("setBump(true)");
    expect(src).toContain("setTimeout");
    expect(src).toContain("420");
    expect(src).toContain("v2-chest-capital--bump");
    expect(src).toContain("v2-chest-motion--react");
    expect(src).toContain('data-value-bump={bump ? "true" : "false"}');
  });

  it("skips bump wiring when animateValueChange is false", () => {
    const html = renderToStaticMarkup(
      createElement(V2CapitalChest, {
        capital: 10,
        animateValueChange: false,
        layer: "all",
      }),
    );
    expect(html).toContain('data-animate-value="false"');
    expect(html).toContain('data-value-bump="false"');
  });
});

describe("V2CapitalChest motion CSS", () => {
  it("defines soft bump/sway and respects prefers-reduced-motion", () => {
    const css = readFileSync(join(here, "../bank.css"), "utf8");
    expect(css).toContain("v2-chest-value-bump");
    expect(css).toContain("v2-chest-soft-react");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?v2-chest-capital--bump[\s\S]*?animation:\s*none/,
    );
    expect(css).toContain("rotate(-0.5deg)");
    expect(css).toContain("scale(1.015)");
    expect(css).toContain("scale(1.04)");
    // Value bump must not be clipped by the capital label group
    expect(css).toMatch(/\.v2-chest-capital\s*\{[^}]*overflow:\s*visible/);
  });
});

describe("RootEnergySystem uses V2CapitalChest", () => {
  it("keeps chest behind/above roots with pointer-events none", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: "0",
        capital: 100_012,
        artMode: true,
      }),
    );
    expect(html).toContain("v2-capital-chest");
    expect(html).toContain('data-capital-chest="true"');
    expect(html).toContain("v2-capital-chest--svg");
    expect(html).toMatch(/v2-capital-chest[^>]*pointer-events="none"/);
    expect(html).toContain("100");
    expect(html).toContain("₽");
  });
});
