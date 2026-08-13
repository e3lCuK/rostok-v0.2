import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EconomyV2ExcessState } from "@/lib/api";
import MetelkaActionCard, {
  CareActionsRow,
  resolveMetelkaPresetSeconds,
  shouldShowMetelkaCard,
} from "./MetelkaActionCard";
import ExcessCleaningTimer from "./ExcessCleaningTimer";
import {
  computeExcessCleaningRemainingSeconds,
  isExcessCleaningMode,
} from "@/lib/excessCleaningCountdown";

const here = dirname(fileURLToPath(import.meta.url));

function careTrio() {
  return (
    <>
      <button type="button" className="action-btn-bank" aria-label="Вода">
        Вода
      </button>
      <button type="button" className="action-btn-bank" aria-label="Свет">
        Свет
      </button>
      <button type="button" className="action-btn-bank" aria-label="Удобрение">
        Удобрение
      </button>
    </>
  );
}

function GameSessionActionsParent({
  v2Excess,
}: {
  v2Excess: EconomyV2ExcessState;
}) {
  return (
    <div className="session-actions-wrap" data-game-ui="session-actions">
      <div className="session-actions">
        <CareActionsRow excess={v2Excess}>{careTrio()}</CareActionsRow>
      </div>
    </div>
  );
}

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const inactiveNone: EconomyV2ExcessState = {
  excessSeconds: 0,
  excessCycle: 0,
  excessAvailable: false,
  excessPresetSeconds: 5,
  excessRate: 0.015,
  session: {
    active: false,
    startedAt: null,
    sourceSeconds: null,
    presetSeconds: null,
    rate: null,
  },
};

const availableInactive: EconomyV2ExcessState = {
  ...inactiveNone,
  excessSeconds: 5,
  excessCycle: 5 / 60,
  excessAvailable: true,
};

const NOW = 1_700_000_000_000;

const sessionActive: EconomyV2ExcessState = {
  ...availableInactive,
  session: {
    active: true,
    startedAt: NOW,
    sourceSeconds: 5,
    presetSeconds: 5,
    rate: 0.0149,
  },
};

const sessionActiveNoAvail: EconomyV2ExcessState = {
  ...inactiveNone,
  excessSeconds: 0,
  excessAvailable: false,
  session: {
    active: true,
    startedAt: NOW,
    sourceSeconds: 5,
    presetSeconds: 5,
    rate: 0.0149,
  },
};

function withPreset(
  preset: number,
  excessSeconds = availableInactive.excessSeconds,
): EconomyV2ExcessState {
  return {
    ...availableInactive,
    excessSeconds,
    excessCycle: excessSeconds / 60,
    excessPresetSeconds: preset,
  };
}

describe("CareActionsRow — Metelka / cleaning / care", () => {
  it("1. inactive + no excess → care trio, no Metelka, no cleaning timer slot", () => {
    expect(shouldShowMetelkaCard(inactiveNone)).toBe(false);
    expect(isExcessCleaningMode(inactiveNone)).toBe(false);
    const html = renderToStaticMarkup(
      <GameSessionActionsParent v2Excess={inactiveNone} />,
    );
    expect(html).toContain('aria-label="Вода"');
    expect(html).not.toContain('data-game-metelka="true"');
    expect(html).toContain('data-care-actions-mode="care"');
  });

  it("after acknowledge with remaining excess → Metelka again, no result card", () => {
    const afterAckWithExcess: EconomyV2ExcessState = {
      ...availableInactive,
      excessSeconds: 3,
      excessAvailable: true,
      result: {
        available: false,
        finishedAt: null,
        reason: null,
        clearedCount: null,
        webCount: null,
        skill: null,
        sourceSeconds: null,
        presetSeconds: null,
        rate: null,
        xp: { max: null, raw: null, awarded: null, applied: false },
        income: {
          available: false,
          reason: "zero",
          capital: null,
          excessElapsedMs: null,
          annualRate: null,
          gross: null,
          paymentFactor: null,
          paid: null,
          applied: false,
        },
      },
    };
    expect(shouldShowMetelkaCard(afterAckWithExcess)).toBe(true);
    const html = renderToStaticMarkup(
      <GameSessionActionsParent v2Excess={afterAckWithExcess} />,
    );
    expect(html).toContain('data-care-actions-mode="metelka"');
    expect(html).toContain('data-game-metelka="true"');
    expect(html).not.toContain("Уборка завершена");
    expect(html).not.toContain("Сначала уберите избыток");
    expect(html).not.toContain('aria-label="Вода"');
  });

  it("after acknowledge with zero excess → care activities restored", () => {
    const afterAckEmpty: EconomyV2ExcessState = {
      ...inactiveNone,
      excessSeconds: 0,
      excessAvailable: false,
      result: {
        available: false,
        finishedAt: null,
        reason: null,
        clearedCount: null,
        webCount: null,
        skill: null,
        sourceSeconds: null,
        presetSeconds: null,
        rate: null,
        xp: { max: null, raw: null, awarded: null, applied: false },
        income: {
          available: false,
          reason: "zero",
          capital: null,
          excessElapsedMs: null,
          annualRate: null,
          gross: null,
          paymentFactor: null,
          paid: null,
          applied: false,
        },
      },
    };
    expect(shouldShowMetelkaCard(afterAckEmpty)).toBe(false);
    const html = renderToStaticMarkup(
      <GameSessionActionsParent v2Excess={afterAckEmpty} />,
    );
    expect(html).toContain('data-care-actions-mode="care"');
    expect(html).toContain('aria-label="Вода"');
    expect(html).not.toContain("Уборка завершена");
    expect(html).not.toContain('data-game-metelka="true"');
  });

  it("legacy result.available shows result card with Continue", () => {
    const pendingResult: EconomyV2ExcessState = {
      ...availableInactive,
      session: { ...inactiveNone.session!, active: false },
      result: {
        available: true,
        sessionVersion: 1,
        finishedAt: NOW,
        reason: "all_webs_cleared",
        clearedCount: 12,
        webCount: 12,
        skill: 1,
        sourceSeconds: 12,
        presetSeconds: 5,
        rate: 0.014,
        xp: { max: 6, raw: 6, awarded: 6, applied: true },
        income: {
          available: true,
          reason: "ok",
          capital: 100_000,
          excessElapsedMs: 3_600_000,
          annualRate: 0.014,
          gross: 10,
          paymentFactor: 1,
          paid: 10,
          applied: false,
        },
      },
    };
    const html = renderToStaticMarkup(
      <CareActionsRow excess={pendingResult}>{careTrio()}</CareActionsRow>,
    );
    expect(html).toContain("Уборка завершена");
    expect(html).toContain("Продолжить");
    expect(html).toContain('data-care-actions-mode="result"');
  });

  it("version=2 result.available does not show result card", () => {
    const pendingV2: EconomyV2ExcessState = {
      ...availableInactive,
      excessAvailable: false,
      session: { ...inactiveNone.session!, active: false, version: 2 },
      result: {
        available: true,
        sessionVersion: 2,
        finishedAt: NOW,
        reason: "time_expired",
        clearedCount: 6,
        webCount: 12,
        skill: 0.5,
        sourceSeconds: 10,
        presetSeconds: 5,
        rate: 0.014,
        xp: { max: 6, raw: 3, awarded: 3, applied: true },
        income: {
          available: true,
          reason: "ok",
          capital: 100_000,
          excessElapsedMs: 3_600_000,
          annualRate: 0.014,
          gross: 10,
          paymentFactor: 0.5,
          paid: 15,
          applied: true,
        },
      },
    };
    const html = renderToStaticMarkup(
      <CareActionsRow excess={pendingV2}>{careTrio()}</CareActionsRow>,
    );
    expect(html).not.toContain("Уборка завершена");
    expect(html).not.toContain("Продолжить");
    expect(html).not.toContain('data-care-actions-mode="result"');
  });

  it("2. excessAvailable inactive → Metelka only; Care buttons absent", () => {
    const html = renderToStaticMarkup(
      <GameSessionActionsParent v2Excess={availableInactive} />,
    );
    expect(html).toContain('data-game-metelka="true"');
    expect(html).toContain('data-care-actions-mode="metelka"');
    expect(html).not.toContain("Сначала уберите избыток");
    expect(html).not.toContain("Сначала завершите Метёлку");
    expect(html).not.toContain('aria-label="Вода"');
    expect(html).not.toContain('data-care-actions-slot="blocked-care"');
    expect(html).not.toContain('data-care-actions-slot="cleaning"');
  });

  it("careBlocksMetelka: excess available but Care awaiting «Уход» → trio, not Metelka", () => {
    const html = renderToStaticMarkup(
      <CareActionsRow excess={availableInactive} careBlocksMetelka>
        {careTrio()}
      </CareActionsRow>,
    );
    expect(html).not.toContain('data-game-metelka="true"');
    expect(html).toContain('data-care-actions-mode="care"');
    expect(html).toContain('aria-label="Вода"');
  });

  it("cleaning frozen trio: no seconds label and no activity pulse", () => {
    const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
    const cssSrc = readFileSync(join(here, "../../bank.css"), "utf8");
    expect(page).toContain("!excessCleaning");
    expect(page).toContain("Metelka cleaning: icon-only frozen grey");
    expect(cssSrc).toMatch(
      /\.action-buttons-row--cleaning[\s\S]*?\.v3-activity-reserve-seconds\s*\{[\s\S]*?display:\s*none/,
    );
    expect(cssSrc).toMatch(
      /\.action-buttons-row--cleaning[\s\S]*?\.action-btn-bank\s*\{[\s\S]*?animation:\s*none/,
    );
  });

  it("3–4. active session → Metelka hidden, care trio frozen (grey)", () => {
    expect(shouldShowMetelkaCard(sessionActive)).toBe(false);
    expect(isExcessCleaningMode(sessionActive)).toBe(true);
    const html = renderToStaticMarkup(
      <GameSessionActionsParent v2Excess={sessionActive} />,
    );
    expect(html).not.toContain('data-game-metelka="true"');
    expect(html).toContain('data-care-actions-mode="cleaning"');
    expect(html).toContain('data-care-actions-slot="cleaning-frozen"');
    expect(html).toContain('aria-label="Вода"');
    expect(html).toContain('aria-label="Свет"');
    expect(html).toContain('aria-label="Удобрение"');
  });

  it("cleaning mode: left actions column is out of hit-testing", () => {
    const css = readFileSync(join(here, "../../bank.css"), "utf8");
    const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
    expect(css).toMatch(
      /\.session-actions-wrap--cleaning[\s\S]*?pointer-events:\s*none/,
    );
    expect(css).toMatch(
      /\.action-buttons-row--cleaning\s*\{[\s\S]*?pointer-events:\s*none/,
    );
    expect(page).toContain("session-actions-wrap--cleaning");
    expect(page).toContain("excessCleaning ? \" session-actions-wrap--cleaning\"");
  });

  it("cobweb layer stacks above session-actions-wrap during cleaning", () => {
    const css = readFileSync(join(here, "../../bank.css"), "utf8");
    const wrapZ = css.match(
      /\.session-actions-wrap\s*\{[^}]*z-index:\s*(\d+)/,
    );
    const webZ = css.match(
      /\.excess-cleaning-web-layer\s*\{[^}]*z-index:\s*(\d+)/,
    );
    expect(wrapZ?.[1]).toBe("15");
    expect(Number(webZ?.[1])).toBeGreaterThan(15);
  });

  it("active + excessAvailable=false → still cleaning, frozen care trio", () => {
    const html = renderToStaticMarkup(
      <GameSessionActionsParent v2Excess={sessionActiveNoAvail} />,
    );
    expect(html).toContain('data-care-actions-mode="cleaning"');
    expect(html).toContain('data-care-actions-slot="cleaning-frozen"');
    expect(html).toContain('aria-label="Удобрение"');
  });

  it("after reset → care returns", () => {
    const html = renderToStaticMarkup(
      <GameSessionActionsParent v2Excess={inactiveNone} />,
    );
    expect(html).toContain('aria-label="Вода"');
  });

  it("never both Metelka card and interactive care mode", () => {
    for (const excess of [
      inactiveNone,
      availableInactive,
      sessionActive,
      sessionActiveNoAvail,
    ]) {
      const html = renderToStaticMarkup(
        <GameSessionActionsParent v2Excess={excess} />,
      );
      const hasMetelka = html.includes('data-game-metelka="true"');
      const hasInteractiveCare =
        html.includes('data-care-actions-mode="care"') &&
        html.includes('aria-label="Вода"');
      expect(hasMetelka && hasInteractiveCare).toBe(false);
    }
  });

  it("GamePage start wiring + cleaning timer mount", () => {
    const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
    expect(page).toContain("CareActionsRow");
    expect(page).toContain("handleStartMetelka");
    expect(page).toContain("startEconomyV2ExcessSession");
    expect(page).toContain("ExcessCleaningTimer");
    expect(page).toContain("hideEnergyTimer={excessCleaning}");
    expect(page).toContain("frozen={excessCleaning}");
    expect(page).toContain(
      "useUndergroundRootsScene && tutorialDone && !excessCleaning",
    );
    expect(page).toContain("excess_session_already_active");
    expect(page).toContain("excess_not_available");
  });
});

describe("ExcessCleaningTimer display", () => {
  const timerSrc = readFileSync(join(here, "ExcessCleaningTimer.tsx"), "utf8");
  const layerSrc = readFileSync(join(here, "RootEnergyLayer.tsx"), "utf8");

  it("1. inactive session → no timer markup", () => {
    const html = renderToStaticMarkup(
      <ExcessCleaningTimer
        session={{
          active: false,
          startedAt: null,
          sourceSeconds: null,
          presetSeconds: null,
          rate: null,
        }}
      />,
    );
    expect(html).toBe("");
  });

  it("2 / 5 / 7. active → timer from startedAt + preset (F5 mid)", () => {
    const startedAt = 1_700_000_000_000;
    const now = startedAt + 6_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    const session = {
      active: true as const,
      startedAt,
      sourceSeconds: 10,
      presetSeconds: 10,
      rate: 0.01,
    };
    expect(computeExcessCleaningRemainingSeconds(session)).toBe(4);

    const html = renderToStaticMarkup(<ExcessCleaningTimer session={session} />);
    expect(html).toContain('data-excess-cleaning-timer="true"');
    expect(html).toContain('data-excess-cleaning-remaining="4"');
    expect(html).toContain('aria-label="До завершения уборки: 4 секунд"');
    expect(visibleText(html)).toBe("4");
    nowSpy.mockRestore();
  });

  it("8–10. at zero stays 0; no auto-reset wiring in timer", () => {
    const session = {
      active: true as const,
      startedAt: Date.now() - 60_000,
      sourceSeconds: 5,
      presetSeconds: 5,
      rate: 0.01,
    };
    expect(computeExcessCleaningRemainingSeconds(session)).toBe(0);
    const html = renderToStaticMarkup(<ExcessCleaningTimer session={session} />);
    expect(html).toContain('data-excess-cleaning-remaining="0"');
    expect(html).toContain("excess-cleaning-timer-capsule--zero");
    expect(timerSrc).not.toContain("resetSession");
    expect(timerSrc).not.toContain("fetch(");
    expect(timerSrc).not.toContain("api.");
  });

  it("11. RootEnergyLayer can hide energy timer", () => {
    expect(layerSrc).toContain("hideEnergyTimer");
    expect(layerSrc).toContain('kind: "hidden"');
  });

  it("12–13. start error / already_active handled in GamePage", () => {
    const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
    const startFn = page.slice(
      page.indexOf("async function handleStartMetelka"),
      page.indexOf("async function handleStartV2Care"),
    );
    expect(startFn).toContain("startEconomyV2ExcessSession");
    expect(startFn).toContain("excess_not_available");
    expect(startFn).toContain("excess_session_already_active");
    expect(startFn).toContain("api.getState()");
    expect(startFn).toContain("normalizeV2Excess");
  });

  it("14. interval cleared on unmount", () => {
    expect(timerSrc).toContain("setInterval");
    expect(timerSrc).toContain("clearInterval");
    expect(timerSrc).toMatch(/return \(\) => \{\s*window\.clearInterval/);
  });

  it("15. visible label has no сек / уборка words", () => {
    const session = {
      active: true as const,
      startedAt: Date.now(),
      sourceSeconds: 5,
      presetSeconds: 5,
      rate: 0.01,
    };
    const html = renderToStaticMarkup(<ExcessCleaningTimer session={session} />);
    const text = visibleText(html);
    expect(text).not.toMatch(/сек/);
    expect(text).not.toContain("уборка");
    expect(text).toMatch(/^\d+$/);
  });
});

describe("MetelkaActionCard visual — button fill + Brush", () => {
  const cardSrc = readFileSync(join(here, "MetelkaActionCard.tsx"), "utf8");
  const css = readFileSync(join(here, "../../bank.css"), "utf8");

  it("uses Brush; solid fill from economy excessPresetSeconds", () => {
    expect(cardSrc).toContain('import { Brush } from "lucide-react"');
    expect(cardSrc).toContain('data-metelka-btn-fill="true"');
    expect(cardSrc).toContain("metelka-action-fill");
    expect(cardSrc).toContain("resolveMetelkaPresetSeconds");
    expect(cardSrc).toContain("metelkaFillProgress(presetSeconds)");
    expect(cardSrc).toContain("fillPercentCss");
    const html = renderToStaticMarkup(
      <MetelkaActionCard excess={availableInactive} />,
    );
    expect(html).toContain('data-metelka-icon="brush"');
    expect(html).toContain("metelka-action-fill");
    // availableInactive: excessPresetSeconds 5 → 1/22 ≈ 4.5%
    expect(html).toContain("height:4.5%");
    expect(html).toContain('data-metelka-visual-preset="5"');
    expect(html).not.toContain("metelka-icon__fill-clip");
  });

  it("active excess does not render Metelka card", () => {
    const html = renderToStaticMarkup(
      <MetelkaActionCard excess={sessionActive} />,
    );
    expect(html).toBe("");
  });

  it("fill follows excessPresetSeconds, not excessSeconds ledger", () => {
    // Large ledger with stale/small T still fills from T.
    const htmlLedger = renderToStaticMarkup(
      <MetelkaActionCard excess={withPreset(5, 2500)} />,
    );
    expect(htmlLedger).toContain("height:4.5%");
    expect(htmlLedger).toContain('data-metelka-visual-preset="5"');

    for (const [preset, pct, visual] of [
      [5, "4.5%", "5"],
      [6, "9.1%", "6"],
      [11, "31.8%", "11"],
      [20, "72.7%", "20"],
      [25, "95.5%", "25"],
    ] as const) {
      const html = renderToStaticMarkup(
        <MetelkaActionCard excess={withPreset(preset, 5)} />,
      );
      expect(html).toContain(`height:${pct}`);
      expect(html).toContain(`data-metelka-visual-preset="${visual}"`);
    }
  });

  it("resolveMetelkaPresetSeconds locks to frozen session while active", () => {
    const liveHighButFrozenLow: EconomyV2ExcessState = {
      ...withPreset(25, 3690),
      session: {
        active: true,
        startedAt: NOW,
        sourceSeconds: 3690,
        presetSeconds: 5,
        rate: 0.0149,
      },
    };
    expect(resolveMetelkaPresetSeconds(liveHighButFrozenLow)).toBe(5);
    expect(resolveMetelkaPresetSeconds(withPreset(25, 3690))).toBe(25);
  });

  it("rerender updates fill when excessPresetSeconds changes", () => {
    expect(cardSrc).not.toMatch(
      /data-metelka-btn-fill[\s\S]{0,80}key=\{/,
    );
    const first = renderToStaticMarkup(
      <MetelkaActionCard excess={withPreset(6, 60)} />,
    );
    expect(first).toContain("height:9.1%");
    expect(first).toContain('data-metelka-fill="0.091"');

    const second = renderToStaticMarkup(
      <MetelkaActionCard excess={withPreset(11, 200)} />,
    );
    expect(second).toContain("height:31.8%");
    expect(second).toContain('data-metelka-fill="0.318"');
    expect(second).not.toContain("height:9.1%");
  });

  it("css keeps cleaning slot + Metelka timer-contrast wash", () => {
    expect(css).toContain("excess-cleaning-timer");
    expect(css).toContain("action-buttons-row-cleaning-frozen");
    expect(css).toContain(".metelka-action-fill");
    expect(css).toMatch(/\.metelka-action-fill[\s\S]*?bottom:\s*0/);
    // Opaque --ac rim + light --ac-wash (not rim RGB).
    expect(css).toMatch(
      /\.metelka-action-fill[\s\S]*?background:\s*var\(--ac-wash/,
    );
    expect(css).toMatch(
      /\.metelka-icon\s*\{[\s\S]*?color:\s*inherit/,
    );
    expect(css).toMatch(
      /\.metelka-icon\s*\{[\s\S]*?drop-shadow\(0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.55\)/,
    );
    expect(cardSrc).toContain("V3_METELKA_RIM");
    expect(cardSrc).toContain("V3_METELKA_WASH");
    expect(cardSrc).toContain("--ac-wash");
  });
});
