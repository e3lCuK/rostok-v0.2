import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const timerSrc = readFileSync(
  join(here, "../components/v2/V3RootWaitTimer.tsx"),
  "utf8",
);
const hourSrc = readFileSync(
  join(here, "../components/v2/V3WaitTimerHourglass.tsx"),
  "utf8",
);
const modalSrc = readFileSync(
  join(here, "../components/v2/FlaskIncomeHelpModal.tsx"),
  "utf8",
);

describe("flask income help modal", () => {
  it("wires upper flask hit → help modal after tutorial", () => {
    expect(hourSrc).toContain('data-flask-help-hit="true"');
    expect(hourSrc).toContain("onHelpClick");
    expect(timerSrc).toContain("onHelpClick={onHelpClick}");
    expect(pageSrc).toContain("setShowFlaskIncomeHelp(true)");
    expect(pageSrc).toContain("FlaskIncomeHelpModal");
  });

  it("explains red base wait, gold main income and grey excess backlog", () => {
    expect(modalSrc).toContain("Красная колба");
    expect(modalSrc).toContain("Базовое время");
    expect(modalSrc).toContain("Золотая колба");
    expect(modalSrc).toContain("Серая колба");
    expect(modalSrc).toContain("Основной доход");
    expect(modalSrc).toContain("Метелкой");
    expect(modalSrc).toContain("Три цвета колбы");
    expect(modalSrc.indexOf("Красная колба")).toBeLessThan(
      modalSrc.indexOf("Золотая колба"),
    );
    expect(modalSrc).toContain("flask-help-head");
    expect(modalSrc).toContain("flask-help-copy");
    expect(modalSrc).toContain("flask-help-modal");
    const artSrc = readFileSync(
      join(here, "../components/v2/FlaskHelpMiniArt.tsx"),
      "utf8",
    );
    expect(artSrc).toContain('type Tone = "red" | "gold" | "grey"');
    expect(artSrc).toContain("#b4533a");
  });
});
