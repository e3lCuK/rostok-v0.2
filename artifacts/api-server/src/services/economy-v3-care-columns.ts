/**
 * Shared SELECT columns for Economy v3 Care session + Care cycle journal.
 */

export const V3_CARE_SESSION_SELECT_COLUMNS = `
  v3_care_activity_kind,
  v3_care_activity_preset_seconds,
  v3_care_activity_started_at,
  v3_care_activity_status,
  v3_care_activity_skill,
  v3_care_activity_finished_at
`;

export const V3_CARE_CYCLE_SELECT_COLUMNS = `
  v3_care_cycle_water_completed,
  v3_care_cycle_water_preset_seconds,
  v3_care_cycle_water_skill,
  v3_care_cycle_sun_completed,
  v3_care_cycle_sun_preset_seconds,
  v3_care_cycle_sun_skill,
  v3_care_cycle_fertilizer_completed,
  v3_care_cycle_fertilizer_preset_seconds,
  v3_care_cycle_fertilizer_skill,
  v3_care_cycle_started_at,
  v3_care_cycle_completed_at,
  v3_care_cycle_finished_at,
  v3_care_cycle_status,
  v3_care_hold_excess,
  v3_care_cycle_total_preset_seconds,
  v3_care_cycle_average_skill,
  v3_care_cycle_claimed_at,
  v3_care_cycle_claimed_xp,
  v3_care_cycle_claimed_tree_growth,
  v3_care_cycle_claimed_base_income,
  v3_care_cycle_claimed_bonus_income,
  v3_care_cycle_claimed_total_income
`;

/** Read-only v2 income fields for Care rewardPreview (no writes). */
export const V3_CARE_REWARD_CONTEXT_SELECT_COLUMNS = `
  v2_income_anchor_at,
  v2_freshness,
  v2_ordinary_income_elapsed_ms
`;

export const V3_CARE_SESSION_AND_CYCLE_SELECT_COLUMNS = `
  ${V3_CARE_SESSION_SELECT_COLUMNS.trim()},
  ${V3_CARE_CYCLE_SELECT_COLUMNS.trim()},
  ${V3_CARE_REWARD_CONTEXT_SELECT_COLUMNS.trim()}
`;
