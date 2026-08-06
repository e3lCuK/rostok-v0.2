import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARE_TO_SHOVEL_MS } from "./careActionsPhase";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../bank.css"), "utf8");
const page = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");

describe("Care converge animation — no bounce / spring", () => {
  it("1. care_transition CSS has no scale keyframe that returns to 1", () => {
    const convergingBlock = css.match(
      /\.action-buttons-row--converging\s+\.action-btn-bank\s*\{[^}]+\}/,
    );
    expect(convergingBlock?.[0]).toBeTruthy();
    expect(convergingBlock?.[0]).toMatch(/scale\(0\.8[2-8]\)|scale\(0\.85\)/);
    // Must not animate via 1 → 0.8 → 1 style keyframes on converging cubes
    expect(css).not.toMatch(
      /@keyframes\s+care-converge[\s\S]*scale\(1\)[\s\S]*scale\(0\.\d+\)[\s\S]*scale\(1\)/,
    );
  });

  it("2. cubes only move to a reduced end scale (monotonic)", () => {
    expect(css).toMatch(
      /\.action-buttons-row--converging\s+\.action-btn-bank\s*\{[^}]*transform:\s*scale\(0\.85\)/,
    );
    expect(css).toMatch(
      /transition:\s*[\s\S]*transform\s+var\(--care-converge-duration/,
    );
    expect(CARE_TO_SHOVEL_MS).toBeGreaterThanOrEqual(300);
    expect(CARE_TO_SHOVEL_MS).toBeLessThanOrEqual(400);
  });

  it("3. «Уход» enter is opacity (+ tiny scale), not spring/bounce", () => {
    expect(css).toMatch(/@keyframes\s+care-btn-appear/);
    expect(css).toMatch(
      /care-btn-appear[\s\S]*from\s*\{[^}]*opacity:\s*0[^}]*scale\(0\.97\)/,
    );
    expect(css).toMatch(
      /care-btn-appear[\s\S]*to\s*\{[^}]*opacity:\s*1[^}]*scale\(1\)/,
    );
    expect(page).not.toMatch(
      /care-btn[\s\S]{0,200}type:\s*[\"']spring[\"']/,
    );
    expect(page).toContain("care-btn--from-converge");
  });

  it("4. after converge starts, cubes fade out — no snap back to scale 1", () => {
    const block = css.match(
      /\.action-buttons-row--converging\s+\.action-btn-bank\s*\{[^}]+\}/,
    )?.[0];
    expect(block).toMatch(/opacity:\s*0/);
    expect(block).not.toMatch(/scale\(1\)/);
  });

  it("5. transition runs once via care_transition phase / converging class", () => {
    expect(page).toContain("action-buttons-row--converging");
    expect(page).toContain("data-care-converge");
    expect(page).toContain("carePhaseIsConverging");
  });

  it("6. fill stays on cubes during converge (fill rule under converging)", () => {
    expect(css).toMatch(
      /\.action-buttons-row--converging\s+\.action-btn-bank\s+\.action-btn-fill/,
    );
  });

  it("7. Tutorial and main game share the same converge / shovel classes", () => {
    expect(page).toContain("action-buttons-row--converging");
    expect(page).toContain("action-buttons-row--care-shovel");
    expect(page).toContain("care-btn--from-converge");
    // Single session-actions branch — no separate tutorial converge animation
    expect(page).not.toMatch(/tutorial-.*converging|converging-tutorial/);
  });
});
