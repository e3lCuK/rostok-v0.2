import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARE_TO_SHOVEL_MS } from "./careActionsPhase";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../bank.css"), "utf8");
const page = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const motionSrc = readFileSync(join(here, "careConvergeMotion.ts"), "utf8");

describe("Care converge animation — Framer Motion merge into «Уход»", () => {
  it("1. GamePage drives trio/shovel via careConvergeMotion helpers", () => {
    expect(page).toContain("careTrioConvergeAnimate");
    expect(page).toContain("careShovelConvergeAnimate");
    expect(page).toContain("careShovelFillPercent");
    // Tutorial «Уход» uses the same quality fill as live — not forced empty.
    expect(page).not.toContain(
      '!tutorialDone && tutorialStep === "complete" ? null',
    );
    // Timer contrast on «Уход»: wash under rim + shovel = rim color.
    expect(css).toMatch(
      /\.care-btn \.action-btn-fill\s*\{[\s\S]*?background:\s*var\(--ac-wash/,
    );
    expect(css).toMatch(
      /\.care-btn > svg\s*\{[\s\S]*?color:\s*inherit/,
    );
    expect(css).toMatch(
      /\.care-btn > svg\s*\{[\s\S]*?drop-shadow\(0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.55\)/,
    );
    expect(page).toContain("careTrioConvergeTransition");
    expect(page).toContain('data-care-shovel-converge={merging ? "true"');
    expect(page).toContain("MotionConfig reducedMotion=\"never\"");
  });

  it("2. continuous tween — no mid keyframe times (avoids stall→jerk)", () => {
    expect(motionSrc).not.toContain("times:");
    expect(motionSrc).toContain("SLIDE_PX");
    expect(motionSrc).toContain("careTrioConvergeTransition");
    expect(CARE_TO_SHOVEL_MS).toBeGreaterThanOrEqual(600);
  });

  it("3. shovel stays in flow with spacers; trio overlays during merge", () => {
    expect(page).toContain("showCareShovelUi || merging");
    expect(page).toContain("!showCareShovelUi || merging");
    expect(page).toContain("Spacers always on");
    expect(css).toMatch(
      /\.session-actions--converging\s+\.action-buttons-row--converging\s*\{[\s\S]*?position:\s*absolute/,
    );
  });

  it("4. CSS must not force opacity:0 on converging cubes (kills merge)", () => {
    // Exact 0 only — do not match fill opacity: 0.55
    expect(css).not.toMatch(
      /\.action-buttons-row--converging\s+\.action-btn-bank[^{]*\{[^}]*opacity:\s*0\s*[;!]/,
    );
    expect(css).not.toMatch(
      /prefers-reduced-motion: reduce[\s\S]{0,200}action-buttons-row--converging[\s\S]{0,120}opacity:\s*0\s*!important/,
    );
  });

  it("5. transition runs once via care_transition phase / converging class", () => {
    expect(page).toContain("action-buttons-row--converging");
    expect(page).toContain("data-care-converge");
    expect(page).toContain("carePhaseIsConverging");
  });

  it("6. Tutorial and main game share the same converge path", () => {
    expect(page).toContain("beginV3CareTrioConverge");
    expect(page).toContain("v3LiveConvergeRef");
    expect(page).not.toMatch(/tutorial-.*converging|converging-tutorial/);
  });

  it("8. «Уход» → trio uses beginCareShovelDiverge (not instant ghost)", () => {
    expect(page).toContain("function beginCareShovelDiverge");
    expect(page).toContain("beginCareShovelDiverge()");
    expect(page).toContain("careTrioDivergeInitial");
    expect(page).toContain("session-actions--diverging");
    expect(page).toContain("CARE_DIVERGE_MS");
    // Live Care + tutorial both call diverge instead of bare setShowActivityGhost(true)
    expect(page).toMatch(
      /setTimeout\(\(\) => beginCareShovelDiverge\(\),\s*800\)/,
    );
    expect(page).toContain("TUTORIAL_CARE_GHOST_DELAY_MS");
  });

  it("9. diverge cubes are already inactive (used) — muted ghost shell", () => {
    expect(page).toContain(
      "action-buttons-row--diverging activities-disabled",
    );
    expect(page).toContain(
      "Diverge = already-used cubes (same muted ghost shell)",
    );
    expect(page).toContain("!careDiverging && (careDone || fillTarget != null)");
  });
});



