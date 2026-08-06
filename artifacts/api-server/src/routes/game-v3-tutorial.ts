/**
 * POST /api/game/tutorial/v3/prepare
 *
 * Idempotent tutorial root grant for Economy v3 (5s per root).
 * Does not touch excess / income / Care rewards.
 */

import { Router } from "express";
import {
  EconomyV3TutorialError,
  grantTutorialV3Roots,
} from "../services/economy-v3-tutorial";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

router.post("/game/tutorial/v3/prepare", requireAuth, async (req: any, res) => {
  try {
    const result = await grantTutorialV3Roots(req.userId);
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3TutorialError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error preparing v3 tutorial roots");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
