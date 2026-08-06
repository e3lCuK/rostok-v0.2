import { Router } from "express";
import {
  collectEconomyV2RootSection,
  EconomyV2RootsCollectError,
} from "../services/economy-v2-roots-collect";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

/**
 * POST /api/game/v2/roots/collect
 *
 * Body: { sectionIndex: 0–59 }
 *
 * Errors:
 * - 400 invalid_section
 * - 403 tutorial_active
 * - 409 section_not_ready (empty / already collected — no +1)
 * - 409 energy_bank_full (section stays ready)
 * - 404 not_found
 */
router.post("/game/v2/roots/collect", requireAuth, async (req: any, res) => {
  try {
    const result = await collectEconomyV2RootSection(
      req.userId,
      req.body?.sectionIndex,
    );
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV2RootsCollectError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error collecting v2 root section");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
