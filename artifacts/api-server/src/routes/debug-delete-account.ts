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
 * Local-only: DELETE /api/game/debug/reset-all
 * Permanently deletes the current user and related rows, then ends the session
 * (same cookie/session teardown as POST /auth/logout).
 */
export function registerDebugDeleteAccountRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.delete("/game/debug/reset-all", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const gameUserId = String(userId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Child tables first (password_reset_tokens also has ON DELETE CASCADE on users).
      await client.query("DELETE FROM income_history WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM game_state WHERE user_id = $1", [gameUserId]);
      await client.query("DELETE FROM accounts WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);

      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      req.log.error({ err }, "debug reset-all");
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }

    if (process.env.NODE_ENV !== "production") {
      req.log.info({ userId, accountDeleted: true }, "debug reset-all");
    }

    // express-session / connect-pg-simple: no user_id column — destroy like /auth/logout
    try {
      await new Promise<void>((resolve, reject) => {
        req.session.destroy((destroyErr: Error | null) => {
          if (destroyErr) reject(destroyErr);
          else resolve();
        });
      });
    } catch (destroyErr) {
      req.log.error({ err: destroyErr }, "debug reset-all session destroy");
      return res.status(500).json({ error: "Internal server error" });
    }

    res.clearCookie("sid");
    return res.json({ success: true });
  });
}
