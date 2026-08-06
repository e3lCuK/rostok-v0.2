/**
 * Round-robin Economy v2 energy split across Care activities.
 * Order: water → sun → fertilizer → water → …
 */
export type ActivityEnergyAllocation = {
  water: number;
  sun: number;
  fertilizer: number;
};

export type CareActivity = keyof ActivityEnergyAllocation;

const CARE_ORDER: readonly CareActivity[] = ["water", "sun", "fertilizer"];

/** Even integer split of totalSeconds (floor); remainder goes water, then sun. */
export function distributeEnergyEvenly(totalSeconds: number): ActivityEnergyAllocation {
  const safeTotal = Math.max(0, Math.floor(totalSeconds));
  const base = Math.floor(safeTotal / 3);
  const remainder = safeTotal % 3;

  return {
    water: base + (remainder >= 1 ? 1 : 0),
    sun: base + (remainder >= 2 ? 1 : 0),
    fertilizer: base,
  };
}

/**
 * Round-robin among a subset of activities (same priority order).
 * Used when mid-session some activities are already done.
 */
export function distributeEnergyAmong(
  totalSeconds: number,
  activities: readonly CareActivity[],
): ActivityEnergyAllocation {
  const safeTotal = Math.max(0, Math.floor(totalSeconds));
  const result: ActivityEnergyAllocation = { water: 0, sun: 0, fertilizer: 0 };
  const ordered = CARE_ORDER.filter((a) => activities.includes(a));
  if (ordered.length === 0 || safeTotal === 0) return result;

  for (let i = 0; i < safeTotal; i++) {
    result[ordered[i % ordered.length]] += 1;
  }
  return result;
}

/**
 * Live allocation from current energy + done flags.
 * UI lock/presets must always derive from this — never a frozen session snapshot.
 */
export function computeLiveAllocation(
  totalSeconds: number,
  done: { water: boolean; sun: boolean; fertilizer: boolean },
): ActivityEnergyAllocation {
  const remaining: CareActivity[] = [];
  if (!done.water) remaining.push("water");
  if (!done.sun) remaining.push("sun");
  if (!done.fertilizer) remaining.push("fertilizer");
  if (remaining.length === 0) return { water: 0, sun: 0, fertilizer: 0 };
  if (remaining.length === 3) return distributeEnergyEvenly(totalSeconds);
  return distributeEnergyAmong(totalSeconds, remaining);
}
