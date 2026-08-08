/**
 * v3 capital chest under roots — must stay visible when RootEnergyLayer is hidden.
 * Position: separate underground host (not inside .v3-root-anchor / tree).
 */

import { createElement } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CapitalChestUnderRoots from "@/components/v2/CapitalChestUnderRoots";
import { formatV2ChestCapital } from "@/components/v2/V2CapitalChest";
import V3WaitTimerHourglass from "@/components/v2/V3WaitTimerHourglass";
import { createIncomeChestFeedback } from "@/lib/incomeChestFeedback";
const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
const underRootsSrc = readFileSync(
  join(here, "../components/v2/CapitalChestUnderRoots.tsx"),
  "utf8",
);

describe("Capital chest under Economy v3 roots", () => {
  it("v3 → chest is in a separate underground host, not inside root-anchor", () => {
    expect(pageSrc).toContain('data-v3-capital-chest-host="true"');
    expect(pageSrc).toContain("v3-capital-chest-host");
    expect(pageSrc).toContain("v3-underground-stack");
    expect(pageSrc).toContain("<CapitalChestUnderRoots");

    const stackIdx = pageSrc.indexOf('data-v3-underground-stack="true"');
    const rootsPrimaryIdx = pageSrc.indexOf('data-v3-roots-primary="true"');
    const hostIdx = pageSrc.indexOf('data-v3-capital-chest-host="true"');
    expect(stackIdx).toBeGreaterThan(-1);
    expect(rootsPrimaryIdx).toBeGreaterThan(-1);
    expect(hostIdx).toBeGreaterThan(-1);
    // Flex stack owns placement; roots then capital-hourglass chest host.
    expect(stackIdx).toBeLessThan(rootsPrimaryIdx);
    expect(rootsPrimaryIdx).toBeLessThan(hostIdx);
    expect(pageSrc).toContain("v3-capital-chest-host--with-hourglass");

    const rootAnchorBlock = pageSrc.slice(rootsPrimaryIdx, hostIdx);
    expect(rootAnchorBlock).toContain("EconomyV3RootSystem");
    expect(rootAnchorBlock).not.toContain("CapitalChestUnderRoots");
    expect(rootAnchorBlock).not.toContain("<RootEnergyLayer");
  });

  it("root-system and chest do not share the same vertical anchor", () => {
    expect(cssSrc).toContain(".game-area .v3-capital-chest-host");
    expect(cssSrc).toContain(".game-area .v3-root-anchor");
    expect(cssSrc).toMatch(
      /\.game-area \.v3-capital-chest-host\s*\{[\s\S]*?bottom:\s*10px/,
    );
    expect(cssSrc).toMatch(
      /\.game-area \.v3-capital-chest-host\s*\{[\s\S]*?left:\s*50%/,
    );
    expect(cssSrc).toMatch(
      /\.game-area \.v3-capital-chest-host\s*\{[\s\S]*?translateX\(-50%\)/,
    );
    // Chest host is not nested under root-anchor in CSS selectors for positioning.
    expect(cssSrc).not.toMatch(
      /\.v3-root-anchor[\s\S]{0,80}\.v3-capital-chest-host/,
    );
    expect(cssSrc).not.toMatch(
      /\.v3-root-anchor[\s\S]{0,120}\.v3-capital-chest-layer--body/,
    );
  });

  it("v3 mount → exactly one data-capital-chest; label + capital value", () => {
    const formatted = formatV2ChestCapital(100_012);
    const value = formatted.replace(/\s*₽$/u, "").trim();
    const html = renderToStaticMarkup(
      createElement(
        CapitalChestUnderRoots,
        { capital: 100_012, onCapitalClick: () => {} },
        createElement(V3WaitTimerHourglass, {
          barProgress: 0.2,
          timeLabel: "10:00",
          ariaLabel: "До следующего накопления",
        }),
      ),
    );
    expect(html.match(/data-capital-chest="true"/g)?.length).toBe(1);
    expect(html).toContain('data-v3-capital-hourglass-slot="true"');
    // Lid-cut foot is part of the hourglass SVG (one figure).
    expect(html).toContain('data-v3-hourglass-lid-cut="true"');
    expect(html).toContain('data-hourglass-lid-cut="true"');
    expect(html).not.toContain("v3-hourglass-lid-cut-slot");
    expect(html).toContain('data-capital-label="true"');
    expect(html).toContain("v3-capital-badge--in-bulb");
    expect(html).toContain("v3-capital-badge__bulb");
    expect(html).toContain("v3-capital-badge__fill");
    expect(html).toContain("M8 103 C2 118");
    expect(html).toContain("field-caption-value");
    expect(html).toContain(value);
    expect(html).toContain("₽");
  });

  it("capital hit target opens accrual history (wired from GamePage)", () => {
    expect(pageSrc).toContain("onCapitalClick={() => setShowDepositInfo(true)}");
    expect(pageSrc).toContain("sessionHistory");
    expect(pageSrc).toContain("Начисления появятся после первой сессии");
    expect(pageSrc).not.toContain("incomeByPreset");
    expect(pageSrc).not.toContain("progress-row-deposit");
    expect(pageSrc).not.toContain("<Wallet");
    expect(underRootsSrc).toContain("data-capital-chest-hit");
    expect(underRootsSrc).toContain("v3-capital-badge--in-bulb");
    expect(cssSrc).toContain("v3-capital-badge--in-bulb");
    const html = renderToStaticMarkup(
      createElement(CapitalChestUnderRoots, {
        capital: 100_012,
        onCapitalClick: () => {},
      }),
    );
    expect(html).toContain('data-capital-chest-hit="true"');
    expect(html).toContain("История начислений");
    expect(html).toMatch(/<button[^>]*data-capital-chest-hit="true"/);
  });

  it("IncomeChestFloat stays inside chest-overlay", () => {
    expect(underRootsSrc).toContain('data-v3-capital-chest-overlay="true"');
    expect(underRootsSrc).toContain("IncomeChestFloat");
    const overlayIdx = underRootsSrc.indexOf("v3-capital-chest-overlay");
    const floatIdx = underRootsSrc.indexOf("<IncomeChestFloat");
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(floatIdx).toBeGreaterThan(overlayIdx);
    const html = renderToStaticMarkup(
      createElement(CapitalChestUnderRoots, {
        capital: 50,
        incomeChestFeedback: createIncomeChestFeedback(0.25),
      }),
    );
    expect(html).toContain('data-income-chest-float="true"');
    expect(html).toContain('data-capital-chest="true"');
  });

  it("v2 fallback → chest still only via RootEnergyLayer", () => {
    const rootsIdx = pageSrc.indexOf("8G: exclusive roots");
    const rootsBlock = pageSrc.slice(rootsIdx, rootsIdx + 3800);
    const fallbackStart = rootsBlock.indexOf(
      "ENABLE_ECONOMY_V2_ROOT_COLLECTION &&",
    );
    expect(fallbackStart).toBeGreaterThan(-1);
    const fallback = rootsBlock.slice(fallbackStart);
    expect(fallback).toContain("<RootEnergyLayer");
    expect(fallback).toContain("capital={balances.balance}");
    expect(fallback).toContain("incomeChestFeedback={incomeChestFeedback}");
    expect(fallback).not.toContain("CapitalChestUnderRoots");
    expect(pageSrc.match(/<CapitalChestUnderRoots/g)?.length).toBe(1);
    expect(pageSrc.match(/<RootEnergyLayer/g)?.length).toBe(1);
  });

  it("layer order: underground soil < roots < earth surface < chest < tree", () => {
    expect(cssSrc).toMatch(/\.v2-underground-zone\s*\{[\s\S]*?z-index:\s*1/);
    expect(cssSrc).toMatch(
      /\.game-area \.v3-root-anchor\s*\{[\s\S]*?z-index:\s*2/,
    );
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.game-area-bg-ground\s*\{[\s\S]*?z-index:\s*3/,
    );
    expect(cssSrc).toMatch(
      /\.game-area \.v3-capital-chest-host\s*\{[\s\S]*?z-index:\s*4/,
    );
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots \.game-tree-wrap\s*\{[\s\S]*?z-index:\s*5/,
    );
    expect(cssSrc).not.toContain("v3-earth-veil");
  });

  it("v3 scene stacks chest below roots with taller underground band", () => {
    expect(pageSrc).toContain("game-area--v3-roots");
    expect(pageSrc).not.toContain("v3-earth-veil");
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots\s*\{[\s\S]*?--v2-scene-lift:\s*300px/,
    );
    expect(cssSrc).toMatch(
      /\.game-area--v3-roots\s*\{[\s\S]*?--v3-root-crown-bury:\s*8px/,
    );
    expect(cssSrc).toContain("--v3-hourglass-height");
  });

  it("chest SVG viewBox is cropped flush to lid; fills host (no letterbox gap)", () => {
    expect(underRootsSrc).toContain("CHEST_VIEW");
    expect(underRootsSrc).toContain("V2_CHEST_PAINT");
    expect(underRootsSrc).toContain('preserveAspectRatio="none"');
    const html = renderToStaticMarkup(
      createElement(CapitalChestUnderRoots, { capital: 100 }),
    );
    // Flush crop: thin lid peak 26 → bottom 79 → height 53.
    expect(html).toContain('viewBox="0 26 200 53"');
    expect(html).toContain('preserveAspectRatio="none"');
  });
});
