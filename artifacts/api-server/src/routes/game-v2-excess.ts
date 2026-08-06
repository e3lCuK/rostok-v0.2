import { Router } from "express";
import {
  EconomyV2ExcessSessionError,
  startEconomyV2ExcessSession,
} from "../services/economy-v2-excess-session";
import { clearEconomyV2ExcessWeb } from "../services/economy-v2-excess-web-clear";
import { finishEconomyV2ExcessSession } from "../services/economy-v2-excess-finish";
import { acknowledgeEconomyV2ExcessResult } from "../services/economy-v2-excess-acknowledge";
import { claimMetelkaPendingReward } from "../services/economy-v2-excess-metelka-claim";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

function sendExcessSessionError(res: any, err: unknown, log: any, label: string) {
  if (err instanceof EconomyV2ExcessSessionError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  log?.error({ err }, label);
  return res.status(500).json({ error: "Internal server error" });
}

/**
 * POST /api/game/v2/excess/start
 *
 * Starts one Metelka attempt when excess ≥ 5 and no session is active.
 * Settles Economy v2 first; freezes source/preset/rate/baseIncome; does not deduct.
 * New sessions are version=2.
 */
router.post("/game/v2/excess/start", requireAuth, async (req: any, res) => {
  try {
    const result = await startEconomyV2ExcessSession(req.userId);
    return res.json(result);
  } catch (err) {
    return sendExcessSessionError(
      res,
      err,
      req.log,
      "Error starting v2 excess session",
    );
  }
});

/**
 * POST /api/game/v2/excess/webs/clear
 *
 * Version=2: record-only — append white webId to cleared list; no awards.
 * Red / base-income ids are rejected. Legacy: per-click XP/money (50/50).
 */
router.post("/game/v2/excess/webs/clear", requireAuth, async (req: any, res) => {
  try {
    const result = await clearEconomyV2ExcessWeb(req.userId, req.body?.webId);
    return res.json(result);
  } catch (err) {
    return sendExcessSessionError(
      res,
      err,
      req.log,
      "Error clearing v2 excess web",
    );
  }
});

/**
 * POST /api/game/v2/excess/finish
 *
 * Version=2: compute Metelka pending (base+bonus+xp prepared), deduct excess,
 * wipe session. No balance/history/player_xp credit yet.
 * Legacy: auto-collect special, deduct excess, clear session.
 */
router.post("/game/v2/excess/finish", requireAuth, async (req: any, res) => {
  try {
    const result = await finishEconomyV2ExcessSession(req.userId);
    return res.json(result);
  } catch (err) {
    return sendExcessSessionError(
      res,
      err,
      req.log,
      "Error finishing v2 excess session",
    );
  }
});

/**
 * POST /api/game/v2/excess/result/acknowledge
 *
 * Version=2: pays base+bonus, deducts snapshots, clears result.
 * Legacy: pays stored paidIncome once (if pending).
 */
/**
 * POST /api/game/v2/excess/metelka/claim
 *
 * Claims active Metelka pending reward by claimToken.
 * Credits balance + XP + income_history (type metelka). No tree growth.
 */
router.post("/game/v2/excess/metelka/claim", requireAuth, async (req: any, res) => {
  try {
    const result = await claimMetelkaPendingReward(
      req.userId,
      req.body?.claimToken,
    );
    return res.json(result);
  } catch (err) {
    return sendExcessSessionError(
      res,
      err,
      req.log,
      "Error claiming Metelka pending reward",
    );
  }
});

router.post(
  "/game/v2/excess/result/acknowledge",
  requireAuth,
  async (req: any, res) => {
    try {
      const result = await acknowledgeEconomyV2ExcessResult(req.userId);
      return res.json(result);
    } catch (err) {
      return sendExcessSessionError(
        res,
        err,
        req.log,
        "Error acknowledging v2 excess result",
      );
    }
  },
);

export default router;
