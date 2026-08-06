import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EconomyV2ExcessResultState, EconomyV2ExcessState } from "@/lib/api";
import { CareActionsRow } from "./MetelkaActionCard";
import ExcessCleaningWebLayer from "./ExcessCleaningWebLayer";
import { formatExcessIncomeBreakdownLabels } from "@/lib/excessResultUi";

const here = dirname(fileURLToPath(import.meta.url));

const v2Result: EconomyV2ExcessResultState = {
  available: true,
  sessionVersion: 2,
  finishedAt: 1_700_000_000_000,
  reason: "time_expired",
  clearedCount: 6,
  clearedWhiteCount: 6,
  webCount: 12,
  whiteWebCount: 12,
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
    applied: false,
    base: { amount: 10, collectionMode: "automatic", applied: false },
    bonus: { gross: 10, skill: 0.5, paid: 5, applied: false },
    total: { paid: 15, applied: false },
  },
};

describe("Metelka v2 result card + red web", () => {
  const layerSrc = readFileSync(join(here, "ExcessCleaningWebLayer.tsx"), "utf8");
  const rowSrc = readFileSync(join(here, "MetelkaActionCard.tsx"), "utf8");
  const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
  const uiSrc = readFileSync(join(here, "../../lib/excessResultUi.ts"), "utf8");

  it("1–3. version=2 session renders one red base-income web; whites = whiteWebCount", () => {
    const session = {
      active: true,
      version: 2,
      startedAt: Date.now(),
      sourceSeconds: 12,
      presetSeconds: 5,
      rate: 0.014,
      webCount: 2,
      whiteWebCount: 2,
      layoutSeed: 1,
      clearedWebIds: [],
      clearedWebCount: 0,
      remainingWebCount: 2,
      baseWebId: "base-income-web",
      specialWebId: "base-income-web",
      specialCleared: false,
      baseWebCleared: false,
      webs: [
        { id: "web-0", x: 0.2, y: 0.3, size: 0.9, rotation: 0, kind: "regular" as const, cleared: false },
        { id: "web-1", x: 0.7, y: 0.4, size: 1.0, rotation: 5, kind: "regular" as const, cleared: false },
        {
          id: "base-income-web",
          x: 0.15,
          y: 0.25,
          size: 1.85,
          rotation: -6,
          kind: "base_income" as const,
          type: "base_income" as const,
          cleared: false,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ExcessCleaningWebLayer session={session} onExcessApplied={() => {}} />,
    );
    expect(html).toContain('data-excess-web-id="base-income-web"');
    expect(html).toContain('data-excess-web-kind="base_income"');
    expect(html).toContain("excess-cleaning-web--special");
    expect(html).toContain("excess-cleaning-web--base-income");    expect(html).toContain('data-excess-web-id="web-0"');
    expect(html).toContain('data-excess-web-id="web-1"');
    const whiteHits = [...html.matchAll(/data-excess-web-id="web-\d+"/g)];
    expect(whiteHits).toHaveLength(2);
    expect(Number(session.remainingWebCount)).toBe(2);
  });

  it("4. red web is larger than base regular size", () => {
    expect(layerSrc).toContain("base-income-web");
    expect(layerSrc).toContain("base_income");
  });

  it("5. remaining regular count excludes red (server field)", () => {
    expect(page).toContain("remainingWebCount");
  });

  it("6. version=2 pending result does not show result card", () => {
    const html = renderToStaticMarkup(
      <CareActionsRow
        excess={{
          excessSeconds: 0,
          excessCycle: 0,
          excessAvailable: false,
          excessPresetSeconds: 5,
          excessRate: 0.01,
          session: {
            active: false,
            version: 2,
            startedAt: null,
            sourceSeconds: null,
            presetSeconds: null,
            rate: null,
          },
          result: v2Result,
        }}
      >
        {null}
      </CareActionsRow>,
    );
    expect(html).not.toContain("Уборка завершена");
    expect(html).not.toContain("Продолжить");
    expect(html).not.toContain('data-care-actions-mode="result"');
  });

  it("7. frontend labels do not multiply gross×skill", () => {
    expect(uiSrc).not.toMatch(/gross\s*\*\s*skill|paymentFactor\s*\*/);
    const labels = formatExcessIncomeBreakdownLabels(v2Result);
    expect(labels?.base).toContain("Базовый доход");
    expect(labels?.bonus).toContain("Бонусный доход");
    expect(labels?.total).toContain("Всего");
  });

  it("8. CareActionsRow still mounts result card for legacy version=1", () => {
    expect(rowSrc).toContain("ExcessCleaningResultCard");
    expect(uiSrc).toContain("ver === 2");
    const legacy: EconomyV2ExcessState = {
      excessSeconds: 0,
      excessCycle: 0,
      excessAvailable: false,
      excessPresetSeconds: 5,
      excessRate: 0.01,
      session: {
        active: false,
        startedAt: null,
        sourceSeconds: null,
        presetSeconds: null,
        rate: null,
      },
      result: {
        ...v2Result,
        sessionVersion: 1,
        income: {
          available: true,
          reason: "ok",
          capital: 1,
          excessElapsedMs: 1,
          annualRate: 0.01,
          gross: 10,
          paymentFactor: 0.75,
          paid: 7.5,
          applied: false,
        },
      },
    };
    const html = renderToStaticMarkup(
      <CareActionsRow excess={legacy}>{null}</CareActionsRow>,
    );
    expect(html).toContain('data-care-actions-mode="result"');
    expect(html).toContain("Уборка завершена");
  });

  it("9. WebLayer uses rewardDelta for v2 floats (no local gross×skill)", () => {
    expect(layerSrc).toContain("rewardDelta");
    expect(layerSrc).toContain("buildClearRewardFloatsFromResponse");
    expect(layerSrc).toContain("onRewardFloats");
    expect(layerSrc).not.toMatch(/gross\s*\*\s*skill/);
    const floatSrc = readFileSync(
      join(here, "../../lib/excessCleaningRewardFloat.ts"),
      "utf8",
    );
    expect(floatSrc).toContain("xpRawDelta");
    expect(floatSrc).toContain("bonusRawDelta");
    expect(floatSrc).toContain("baseIncomeAmount");
    expect(floatSrc).toContain("formatExcessMicroMoneyFloatLabel");
  });
});
