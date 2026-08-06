import type { Router } from "express";
import { areDebugRoutesEnabled } from "./debug-enabled";
import {
  debugMutateEconomyV3Roots,
  EconomyV3RootsDebugError,
  parseDebugV3RootsBody,
} from "../services/economy-v3-roots-debug";

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
 * POST /api/game/debug/economy-v3/roots
 * Body: { action: "reset" } | { action?: "set", roots?, reserves? }
 *       | { action: "add", roots?, reserves? }
 *       | { action: "fillToCapacity", roots?: boolean, reserves?: boolean }
 *
 * Mutates v3 root/reserve seconds (or full v3 reset). Never writes above
 * effectivePresetSeconds. Never touches Economy v2.
 * Gated by areDebugRoutesEnabled() + ENABLE_ECONOMY_V3_ROOTS.
 */
export function registerDebugEconomyV3RootsRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post(
    "/game/debug/economy-v3/roots",
    requireAuth,
    async (req: any, res) => {
      const userId = req.userId as number;
      const parsed = parseDebugV3RootsBody(req.body);
      if ("error" in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      try {
        const result = await debugMutateEconomyV3Roots(userId, parsed);
        return res.json({
          success: true,
          v3Roots: result.v3Roots,
          capacitySeconds: result.capacitySeconds,
          clamp: result.clamp,
          game: {
            v3Roots: result.v3Roots,
          },
        });
      } catch (err) {
        if (err instanceof EconomyV3RootsDebugError) {
          return res
            .status(err.status)
            .json({ error: err.message, code: err.code });
        }
        req.log.error({ err }, "debug economy-v3 roots");
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
