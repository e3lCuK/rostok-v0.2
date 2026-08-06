import type { Router } from "express";
import { areDebugRoutesEnabled } from "./debug-enabled";
import {
  debugMutateEconomyV2Roots,
  EconomyV2RootsDebugError,
  type DebugRootsAction,
} from "../services/economy-v2-roots-debug";

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

function parseActionBody(body: unknown): DebugRootsAction | { error: string } {
  if (body == null || typeof body !== "object") {
    return { error: "Expected JSON body with action" };
  }
  const action = (body as { action?: unknown }).action;
  if (action === "reset") {
    return { action: "reset" };
  }
  if (action === "add") {
    const countRaw = (body as { count?: unknown }).count;
    const count =
      typeof countRaw === "number" ? countRaw : parseInt(String(countRaw ?? ""), 10);
    if (!Number.isInteger(count) || count < 1) {
      return { error: "add requires a positive integer count" };
    }
    return { action: "add", count };
  }
  return { error: 'action must be "reset" or "add"' };
}

/**
 * POST /api/game/debug/economy-v2/roots
 * Body: { action: "reset" } | { action: "add", count: number }
 *
 * Mutates server v2_root_ready_mask only (plus reset clears progress / freezes anchor).
 * Collected bank (v2_energy_seconds) is never changed.
 * Gated by areDebugRoutesEnabled().
 */
export function registerDebugEconomyV2RootsRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post("/game/debug/economy-v2/roots", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const parsed = parseActionBody(req.body);
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    try {
      const result = await debugMutateEconomyV2Roots(userId, parsed);
      return res.json({
        success: true,
        readyMask: result.readyMask,
        readyCount: result.readyCount,
        generationProgress: result.generationProgress,
        energySeconds: result.energySeconds,
        anchorAt: result.anchorAt,
        roots: result.roots,
        game: {
          v2EnergySeconds: result.energySeconds,
          v2EnergyAnchorAt: result.anchorAt,
          v2Roots: result.roots,
        },
      });
    } catch (err) {
      if (err instanceof EconomyV2RootsDebugError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      req.log.error({ err }, "debug economy-v2 roots");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
