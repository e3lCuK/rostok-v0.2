import type { Router } from "express";
import { pool } from "@workspace/db";
import { areDebugRoutesEnabled } from "./debug-enabled";

function requireAuth(req: any, res: any, next: any) {
  const raw = req.session?.userId;
  if (raw == null || raw === "") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
}

/** Local-only: reset-growth + reset-tutorial for the debug panel. */
export function registerDebugResetRoutes(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post("/game/debug/reset-growth", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const gameUserId = String(userId);

    try {
      const result = await pool.query(
        `UPDATE game_state SET
           tree_growth_mm = 0,
           tree_growth_remainder = 0,
           updated_at = NOW()
         WHERE user_id = $1`,
        [gameUserId],
      );
      if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });

      if (process.env.NODE_ENV !== "production") {
        req.log.info({ userId }, "debug reset-growth");
      }

      return res.json({ success: true, treeGrowthMM: 0, treeGrowthRemainder: 0 });
    } catch (err) {
      req.log.error({ err }, "debug reset-growth");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * Wipe account progress then land in live play with tutorial skipped
   * (sprout planted, capital on chest, tutorial_done=true). One click for
   * local testing without replaying onboarding + tutorial.
   */
  router.post("/game/debug/reset-tutorial", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const gameUserId = String(userId);
    const capital = 100_000;
    const now = Date.now();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query("DELETE FROM income_history WHERE user_id = $1", [
        userId,
      ]);
      await client.query("DELETE FROM game_state WHERE user_id = $1", [
        gameUserId,
      ]);
      await client.query("DELETE FROM accounts WHERE user_id = $1", [userId]);

      // Post-tutorial chest: starting capital + small demo earned row (type tutorial).
      await client.query(
        `INSERT INTO accounts(
           user_id, standard_balance, active_balance, vault_balance,
           standard_earned, active_earned, total_days_earned,
           start_date, starting_capital
         )
         VALUES($1, 0, $2, 0, 0, 1, 0, $3, $4)`,
        [userId, capital + 1, now, capital],
      );
      await client.query(
        `INSERT INTO income_history(user_id, amount, type, earned_date)
         VALUES ($1, 1, 'tutorial', CURRENT_DATE)`,
        [userId],
      );
      await client.query(
        `INSERT INTO game_state(
           user_id, last_session_time, session_in_progress,
           current_session_water, current_session_sun, current_session_fertilizer,
           pending_base_reward, pending_bonus_reward,
           tutorial_done, sprout_planted,
           tree_growth_mm, tree_growth_remainder, total_apples, total_sessions,
           streak_days, last_streak_date,
           v2_energy_anchor_at, v2_root_generation_progress, v2_root_ready_mask,
           v3_generation_progress, v3_generation_anchor_at,
           v2_excess_seconds, v2_excess_elapsed_ms, v2_excess_base_income
         )
         VALUES(
           $1, NULL, FALSE,
           FALSE, FALSE, FALSE,
           0, 0,
           TRUE, TRUE,
           1, 0, 1, 0,
           0, NULL,
           $2, 0, '0',
           0, $3,
           0, 0, 0
         )`,
        [gameUserId, now, new Date(now)],
      );

      await client.query("COMMIT");

      if (process.env.NODE_ENV !== "production") {
        req.log.info({ userId }, "debug reset-tutorial");
      }

      return res.json({ success: true, tutorialDone: true, sproutPlanted: true });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      req.log.error({ err }, "debug reset-tutorial");
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  });
}
