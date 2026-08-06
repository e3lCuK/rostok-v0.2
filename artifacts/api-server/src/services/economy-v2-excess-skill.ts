/**
 * Excess Metelka cleaning Skill (GDD).
 * Skill_excess = clearedWebCount / webCount, clamped to [0, 1].
 */

/** Pure Skill from cleared / total webs. No speed/accuracy/time factors. */
export function computeExcessCleaningSkill(
  clearedCount: number,
  webCount: number,
): number {
  const cleared = Number(clearedCount);
  const total = Number(webCount);
  if (!Number.isFinite(cleared) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const raw = Math.max(0, cleared) / total;
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

export type ExcessFinishReason = "time_expired" | "all_webs_cleared";

export function isExcessFinishReason(raw: unknown): raw is ExcessFinishReason {
  return raw === "time_expired" || raw === "all_webs_cleared";
}
