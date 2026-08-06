/**
 * Growth readout to the right of the tree.
 * Click opens the player rating (leaderboard).
 */

import type { ReactNode } from "react";
import { formatTreeGrowth } from "@/lib/engine";

type Props = {
  growthMM: number;
  onClick: () => void;
  /** Optional +N мм popup anchored above the badge. */
  popup?: ReactNode;
};

function splitGrowthLabel(label: string): { value: string; unit: string } {
  const m = label.match(/^(.+?)\s+(мм|см|м)$/);
  if (m) return { value: m[1], unit: m[2] };
  return { value: label, unit: "" };
}

export default function TreeGrowthBadge({ growthMM, onClick, popup }: Props) {
  const label = formatTreeGrowth(growthMM);
  const { value, unit } = splitGrowthLabel(label);

  return (
    <div className="tree-growth-badge-host" data-tree-growth-badge-host="true">
      {popup}
      <button
        type="button"
        className="field-caption-badge tree-growth-badge"
        data-tree-growth-badge="true"
        aria-label={`Рост дерева: ${label}. Рейтинг`}
        onClick={onClick}
      >
        <span className="field-caption-value">{value}</span>
        {unit ? <span className="field-caption-unit">{unit}</span> : null}
      </button>
    </div>
  );
}
