import type { Router } from "express";
import { pool } from "@workspace/db";
import { areDebugRoutesEnabled } from "./debug-enabled";

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

/** Same thresholds as session completion in game.ts / bank-game levels.ts. */
function calcLevel(xp: number): number {
  if (xp >= 5000) return 5;
  if (xp >= 2500) return 4;
  if (xp >= 1000) return 3;
  if (xp >= 300) return 2;
  return 1;
}

/** Finite integer (positive, negative, or zero). Rejects floats / NaN / Infinity. */
function parseIntDelta(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

/** Local-only: add-xp / add-mm / add-apples for the debug panel. */
export function registerDebugResourcesRoutes(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post("/game/debug/add-xp", requireAuth, async (req: any, res) => {
    const userId = req.userId;
    const xp = parseIntDelta(req.body?.xp);
    if (xp === null) {
      return res.status(400).json({ error: "Invalid xp: expected finite integer" });
    }

    try {
      const row = await pool.query(
        "SELECT player_xp FROM game_state WHERE user_id = $1",
        [userId],
      );
      if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });

      const playerXP = Math.max(0, (parseInt(row.rows[0].player_xp, 10) || 0) + xp);
      const playerLevel = calcLevel(playerXP);
      await pool.query(
        `UPDATE game_state SET player_xp = $2, player_level = $3, updated_at = NOW() WHERE user_id = $1`,
        [userId, playerXP, playerLevel],
      );
      return res.json({ success: true, playerXP, playerLevel });
    } catch (err) {
      req.log.error({ err }, "debug add-xp");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/game/debug/add-mm", requireAuth, async (req: any, res) => {
    const userId = req.userId;
    const mm = parseIntDelta(req.body?.mm);
    if (mm === null) {
      return res.status(400).json({ error: "Invalid mm: expected finite integer" });
    }

    try {
      const row = await pool.query(
        "SELECT tree_growth_mm, tree_growth_remainder FROM game_state WHERE user_id = $1",
        [userId],
      );
      if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });

      const g = row.rows[0];
      // Production claim path comments "max 10000 mm" but does not clamp on write;
      // mirror that: only floor at 0. Remainder unchanged for integer deltas.
      const treeGrowthMM = Math.max(0, (parseInt(g.tree_growth_mm, 10) || 0) + mm);
      const treeGrowthRemainder = parseFloat(g.tree_growth_remainder) || 0;

      await pool.query(
        `UPDATE game_state SET tree_growth_mm = $2, tree_growth_remainder = $3, updated_at = NOW() WHERE user_id = $1`,
        [userId, treeGrowthMM, treeGrowthRemainder],
      );
      return res.json({ success: true, treeGrowthMM, treeGrowthRemainder });
    } catch (err) {
      req.log.error({ err }, "debug add-mm");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/game/debug/add-apples", requireAuth, async (req: any, res) => {
    const userId = req.userId;
    const amount = parseIntDelta(req.body?.amount);
    if (amount === null) {
      return res.status(400).json({ error: "Invalid amount: expected finite integer" });
    }

    try {
      const row = await pool.query(
        "SELECT total_apples FROM game_state WHERE user_id = $1",
        [userId],
      );
      if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });

      const totalApples = Math.max(0, (parseInt(row.rows[0].total_apples, 10) || 0) + amount);
      await pool.query(
        `UPDATE game_state SET total_apples = $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, totalApples],
      );
      return res.json({ success: true, totalApples });
    } catch (err) {
      req.log.error({ err }, "debug add-apples");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
