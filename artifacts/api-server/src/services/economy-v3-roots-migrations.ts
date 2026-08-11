/**
 * Idempotent runtime SQL for Economy v3 root / reserve storage.
 * Applied from server startup (`index.ts`); safe to re-run.
 */

export const ECONOMY_V3_ROOT_MIGRATION_SQL: readonly string[] = [
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_root_water_seconds NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_root_sun_seconds NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_root_fertilizer_seconds NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_reserve_water_seconds NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_reserve_sun_seconds NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_reserve_fertilizer_seconds NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_daily_cap_seconds INTEGER NOT NULL DEFAULT 20`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_day_key TEXT NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_generation_anchor_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_generation_frozen_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_insurance_deadline_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_first_transferred_root TEXT NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_transferred_roots TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_generation_progress NUMERIC NOT NULL DEFAULT 0`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_activity_kind TEXT NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_activity_preset_seconds INTEGER NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_activity_started_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_activity_status TEXT NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_activity_skill NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_activity_finished_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_water_completed BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_water_preset_seconds INTEGER NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_water_skill NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_sun_completed BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_sun_preset_seconds INTEGER NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_sun_skill NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_fertilizer_completed BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_fertilizer_preset_seconds INTEGER NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_fertilizer_skill NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_started_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_completed_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_finished_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_status TEXT NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_total_preset_seconds INTEGER NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_average_skill NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_claimed_at TIMESTAMP NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_claimed_xp INTEGER NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_claimed_tree_growth INTEGER NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_claimed_base_income NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_claimed_bonus_income NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_care_cycle_claimed_total_income NUMERIC NULL`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_generation_rr_cursor INTEGER NOT NULL DEFAULT 0`,
  /** Roots-full → Metelka-before-transfer cycle markers. */
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_metelka_required BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v3_metelka_completed_for_cycle BOOLEAN NOT NULL DEFAULT FALSE`,
  /** Tutorial: tree + underground unlock after tap-to-plant. */
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS sprout_planted BOOLEAN NOT NULL DEFAULT FALSE`,
  /** Starting capital parked in vault until drag-to-chest (accounts). */
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vault_balance NUMERIC(15,2) NOT NULL DEFAULT 0`,
];

export type EconomyV3MigrationClient = {
  query: (text: string) => Promise<unknown>;
};

export async function applyEconomyV3RootMigrations(
  client: EconomyV3MigrationClient,
): Promise<void> {
  for (const sql of ECONOMY_V3_ROOT_MIGRATION_SQL) {
    await client.query(sql);
  }
}
