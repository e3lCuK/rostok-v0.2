/**
 * POST /api/game/tutorial/v3/prepare
 *
 * Idempotent tutorial root grant for Economy v3 (10s / two segments per root).
 * Body `{ kind: "water"|"sun"|"fertilizer" }` grants exactly one root (staged fill).
 * Body `{ all: true }` grants all three (recovery / legacy).
 * `kind` is required unless `all: true` — empty body must NOT fill all roots.
 */

import { Router } from "express";
import {
  EconomyV3CapitalVaultError,
  plantTutorialSprout,
  transferVaultToChest,
} from "../services/economy-v3-capital-vault";
import {
  EconomyV3TutorialError,
  armTutorialV3Wait,
  grantTutorialV3Roots,
  syncTutorialV3WaitEnergy,
} from "../services/economy-v3-tutorial";
import { V3_ROOT_KINDS, type RootKind } from "../services/economy-v3-roots";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

function parsePrepareKinds(body: unknown): {
  kinds: RootKind[] | undefined;
  error?: "invalid_kind" | "kind_required";
} {
  if (!body || typeof body !== "object") {
    return { kinds: undefined, error: "kind_required" };
  }
  const rec = body as { kind?: unknown; all?: unknown };
  if (rec.all === true) {
    return { kinds: undefined }; // grantTutorialV3RootsPure: all three
  }
  const kind = rec.kind;
  if (kind == null || kind === "") {
    return { kinds: undefined, error: "kind_required" };
  }
  if (
    typeof kind === "string" &&
    (V3_ROOT_KINDS as readonly string[]).includes(kind)
  ) {
    return { kinds: [kind as RootKind] };
  }
  return { kinds: undefined, error: "invalid_kind" };
}

router.post("/game/tutorial/v3/prepare", requireAuth, async (req: any, res) => {
  try {
    const parsed = parsePrepareKinds(req.body);
    if (parsed.error === "kind_required") {
      return res.status(400).json({
        error: "kind is required (or all: true)",
        code: "kind_required",
      });
    }
    if (parsed.error === "invalid_kind") {
      return res.status(400).json({
        error: "Invalid kind",
        code: "invalid_kind",
      });
    }
    const result = await grantTutorialV3Roots(req.userId, Date.now(), {
      kinds: parsed.kinds,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3TutorialError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error preparing v3 tutorial roots");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** Arm the tutorial 12:00 generation clock (client wait start). */
router.post("/game/tutorial/v3/arm-wait", requireAuth, async (req: any, res) => {
  try {
    const startedAtMs = Number(req.body?.startedAtMs);
    const result = await armTutorialV3Wait(req.userId, startedAtMs, Date.now());
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3TutorialError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error arming v3 tutorial wait");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * When the tutorial 12:00 wait elapses — settle energy into root cells
 * like the main game (without completing the tutorial).
 */
router.post(
  "/game/tutorial/v3/sync-wait-energy",
  requireAuth,
  async (req: any, res) => {
    try {
      const raw = req.body?.startedAtMs;
      const startedAtMs =
        raw == null || raw === ""
          ? null
          : Number(raw);
      const startGoldFlask = req.body?.startGoldFlask === true;
      const result = await syncTutorialV3WaitEnergy(
        req.userId,
        startedAtMs,
        Date.now(),
        { startGoldFlask },
      );
      return res.json(result);
    } catch (err) {
      if (err instanceof EconomyV3TutorialError) {
        return res
          .status(err.status)
          .json({ error: err.message, code: err.code });
      }
      req.log?.error({ err }, "Error syncing v3 tutorial wait energy");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/** Unlock tree + underground after the player taps the plant pad. */
router.post("/game/tutorial/v3/plant-sprout", requireAuth, async (req: any, res) => {
  try {
    const result = await plantTutorialSprout(req.userId);
    return res.json(result);
  } catch (err) {
    if (err instanceof EconomyV3CapitalVaultError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    req.log?.error({ err }, "Error planting tutorial sprout");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** Move vault capital into the tree chest (active_balance). */
router.post(
  "/game/tutorial/v3/capital-vault/transfer",
  requireAuth,
  async (req: any, res) => {
    try {
      const result = await transferVaultToChest(req.userId);
      return res.json(result);
    } catch (err) {
      if (err instanceof EconomyV3CapitalVaultError) {
        return res
          .status(err.status)
          .json({ error: err.message, code: err.code });
      }
      req.log?.error({ err }, "Error transferring tutorial capital vault");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
