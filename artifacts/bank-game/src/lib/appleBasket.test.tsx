import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import AppleBasket from "@/components/AppleBasket";

const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(resolve(root, "bank.css"), "utf8");
const basketSrc = readFileSync(
  resolve(root, "components/AppleBasket.tsx"),
  "utf8",
);

describe("AppleBasket on play field", () => {
  it("topbar no longer has apple progress row", () => {
    expect(pageSrc).not.toContain("progress-row-apples");
    expect(pageSrc).not.toContain("growth-info-btn-plus");
  });

  it("GamePage mounts AppleBasket and opens shop", () => {
    expect(pageSrc).toContain('from "@/components/AppleBasket"');
    expect(pageSrc).toContain("<AppleBasket");
    expect(pageSrc).toContain("onClick={() => setShowShop(true)}");
    expect(pageSrc).toContain("dropHighlight={appleDropTargetActive}");
    expect(pageSrc).toContain("data-apple-basket-popup");
    expect(pageSrc).toContain("apple-basket-popup-slot");
    expect(pageSrc).toContain('excessCleaning ? " game-area--metelka-cleaning"');
    expect(cssSrc).toContain(".game-area--metelka-cleaning .apple-basket-host");
    expect(cssSrc).toContain(
      ".game-area--metelka-cleaning .tree-growth-badge-host",
    );
  });

  it("CSS keeps apple popup out of basket flow and inside the field", () => {
    expect(cssSrc).toMatch(/\.apple-basket-popup-slot\s*\{[^}]*position:\s*absolute/s);
    expect(cssSrc).toMatch(/\.apple-basket-popup-slot\s*\{[^}]*left:\s*0/s);
    expect(cssSrc).not.toMatch(/\.apple-basket-popup-slot\s*\{[^}]*translateX\(-50%\)/s);
    expect(cssSrc).toMatch(/\.apple-basket-host\s*\{[^}]*display:\s*block/s);
    // Apple counter + flash label match capital type.
    expect(basketSrc).toContain("field-caption-value");
    expect(cssSrc).toMatch(
      /\.apple-popup-label\s*\{[\s\S]*?font-size:\s*var\(--v3-flask-font-size/,
    );
  });

  it("manual apple collect flies toward basket (left/down)", () => {
    expect(pageSrc).toMatch(/y:\s*90,\s*x:\s*-22/);
    expect(pageSrc).not.toMatch(/y:\s*-220,\s*x:\s*-90/);
  });

  it("CSS hosts basket near ground / right of left bush", () => {
    expect(cssSrc).toContain(".apple-basket-host");
    expect(cssSrc).toContain(".apple-basket");
    expect(cssSrc).toContain(".game-area--v3-roots .apple-basket-host");
    expect(cssSrc).toContain("var(--v2-scene-lift)");
    expect(cssSrc).toMatch(/\.apple-basket-host\s*\{[^}]*left:\s*13%/s);
    expect(cssSrc).not.toMatch(/\.apple-basket-host\s*\{[^}]*left:\s*0(?:px)?;/s);
  });

  it("basket renders count and accessibility label", () => {
    expect(basketSrc).toContain("data-apple-basket");
    expect(basketSrc).toContain("Открыть магазин");
    const html = renderToStaticMarkup(
      createElement(AppleBasket, {
        apples: 12,
        onClick: () => {},
      }),
    );
    expect(html).toContain('data-apple-basket="true"');
    expect(html).toContain('data-apple-basket-count="true"');
    expect(html).toContain("12");
    expect(html).toContain("ябл");
    expect(html).toContain("Яблоки: 12. Открыть магазин");
  });
});
