import type { Router } from "express";
import { pool } from "@workspace/db";
import {
  buildV3EffectiveCapacityBreakdown,
  normalizeV3BasePresetSeconds,
  resolveV3CurrentVisitDay,
} from "../services/economy-v3-effective-capacity";
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
 * Advance visit day by 1 using 1-based currentVisitDay SoT.
 *
 * streak_days ≤ 0 and streak_days = 1 both mean visit day 1 — a naive
 * streak+1 from 0 stays on day 1 / effective 21. Debug must bump visit day.
 */
export function nextDebugVisitStreakDays(streakDaysRaw: unknown): number {
  const currentVisitDay = resolveV3CurrentVisitDay(streakDaysRaw);
  return currentVisitDay + 1;
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
        `SELECT streak_days, v3_daily_cap_seconds
         FROM game_state WHERE user_id = $1`,
        [gameUserId],
      );
      if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });

      const beforeStreakDays = parseInt(String(row.rows[0].streak_days), 10) || 0;
      const streakDays = nextDebugVisitStreakDays(beforeStreakDays);
      const basePresetSeconds = normalizeV3BasePresetSeconds(
        row.rows[0].v3_daily_cap_seconds,
      );
      const capacity = buildV3EffectiveCapacityBreakdown({
        basePresetSeconds,
        streakDays,
      });

      await pool.query(
        `UPDATE game_state SET streak_days = $2, last_streak_date = $3, updated_at = NOW() WHERE user_id = $1`,
        [gameUserId, streakDays, todayUTC],
      );

      if (process.env.NODE_ENV !== "production") {
        req.log.info(
          {
            userId,
            beforeStreakDays,
            afterStreakDays: streakDays,
            currentVisitDay: capacity.currentVisitDay,
            activeDailyBonusSeconds: capacity.activeDailyBonusSeconds,
            effectivePresetSeconds: capacity.effectivePresetSeconds,
          },
          "debug add-streak-day",
        );
      }

      return res.json({
        success: true,
        streakDays,
        currentVisitDay: capacity.currentVisitDay,
        activeDailyBonusSeconds: capacity.activeDailyBonusSeconds,
        basePresetSeconds: capacity.basePresetSeconds,
        effectivePresetSeconds: capacity.effectivePresetSeconds,
      });
    } catch (err) {
      req.log.error({ err }, "debug add-streak-day");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
