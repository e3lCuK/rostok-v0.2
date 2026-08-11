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

  router.post("/game/debug/reset-tutorial", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const gameUserId = String(userId);

    try {
      // Production: tutorialDone true = finished; false → UI starts at "welcome".
      // Also re-park starting capital in the vault and clear the plant flag.
      const result = await pool.query(
        `UPDATE game_state
         SET tutorial_done = FALSE,
             sprout_planted = FALSE,
             updated_at = NOW()
         WHERE user_id = $1`,
        [gameUserId],
      );
      if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });

      await pool.query(
        `UPDATE accounts
         SET vault_balance = COALESCE(NULLIF(starting_capital, 0), 100000),
             active_balance = 0
         WHERE user_id = $1`,
        [gameUserId],
      );

      if (process.env.NODE_ENV !== "production") {
        req.log.info({ userId }, "debug reset-tutorial");
      }

      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "debug reset-tutorial");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
