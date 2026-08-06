import { Check } from "lucide-react";
import type { EconomyV2ExcessResultState } from "@/lib/api";
import {
  excessResultClearedLabel,
  formatExcessAwardedXp,
  formatExcessIncomeBreakdownLabels,
  formatExcessSkillPercent,
  resolveExcessResultContinueUi,
} from "@/lib/excessResultUi";

type Props = {
  result: EconomyV2ExcessResultState;
  onContinue: () => void;
  /** True only while a real HTTP request (e.g. acknowledge) is in flight. */
  loading?: boolean;
};

/**
 * Compact Metelka result card — server Skill + XP + base/bonus/total.
 * Continue is enabled while result.available; acknowledge credits + dismisses.
 */
export default function ExcessCleaningResultCard({
  result,
  onContinue,
  loading = false,
}: Props) {
  if (!result.available) return null;

  const skillPct = formatExcessSkillPercent(result.skill);
  const perfect = Number(result.skill) >= 1;
  const xpLabel = formatExcessAwardedXp(result.xp?.awarded);
  const income = formatExcessIncomeBreakdownLabels(result);
  const continueUi = resolveExcessResultContinueUi({ result, loading });

  return (
    <div
      className="excess-cleaning-result-card"
      data-excess-result-card="true"
      data-excess-result-loading={continueUi.loading ? "true" : "false"}
      data-excess-result-version={result.sessionVersion ?? ""}
      role="status"
      aria-live="polite"
    >
      <div className="excess-cleaning-result-title">Уборка завершена</div>
      <div
        className="excess-cleaning-result-cleared"
        data-excess-result-cleared="true"
      >
        {excessResultClearedLabel(result)}
      </div>
      <div
        className="excess-cleaning-result-skill"
        data-excess-result-skill="true"
      >
        {perfect && (
          <Check
            className="excess-cleaning-result-check"
            size={18}
            strokeWidth={2.25}
            aria-hidden="true"
          />
        )}
        <span data-excess-result-skill-value="true">{skillPct}</span>
      </div>
      <div className="excess-cleaning-result-xp" data-excess-result-xp="true">
        {xpLabel}
      </div>
      {income && (
        <div
          className="excess-cleaning-result-income"
          data-excess-result-income="true"
        >
          <div data-excess-result-income-base="true">{income.base}</div>
          <div data-excess-result-income-bonus="true">{income.bonus}</div>
          <div data-excess-result-income-total="true">{income.total}</div>
        </div>
      )}
      <button
        type="button"
        className={[
          "excess-cleaning-result-continue",
          continueUi.loading ? "excess-cleaning-result-continue--loading" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-excess-result-continue="true"
        disabled={continueUi.disabled}
        aria-busy={continueUi.loading ? "true" : undefined}
        onClick={onContinue}
      >
        {continueUi.label}
      </button>
    </div>
  );
}
