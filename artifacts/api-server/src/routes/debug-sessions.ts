import type { Router } from "express";
import { pool } from "@workspace/db";
import { areDebugRoutesEnabled } from "./debug-enabled";

const COOLDOWN_MS = 8 * 60 * 60 * 1000;
/** Past cooldown enough to unlock, but under 2× so client additionalMissed stays 0. */
const UNLOCK_SLACK_MS = 60_000;

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

function clientAdditionalMissed(lastSessionTime: number | null, now: number): number {
  if (lastSessionTime == null) return 0;
  const elapsed = now - lastSessionTime;
  return Math.max(0, Math.floor(elapsed / COOLDOWN_MS) - 1);
}

function isLocked(lastSessionTime: number | null, now: number): boolean {
  if (lastSessionTime == null) return false;
  return now - lastSessionTime < COOLDOWN_MS;
}

/** Local-only: restore POST /api/game/debug/add-sessions for the debug panel. */
export function registerDebugSessionsRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post("/game/debug/add-sessions", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;

    try {
      const gameRow = await pool.query(
        `SELECT missed_sessions, last_session_time, session_in_progress
         FROM game_state WHERE user_id = $1`,
        [String(userId)],
      );
      if (gameRow.rows.length === 0) return res.status(404).json({ error: "Not found" });

      const g = gameRow.rows[0];
      const now = Date.now();
      const currentMissed = parseInt(g.missed_sessions, 10) || 0;
      const lastBefore = g.last_session_time != null ? parseInt(g.last_session_time, 10) : null;
      const lockedBefore = isLocked(lastBefore, now);
      const additionalBefore = clientAdditionalMissed(lastBefore, now);

      // What the player actually sees: timer (0) while locked, else ×storedSessions.
      const visibleStoredBefore = lockedBefore
        ? 0
        : 1 + currentMissed + additionalBefore;
      const targetVisibleStored = visibleStoredBefore + 1;

      // After unlock, additionalMissed must be 0 → stored = 1 + missed.
      const newMissedSessions = Math.max(0, targetVisibleStored - 1);
      const lastSessionTime = now - COOLDOWN_MS - UNLOCK_SLACK_MS;
      const additionalAfter = clientAdditionalMissed(lastSessionTime, now);
      const visibleStoredAfter = 1 + newMissedSessions + additionalAfter;

      await pool.query(
        `UPDATE game_state SET
           missed_sessions = $2,
           last_session_time = $3,
           session_in_progress = FALSE,
           current_session_water = FALSE,
           current_session_sun = FALSE,
           current_session_fertilizer = FALSE,
           updated_at = NOW()
         WHERE user_id = $1`,
        [String(userId), newMissedSessions, lastSessionTime],
      );

      if (process.env.NODE_ENV !== "production") {
        req.log.info(
          {
            lockedBefore,
            visibleStoredBefore,
            currentMissed,
            additionalBefore,
            targetVisibleStored,
            newMissedSessions,
            visibleStoredAfter,
          },
          "debug add-sessions",
        );
      }

      return res.json({
        success: true,
        missedSessions: newMissedSessions,
        lastSessionTime,
        storedSessions: visibleStoredAfter,
      });
    } catch (err) {
      req.log.error({ err }, "debug add-sessions");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
