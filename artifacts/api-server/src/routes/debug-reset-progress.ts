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

/**
 * Local-only: DELETE /api/game/reset-progress
 *
 * Leaves the user logged in but without a selected account — same as after
 * auth and before POST /game/init. Frontend shows OnboardingPage when
 * GET /game/state returns { exists: false } (no accounts row).
 */
export function registerDebugResetProgressRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.delete("/game/reset-progress", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const gameUserId = String(userId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query("DELETE FROM income_history WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM game_state WHERE user_id = $1", [gameUserId]);
      await client.query("DELETE FROM accounts WHERE user_id = $1", [userId]);

      await client.query("COMMIT");

      if (process.env.NODE_ENV !== "production") {
        req.log.info(
          { userId, gameStateReset: true, accountValuesReset: true },
          "debug reset-progress",
        );
      }

      return res.json({ success: true });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      req.log.error({ err }, "debug reset-progress");
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  });
}
