import type { Router } from "express";
import { pool } from "@workspace/db";
import { calculateEconomyV2Preview } from "../services/economy-v2-preview";

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

/**
 * Local-only read-only preview for economy v2.
 * Register behind ENABLE_DEBUG_ROUTES in routes/index.ts - not wired yet.
 * GET /api/game/debug/economy-v2-preview
 */
export function registerDebugEconomyV2PreviewRoute(router: Router) {
  router.get("/game/debug/economy-v2-preview", requireAuth, async (req: any, res) => {
    const userId = req.userId as string;

    try {
      const [accRow, gameRow] = await Promise.all([
        pool.query(
          "SELECT active_balance FROM accounts WHERE user_id = $1",
          [userId],
        ),
        pool.query(
          "SELECT last_session_time FROM game_state WHERE user_id = $1",
          [userId],
        ),
      ]);

      if (accRow.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Account not found",
        });
      }

      const capital = Number(accRow.rows[0].active_balance);

      let lastSessionTime: Date | null = null;
      if (gameRow.rows.length > 0 && gameRow.rows[0].last_session_time != null) {
        lastSessionTime = new Date(Number(gameRow.rows[0].last_session_time));
      }

      const currentTime = new Date();
      const preview = calculateEconomyV2Preview({
        capital,
        lastSessionTime,
        currentTime,
      });

      const lastSessionTimeIso =
        lastSessionTime != null && Number.isFinite(lastSessionTime.getTime())
          ? lastSessionTime.toISOString()
          : null;

      return res.json({
        success: true,
        source: {
          capital,
          lastSessionTime: lastSessionTimeIso,
          currentTime: currentTime.toISOString(),
        },
        preview,
      });
    } catch (err) {
      req.log.error({ err }, "debug economy-v2-preview");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
