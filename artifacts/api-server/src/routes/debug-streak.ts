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

/** Local-only: POST /api/game/debug/add-streak-day for the debug panel. */
export function registerDebugStreakRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post("/game/debug/add-streak-day", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const gameUserId = String(userId);
    const todayUTC = new Date().toISOString().slice(0, 10);

    try {
      const row = await pool.query(
        "SELECT streak_days FROM game_state WHERE user_id = $1",
        [gameUserId],
      );
      if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });

      const beforeStreakDays = parseInt(row.rows[0].streak_days, 10) || 0;
      // Cap matches gameplay streak bonus (getStreakBonusSeconds max 5).
      const streakDays = Math.min(beforeStreakDays + 1, 5);

      await pool.query(
        `UPDATE game_state SET streak_days = $2, last_streak_date = $3, updated_at = NOW() WHERE user_id = $1`,
        [gameUserId, streakDays, todayUTC],
      );

      if (process.env.NODE_ENV !== "production") {
        req.log.info(
          { userId, beforeStreakDays, afterStreakDays: streakDays },
          "debug add-streak-day",
        );
      }

      return res.json({ success: true, streakDays });
    } catch (err) {
      req.log.error({ err }, "debug add-streak-day");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
