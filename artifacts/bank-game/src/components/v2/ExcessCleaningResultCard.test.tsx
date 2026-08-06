import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EconomyV2ExcessResultState } from "@/lib/api";
import ExcessCleaningResultCard from "./ExcessCleaningResultCard";
import { CareActionsRow } from "./MetelkaActionCard";
import { formatExcessIncomeBreakdownLabels } from "@/lib/excessResultUi";

const sampleResult: EconomyV2ExcessResultState = {
  available: true,
  sessionVersion: 2,
  finishedAt: 1_700_000_000_000,
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
    gross: 100,
    paymentFactor: 0.5,
    paid: 150,
    applied: false,
    base: { amount: 100, collectionMode: "manual", applied: false },
    bonus: { gross: 100, skill: 0.5, paid: 50, applied: false },
    total: { paid: 150, applied: false },
  },
};

describe("ExcessCleaningResultCard", () => {
  it("renders base/bonus/total and Continue", () => {
    const html = renderToStaticMarkup(
      <ExcessCleaningResultCard result={sampleResult} onContinue={() => {}} />,
    );
    expect(html).toContain("Уборка завершена");
    expect(html).toContain("Базовый доход");
    expect(html).toContain("Бонусный доход");
    expect(html).toContain("Всего");
    expect(html).toContain("Продолжить");
  });

  it("CareActionsRow mounts result card for legacy result.available", () => {
    const html = renderToStaticMarkup(
      <CareActionsRow
        excess={{
          excessSeconds: 0,
          excessCycle: 0,
          excessAvailable: false,
          excessPresetSeconds: 5,
          excessRate: 0.01,
          result: { ...sampleResult, sessionVersion: 1 },
        }}
      >
        <button type="button" aria-label="Вода">
          W
        </button>
      </CareActionsRow>,
    );
    expect(html).toContain('data-care-actions-mode="result"');
    expect(html).toContain("ExcessCleaningResultCard".slice(0, 0) + "Уборка завершена");
  });

  it("breakdown labels use server amounts", () => {
    const labels = formatExcessIncomeBreakdownLabels(sampleResult);
    expect(labels?.total).toMatch(/Всего/);
  });
});
