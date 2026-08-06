import { Brush } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { EconomyV2ExcessState, EconomyV3RootsState } from "@/lib/api";
import { isExcessCleaningMode } from "@/lib/excessCleaningCountdown";
import { isExcessResultAvailable } from "@/lib/excessResultUi";
import { metelkaFillProgress, metelkaVisualPresetSeconds } from "@/lib/metelkaFillProgress";
import { shouldShowMetelkaCardWithV3Gate } from "@/lib/v3MetelkaUi";
import ExcessCleaningResultCard from "./ExcessCleaningResultCard";

export type MetelkaActionCardProps = {
  excess?: EconomyV2ExcessState | null;
  /** When enabled, Metelka card uses metelkaCycle / rootsFull (not reserves). */
  v3Roots?: EconomyV3RootsState | null;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * Clickable Metelka card — only while excess is available and session is inactive.
 * Hidden while cleaning or while a legacy finish result is pending.
 * With v3 enabled, also requires roots-full Metelka cycle (not bank=60).
 */
export function shouldShowMetelkaCard(
  excess?: EconomyV2ExcessState | null,
  v3Roots?: EconomyV3RootsState | null,
): boolean {
  return shouldShowMetelkaCardWithV3Gate({ excess, v3Roots });
}

export { shouldShowMetelkaCard as showMetelkaFromExcess };
export { isExcessCleaningMode };

/**
 * Preset for Metelka duration + icon fill on the main screen:
 * lock to session.presetSeconds while active, otherwise live excessPresetSeconds.
 * Never floor(excessSeconds) — ledger is unlimited; T comes from n.
 */
export function resolveMetelkaPresetSeconds(
  excess?: EconomyV2ExcessState | null,
): number | null {
  if (!excess) return null;
  if (excess.session?.active === true) {
    const locked = Number(excess.session.presetSeconds);
    if (Number.isFinite(locked) && locked > 0) return locked;
  }
  const live = Number(excess.excessPresetSeconds);
  return Number.isFinite(live) && live > 0 ? live : null;
}

/** Live excess ledger game-seconds (unlimited). Not the Metelka duration. */
export function resolveMetelkaExcessSeconds(
  excess?: EconomyV2ExcessState | null,
): number {
  if (!excess) return 0;
  const n = Number(excess.excessSeconds);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

type CareActionsRowProps = {
  excess?: EconomyV2ExcessState | null;
  /** Live v3 snapshot — gates Metelka card via excessGate when enabled. */
  v3Roots?: EconomyV3RootsState | null;
  /** Apply activities-disabled only when care trio is shown (not Metelka). */
  careActivitiesLocked?: boolean;
  /**
   * Ordinary Care mid-cycle / awaiting «Уход» / unclaimed Care pending.
   * Excess alone must not replace the Care row in that case.
   */
  careBlocksMetelka?: boolean;
  metelkaDisabled?: boolean;
  onMetelkaClick?: () => void;
  resultContinueBusy?: boolean;
  onResultContinue?: () => void;
  /** Water / Sun / Fertilizer buttons — omitted from DOM when Metelka shows. */
  children: ReactNode;
};

/**
 * Ready-row slot:
 * - legacy pending result → result card;
 * - available Metelka → card (unless Care cycle blocks it);
 * - active cleaning → empty placeholder (no care trio);
 * - otherwise → care activities.
 * Version=2 never enters result mode (finish settles immediately).
 *
 * Active Metelka session stays in cleaning mode even if v3 rootsFull / cycle
 * flags later change.
 */
export function CareActionsRow({
  excess,
  v3Roots = null,
  careActivitiesLocked = false,
  careBlocksMetelka = false,
  metelkaDisabled = false,
  onMetelkaClick,
  resultContinueBusy = false,
  onResultContinue,
  children,
}: CareActionsRowProps) {
  const cleaning = isExcessCleaningMode(excess);
  const resultPending = isExcessResultAvailable(excess);
  const showMetelka =
    !careBlocksMetelka && shouldShowMetelkaCard(excess, v3Roots);
  const rowClass = [
    "action-buttons-row",
    showMetelka || cleaning || resultPending
      ? "action-buttons-row--metelka"
      : "",
    cleaning ? "action-buttons-row--cleaning" : "",
    resultPending ? "action-buttons-row--result" : "",
    !showMetelka && !cleaning && !resultPending && careActivitiesLocked
      ? "activities-disabled"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const mode = resultPending
    ? "result"
    : cleaning
      ? "cleaning"
      : showMetelka
        ? "metelka"
        : "care";

  return (
    <div className={rowClass} data-care-actions-mode={mode}>
      {resultPending && excess?.result ? (
        <ExcessCleaningResultCard
          result={excess.result}
          loading={resultContinueBusy}
          onContinue={() => onResultContinue?.()}
        />
      ) : cleaning ? (
        <div
          className="action-buttons-row-cleaning-slot"
          data-care-actions-slot="cleaning"
          aria-hidden="true"
        />
      ) : showMetelka ? (
        <MetelkaActionCard
          excess={excess}
          v3Roots={v3Roots}
          disabled={metelkaDisabled}
          onClick={onMetelkaClick}
        />
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Production Metelka card — replaces Water/Sun/Fertilizer while available.
 * Fill tracks derived T_excess (excessPresetSeconds from ledger n), not the ledger itself.
 */
export default function MetelkaActionCard({
  excess,
  v3Roots = null,
  onClick,
  disabled = false,
}: MetelkaActionCardProps) {
  if (!shouldShowMetelkaCard(excess, v3Roots)) return null;

  const clickable = !disabled;
  const presetSeconds = resolveMetelkaPresetSeconds(excess);
  const visualPreset =
    presetSeconds != null ? metelkaVisualPresetSeconds(presetSeconds) : null;
  const fillRatio =
    presetSeconds != null ? metelkaFillProgress(presetSeconds) : 0;
  const fillPercent = Math.round(fillRatio * 1000) / 10;
  const fillPercentCss = `${fillPercent}%`;

  const ariaLabel =
    presetSeconds != null
      ? `Метёлка, доступно ${presetSeconds} секунд`
      : "Метёлка";

  return (
    <button
      type="button"
      className="action-btn-bank metelka-action-btn"
      data-game-metelka="true"
      data-metelka-status="available"
      data-metelka-fill={fillRatio.toFixed(3)}
      data-metelka-fill-percent={String(fillPercent)}
      data-metelka-visual-preset={
        visualPreset != null ? String(visualPreset) : ""
      }
      style={{ "--ac": "#44403c" } as CSSProperties}
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-label={ariaLabel}
    >
      <div
        className="metelka-action-fill"
        data-metelka-btn-fill="true"
        aria-hidden="true"
        style={{ height: fillPercentCss }}
      />
      <div className="action-btn-top metelka-action-content">
        <Brush
          className="metelka-icon"
          size={16}
          strokeWidth={2.25}
          data-metelka-icon="brush"
          aria-hidden="true"
        />
      </div>
    </button>
  );
}
