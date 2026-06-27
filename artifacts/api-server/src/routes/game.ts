import { Router } from "express";
import { pool } from "@workspace/db";

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

    return res.json({
      exists: true,
      balances: {
        balance: parseFloat(acc.active_balance),
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
        pendingStoredSessions: parseInt(game.pending_stored_sessions) || 1,
        treeGrowthMM: parseInt(game.tree_growth_mm) || 0,
        treeGrowthRemainder: parseFloat(game.tree_growth_remainder) || 0,
        playerXP: parseInt(game.player_xp) || 0,
        playerLevel: parseInt(game.player_level) || 1,
        totalApples: parseInt(game.total_apples) || 0,
        xpHistory: Array.isArray(game.xp_history)
          ? game.xp_history
          : (game.xp_history ? JSON.parse(game.xp_history) : []),
      },
      history: historyRows.rows.map((r: any) => ({
        amount: parseFloat(r.amount),
        type: r.type,
        date: r.earned_date,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching game state");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/init — create account with starting capital
router.post("/game/init", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const { startingCapital } = req.body;

  const capital = Number(startingCapital);
  if (!capital || capital <= 0 || !Number.isFinite(capital)) {
    return res.status(400).json({ error: "Invalid starting capital" });
  }

  const now = Date.now();

  try {
    const existing = await pool.query("SELECT user_id FROM accounts WHERE user_id = $1", [userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Account already exists" });
    }

    await pool.query(
      `INSERT INTO accounts(user_id, standard_balance, active_balance, standard_earned, active_earned, total_days_earned, start_date, starting_capital)
       VALUES($1, 0, $2, 0, 0, 0, $3, $4)`,
      [userId, capital, now, capital],
    );
    await pool.query(
      `INSERT INTO game_state(user_id, last_session_time, session_in_progress, current_session_water, current_session_sun, current_session_fertilizer, pending_base_reward, pending_bonus_reward)
       VALUES($1, NULL, FALSE, FALSE, FALSE, FALSE, 0, 0)`,
      [userId],
    );

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error initializing account");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/accrue — no-op: standard deposit removed, all income via active sessions
router.post("/game/accrue", requireAuth, async (_req: any, res) => {
  return res.json({ accrued: 0, days: 0 });
});

// POST /api/game/session/start — begin a session
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

    if (g.session_in_progress) {
      return res.status(409).json({ error: "Session already in progress" });
    }

    if (g.last_session_time && now - parseInt(g.last_session_time) < COOLDOWN_MS) {
      const nextAvailable = parseInt(g.last_session_time) + COOLDOWN_MS;
      return res.status(429).json({ error: "Session locked", nextAvailable });
    }

    // Calculate how many sessions were missed since the last one.
    // If last_session_time is null (never played), fall back to start_date so
    // players who were away from day 1 still accumulate super sessions.
    let additionalMissed = 0;
    const referenceTime = g.last_session_time
      ? parseInt(g.last_session_time)
      : parseInt(accRow.rows[0].start_date);
    const elapsed = now - referenceTime;
    // Each full cooldown period that passed is a potential session;
    // subtract 1 because the current session is the one being started now.
    additionalMissed = Math.max(0, Math.floor(elapsed / COOLDOWN_MS) - 1);

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
  const { action, skillScore: rawSkillScore } = req.body;
  const skillScore: number = typeof rawSkillScore === "number" && !isNaN(rawSkillScore) && rawSkillScore >= 0 && rawSkillScore <= 100
    ? rawSkillScore
    : 40;

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

      // Streak logic — one increment per calendar day (UTC), using last_streak_date
      // last_streak_date is ONLY updated by real session completions (not debug)
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
        newStreak = currentStreak;
      } else if (lastStreakDate === yesterdayUTC) {
        // Consecutive day — increment (max 7)
        newStreak = currentStreak + 1;
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
    const baseAmount = parseFloat(g.pending_base_reward) || 0;
    const bonusAmount = parseFloat(g.pending_bonus_reward) || 0;
    const totalAmount = baseAmount + bonusAmount;

    if (totalAmount <= 0) {
      return res.status(409).json({ error: "Nothing to claim" });
    }

    const earnedDate = new Date().toLocaleDateString("ru-RU");

    // Apply tree growth for combined amount
    const wholeMM = Math.floor(totalAmount);
    const growRemainder = totalAmount - wholeMM;
    let newGrowthMM = (parseInt(g.tree_growth_mm) || 0) + wholeMM;
    let newGrowthRemainder = (parseFloat(g.tree_growth_remainder) || 0) + growRemainder;
    if (newGrowthRemainder >= 1) {
      const extraMM = Math.floor(newGrowthRemainder);
      newGrowthMM += extraMM;
      newGrowthRemainder -= extraMM;
    }

    const applesCollected = parseInt(req.body?.applesCollected) || 0;
    await pool.query(
      `UPDATE game_state SET pending_base_reward = 0, pending_bonus_reward = 0, tree_growth_mm = $2, tree_growth_remainder = $3, total_apples = COALESCE(total_apples, 0) + $4, updated_at = NOW() WHERE user_id = $1`,
      [userId, newGrowthMM, newGrowthRemainder, applesCollected],
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

    req.log.info({ baseAmount, bonusAmount, totalAmount, newGrowthMM }, "All rewards claimed");
    return res.json({ success: true, totalAmount, baseAmount, bonusAmount, treeGrowthMM: newGrowthMM, treeGrowthRemainder: newGrowthRemainder });
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
    const amount = parseFloat(g[col]) || 0;

    if (amount <= 0) {
      return res.status(409).json({ error: "Nothing to claim" });
    }

    const earnedDate = new Date().toLocaleDateString("ru-RU");

    // Apply tree growth: 1 RUB = 1 mm, max 10000 mm
    const wholeMM = Math.floor(amount);
    const growRemainder = amount - wholeMM;
    let newGrowthMM = (parseInt(g.tree_growth_mm) || 0) + wholeMM;
    let newGrowthRemainder = (parseFloat(g.tree_growth_remainder) || 0) + growRemainder;
    if (newGrowthRemainder >= 1) {
      const extraMM = Math.floor(newGrowthRemainder);
      newGrowthMM += extraMM;
      newGrowthRemainder -= extraMM;
    }

    await pool.query(
      `UPDATE game_state SET ${col} = 0, tree_growth_mm = $2, tree_growth_remainder = $3, updated_at = NOW() WHERE user_id = $1`,
      [userId, newGrowthMM, newGrowthRemainder],
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

// POST /api/game/debug/add-sessions — add exactly +1 to the displayed storedSessions (debug)
// The server computes the current "computedMissed" from DB data (same formula as the frontend)
// and sets missed_sessions = computedMissed + 1, so the display always goes up by exactly 1.
router.post("/game/debug/add-sessions", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const now = Date.now();
  try {
    const [gsRow, accRow] = await Promise.all([
      pool.query("SELECT missed_sessions, last_session_time FROM game_state WHERE user_id = $1", [userId]),
      pool.query("SELECT start_date FROM accounts WHERE user_id = $1", [userId]),
    ]);
    if (!gsRow.rows[0] || !accRow.rows[0]) {
      return res.status(404).json({ error: "Account not found" });
    }
    const g = gsRow.rows[0];
    const dbMissed = g.missed_sessions || 0;
    const lastSessionTime = g.last_session_time ? parseInt(g.last_session_time) : null;
    const startDate = parseInt(accRow.rows[0].start_date);

    // Mirror the client's computedMissed formula exactly
    const referenceTime = lastSessionTime ?? startDate;
    const elapsed = now - referenceTime;
    const additional = Math.max(0, Math.floor(elapsed / COOLDOWN_MS) - 1);
    const currentComputedMissed = dbMissed + additional;

    // Add exactly +1 to the displayed count
    const newMissed = currentComputedMissed + 1;
    // Set last_session_time to exactly one cooldown ago so elapsed = COOLDOWN_MS,
    // additional = 0, and computedMissed = newMissed (no extra time-based sessions).
    const justExpired = now - COOLDOWN_MS;

    await pool.query(
      `UPDATE game_state SET
        missed_sessions = $2,
        last_session_time = $3,
        session_in_progress = FALSE,
        updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newMissed, justExpired],
    );
    return res.json({ success: true, missedSessions: newMissed, lastSessionTime: justExpired });
  } catch (err) {
    req.log.error({ err }, "Error adding sessions (debug)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/debug/add-streak-day — increment streak_days by 1 (debug)
router.post("/game/debug/add-streak-day", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  try {
    const result = await pool.query(
      `UPDATE game_state SET streak_days = COALESCE(streak_days, 0) + 1, updated_at = NOW()
       WHERE user_id = $1
       RETURNING streak_days`,
      [userId],
    );
    const streakDays = result.rows[0]?.streak_days ?? 1;
    return res.json({ success: true, streakDays: Number(streakDays) });
  } catch (err) {
    req.log.error({ err }, "Error adding streak day (debug)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/game/debug/add-xp — add XP to player (debug)
router.post("/game/debug/add-xp", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  const value = Math.floor(Number(req.body.xp));
  if (isNaN(value) || value < 1) {
    return res.status(400).json({ error: "Invalid xp value" });
  }
  try {
    const result = await pool.query(
      `UPDATE game_state SET player_xp = player_xp + $2, updated_at = NOW()
       WHERE user_id = $1
       RETURNING player_xp`,
      [userId, value],
    );
    const newXP = result.rows[0]?.player_xp ?? 0;
    return res.json({ success: true, playerXP: Number(newXP) });
  } catch (err) {
    req.log.error({ err }, "Error adding XP (debug)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/game/leaderboard — top players by XP
router.get("/game/leaderboard", requireAuth, async (req: any, res) => {
  const me = req.userId;

  try {
    const result = await pool.query(`
      SELECT gs.user_id,
             COALESCE(u.nickname, 'Игрок ' || gs.user_id) AS nickname,
             gs.player_xp, gs.player_level, gs.streak_days,
             gs.tree_growth_mm, gs.xp_history
      FROM game_state gs
      LEFT JOIN users u ON u.id::text = gs.user_id
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
        streakDays: r.streak_days ?? 0,
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

// DELETE /api/game/debug/reset-all — wipe all user data including the user record itself
router.delete("/game/debug/reset-all", requireAuth, async (req: any, res) => {
  const userId = req.userId;
  try {
    await pool.query("DELETE FROM income_history WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM game_state WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM accounts WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]).catch(() => {});
    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error wiping user data (debug)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
