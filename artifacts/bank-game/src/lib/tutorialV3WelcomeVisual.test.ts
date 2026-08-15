/**
 * Tutorial welcome + root-pulse visuals (no mechanics changes).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  nextV3TutorialStepAfterRootTransfer,
  tutorialHighlightRoot,
  v3TutorialOverlayConfig,
} from "./tutorialFlow";
import { isV3TutorialActivitiesInteractionLocked } from "./tutorialFlow";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");
const rootSrc = readFileSync(
  join(here, "../components/v2/EconomyV3RootSystem.tsx"),
  "utf8",
);

describe("tutorial v3 welcome + root pulse visuals", () => {
  it("1–2. welcome title and tree icon (same asset as complete)", () => {
    expect(pageSrc).toContain(">Ухаживайте за деревом<");
    expect(pageSrc).not.toContain("Как ухаживать за деревом");
    expect(pageSrc).not.toContain(">Уход за деревом<");
    // Outline TreePine — same stroke language as Droplets / Sun / FertilizerIcon
    expect(pageSrc).toMatch(
      /tutorial-welcome-icon[\s\S]{0,160}<TreePine size=\{48\} strokeWidth=\{2\.25\}/,
    );
    expect(pageSrc).toMatch(
      /tutorial-complete-icon[\s\S]{0,160}<TreePine size=\{48\} strokeWidth=\{2\.25\}/,
    );
    expect(pageSrc).not.toMatch(
      /tutorial-welcome-icon[^>]*>🌳<\/span>/,
    );
    expect(pageSrc).not.toMatch(
      /tutorial-welcome-icon[\s\S]{0,120}<Shovel/,
    );
    expect(pageSrc).not.toMatch(
      /tutorial-welcome-icon[^>]*>\s*🌱/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-icon\s*\{[\s\S]*?font-size:\s*2\.8rem/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-complete-icon\s*\{[\s\S]*?font-size:\s*2\.8rem/,
    );
  });

  it("3–4. welcome is icon + paragraph steps (no numbered list)", () => {
    expect(pageSrc).toContain("tutorial-welcome-steps");
    expect(pageSrc).toContain("tutorial-welcome-step-icon");
    expect(pageSrc).toContain("Посадите росток");
    expect(pageSrc).toContain("Красная колба");
    expect(pageSrc).toContain("Перенесите капитал из сейфа");
    expect(pageSrc).not.toContain("Нажмите фиолетовые часы у колбы");
    expect(pageSrc).toContain("созреет энергия");
    expect(pageSrc).toContain("Соберите энергию из корней");
    expect(pageSrc).toContain("Пройдите активности");
    expect(pageSrc).toContain("Завершите уход");
    expect(pageSrc).toContain("Заберите награды");
    expect(pageSrc).toContain("<Clock size={20}");
    expect(pageSrc).toContain("TUTORIAL_PLAN_ICON_COLORS.energyBase");
    expect(pageSrc).toContain("tutorial-welcome-flask-icon");
    expect(pageSrc).toContain("tutorial-welcome-vault-icon");
    expect(pageSrc).toContain("<Zap size={20}");
    expect(pageSrc).toContain("<Shovel size={20}");
    expect(pageSrc).toContain("<Gift size={20}");
    expect(pageSrc).not.toContain("Три вида активности");
    expect(pageSrc).not.toContain("Полив — ловить капли");
    expect(pageSrc).not.toContain("tutorial-welcome-games");
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-desc\s*\{[\s\S]*?text-align:\s*left/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-card\s*\{[\s\S]*?text-align:\s*center/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-title\s*\{[\s\S]*?text-align:\s*center/,
    );
    expect(cssSrc).toContain(".tutorial-welcome-step-icon");
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-steps\s*\{[\s\S]*?grid-template-columns:\s*20px/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-step\s*\{[\s\S]*?display:\s*contents/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-step-icon\s*\{[\s\S]*?width:\s*20px/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-step-icon svg\s*\{[\s\S]*?width:\s*20px/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-step-icon--trio\s*\{[\s\S]*?overflow:\s*visible/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-step-icon--trio svg:nth-child\(1\)/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-step-icon--trio svg:nth-child\(2\)/,
    );
    expect(cssSrc).toMatch(
      /\.tutorial-welcome-step-icon--trio svg:nth-child\(3\)/,
    );
  });

  it("5–7. intro wait card; root collect has energy card + pulse (no outline)", () => {
    expect(v3TutorialOverlayConfig("intro")?.text).toBe(
      "Нажмите на значок времени",
    );
    expect(v3TutorialOverlayConfig("intro")?.hint).toContain(
      "ускорят формирование энергии в обучении",
    );
    expect(cssSrc).toContain("v3-tutorial-fast-fill-blink");
    expect(cssSrc).toMatch(
      /\.v3-tutorial-fast-fill-btn\s*\{[\s\S]*?color:\s*#7c3aed/,
    );
    expect(cssSrc).toMatch(
      /\.v3-tutorial-fast-fill-btn\s*\{[\s\S]*?--v3-fast-fill-size:\s*12px/,
    );
    expect(cssSrc).toContain("stroke-width: var(--v3-hourglass-rim-width");
    expect(cssSrc).toMatch(
      /\.v3-tutorial-fast-fill-btn svg circle\s*\{[\s\S]*?fill:\s*#fff8ec/,
    );
    expect(cssSrc).toMatch(
      /\.v3-tutorial-fast-fill-btn svg line\s*\{/,
    );
    expect(cssSrc).toMatch(
      /\.v3-tutorial-fast-fill-btn\s*\{[\s\S]*?box-shadow:\s*none/,
    );
    expect(cssSrc).toMatch(
      /\.v3-tutorial-fast-fill-btn\s*\{[\s\S]*?background:\s*transparent/,
    );
    expect(cssSrc).not.toMatch(
      /\.v3-tutorial-fast-fill-btn\s*\{[^}]*box-shadow:\s*0 0/,
    );
    for (const step of [
      "v3-root-water",
      "v3-root-sun",
      "v3-root-fertilizer",
    ] as const) {
      expect(v3TutorialOverlayConfig(step)?.icon).toBe("energy");
      expect(v3TutorialOverlayConfig(step)?.text).toBe(
        "Соберите энергию из корней",
      );
      expect(v3TutorialOverlayConfig(step)?.hint).toBe(
        "Нажмите на корневые ячейки по очереди.",
      );
    }
    expect(cssSrc).toMatch(
      /\.v3-root--tutorial-pulse\s*\{[\s\S]*?outline:\s*none/,
    );
    expect(cssSrc).not.toMatch(
      /\.v3-root--tutorial-pulse\s*\{[^}]*outline:\s*2px solid/,
    );
    expect(cssSrc).not.toMatch(
      /\.game-area--v3-roots \.v3-root--tutorial-pulse\s*\{[^}]*outline:\s*2px solid/,
    );
  });

  it("8–10. pulse only on highlighted root; advances / clears with steps", () => {
    expect(tutorialHighlightRoot("v3-root-water")).toBe("water");
    expect(tutorialHighlightRoot("v3-root-sun")).toBe("sun");
    expect(tutorialHighlightRoot("v3-root-fertilizer")).toBe("fertilizer");
    expect(tutorialHighlightRoot("v3-activities-intro")).toBeNull();
    expect(nextV3TutorialStepAfterRootTransfer("water")).toBe("v3-root-sun");
    expect(nextV3TutorialStepAfterRootTransfer("sun")).toBe(
      "v3-root-fertilizer",
    );
    expect(nextV3TutorialStepAfterRootTransfer("fertilizer")).toBe(
      "v3-activities-intro",
    );
    expect(rootSrc).toContain("collectPulseKind");
    expect(rootSrc).toContain("v3-root--tutorial-pulse");
    // Per-cell contour pulse (smaller scale than activity buttons).
    expect(cssSrc).toContain("v3-root-collect-pulse");
    expect(cssSrc).toMatch(
      /\.v3-root--tutorial-pulse \.v3-root-segment\s*\{[\s\S]*?v3-root-collect-pulse/,
    );
    expect(cssSrc).toMatch(
      /@keyframes v3-root-collect-pulse[\s\S]*?scale\(1\.02\)/,
    );
  });

  it("11. activities stay locked during root steps", () => {
    expect(isV3TutorialActivitiesInteractionLocked("v3-root-water", false)).toBe(
      true,
    );
    expect(isV3TutorialActivitiesInteractionLocked("v3-root-sun", false)).toBe(
      true,
    );
    expect(
      isV3TutorialActivitiesInteractionLocked("v3-root-fertilizer", false),
    ).toBe(true);
    expect(
      isV3TutorialActivitiesInteractionLocked("v3-activities-intro", false),
    ).toBe(false);
  });

  it("12. reduced-motion uses static per-cell contour", () => {
    expect(cssSrc).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?\.v3-root--tutorial-pulse \.v3-root-segment[\s\S]*?animation:\s*none[\s\S]*?box-shadow:/,
    );
  });

  it("13. tutorial + live use blink pulse (recommend); step only gates clicks", () => {
    expect(rootSrc).toContain(
      'tutorialPulse && !metelkaLocked ? "v3-root--tutorial-pulse" : ""',
    );
    expect(rootSrc).toContain("recommendedV3RootToCollect");
    expect(rootSrc).toContain("collectPulseKind");
    expect(rootSrc).toContain("V3_ROOT_COLLECT_PULSE_MIN_SECONDS");
    // Pulse is recommendation-only — not gated on clickable (same as activities).
    expect(rootSrc).not.toContain(
      "collectPulseKind === kind && clickable && !metelkaLocked",
    );
    expect(pageSrc).toContain(
      "!tutorialDone ? tutorialHighlightRoot(tutorialStep) : null",
    );
  });

  it("14. capital + tree info are locked until tutorialDone", () => {
    expect(pageSrc).toContain("onCapitalClick=");
    expect(pageSrc).toMatch(
      /onCapitalClick=\{\s*\n?\s*tutorialDone\s*&&[\s\S]*?setShowDepositInfo\(true\)[\s\S]*?:\s*undefined/,
    );
    expect(pageSrc).toContain("tree-wrapper--tutorial-locked");
    expect(pageSrc).toContain("if (!tutorialDone) return;");
    expect(pageSrc).toContain("setShowTreeInfo(true)");
    expect(cssSrc).toContain(".tree-wrapper--tutorial-locked");
    expect(cssSrc).toMatch(
      /\.tree-wrapper--tutorial-locked[\s\S]*?pointer-events:\s*none/,
    );
  });
});
