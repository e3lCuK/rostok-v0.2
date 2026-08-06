import type { Router } from "express";
import { areDebugRoutesEnabled } from "./debug-enabled";
import {
  debugMutateEconomyV2Excess,
  EconomyV2ExcessDebugError,
  parseDebugExcessAction,
} from "../services/economy-v2-excess-debug";

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
 * POST /api/game/debug/economy-v2/excess
 * Body:
 *   { action: "reset" }
 *   { action: "addPresetSeconds", seconds: 1…25 } — primary UI:
 *     adds N game-seconds to excess ledger;
 *     fills all three v3 roots to effective capacity (buildV3EffectiveCapacityBreakdown);
 *     financial elapsed: current + N×secondsPerGameSecondForCapital(K)×1000
 *       (accumulative; keeps prior elapsed; does not rewrite history);
 *     latches Metelka; resets anchors; clears frozen session
 *   { action: "add", seconds: number > 0 } — raw ledger delta (not Metelka T)
 *   { action: "set", seconds: number >= 0 }
 *   { action: "setPreset", presetSeconds: 5…25, elapsedMs?: number }
 *   { action: "setElapsed", elapsedMs: number } — financial t_excess only
 *   { action: "setFinancial", seconds: number, elapsedMs: number }
 *   { action: "resetSession" } — clears Metelka session fields only
 *
 * Mutates v2_excess_seconds / v2_excess_elapsed_ms and/or session fields.
 * Gated by areDebugRoutesEnabled().
 */
export function registerDebugEconomyV2ExcessRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post("/game/debug/economy-v2/excess", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const parsed = parseDebugExcessAction(req.body);
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    try {
      const result = await debugMutateEconomyV2Excess(userId, parsed);
      return res.json({
        success: true,
        excessSeconds: result.excessSeconds,
        excessElapsedMs: result.excessElapsedMs,
        excess: result.excess,
        ...(result.capacitySeconds != null
          ? { capacitySeconds: result.capacitySeconds }
          : {}),
        ...(result.v3Roots != null ? { v3Roots: result.v3Roots } : {}),
        game: {
          v2Excess: result.excess,
          ...(result.v3Roots != null ? { v3Roots: result.v3Roots } : {}),
        },
      });
    } catch (err) {
      if (err instanceof EconomyV2ExcessDebugError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      req.log.error({ err }, "debug economy-v2 excess");
      const pgCode =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code ?? "")
          : "";
      const pgMsg =
        err instanceof Error && err.message
          ? err.message.slice(0, 280)
          : "Internal server error";
      // Local debug only: surface root cause (e.g. PG 42804) in response body.
      return res.status(500).json({
        error: pgMsg,
        ...(pgCode ? { code: pgCode } : {}),
      });
    }
  });
}
