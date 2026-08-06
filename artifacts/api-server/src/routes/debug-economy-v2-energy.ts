import type { Router } from "express";
import { areDebugRoutesEnabled } from "./debug-enabled";
import {
  debugMutateEconomyV2Energy,
  EconomyV2EnergyDebugError,
} from "../services/economy-v2-energy-debug";
import { pool } from "@workspace/db";
import { normalizeBankSecondsForCapacity } from "../services/economy-v2-capacity";

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

function parseFiniteNumberField(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * POST /api/game/debug/economy-v2/energy
 * Body: { deltaSeconds?: number, setSeconds?: number }
 *
 * Updates bank + anchor, normalizes roots progress under shared cap,
 * returns fresh energy + roots snapshot (countdown / storageFull).
 */
export function registerDebugEconomyV2EnergyRoute(router: Router) {
  if (!areDebugRoutesEnabled()) return;

  router.post("/game/debug/economy-v2/energy", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    const hasSet = req.body?.setSeconds !== undefined && req.body?.setSeconds !== null;
    const hasDelta =
      req.body?.deltaSeconds !== undefined && req.body?.deltaSeconds !== null;

    if (!hasSet && !hasDelta) {
      return res.status(400).json({
        error: "Expected finite deltaSeconds and/or setSeconds",
      });
    }

    const setSeconds = hasSet ? parseFiniteNumberField(req.body.setSeconds) : null;
    const deltaSeconds = hasDelta
      ? parseFiniteNumberField(req.body.deltaSeconds)
      : null;
    if (hasSet && setSeconds === null) {
      return res.status(400).json({ error: "Invalid setSeconds: expected finite number" });
    }
    if (hasDelta && deltaSeconds === null) {
      return res.status(400).json({ error: "Invalid deltaSeconds: expected finite number" });
    }

    try {
      const result = await debugMutateEconomyV2Energy(userId, {
        setSeconds: hasSet ? (setSeconds as number) : undefined,
        deltaSeconds: hasDelta ? (deltaSeconds as number) : undefined,
      });
      return res.json({
        success: true,
        economyV2: {
          energySeconds: result.energySeconds,
          energyAnchorAt: result.energyAnchorAt,
          lastSessionTime: result.lastSessionTime,
          missedSessions: result.missedSessions,
        },
        capacity: result.capacity,
        game: {
          v2EnergySeconds: result.energySeconds,
          v2EnergyAnchorAt: result.energyAnchorAt,
          lastSessionTime: result.lastSessionTime,
          missedSessions: result.missedSessions,
          v2Roots: result.roots,
        },
      });
    } catch (err) {
      if (err instanceof EconomyV2EnergyDebugError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      req.log.error({ err }, "debug economy-v2 energy");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/game/debug/economy-v2/energy", requireAuth, async (req: any, res) => {
    const userId = req.userId as number;
    try {
      const row = await pool.query(
        `SELECT v2_energy_seconds, v2_energy_anchor_at, last_session_time, missed_sessions
         FROM game_state WHERE user_id = $1`,
        [String(userId)],
      );
      if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });
      const existing = row.rows[0];
      const energySeconds = normalizeBankSecondsForCapacity(
        typeof existing.v2_energy_seconds === "number"
          ? existing.v2_energy_seconds
          : parseFloat(String(existing.v2_energy_seconds ?? "0")),
      );
      const anchorRaw =
        existing.v2_energy_anchor_at != null
          ? parseInt(String(existing.v2_energy_anchor_at), 10)
          : NaN;
      return res.json({
        success: true,
        economyV2: {
          energySeconds,
          energyAnchorAt: Number.isFinite(anchorRaw) ? anchorRaw : Date.now(),
          lastSessionTime:
            existing.last_session_time != null
              ? parseInt(String(existing.last_session_time), 10)
              : null,
          missedSessions: parseInt(String(existing.missed_sessions ?? "0"), 10) || 0,
        },
      });
    } catch (err) {
      req.log.error({ err }, "debug economy-v2 energy get");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
