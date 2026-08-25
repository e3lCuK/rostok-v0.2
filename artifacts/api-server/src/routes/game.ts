import { Router } from "express";
import { pool } from "@workspace/db";
import {
  isEconomyV2TutorialActive,
  settleAndPersistEconomyV2Energy,
} from "../services/economy-v2-energy-settle";
import { V2_ENERGY_BANK_MAX } from "../services/economy-v2";
import { buildIncomeByPresetTable } from "../services/economy-v2-care-income";
import { mapGameStateRowToV2Care } from "../services/economy-v2-care";
import { isEconomyV3RootsEnabled } from "../services/economy-v3-feature";
import { buildEconomyV3RootsPublicState } from "../services/economy-v3-roots";
import { settleAndPersistEconomyV3Roots } from "../services/economy-v3-roots-settle";
import { V3_TUTORIAL_COMPLETE_CLEAR_SQL } from "../services/economy-v3-tutorial";
import { computeTutorialCompensation } from "../services/economy-v3-tutorial-compensation";
import { readMetelkaPendingRewardFromRow } from "../services/economy-v2-excess-metelka-pending";
import { computeVisitStreakOnLogin } from "../services/economy-v3-visit-streak";
import { nextVisitStreakDays } from "../services/economy-v3-effective-capacity";

const COOLDOWN_MS = 8 * 60 * 60 * 1000;
const SESSIONS_PER_DAY = 3; // 1 session per 8 hours

// ---- New economy helpers ----

// skillScore: 0–100 average from mini-games
function calcBonusPercent(skillScore: number): number {
  const skillFactor = Math.min(Math.max(skillScore, 0), 100) / 100; // 0–1
  const skillPart = skillFactor * 0.75;                            // 0–0.75
  const capitalPart = 0.16;                                        // статичный
  const randomPart = Math.random() * 0.08;                         // 0–0.08
  const performance = skillPart + capitalPart + randomPart;
  const normalized = Math.min(performance, 1);
  return 0.03 * normalized;
}

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = String(userId);
  next();
}

// GET /api/game/state — load full user state
router.get("/game/state", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  try {
    const [accRow, gameRow, historyRows] = await Promise.all([
      pool.query("SELECT * FROM accounts WHERE user_id = $1", [userId]),
      pool.query("SELECT * FROM game_state WHERE user_id = $1", [userId]),
      pool.query(
        "SELECT amount, type, earned_date FROM income_history WHERE user_id = $1 ORDER BY id DESC LIMIT 30",
        [userId],
      ),
    ]);

    if (accRow.rows.length === 0) {
      return res.json({ exists: false });
    }

    const acc = accRow.rows[0];
    const game = gameRow.rows[0] || {};

    // Track daily login + visit-day streak (once per calendar day).
    // Visit day used to advance only on legacy session complete — v3 never
    // hits that path, so a second-day login stayed on «День 1».
    if (gameRow.rows.length > 0) {
      const visit = computeVisitStreakOnLogin({
        nowMs: Date.now(),
        clientVisitDate: req.query?.visitDate,
        lastStreakDate: game.last_streak_date ?? null,
        lastLoginDate: game.last_login_date ?? null,
        currentStreak: game.streak_days,
        totalLoginDays: game.total_login_days,
      });
      if (visit.persist) {
        try {
          await pool.query(
            `UPDATE game_state
             SET total_login_days = COALESCE(total_login_days, 0) + $4,
                 last_login_date = $2,
                 streak_days = $3,
                 last_streak_date = $2,
                 updated_at = NOW()
             WHERE user_id = $1`,
            [userId, visit.today, visit.newStreak, visit.loginChanged ? 1 : 0],
          );
          game.streak_days = visit.newStreak;
          game.last_streak_date = visit.today;
          game.last_login_date = visit.today;
        } catch (err) {
          req.log?.error?.({ err }, "visit streak login update");
        }
      }
    }

    // Economy v2: settle root maturation from capital × elapsed since anchor.
    // Collected bank (v2_energy_seconds) is unchanged by settle.
    // Does not touch last_session_time or the v1 Care session pipeline.
    let v2EnergySeconds = 0;
    let v2EnergyAnchorAt: number | null = null;
    let v2Roots = {
      readyMask: "0",
      readyCount: 0,
      generationProgress: 0,
      secondsPerSection: 0,
      secondsUntilNextSection: null as number | null,
      isFull: false,
      storageFull: false,
      storageOccupied: 0,
      storageFree: 60,
      storageOverCapacity: false,
    };
    let v2Excess = {
      excessSeconds: 0,
      excessElapsedMs: 0,
      excessFinanciallyValid: true,
      excessCycle: 0,
      excessAvailable: false,
      excessPresetSeconds: 5,
      excessRate: 0.015,
      session: {
        active: false,
        startedAt: null as number | null,
        sourceSeconds: null as number | null,
        sourceElapsedMs: null as number | null,
        capital: null as number | null,
        presetSeconds: null as number | null,
        rate: null as number | null,
      },
    };
    let v2Care = mapGameStateRowToV2Care(gameRow.rows.length > 0 ? game : null);
    let v3RootsSnapshot = null as ReturnType<
      typeof buildEconomyV3RootsPublicState
    > | null;
    let v3AutoTransfer = null as
      | import("../services/economy-v3-roots").EconomyV3AutoTransferPublic
      | null;
    if (gameRow.rows.length > 0) {
      const settled = await settleAndPersistEconomyV2Energy(userId);
      if (settled) {
        v2EnergySeconds = Math.min(
          V2_ENERGY_BANK_MAX,
          Math.max(0, settled.energySeconds),
        );
        v2EnergyAnchorAt = settled.energyAnchorAt;
        v2Roots = settled.roots;
        v2Excess = settled.excess;
      }
      // Re-read Care snapshot after settle so F5 recovery sees latest completed flags.
      // Settle does not mutate Care columns; a concurrent activity may have.
      const careRow = await pool.query(
        `SELECT
           v2_care_in_progress,
           v2_care_cycle_id,
           v2_care_water_seconds,
           v2_care_sun_seconds,
           v2_care_fertilizer_seconds,
           v2_care_water_completed,
           v2_care_sun_completed,
           v2_care_fertilizer_completed,
           v2_care_started_at,
           v2_care_water_score,
           v2_care_sun_score,
           v2_care_fertilizer_score
         FROM game_state
         WHERE user_id = $1`,
        [userId],
      );
      if (careRow.rows.length > 0) {
        v2Care = mapGameStateRowToV2Care(careRow.rows[0]);
      }

      // Economy v3 parallel roots — single settle when flag is on.
      // Owns ordinary generation + excess gate; refreshes v2Excess from ledger.
      if (isEconomyV3RootsEnabled()) {
        const v3Settled = await settleAndPersistEconomyV3Roots(userId);
        if (v3Settled) {
          v3RootsSnapshot = v3Settled.snapshot;
          v3AutoTransfer = v3Settled.autoTransfer;
          if (v3Settled.excessLedger) {
            v2Excess = v3Settled.excessLedger.excess;
          }
        } else {
          const capital = parseFloat(String(acc.active_balance ?? "0")) || 0;
          v3RootsSnapshot = buildEconomyV3RootsPublicState(game, { capital });
        }
      }
    }

    return res.json({
      exists: true,
      balances: {
        balance: parseFloat(acc.active_balance),
        vaultBalance: parseFloat(String(acc.vault_balance ?? "0")) || 0,
        earned: parseFloat(acc.active_earned),
        totalDaysEarned: acc.total_days_earned,
        startDate: parseInt(acc.start_date),
      },
      game: {
        lastSessionTime: game.last_session_time ? parseInt(game.last_session_time) : null,
        sessionInProgress: game.session_in_progress || false,
        water: game.current_session_water || false,
        sun: game.current_session_sun || false,
        fertilizer: game.current_session_fertilizer || false,
        streakDays: game.streak_days || 0,
        missedSessions: game.missed_sessions || 0,
        pendingBaseReward: parseFloat(game.pending_base_reward) || 0,
        pendingBonusReward: parseFloat(game.pending_bonus_reward) || 0,
        metelkaPendingReward: readMetelkaPendingRewardFromRow(game),
        pendingStoredSessions: parseInt(game.pending_stored_sessions) || 1,
        treeGrowthMM: parseInt(game.tree_growth_mm) || 0,
        treeGrowthRemainder: parseFloat(game.tree_growth_remainder) || 0,
        playerXP: parseInt(game.player_xp) || 0,
        playerLevel: parseInt(game.player_level) || 1,
        totalApples: parseInt(game.total_apples) || 0,
        purchasedItems: Array.isArray(game.purchased_items)
          ? game.purchased_items
          : (game.purchased_items ? JSON.parse(game.purchased_items) : []),
        xpHistory: Array.isArray(game.xp_history)
          ? game.xp_history
          : (game.xp_history ? JSON.parse(game.xp_history) : []),
        tutorialDone: game.tutorial_done !== false,
        // Only the plant flag (or finished tutorial) — do not infer from nullish tutorial_done.
        sproutPlanted:
          game.sprout_planted === true || game.tutorial_done === true,
        // Collected Care bank (0–60). Root maturation is in v2Roots.
        v2EnergySeconds,
        v2EnergyAnchorAt,
        v2Roots,
        v2Excess,
        v2Care: {
          inProgress: v2Care.inProgress,
          cycleId: v2Care.cycleId,
          allocation: v2Care.allocation,
          completed: v2Care.completed,
          allCompleted: v2Care.allCompleted,
          scores: v2Care.scores,
        },
        v2Freshness:
          game.v2_freshness != null
            ? parseFloat(String(game.v2_freshness))
            : 1,
        v2IncomeAnchorAt: game.v2_income_anchor_at
          ? parseInt(String(game.v2_income_anchor_at), 10)
          : null,
        // Legacy v1 scores (unchanged for v1 mode).
        sessionWaterScore: parseInt(game.session_water_score) || 0,
        sessionSunScore: parseInt(game.session_sun_score) || 0,
        sessionFertilizerScore: parseInt(game.session_fertilizer_score) || 0,
        // Economy v3 storage snapshot — omitted when flag is off (default).
        ...(v3RootsSnapshot ? { v3Roots: v3RootsSnapshot } : {}),
        // One-shot metadata for this request only (not persisted).
        ...(v3AutoTransfer ? { v3AutoTransfer } : {}),
      },
      history: historyRows.rows.map((r: any) => ({
        amount: parseFloat(r.amount),
        type: r.type,
        date: r.earned_date,
      })),
      /** Catalog: income for one completed mini-game by duration (SoT). */
      incomeByPreset: buildIncomeByPresetTable({
        capital: parseFloat(acc.active_balance) || 0,
      }),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching game state");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/init — create account with fixed starting capital (100 000)
router.post("/game/init", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const capital = 100_000;
  const now = Date.now();

  try {
    const existing = await pool.query("SELECT user_id FROM accounts WHERE user_id = $1", [userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Account already exists" });
    }

    // Capital starts in the vault; tree chest (active_balance) is empty until
    // the tutorial drag-to-chest transfer.
    await pool.query(
      `INSERT INTO accounts(user_id, standard_balance, active_balance, vault_balance, standard_earned, active_earned, total_days_earned, start_date, starting_capital)
       VALUES($1, 0, 0, $2, 0, 0, 0, $3, $4)`,
      [userId, capital, now, capital],
    );
    await pool.query(
      `INSERT INTO game_state(user_id, last_session_time, session_in_progress, current_session_water, current_session_sun, current_session_fertilizer, pending_base_reward, pending_bonus_reward, tutorial_done, sprout_planted)
       VALUES($1, NULL, FALSE, FALSE, FALSE, FALSE, 0, 0, FALSE, FALSE)`,
      [userId],
    );

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error initializing account");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /game/tutorial/complete — mark tutorial done, award capital-idle
// compensation (12% APR from capital-on-chest → gold flask start), keep apple,
// continue v3 generation from the tutorial 12:00 wait start when provided.
router.post("/game/tutorial/complete", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const now = Date.now();
  try {
    // Idempotent: a second complete (heal / F5) must not wipe the live cycle
    // back to a fresh 12:00 (progress=0 + anchor=now).
    if (isEconomyV3RootsEnabled()) {
      const existing = await pool.query(
        `SELECT tutorial_done, v3_generation_anchor_at
         FROM game_state WHERE user_id = $1`,
        [userId],
      );
      const row = existing.rows[0] as
        | { tutorial_done?: boolean; v3_generation_anchor_at?: Date | string | null }
        | undefined;
      if (row?.tutorial_done === true) {
        const existingAnchor = row.v3_generation_anchor_at
          ? new Date(row.v3_generation_anchor_at).getTime()
          : null;
        return res.json({
          success: true,
          alreadyComplete: true,
          energyAnchorAt: now,
          generationAnchorAt: Number.isFinite(existingAnchor)
            ? existingAnchor
            : now,
        });
      }
    }

    const capitalRow = await pool.query(
      `SELECT starting_capital FROM accounts WHERE user_id = $1`,
      [userId],
    );
    const startingCapital = Number(capitalRow.rows[0]?.starting_capital);
    const compensation = computeTutorialCompensation({
      capital: startingCapital,
      startedAtMs: req.body?.compensationStartedAt,
      endedAtMs: req.body?.compensationEndedAt,
      nowMs: now,
    });
    const amountRub = compensation.amountRub;
    const growthMm = compensation.growthMm;

    // Starting capital + idle compensation (closes the tutorial no-pay window).
    // NULLIF: legacy rows may have starting_capital=0 (column default).
    await pool.query(
      `UPDATE accounts
       SET active_balance = COALESCE(NULLIF(starting_capital, 0), 100000) + $2,
           vault_balance = 0,
           active_earned = $2,
           standard_earned = 0
       WHERE user_id = $1`,
      [userId, amountRub],
    );
    // Replace any mid-tutorial income rows with the compensation entry.
    await pool.query(`DELETE FROM income_history WHERE user_id = $1`, [userId]);
    await pool.query(
      `INSERT INTO income_history(user_id, amount, type, earned_date)
       VALUES ($1, $2, 'tutorial', CURRENT_DATE)`,
      [userId, amountRub],
    );

    // Keep tutorial collectibles (compensation мм / 1 apple / claimed skill XP).
    // v3 generation clock continues from the tutorial wait start (not "now"),
    // so a 9:54 leftover on the tutorial capsule becomes the live wait timer.
    if (isEconomyV3RootsEnabled()) {
      const rawAnchor = req.body?.generationAnchorAt;
      const parsedAnchor = Number(rawAnchor);
      const maxAgeMs = 30 * 60 * 1000;
      const bodyAnchorOk =
        Number.isFinite(parsedAnchor) &&
        parsedAnchor <= now &&
        parsedAnchor >= now - maxAgeMs;
      // Prefer client wait-start; else keep any existing DB anchor; never invent "now"
      // when a prior anchor exists (that is the classic F5 → 12:00 reset).
      let generationAnchorAt: number;
      if (bodyAnchorOk) {
        generationAnchorAt = Math.trunc(parsedAnchor);
      } else {
        const existing = await pool.query(
          `SELECT v3_generation_anchor_at FROM game_state WHERE user_id = $1`,
          [userId],
        );
        const rawExisting = existing.rows[0]?.v3_generation_anchor_at;
        const existingMs = rawExisting
          ? new Date(rawExisting).getTime()
          : NaN;
        generationAnchorAt =
          Number.isFinite(existingMs) &&
          existingMs <= now &&
          existingMs >= now - maxAgeMs
            ? Math.trunc(existingMs)
            : now;
      }
      await pool.query(
        `UPDATE game_state
         SET tutorial_done = TRUE,
             v2_energy_anchor_at = $2,
             v2_root_generation_progress = 0,
             v2_root_ready_mask = '0',
             ${V3_TUTORIAL_COMPLETE_CLEAR_SQL},
             updated_at = NOW()
         WHERE user_id = $1`,
        // $2 = v2 bigint epoch-ms; $3 = v3 TIMESTAMP; $4 = growth floor
        [userId, now, new Date(generationAnchorAt), growthMm],
      );
      return res.json({
        success: true,
        energyAnchorAt: now,
        generationAnchorAt,
        compensationRub: amountRub,
        compensationGrowthMm: growthMm,
        compensationUsedFallback: compensation.usedFallback,
      });
    } else {
      await pool.query(
        `UPDATE game_state
         SET tutorial_done = TRUE,
             v2_energy_anchor_at = $2,
             v2_root_generation_progress = 0,
             v2_root_ready_mask = '0',
             tree_growth_mm = GREATEST(COALESCE(tree_growth_mm, 0), $3),
             tree_growth_remainder = 0,
             total_apples = GREATEST(COALESCE(total_apples, 0), 1),
             total_sessions = 0,
             streak_days = 0,
             last_streak_date = NULL,
             pending_base_reward = 0,
             pending_bonus_reward = 0,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, now, growthMm],
      );
    }
    return res.json({
      success: true,
      energyAnchorAt: now,
      compensationRub: amountRub,
      compensationGrowthMm: growthMm,
      compensationUsedFallback: compensation.usedFallback,
    });
  } catch (err) {
    req.log.error({ err }, "Error completing tutorial");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/accrue — no-op: standard deposit removed, all income via active sessions
router.post("/game/accrue", requireAuth, async (_req: any, res) => {
  return res.json({ accrued: 0, days: 0 });
});

// POST /api/game/session/start — begin a v1 session (pure v1; no Economy v2 Care bridge).
router.post("/game/session/start", requireAuth, async (req: any, res) => {
  const userId = req.userId;

  try {
    const [gameRow, accRow] = await Promise.all([
      pool.query("SELECT * FROM game_state WHERE user_id = $1", [userId]),
      pool.query("SELECT start_date FROM accounts WHERE user_id = $1", [userId]),
    ]);
    if (gameRow.rows.length === 0 || accRow.rows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    const g = gameRow.rows[0];
    const now = Date.now();

    // Idempotent resume: v1 session already open.
    if (g.session_in_progress) {
      return res.json({ success: true, resumed: true });
    }

    if (g.last_session_time && now - parseInt(g.last_session_time) < COOLDOWN_MS) {
      const nextAvailable = parseInt(g.last_session_time) + COOLDOWN_MS;
      return res.status(429).json({ error: "Session locked", nextAvailable });
    }

    // Calculate how many sessions were missed since the last one.
    // If last_session_time is null (never played), fall back to start_date so
    // players who were away from day 1 still accumulate super sessions.
    const referenceTime = g.last_session_time
      ? parseInt(g.last_session_time)
      : parseInt(accRow.rows[0].start_date);
    const elapsed = now - referenceTime;
    // Each full cooldown period that passed is a potential session;
    // subtract 1 because the current session is the one being started now.
    const additionalMissed = Math.max(0, Math.floor(elapsed / COOLDOWN_MS) - 1);
    const newMissedSessions = (g.missed_sessions || 0) + additionalMissed;

    await pool.query(
      `UPDATE game_state
       SET session_in_progress = TRUE,
           current_session_water = FALSE,
           current_session_sun = FALSE,
           current_session_fertilizer = FALSE,
           missed_sessions = $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newMissedSessions],
    );

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error starting session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/session/action — perform water/sun/fertilizer
router.post("/game/session/action", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const { action, skillScore: rawSkillScore, count: rawCount } = req.body;
  const skillScore: number = typeof rawSkillScore === "number" && !isNaN(rawSkillScore) && rawSkillScore >= 0 && rawSkillScore <= 100
    ? rawSkillScore
    : 40;
  const itemCount: number = typeof rawCount === "number" && !isNaN(rawCount) && rawCount >= 0 && rawCount <= 10000
    ? Math.round(rawCount)
    : 1;

  if (!["water", "sun", "fertilizer"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    const [gameRow, accRow] = await Promise.all([
      pool.query("SELECT * FROM game_state WHERE user_id = $1", [userId]),
      pool.query("SELECT * FROM accounts WHERE user_id = $1", [userId]),
    ]);

    if (gameRow.rows.length === 0 || accRow.rows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    const g = gameRow.rows[0];
    const acc = accRow.rows[0];

    // Prevent double XP/rewards while Economy v2 Care owns the cycle.
    if (g.v2_care_in_progress === true || g.v2_care_in_progress === "t") {
      return res.status(409).json({
        error: "Economy v2 Care cycle is active — use /game/v2/care/activity",
        code: "v2_care_active",
      });
    }

    if (!g.session_in_progress) {
      return res.status(409).json({ error: "No active session" });
    }

    if (g[`current_session_${action}`]) {
      return res.status(409).json({ error: "Action already performed" });
    }

    await pool.query(
      `UPDATE game_state SET current_session_${action} = TRUE, session_${action}_score = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, skillScore],
    );

    // Increment per-action counter by actual items collected
    const counterCol = action === "water" ? "total_water_drops" : action === "sun" ? "total_sun_catches" : "total_leaf_picks";
    await pool.query(
      `UPDATE game_state SET ${counterCol} = COALESCE(${counterCol}, 0) + $2 WHERE user_id = $1`,
      [userId, itemCount],
    );

    // Check if all 3 actions done
    const updated = await pool.query("SELECT * FROM game_state WHERE user_id = $1", [userId]);
    const u = updated.rows[0];
    const allDone = u.current_session_water && u.current_session_sun && u.current_session_fertilizer;

    let baseReward = 0;
    let bonusReward = 0;
    let storedSessionsResult = 1;

    if (allDone) {
      const activeBalance = parseFloat(acc.active_balance);
      const totalBalance = activeBalance;
      const now = Date.now();

      // Streak logic — one increment per calendar day (UTC), using last_streak_date.
      // Login GET also ticks this for Economy v3 (no legacy session complete).
      const todayUTC = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      const yesterdayUTC = new Date(now - 86400000).toISOString().slice(0, 10);
      const lastStreakDate: string | null = g.last_streak_date ?? null;
      const currentStreak: number = g.streak_days || 0;
      let newStreak: number;
      if (!lastStreakDate) {
        // First ever session
        newStreak = 1;
      } else if (lastStreakDate === todayUTC) {
        // Already completed a session today — keep streak unchanged
        newStreak = currentStreak <= 0 ? 1 : currentStreak;
      } else if (lastStreakDate === yesterdayUTC) {
        // Consecutive day — 0 and 1 are both visit day 1
        newStreak = nextVisitStreakDays(currentStreak);
      } else {
        // Missed one or more days — reset
        newStreak = 1;
      }

      // New economy formula — single source of truth
      // daily = activeBalance * rate / 365 | session = daily / SESSIONS_PER_DAY
      // IMPORTANT: use activeBalance only — all income is via active sessions
      const missedSessions = g.missed_sessions || 0;
      storedSessionsResult = 1 + missedSessions;
      const bonusMultiplier = Math.max(1 - missedSessions * 0.1, 0.1);
      const bonusPercent = calcBonusPercent(skillScore);
      const dailyBase = activeBalance * 0.12 / 365;
      const dailyBonus = activeBalance * bonusPercent / 365;
      const basePerSession = dailyBase / SESSIONS_PER_DAY;
      const bonusPerSession = dailyBonus / SESSIONS_PER_DAY;
      baseReward = basePerSession * storedSessionsResult;
      bonusReward = bonusPerSession * bonusMultiplier * storedSessionsResult;

      // XP calculation — always ×1 regardless of stored sessions
      const wPct = Math.round((((u.session_water_score ?? 50) as number) / 100) * 100);
      const sPct = Math.round((((u.session_sun_score ?? 50) as number) / 100) * 100);
      const fPct = Math.round((((u.session_fertilizer_score ?? 50) as number) / 100) * 100);
      const xpGained = Math.max(10, Math.round((wPct + sPct + fPct) / 3));
      const skillPct = xpGained; // same value — average care percent

      // XP history — keep last 5 entries
      const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      const prevXpHistory: any[] = Array.isArray(g.xp_history)
        ? g.xp_history
        : (g.xp_history ? JSON.parse(g.xp_history) : []);
      const sameDayCount = prevXpHistory.filter((e: any) => e.date === today).length;
      const newXpEntry = { date: today, n: sameDayCount + 1, pct: skillPct, xp: xpGained };
      const newXpHistory = [newXpEntry, ...prevXpHistory].slice(0, 5);

      const prevLevel = g.player_level || 1;
      const newTotalXP = (g.player_xp || 0) + xpGained;
      function calcLevel(xp: number): number {
        if (xp >= 5000) return 5;
        if (xp >= 2500) return 4;
        if (xp >= 1000) return 3;
        if (xp >= 300)  return 2;
        return 1;
      }
      const newLevel = calcLevel(newTotalXP);
      const levelUp = newLevel > prevLevel;

      req.log.info(
        { skillScore, bonusPercent, bonusMultiplier, storedSessions: storedSessionsResult, baseReward, bonusReward, totalBalance, xpGained, newLevel, levelUp },
        "Session rewards calculated",
      );

      // Store pending rewards (accumulate in case previous unclaimed)
      // Close session, do NOT auto-credit
      // Tree growth is applied later when user clicks Claim buttons
      await pool.query(
        `UPDATE game_state SET
          session_in_progress = FALSE,
          last_session_time = $1,
          streak_days = $2,
          last_streak_date = $3,
          current_session_water = FALSE,
          current_session_sun = FALSE,
          current_session_fertilizer = FALSE,
          missed_sessions = 0,
          pending_stored_sessions = $4,
          pending_base_reward = COALESCE(pending_base_reward, 0) + $5,
          pending_bonus_reward = COALESCE(pending_bonus_reward, 0) + $6,
          player_xp = $8,
          player_level = $9,
          xp_history = $10::jsonb,
          total_sessions = COALESCE(total_sessions, 0) + 1,
          updated_at = NOW()
         WHERE user_id = $7`,
        [now, newStreak, todayUTC, storedSessionsResult, baseReward, bonusReward, userId, newTotalXP, newLevel, JSON.stringify(newXpHistory)],
      );

      return res.json({ success: true, sessionComplete: true, baseReward, bonusReward, storedSessions: storedSessionsResult, xpGained, newLevel, prevLevel, levelUp, xpHistory: newXpHistory });
    }

    return res.json({ success: true, sessionComplete: false, baseReward: 0, bonusReward: 0, storedSessions: 1 });
  } catch (err) {
    req.log.error({ err }, "Error processing action");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/session/claimAll — claim both base and bonus in one request
router.post("/game/session/claimAll", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  try {
    const gameRow = await pool.query("SELECT * FROM game_state WHERE user_id = $1", [userId]);
    if (gameRow.rows.length === 0) return res.status(404).json({ error: "Account not found" });

    const g = gameRow.rows[0];
    if (isEconomyV2TutorialActive(g.tutorial_done)) {
      return res.status(409).json({
        error: "Tutorial active — rewards are not claimable",
        code: "tutorial_active",
      });
    }

    const baseAmount = parseFloat(g.pending_base_reward) || 0;
    const bonusAmount = parseFloat(g.pending_bonus_reward) || 0;
    const totalAmount = baseAmount + bonusAmount;

    if (totalAmount <= 0) {
      return res.status(409).json({ error: "Nothing to claim" });
    }

    const earnedDate = new Date().toLocaleDateString("ru-RU");

    // Money claim only — tree mm comes from Care Growth formula, not rub→mm.
    const newGrowthMM = parseInt(g.tree_growth_mm) || 0;
    const newGrowthRemainder = parseFloat(g.tree_growth_remainder) || 0;

    const applesCollected = Math.max(0, parseInt(req.body?.applesCollected, 10) || 0);
    const prevApples = parseInt(g.total_apples, 10) || 0;
    const totalApples = prevApples + applesCollected;
    await pool.query(
      `UPDATE game_state SET pending_base_reward = 0, pending_bonus_reward = 0, total_apples = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, totalApples],
    );
    await pool.query(
      `UPDATE accounts SET active_balance = active_balance + $1, active_earned = active_earned + $1 WHERE user_id = $2`,
      [totalAmount, userId],
    );
    if (baseAmount > 0) {
      await pool.query(
        `INSERT INTO income_history(user_id, amount, type, earned_date) VALUES($1, $2, 'base', $3)`,
        [userId, baseAmount, earnedDate],
      );
    }
    if (bonusAmount > 0) {
      await pool.query(
        `INSERT INTO income_history(user_id, amount, type, earned_date) VALUES($1, $2, 'bonus', $3)`,
        [userId, bonusAmount, earnedDate],
      );
    }

    req.log.info({ baseAmount, bonusAmount, totalAmount, newGrowthMM, applesCollected, totalApples }, "All rewards claimed");
    return res.json({
      success: true,
      totalAmount,
      baseAmount,
      bonusAmount,
      treeGrowthMM: newGrowthMM,
      treeGrowthRemainder: newGrowthRemainder,
      applesCollected,
      totalApples,
    });
  } catch (err) {
    req.log.error({ err }, "Error claiming all rewards");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/session/claim — claim base or bonus reward
router.post("/game/session/claim", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const { type } = req.body;

  if (type !== "base" && type !== "bonus") {
    return res.status(400).json({ error: "Invalid claim type" });
  }

  const col = type === "base" ? "pending_base_reward" : "pending_bonus_reward";
  const historyType = type; // "base" or "bonus"

  try {
    const gameRow = await pool.query("SELECT * FROM game_state WHERE user_id = $1", [userId]);
    if (gameRow.rows.length === 0) return res.status(404).json({ error: "Account not found" });

    const g = gameRow.rows[0];
    if (isEconomyV2TutorialActive(g.tutorial_done)) {
      return res.status(409).json({
        error: "Tutorial active — rewards are not claimable",
        code: "tutorial_active",
      });
    }

    const amount = parseFloat(g[col]) || 0;

    if (amount <= 0) {
      return res.status(409).json({ error: "Nothing to claim" });
    }

    const earnedDate = new Date().toLocaleDateString("ru-RU");

    // Money claim only — tree mm comes from Care Growth formula, not rub→mm.
    const newGrowthMM = parseInt(g.tree_growth_mm) || 0;
    const newGrowthRemainder = parseFloat(g.tree_growth_remainder) || 0;

    await pool.query(
      `UPDATE game_state SET ${col} = 0, updated_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    await pool.query(
      `UPDATE accounts SET active_balance = active_balance + $1, active_earned = active_earned + $1
       WHERE user_id = $2`,
      [amount, userId],
    );
    await pool.query(
      `INSERT INTO income_history(user_id, amount, type, earned_date)
       VALUES($1, $2, $3, $4)`,
      [userId, amount, historyType, earnedDate],
    );

    req.log.info({ type, amount, newGrowthMM }, "Reward claimed");
    return res.json({ success: true, amount, treeGrowthMM: newGrowthMM, treeGrowthRemainder: newGrowthRemainder });
  } catch (err) {
    req.log.error({ err }, "Error claiming reward");
    return res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/game/leaderboard — top players by XP
router.get("/game/leaderboard", requireAuth, async (req: any, res) => {
  const me = req.userId;

  try {
    // Clean up orphaned game_state rows (user deleted but game_state remained)
    await pool.query(`
      DELETE FROM game_state
      WHERE user_id NOT IN (SELECT id::text FROM users)
    `).catch(() => {});

    const result = await pool.query(`
      SELECT gs.user_id,
             u.nickname,
             gs.player_xp, gs.player_level, gs.total_login_days,
             gs.tree_growth_mm, gs.xp_history
      FROM game_state gs
      INNER JOIN users u ON u.id::text = gs.user_id
      WHERE gs.player_xp > 0 OR gs.tree_growth_mm > 0
      ORDER BY gs.player_xp DESC
      LIMIT 100
    `);
    const rows = result.rows.map((r: any, i: number) => {
      const history: { xp: number; date: string; n: number }[] = r.xp_history ?? [];
      const lastSession = history.length > 0 ? history[0] : null;
      return {
        rank: i + 1,
        nickname: r.nickname,
        xp: r.player_xp ?? 0,
        level: r.player_level ?? 1,
        loginDays: parseInt(String(r.total_login_days ?? 0), 10) || 0,
        treeGrowthMM: r.tree_growth_mm ?? 0,
        lastSessionXp: lastSession?.xp ?? 0,
        isMe: r.user_id === me,
      };
    });
    return res.json({ players: rows });
  } catch (err) {
    req.log.error({ err }, "Error fetching leaderboard");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** Normalize boolean / int tutorial_done column to 0|1 for achievement counts. */
function tutorialDoneCount(raw: unknown): number {
  if (raw === true || raw === 1 || raw === "1" || raw === "t" || raw === "true") {
    return 1;
  }
  return 0;
}

// GET /api/game/achievements — return current activity counts + claimed list
router.get("/game/achievements", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  try {
    const row = await pool.query(
      `SELECT total_sessions, total_login_days, total_water_drops, total_sun_catches,
              total_leaf_picks, claimed_achievements, total_apples, tutorial_done
         FROM game_state WHERE user_id = $1`,
      [userId],
    );
    if (row.rows.length === 0) return res.json({ counts: {}, claimed: [], totalApples: 0 });
    const g = row.rows[0];
    const claimed: string[] = Array.isArray(g.claimed_achievements)
      ? g.claimed_achievements
      : (g.claimed_achievements ? JSON.parse(g.claimed_achievements) : []);
    return res.json({
      counts: {
        total_sessions: parseInt(g.total_sessions) || 0,
        total_login_days: parseInt(g.total_login_days) || 0,
        total_water_drops: parseInt(g.total_water_drops) || 0,
        total_sun_catches: parseInt(g.total_sun_catches) || 0,
        total_leaf_picks: parseInt(g.total_leaf_picks) || 0,
        tutorial_done: tutorialDoneCount(g.tutorial_done),
      },
      claimed,
      totalApples: parseInt(g.total_apples) || 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching achievements");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const ACHIEVEMENT_REWARDS: Record<string, number> = {
  tutorial_1: 1,
  days_1: 1, days_10: 30, days_100: 100,
  water_100: 1, water_1000: 30, water_10000: 100,
  sun_100: 1, sun_1000: 30, sun_10000: 100,
  leaf_100: 1, leaf_1000: 30, leaf_10000: 100,
};

const ACHIEVEMENT_THRESHOLDS: Record<string, { field: string; threshold: number }> = {
  tutorial_1:   { field: "tutorial_done",     threshold: 1 },
  days_1:       { field: "total_login_days",  threshold: 1 },
  days_10:      { field: "total_login_days",  threshold: 10 },
  days_100:     { field: "total_login_days",  threshold: 100 },
  water_100:    { field: "total_water_drops", threshold: 100 },
  water_1000:   { field: "total_water_drops", threshold: 1000 },
  water_10000:  { field: "total_water_drops", threshold: 10000 },
  sun_100:      { field: "total_sun_catches", threshold: 100 },
  sun_1000:     { field: "total_sun_catches", threshold: 1000 },
  sun_10000:    { field: "total_sun_catches", threshold: 10000 },
  leaf_100:     { field: "total_leaf_picks",  threshold: 100 },
  leaf_1000:    { field: "total_leaf_picks",  threshold: 1000 },
  leaf_10000:   { field: "total_leaf_picks",  threshold: 10000 },
};

// POST /api/game/achievements/claim — claim one achievement, award apples
router.post("/game/achievements/claim", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const { id } = req.body;

  if (!(id in ACHIEVEMENT_REWARDS) || !ACHIEVEMENT_THRESHOLDS[id]) {
    return res.status(400).json({ error: "Invalid achievement id" });
  }

  try {
    const row = await pool.query(
      `SELECT total_sessions, total_login_days, total_water_drops, total_sun_catches,
              total_leaf_picks, claimed_achievements, total_apples, tutorial_done
         FROM game_state WHERE user_id = $1`,
      [userId],
    );
    if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const g = row.rows[0];

    const claimed: string[] = Array.isArray(g.claimed_achievements)
      ? g.claimed_achievements
      : (g.claimed_achievements ? JSON.parse(g.claimed_achievements) : []);

    if (claimed.includes(id)) return res.status(409).json({ error: "Already claimed" });

    const { field, threshold } = ACHIEVEMENT_THRESHOLDS[id];
    const values: Record<string, number> = {
      total_sessions: parseInt(g.total_sessions) || 0,
      total_login_days: parseInt(g.total_login_days) || 0,
      total_water_drops: parseInt(g.total_water_drops) || 0,
      total_sun_catches: parseInt(g.total_sun_catches) || 0,
      total_leaf_picks: parseInt(g.total_leaf_picks) || 0,
      tutorial_done: tutorialDoneCount(g.tutorial_done),
    };
    const currentVal = values[field] ?? 0;
    if (currentVal < threshold) return res.status(409).json({ error: "Not yet reached" });

    const applesAwarded = ACHIEVEMENT_REWARDS[id];
    const newClaimed = [...claimed, id];
    const newTotalApples = (parseInt(g.total_apples) || 0) + applesAwarded;

    await pool.query(
      `UPDATE game_state SET claimed_achievements = $2::jsonb, total_apples = $3, updated_at = NOW() WHERE user_id = $1`,
      [userId, JSON.stringify(newClaimed), newTotalApples],
    );

    req.log.info({ id, applesAwarded, newTotalApples }, "Achievement claimed");
    return res.json({ success: true, applesAwarded, totalApples: newTotalApples });
  } catch (err) {
    req.log.error({ err }, "Error claiming achievement");
    return res.status(500).json({ error: "Internal server error" });
  }
});


// ── Shop ─────────────────────────────────────────────────────────────────────

const VALID_SHOP_ITEMS: Record<string, number> = {
  flowers:   30,
  birds:     50,
  butterfly: 70,
};

// POST /api/game/shop/buy
router.post("/game/shop/buy", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const { itemId } = req.body;

  if (!itemId || !VALID_SHOP_ITEMS[itemId]) {
    return res.status(400).json({ error: "Unknown item" });
  }
  const price = VALID_SHOP_ITEMS[itemId];

  try {
    const row = await pool.query(
      `SELECT total_apples, purchased_items FROM game_state WHERE user_id = $1`,
      [userId],
    );
    if (row.rows.length === 0) return res.status(404).json({ error: "Not found" });

    const g = row.rows[0];
    const apples = parseInt(g.total_apples) || 0;
    const owned: string[] = Array.isArray(g.purchased_items)
      ? g.purchased_items
      : (g.purchased_items ? JSON.parse(g.purchased_items) : []);

    if (owned.includes(itemId)) return res.status(409).json({ error: "Already owned" });
    if (apples < price) return res.status(402).json({ error: "Not enough apples" });

    const newApples  = apples - price;
    const newOwned   = [...owned, itemId];

    await pool.query(
      `UPDATE game_state SET total_apples = $2, purchased_items = $3::jsonb, updated_at = NOW() WHERE user_id = $1`,
      [userId, newApples, JSON.stringify(newOwned)],
    );

    return res.json({ success: true, totalApples: newApples, purchasedItems: newOwned });
  } catch (err) {
    req.log.error({ err }, "Error buying shop item");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
