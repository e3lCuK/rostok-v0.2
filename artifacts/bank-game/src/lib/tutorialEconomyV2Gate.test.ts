import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RootEnergySystem from "@/components/v2/RootEnergySystem";
import {
  buildReadyMaskFromSections,
  resolveRootTimerDisplay,
  shouldShowRootCountdown,
} from "@/lib/v2Roots";

const here = dirname(fileURLToPath(import.meta.url));

describe("Tutorial ↔ Economy v2 gate helpers", () => {
  it("hides countdown when tutorialDone=false", () => {
    expect(
      shouldShowRootCountdown({
        capital: 100_000,
        secondsUntilNext: 720,
        tutorialDone: false,
      }),
    ).toBe(false);
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        capital: 100_000,
        secondsUntilNext: 720,
        secondsPerSection: 720,
        tutorialDone: false,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("shows countdown for tutorialDone=true with full server cycle", () => {
    const t = resolveRootTimerDisplay({
      isFull: false,
      capital: 100_000,
      secondsUntilNext: 720,
      secondsPerSection: 720,
      tutorialDone: true,
    });
    expect(t).toMatchObject({
      kind: "countdown",
      seconds: 720,
      timeLabel: "12:00",
      barProgress: 0,
    });
  });

  it("keeps prior behaviour when tutorialDone omitted (existing accounts)", () => {
    expect(
      shouldShowRootCountdown({
        capital: 50_000,
        secondsUntilNext: 100,
      }),
    ).toBe(true);
  });

  it("excess cleaning hideEnergyTimer path stays independent of tutorialDone", () => {
    // Layer uses: hideEnergyTimer || !tutorialDone → hidden
    // With tutorialDone true + hideEnergyTimer, timer stays hidden (Metelka).
    const layerSrc = readFileSync(
      join(here, "../components/v2/RootEnergyLayer.tsx"),
      "utf8",
    );
    const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
    expect(layerSrc).toContain("hideEnergyTimer || !tutorialDone");
    expect(pageSrc).toContain("hideEnergyTimer={excessCleaning}");
  });
});

describe("RootEnergySystem production collect during Tutorial", () => {
  it("disables all production hit-paths when productionCollectEnabled=false", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: buildReadyMaskFromSections([0, 14, 30]),
        productionCollectEnabled: false,
      }),
    );
    expect(html.match(/data-root-hit="/g)?.length).toBe(4);
    expect(html).not.toContain('pointer-events="stroke"');
    expect(html).toContain('pointer-events="none"');
    expect(html).toContain("cursor:default");
  });

  it("keeps ready hits clickable when productionCollectEnabled=true", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: buildReadyMaskFromSections([0]),
        productionCollectEnabled: true,
      }),
    );
    expect(html).toMatch(
      /data-root-hit="0"[^>]*data-root-has-ready="true"[\s\S]*?pointer-events="stroke"/,
    );
  });
});

describe("RootEnergyLayer Tutorial source contracts", () => {
  const layerSrc = readFileSync(
    join(here, "../components/v2/RootEnergyLayer.tsx"),
    "utf8",
  );
  const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");

  it("does not start countdown interval while Tutorial is active", () => {
    expect(layerSrc).toContain("!tutorialDone ||");
    expect(layerSrc).toContain("setLocalUntil(null)");
    expect(layerSrc).toContain("productionCollectEnabled={tutorialDone}");
    expect(layerSrc).toContain("if (!tutorialDone) return;");
  });

  it("does not call collect endpoint while Tutorial is active", () => {
    expect(layerSrc).toContain("api.collectV2RootSection");
    const collectBlock = layerSrc.slice(
      layerSrc.indexOf("const handleRootCollect"),
      layerSrc.indexOf("const mask = useMemo"),
    );
    expect(collectBlock).toContain("if (!tutorialDone) return;");
    expect(collectBlock.indexOf("if (!tutorialDone) return;")).toBeLessThan(
      collectBlock.indexOf("api.collectV2RootSection"),
    );
  });

  it("after Tutorial finish: awaits tutorialComplete + fresh getState (no F5)", () => {
    expect(pageSrc).toContain("await api.tutorialComplete()");
    expect(pageSrc).toContain("await api.getState()");
    expect(pageSrc).toContain("tutorialDone: true");
    expect(pageSrc).toContain("v2Roots: normalizeV2Roots(data.game.v2Roots)");
  });

  it("passes tutorialDone into RootEnergyLayer", () => {
    expect(pageSrc).toContain("tutorialDone={tutorialDone}");
  });
});
