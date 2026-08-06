import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import RootEnergySystem from "@/components/v2/RootEnergySystem";
import {
  buildReadyMaskFromSections,
  getNextCollectableSectionIndex,
  resolveRootTimerDisplay,
} from "@/lib/v2Roots";

const here = dirname(fileURLToPath(import.meta.url));

describe("root collect UX helpers", () => {
  it("picks tip section first within a root (14→0)", () => {
    const mask = buildReadyMaskFromSections([0, 5, 14]);
    expect(getNextCollectableSectionIndex(0, mask)).toBe(14);
  });

  it("empty root returns null — no collect", () => {
    expect(getNextCollectableSectionIndex(3, "0")).toBeNull();
  });

  it("timer states: numeric countdown only, no «до +1 сек»", () => {
    const zero = resolveRootTimerDisplay({
      isFull: false,
      capital: 50_000,
      secondsUntilNext: 0,
      secondsPerSection: 720,
    });
    expect(zero.kind).toBe("countdown");
    if (zero.kind === "countdown") {
      expect(zero.seconds).toBe(0);
      expect(zero.barProgress).toBe(1);
    }
    expect(JSON.stringify(zero)).not.toContain("до +1 сек");

    expect(
      resolveRootTimerDisplay({
        isFull: true,
        capital: 1,
        secondsUntilNext: 0,
      }),
    ).toEqual({ kind: "hidden" });

    expect(
      resolveRootTimerDisplay({
        isFull: false,
        capital: 0,
        secondsUntilNext: 90,
      }),
    ).toEqual({ kind: "hidden" });

    expect(JSON.stringify(resolveRootTimerDisplay({
      isFull: false,
      storageFull: true,
      capital: 50_000,
      secondsUntilNext: null,
    }))).not.toContain("Накопление приостановлено");
  });
});

describe("root timer progress bar", () => {
  it("starts near 0 and rises as remaining falls; clamps 0..1", async () => {
    const {
      resolveCountdownProgress,
      resolveRootTimerDisplay,
      shouldPulseRootTimerBar,
    } = await import("./v2Roots");

    expect(resolveCountdownProgress(720, 720)).toBeCloseTo(0, 9);
    expect(resolveCountdownProgress(360, 720)).toBeCloseTo(0.5, 9);
    expect(resolveCountdownProgress(0, 720)).toBeCloseTo(1, 9);
    expect(resolveCountdownProgress(-10, 720)).toBe(1);
    expect(resolveCountdownProgress(800, 720)).toBe(0);

    const mid = resolveRootTimerDisplay({
      isFull: false,
      capital: 100_000,
      secondsUntilNext: 360,
      secondsPerSection: 720,
    });
    expect(mid).toMatchObject({ kind: "countdown", barProgress: 0.5, pulse: false });

    // 12-min cycle: last minute must NOT pulse; only last ≤8s
    expect(
      shouldPulseRootTimerBar({ remainingSeconds: 60, totalSeconds: 720 }),
    ).toBe(false);
    expect(
      shouldPulseRootTimerBar({ remainingSeconds: 8, totalSeconds: 720 }),
    ).toBe(true);
    expect(
      shouldPulseRootTimerBar({ remainingSeconds: 0, totalSeconds: 720 }),
    ).toBe(false);

    const full = resolveRootTimerDisplay({
      isFull: true,
      capital: 100_000,
      secondsUntilNext: 0,
      secondsPerSection: 720,
    });
    expect(full.kind).toBe("hidden");
    expect(full).not.toHaveProperty("barProgress");

    const paused = resolveRootTimerDisplay({
      isFull: false,
      capital: 0,
      secondsUntilNext: 10,
      secondsPerSection: 720,
    });
    expect(paused.kind).toBe("hidden");
    expect(paused).not.toHaveProperty("pulse");
  });

  it("capsule markup keeps time above fill; old under-bar classes absent", () => {
    const layerSrc = readFileSync(
      join(here, "../components/v2/RootEnergyLayer.tsx"),
      "utf8",
    );
    const fillIdx = layerSrc.indexOf("v2-root-timer-capsule__fill");
    const timeIdx = layerSrc.indexOf("v2-root-timer-capsule__time");
    expect(fillIdx).toBeGreaterThan(-1);
    expect(timeIdx).toBeGreaterThan(fillIdx);
    expect(layerSrc).toContain('data-timer-capsule="true"');
    expect(layerSrc).not.toContain("v2-root-timer-side__bar");
  });
});

describe("RootEnergySystem root hit UX", () => {
  it("exposes four whole-root hit paths", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: buildReadyMaskFromSections([0, 14, 30]),
      }),
    );
    expect(html.match(/data-root-hit="/g)?.length).toBe(4);
    expect(html).toContain('data-root-hit="0"');
    expect(html).toContain('data-root-has-ready="true"');
    expect(html).toContain('stroke-width="28"');
    expect(html).toMatch(/v2-capital-chest[^>]*pointer-events="none"/);
  });

  it("disables only the in-flight root hit", () => {
    const html = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        readyMask: buildReadyMaskFromSections([0, 15]),
        collectingRootIndices: new Set([0]),
      }),
    );
    // Root 0 has ready but is collecting → pointer-events none
    expect(html).toMatch(
      /data-root-hit="0"[^>]*data-root-has-ready="true"[\s\S]*?pointer-events="none"/,
    );
    // Root 1 still clickable
    expect(html).toMatch(
      /data-root-hit="1"[^>]*data-root-has-ready="true"[\s\S]*?pointer-events="stroke"/,
    );
  });
});

describe("RootEnergyLayer source contracts", () => {
  const layerSrc = readFileSync(
    join(here, "../components/v2/RootEnergyLayer.tsx"),
    "utf8",
  );

  it("refreshes server state when local countdown hits 0", () => {
    expect(layerSrc).toContain("localUntil !== 0");
    expect(layerSrc).toContain("onRefreshState");
  });

  it("renders oval capsule timer without separate under-bar", () => {
    expect(layerSrc).toContain("v2-root-timer-capsule");
    expect(layerSrc).toContain("v2-root-timer-capsule__fill");
    expect(layerSrc).toContain("v2-root-timer-capsule__time");
    expect(layerSrc).toContain("barProgress");
    expect(layerSrc).not.toContain("v2-root-timer-side__bar");
    expect(layerSrc).not.toContain("v2-root-timer-side__bar-fill");
    expect(layerSrc).not.toContain("до +1 сек");
    // collect floater still uses +1 сек after success
    expect(layerSrc).toContain("+1 сек");
  });

  it("shows outline Zap energy icon inside the capsule, left of time", () => {
    expect(layerSrc).toContain('from "lucide-react"');
    expect(layerSrc).toContain("Zap");
    expect(layerSrc).toContain('data-timer-energy-icon="true"');
    expect(layerSrc).toContain("v2-root-timer-icon");
    expect(layerSrc).toContain('fill="none"');
    expect(layerSrc).toContain("size={10}");
    expect(layerSrc).not.toContain('data-timer-row="true"');
    expect(layerSrc).not.toContain("v2-root-timer-row");
    // Icon markup is inside the capsule block, before time label
    const capsuleIdx = layerSrc.indexOf('data-timer-capsule="true"');
    const iconIdx = layerSrc.indexOf('data-timer-energy-icon="true"');
    const timeIdx = layerSrc.indexOf("v2-root-timer-capsule__time");
    expect(capsuleIdx).toBeGreaterThan(-1);
    expect(iconIdx).toBeGreaterThan(capsuleIdx);
    expect(timeIdx).toBeGreaterThan(iconIdx);
  });

  it("keeps capsule progress/pulse wiring unchanged", () => {
    expect(layerSrc).toContain("timer.barProgress");
    expect(layerSrc).toContain("v2-root-timer-side--pulse");
    expect(layerSrc).toContain("timer.pulse");
    expect(layerSrc).toContain("data-timer-kind={timer.kind}");
  });

  it("collects via getNextCollectableSectionIndex and shows +1 сек only after success", () => {
    expect(layerSrc).toContain("getNextCollectableSectionIndex");
    expect(layerSrc).toContain("api.collectV2RootSection");
    expect(layerSrc).toContain("spawnFloater");
    expect(layerSrc).toContain("+1 сек");
    // floater after successful response, not in catch
    const successIdx = layerSrc.indexOf("onRootsChange(normalizeV2Roots");
    const floaterIdx = layerSrc.indexOf("spawnFloater(event)");
    const catchIdx = layerSrc.indexOf("} catch (err)");
    expect(successIdx).toBeGreaterThan(-1);
    expect(floaterIdx).toBeGreaterThan(successIdx);
    expect(floaterIdx).toBeLessThan(catchIdx);
  });

  it("blocks only the in-flight root, not the whole system", () => {
    expect(layerSrc).toContain("collectingRootsRef.current.has(rootIndex)");
    expect(layerSrc).toContain("collectingRootIndices={collectingRoots}");
  });
});

describe("collect floater animation CSS", () => {
  it("defines +1 сек float keyframes without layout impact", () => {
    const css = readFileSync(join(here, "../bank.css"), "utf8");
    expect(css).toContain(".v2-root-collect-floater");
    expect(css).toContain("v2-root-collect-float");
    expect(css).toContain("pointer-events: none");
    expect(css).toMatch(/translate\(-50%, -16px\)/);
  });

  it("shows capsule timer styles matching growth-timer pattern", () => {
    const css = readFileSync(join(here, "../bank.css"), "utf8");
    const block = css.slice(
      css.indexOf(".v2-root-timer-side {"),
      css.indexOf("@keyframes v2-root-timer-capsule-pulse"),
    );
    expect(block).toContain("display: block");
    expect(block).not.toContain("display: none");
    expect(css).toContain(".v2-root-timer-capsule");
    expect(css).toContain(".v2-root-timer-capsule__fill");
    expect(css).toContain(".v2-root-timer-capsule__time");
    expect(css).toContain("v2-root-timer-capsule-pulse");
    // icon lives inside capsule (no external row)
    expect(css).toContain(".v2-root-timer-icon");
    expect(css).not.toContain(".v2-root-timer-row");
    expect(block).toContain("gap: 5px");
    expect(block).toContain("width: 10px");
    expect(block).toContain("fill: none");
    expect(block).toContain('[data-timer-kind="hidden"]');
    // old under-bar track removed
    expect(css).not.toContain(".v2-root-timer-side__bar {");
    expect(css).not.toContain(".v2-root-timer-side__bar-fill");
    expect(css).not.toContain("v2-root-timer-bar-pulse");
    // contrast: dark text vs light fill (growth-timer palette)
    expect(css).toContain("color: #166534");
    expect(css).toContain("rgba(134, 239, 172");
    expect(css).not.toContain("до +1 сек");
    expect(css).not.toContain("Накопление приостановлено");
  });
});

describe("in-flight double collect guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("getNextCollectableSectionIndex stays stable while tip bit still set", () => {
    const mask = buildReadyMaskFromSections([12, 13, 14]);
    expect(getNextCollectableSectionIndex(0, mask)).toBe(14);
    // Simulate server clearing tip after first collect
    const after = buildReadyMaskFromSections([12, 13]);
    expect(getNextCollectableSectionIndex(0, after)).toBe(13);
  });
});
