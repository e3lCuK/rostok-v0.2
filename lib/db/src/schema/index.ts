import {
    pgTable,
    serial,
    integer,
    smallint,
    varchar,
    text,
    numeric,
    boolean,
    timestamp,
    json,
    jsonb,
    bigint,
    index,
  } from "drizzle-orm/pg-core";
  
  export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    nickname: varchar("nickname", { length: 100 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    email: text("email"),
  });
  
  export const accounts = pgTable("accounts", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    balance: numeric("balance").notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  
    startingCapital: numeric("starting_capital", { precision: 15, scale: 2 }).notNull().default("0"),
    standardBalance: numeric("standard_balance", { precision: 15, scale: 2 }).notNull().default("0"),
    gamifiedBalance: numeric("gamified_balance", { precision: 15, scale: 2 }).notNull().default("0"),
    activeBalance: numeric("active_balance", { precision: 15, scale: 2 }).notNull().default("0"),
    standardEarned: numeric("standard_earned", { precision: 15, scale: 2 }).notNull().default("0"),
    gamifiedEarned: numeric("gamified_earned", { precision: 15, scale: 2 }).notNull().default("0"),
    activeEarned: numeric("active_earned", { precision: 15, scale: 2 }).notNull().default("0"),
  
    totalDaysEarned: integer("total_days_earned").notNull().default(0),
    startDate: text("start_date"),
  });
  
  export const gameState = pgTable("game_state", {
    userId: text("user_id").primaryKey(),
  
    lastSessionTime: bigint("last_session_time", { mode: "number" }),
    sessionInProgress: boolean("session_in_progress").notNull().default(false),
    currentSessionWater: boolean("current_session_water").notNull().default(false),
    currentSessionSun: boolean("current_session_sun").notNull().default(false),
    currentSessionFertilizer: boolean("current_session_fertilizer").notNull().default(false),
  
    treeGrowthMm: numeric("tree_growth_mm").notNull().default("0"),
    treeGrowthRemainder: numeric("tree_growth_remainder").notNull().default("0"),
  
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  
    missedSessions: integer("missed_sessions").notNull().default(0),
    pendingStoredSessions: integer("pending_stored_sessions").notNull().default(1),
    pendingBaseReward: numeric("pending_base_reward").notNull().default("0"),
    pendingBonusReward: numeric("pending_bonus_reward").notNull().default("0"),
  
    playerXp: integer("player_xp").notNull().default(0),
    playerLevel: smallint("player_level").notNull().default(1),
  
    sessionWaterScore: smallint("session_water_score").notNull().default(40),
    sessionSunScore: smallint("session_sun_score").notNull().default(40),
    sessionFertilizerScore: smallint("session_fertilizer_score").notNull().default(40),
  
    xpHistory: jsonb("xp_history").notNull().default([]),
    lastStreakDate: text("last_streak_date"),
    streakDays: integer("streak_days").notNull().default(0),
  
    totalApples: integer("total_apples").notNull().default(0),
    totalSessions: integer("total_sessions").notNull().default(0),
    totalLoginDays: integer("total_login_days").notNull().default(0),
    totalWaterDrops: integer("total_water_drops").notNull().default(0),
    totalSunCatches: integer("total_sun_catches").notNull().default(0),
    totalLeafPicks: integer("total_leaf_picks").notNull().default(0),
  
    claimedAchievements: jsonb("claimed_achievements").notNull().default([]),
    lastLoginDate: text("last_login_date"),
    purchasedItems: jsonb("purchased_items").notNull().default([]),
    tutorialDone: boolean("tutorial_done").notNull().default(true),
  });
  
  export const incomeHistory = pgTable("income_history", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    amount: numeric("amount").notNull().default("0"),
    kind: text("kind"),
    type: text("type"),
    earnedDate: text("earned_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  });
  
  export const passwordResetTokens = pgTable(
    "password_reset_tokens",
    {
      id: serial("id").primaryKey(),
      userId: integer("user_id").notNull(),
      token: varchar("token", { length: 64 }).notNull().unique(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      used: boolean("used").notNull().default(false),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => ({
      tokenIdx: index("idx_prt_token").on(table.token),
    }),
  );
  
  export const session = pgTable(
    "session",
    {
      sid: varchar("sid").primaryKey(),
      sess: json("sess").notNull(),
      expire: timestamp("expire", { precision: 6 }).notNull(),
    },
    (table) => ({
      expireIdx: index("IDX_session_expire").on(table.expire),
    }),
  );