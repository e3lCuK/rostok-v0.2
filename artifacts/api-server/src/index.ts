import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

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
