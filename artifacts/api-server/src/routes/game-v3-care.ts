import { Router } from "express";
import {
  startEconomyV3CareActivity,
  EconomyV3CareStartError,
} from "../services/economy-v3-care-start";
import {
  finishEconomyV3CareActivity,
  EconomyV3CareFinishError,
} from "../services/economy-v3-care-finish";
import {
  acknowledgeEconomyV3CareActivity,
  EconomyV3CareAcknowledgeError,
} from "../services/economy-v3-care-acknowledge";
import {
  finishEconomyV3CareCycle,
  EconomyV3CareFinishCycleError,
} from "../services/economy-v3-care-finish-cycle";
import {
  acknowledgeEconomyV3CareCycle,
  EconomyV3CareAcknowledgeCycleError,
} from "../services/economy-v3-care-acknowledge-cycle";
import {
  claimEconomyV3CareCycle,
  EconomyV3CareClaimCycleError,
} from "../services/economy-v3-care-claim-cycle";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

/**
 * POST /api/game/v3/care/start-activity
 *
 * Body: { activity: "water" | "sun" | "fertilizer", presetSeconds: number }
 *
 * Errors:
 * - 400 unknown_activity / invalid_preset / preset_* / insufficient_reserve
 * - 403 feature_disabled
 * - 409 activity_in_progress / metelka_required_before_care
 * - 404 not_found
 */
router.post("/game/v3/care/start-activity", requireAuth, async (req: any, res) => {
  try {
    const result = await startEconomyV3CareActivity(
      req.userId,
      req.body?.activity,
      req.body?.presetSeconds,
    );
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3CareStartError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error starting v3 Care activity");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/game/v3/care/finish-activity
 *
 * Body: {
 *   activity: "water" | "sun" | "fertilizer",
 *   skill: number,
 *   count?: number,      // items caught (achievements; also accepted as collected)
 *   collected?: number
 * }
 *
 * Errors:
 * - 400 unknown_activity / invalid_skill
 * - 403 feature_disabled
 * - 409 activity_mismatch / no_active_activity
 * - 404 not_found
 */
router.post("/game/v3/care/finish-activity", requireAuth, async (req: any, res) => {
  try {
    const collected =
      req.body?.collected ?? req.body?.count ?? 0;
    const result = await finishEconomyV3CareActivity(
      req.userId,
      req.body?.activity,
      req.body?.skill,
      Date.now(),
      collected,
    );
    req.log?.info?.(
      {
        activity: result.activity,
        skill: result.skill,
        alreadyCompleted: result.alreadyCompleted,
        incomeTotal: result.income?.total,
      },
      "v3 Care activity finished",
    );
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3CareFinishError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error finishing v3 Care activity");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/game/v3/care/acknowledge-activity
 *
 * Body: { activity: "water" | "sun" | "fertilizer" }
 *
 * Errors:
 * - 400 unknown_activity
 * - 403 feature_disabled
 * - 409 activity_mismatch / activity_not_completed / no_completed_activity
 * - 404 not_found
 */
router.post(
  "/game/v3/care/acknowledge-activity",
  requireAuth,
  async (req: any, res) => {
    try {
      const result = await acknowledgeEconomyV3CareActivity(
        req.userId,
        req.body?.activity,
      );
      return res.json(result);
    } catch (err) {
      if (err instanceof EconomyV3CareAcknowledgeError) {
        return res
          .status(err.status)
          .json({ error: err.message, code: err.code });
      }
      req.log?.error({ err }, "Error acknowledging v3 Care activity");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * POST /api/game/v3/care/finish-cycle
 *
 * Body: none
 *
 * Errors:
 * - 403 feature_disabled
 * - 409 care_cycle_not_complete / activity_session_pending
 * - 404 not_found
 */
router.post("/game/v3/care/finish-cycle", requireAuth, async (req: any, res) => {
  try {
    const result = await finishEconomyV3CareCycle(req.userId);
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3CareFinishCycleError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error finishing v3 Care cycle");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/game/v3/care/claim-cycle
 *
 * Body: none
 *
 * Errors:
 * - 403 feature_disabled
 * - 409 care_cycle_not_finished / activity_session_pending / reward_preview_unavailable
 * - 404 not_found
 */
router.post("/game/v3/care/claim-cycle", requireAuth, async (req: any, res) => {
  try {
    const result = await claimEconomyV3CareCycle(req.userId);
    const cycle = result.v3Roots?.careCycle;
    req.log?.info?.(
      {
        treeGrowth: result.treeGrowth,
        treeGrowthMm: result.treeGrowthMm,
        alreadyClaimed: result.alreadyClaimed,
        xp: result.xp,
        waterSkill: cycle?.activities?.water?.skill ?? null,
        sunSkill: cycle?.activities?.sun?.skill ?? null,
        fertilizerSkill: cycle?.activities?.fertilizer?.skill ?? null,
        averageSkill: cycle?.averageSkill ?? null,
        previewTreeGrowth: cycle?.rewardPreview?.treeGrowth ?? null,
        claimSnapshotTreeGrowth: cycle?.claim?.treeGrowth ?? null,
      },
      "v3 Care cycle claimed",
    );
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3CareClaimCycleError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error claiming v3 Care cycle");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/game/v3/care/acknowledge-cycle
 *
 * Body: none
 *
 * Errors:
 * - 403 feature_disabled
 * - 409 care_cycle_not_finished / care_cycle_not_claimed / activity_session_pending
 * - 404 not_found
 */
router.post(
  "/game/v3/care/acknowledge-cycle",
  requireAuth,
  async (req: any, res) => {
    try {
      const result = await acknowledgeEconomyV3CareCycle(req.userId);
      return res.json(result);
    } catch (err) {
      if (err instanceof EconomyV3CareAcknowledgeCycleError) {
        return res
          .status(err.status)
          .json({ error: err.message, code: err.code });
      }
      req.log?.error({ err }, "Error acknowledging v3 Care cycle");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
