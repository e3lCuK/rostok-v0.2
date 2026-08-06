import { Router } from "express";
import {
  completeEconomyV2CareActivity,
  EconomyV2CareError,
  finishEconomyV2Care,
  startEconomyV2Care,
} from "../services/economy-v2-care";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

function sendCareError(res: any, err: unknown, log: any, label: string) {
  if (err instanceof EconomyV2CareError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  log.error({ err }, label);
  return res.status(500).json({ error: "Internal server error" });
}

/**
 * POST /api/game/v2/care/start
 *
 * Production Economy v2 Care start. Independent of ENABLE_DEBUG_ROUTES.
 * Snapshots allocation; does not spend energy; does not touch v1 session fields.
 */
router.post("/game/v2/care/start", requireAuth, async (req: any, res) => {
  try {
    const result = await startEconomyV2Care(req.userId);
    return res.json(result);
  } catch (err) {
    return sendCareError(res, err, req.log, "Error starting v2 care");
  }
});

/**
 * POST /api/game/v2/care/activity
 *
 * Atomically completes one Care activity:
 * settle → spend snapshot cost → save result → award XP → (on 3rd) pending rewards.
 *
 * Body: { cycleId, activity, result: { skillScore, collected?, maximum? } }
 * Client must NOT pass seconds / cost / XP / money.
 *
 * HTTP status contract:
 * - 400 invalid cycleId / activity / result
 * - 409 inactive/mismatched cycle, invalid allocation, insufficient energy
 * - 404 missing game_state
 * - 200 success or idempotent repeat (first result wins; spentSeconds=0)
 */
router.post("/game/v2/care/activity", requireAuth, async (req: any, res) => {
  try {
    const { cycleId, activity, result } = req.body ?? {};
    const out = await completeEconomyV2CareActivity(
      req.userId,
      cycleId,
      activity,
      result,
    );
    return res.json(out);
  } catch (err) {
    return sendCareError(res, err, req.log, "Error completing v2 care activity");
  }
});

/**
 * POST /api/game/v2/care/finish
 *
 * Clears Care snapshot after all three activities. No XP / rewards / growth.
 * Repeat finish of an inactive cycle → 409 cycle_not_active.
 */
router.post("/game/v2/care/finish", requireAuth, async (req: any, res) => {
  try {
    const { cycleId } = req.body ?? {};
    const result = await finishEconomyV2Care(req.userId, cycleId);
    return res.json(result);
  } catch (err) {
    return sendCareError(res, err, req.log, "Error finishing v2 care");
  }
});

export default router;
