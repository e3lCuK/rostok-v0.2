import { Router } from "express";
import {
  transferEconomyV3Root,
  EconomyV3RootsTransferError,
} from "../services/economy-v3-roots-transfer";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

/**
 * POST /api/game/v3/roots/transfer
 *
 * Body: { root: "water" | "sun" | "fertilizer" }
 *
 * Errors:
 * - 400 unknown_root
 * - 403 feature_disabled
 * - 409 already_transferred
 * - 409 empty_root
 * - 404 not_found
 */
router.post("/game/v3/roots/transfer", requireAuth, async (req: any, res) => {
  try {
    const result = await transferEconomyV3Root(req.userId, req.body?.root);
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3RootsTransferError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error transferring v3 root");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
