import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { applyEconomyV3RootMigrations } from "./services/economy-v3-roots-migrations";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrations() {
  if (process.env.CLEAR_DB_ON_START === "true") {
    await pool.query(`TRUNCATE TABLE income_history, game_state, accounts, users, "session", password_reset_tokens RESTART IDENTITY CASCADE`);
    logger.info("DB полностью очищена по CLEAR_DB_ON_START");
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      nickname VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS missed_sessions INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS pending_stored_sessions INT NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS pending_base_reward NUMERIC NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS pending_bonus_reward NUMERIC NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS player_xp INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS player_level SMALLINT NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS session_water_score SMALLINT NOT NULL DEFAULT 40`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS session_sun_score SMALLINT NOT NULL DEFAULT 40`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS session_fertilizer_score SMALLINT NOT NULL DEFAULT 40`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS xp_history JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens (token)`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS last_streak_date TEXT`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_apples INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_sessions INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_login_days INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_water_drops INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_sun_catches INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_leaf_picks INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS claimed_achievements JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS last_login_date TEXT`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS purchased_items JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS tutorial_done BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_energy_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_energy_anchor_at BIGINT`);
  // Economy v2 settle needs a fractional bank so sub-second accrual is not lost.
  await pool.query(
    `ALTER TABLE game_state
     ALTER COLUMN v2_energy_seconds TYPE NUMERIC
     USING COALESCE(v2_energy_seconds::numeric, 0)`,
  );
  await pool.query(
    `ALTER TABLE game_state
     ALTER COLUMN v2_energy_seconds SET DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state
     ALTER COLUMN v2_energy_seconds SET NOT NULL`,
  );
  // Economy v2 Care cycle snapshot (independent from v1 session_* fields).
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_in_progress BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_cycle_id TEXT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_water_seconds INTEGER NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_sun_seconds INTEGER NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_fertilizer_seconds INTEGER NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_water_completed BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_sun_completed BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_fertilizer_completed BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_started_at BIGINT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_water_score INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_sun_score INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_care_fertilizer_score INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_income_anchor_at BIGINT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_freshness NUMERIC NOT NULL DEFAULT 1`,
  );
  // Root energy: matured sections mask + fractional generation progress.
  // Existing v2_energy_seconds stays as collected Care bank (not moved into roots).
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_root_ready_mask BIGINT NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_root_generation_progress NUMERIC NOT NULL DEFAULT 0`,
  );
  // Excess beyond ordinary 60-capacity (t_excess). Separate from bank / roots.
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_seconds NUMERIC NOT NULL DEFAULT 0`,
  );
  // Base 12% APR accrued only on excess-period wall-clock (not Care pending).
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_base_income NUMERIC NOT NULL DEFAULT 0`,
  );
  // Ordinary Care financial elapsed accumulator (excludes excess share).
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_ordinary_income_elapsed_ms NUMERIC NOT NULL DEFAULT 0`,
  );
  // Active Metelka (broom) attempt snapshot — frozen at start; excess not deducted yet.
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_active BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_started_at BIGINT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_source_seconds NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_preset_seconds INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_rate NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_web_count INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_layout_seed BIGINT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_cleared_web_ids TEXT[] NOT NULL DEFAULT '{}'`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_finished_at BIGINT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_finish_reason TEXT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_final_cleared_count INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_final_web_count INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_skill NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_xp_max NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_xp_raw NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_xp_awarded INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_xp_applied BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  // Real wall-clock ms while energy overflowed into excess (t_excess financial time).
  // NUMERIC: proportional shares of elapsed can be fractional; not reconstructed from capital.
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_elapsed_ms NUMERIC NOT NULL DEFAULT 0`,
  );
  // Metelka financial snapshot + income preview (income_applied stays false until payout stage).
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_capital NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_source_elapsed_ms NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_gross_income NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_payment_factor NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_paid_income NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_income_applied BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  // Metelka session version=2: base-income red web + finish pending result + ack payout.
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_version INTEGER`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_base_income NUMERIC`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_base_web_cleared BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_base_web_collection_mode TEXT NULL`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_base_income_applied BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  // Metelka version=2 per-click rewards: cumulative raw bonus share unlocked
  // by white-web clears this session (visual/accounting; not yet credited).
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS v2_excess_session_bonus_raw_unlocked NUMERIC NOT NULL DEFAULT 0`,
  );

  // Separate Metelka pending reward (not Care pending_* / claimAll).
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS metelka_pending_active BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS metelka_pending_base NUMERIC NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS metelka_pending_bonus NUMERIC NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS metelka_pending_xp INTEGER NOT NULL DEFAULT 0`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS metelka_pending_created_at BIGINT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS metelka_pending_claim_token TEXT`,
  );
  await pool.query(
    `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS metelka_pending_claimed_at BIGINT`,
  );

  // Economy v3 roots + activity reserves (storage only; flag-gated snapshot).
  await applyEconomyV3RootMigrations(pool);

  // Mark all existing users as tutorial done (only new inserts start with FALSE)
  await pool.query(`UPDATE game_state SET tutorial_done = TRUE WHERE tutorial_done = FALSE AND last_session_time IS NOT NULL`);
  await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS starting_capital NUMERIC(15,2) NOT NULL DEFAULT 0`);
  await pool.query(`
    UPDATE accounts
    SET starting_capital = GREATEST(0, (standard_balance - standard_earned) + (active_balance - active_earned))
    WHERE starting_capital = 0
      AND (standard_balance + active_balance) > 0
  `);
  // Consolidate standard_balance into active_balance (remove split-account logic)
  await pool.query(`
    UPDATE accounts
    SET active_balance = active_balance + standard_balance,
        active_earned  = active_earned  + standard_earned,
        standard_balance = 0,
        standard_earned  = 0
    WHERE standard_balance > 0
  `);
  logger.info("DB migrations applied");
}

runMigrations()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed, aborting startup");
    process.exit(1);
  });
