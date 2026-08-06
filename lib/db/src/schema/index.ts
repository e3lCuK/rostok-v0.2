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

    /** Separate Metelka pending reward (not Care claimAll). */
    metelkaPendingActive: boolean("metelka_pending_active").notNull().default(false),
    metelkaPendingBase: numeric("metelka_pending_base").notNull().default("0"),
    metelkaPendingBonus: numeric("metelka_pending_bonus").notNull().default("0"),
    metelkaPendingXp: integer("metelka_pending_xp").notNull().default(0),
    metelkaPendingCreatedAt: bigint("metelka_pending_created_at", { mode: "number" }),
    metelkaPendingClaimToken: text("metelka_pending_claim_token"),
    metelkaPendingClaimedAt: bigint("metelka_pending_claimed_at", { mode: "number" }),
  
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
    /** Economy v2 available activity seconds (0–60, fractional). Isolated from v1 8h session lock. */
    v2EnergySeconds: numeric("v2_energy_seconds").notNull().default("0"),
    /** Epoch ms when v2 energy was last settled/written — generation clock for roots. */
    v2EnergyAnchorAt: bigint("v2_energy_anchor_at", { mode: "number" }),
    /** 60-bit mask: bit i = root section i ready to collect (0–59). */
    v2RootReadyMask: bigint("v2_root_ready_mask", { mode: "bigint" }).notNull().default(0n),
    /** Fractional progress toward the next root section [0, 1). */
    v2RootGenerationProgress: numeric("v2_root_generation_progress").notNull().default("0"),

    /** Economy v2 Care cycle — independent from v1 session_* fields. */
    v2CareInProgress: boolean("v2_care_in_progress").notNull().default(false),
    v2CareCycleId: text("v2_care_cycle_id"),
    v2CareWaterSeconds: integer("v2_care_water_seconds").notNull().default(0),
    v2CareSunSeconds: integer("v2_care_sun_seconds").notNull().default(0),
    v2CareFertilizerSeconds: integer("v2_care_fertilizer_seconds").notNull().default(0),
    v2CareWaterCompleted: boolean("v2_care_water_completed").notNull().default(false),
    v2CareSunCompleted: boolean("v2_care_sun_completed").notNull().default(false),
    v2CareFertilizerCompleted: boolean("v2_care_fertilizer_completed").notNull().default(false),
    /** Epoch ms when the current v2 Care cycle was started (audit / recovery). */
    v2CareStartedAt: bigint("v2_care_started_at", { mode: "number" }),
    /** Dedicated Care skill scores (NULL until activity completed). */
    v2CareWaterScore: integer("v2_care_water_score"),
    v2CareSunScore: integer("v2_care_sun_score"),
    v2CareFertilizerScore: integer("v2_care_fertilizer_score"),
    /** Epoch ms of last ordinary Care income settle (financial period anchor). */
    v2IncomeAnchorAt: bigint("v2_income_anchor_at", { mode: "number" }),
    /** Ordinary Care Freshness coefficient 0.50–1.00. */
    v2Freshness: numeric("v2_freshness").notNull().default("1"),

    /**
     * Economy v3 roots + activity reserves (stage 1 storage only).
     * Not wired into production settle / Care / excess while ENABLE_ECONOMY_V3_ROOTS=false.
     */
    v3RootWaterSeconds: numeric("v3_root_water_seconds").notNull().default("0"),
    v3RootSunSeconds: numeric("v3_root_sun_seconds").notNull().default("0"),
    v3RootFertilizerSeconds: numeric("v3_root_fertilizer_seconds")
      .notNull()
      .default("0"),
    v3ReserveWaterSeconds: numeric("v3_reserve_water_seconds")
      .notNull()
      .default("0"),
    v3ReserveSunSeconds: numeric("v3_reserve_sun_seconds").notNull().default("0"),
    v3ReserveFertilizerSeconds: numeric("v3_reserve_fertilizer_seconds")
      .notNull()
      .default("0"),
    v3DailyCapSeconds: integer("v3_daily_cap_seconds").notNull().default(20),
    v3DayKey: text("v3_day_key"),
    v3GenerationAnchorAt: timestamp("v3_generation_anchor_at"),
    v3GenerationFrozenAt: timestamp("v3_generation_frozen_at"),
    v3InsuranceDeadlineAt: timestamp("v3_insurance_deadline_at"),
    /** Fractional progress toward the next whole game-second shared by all three roots [0, 1). */
    v3GenerationProgress: numeric("v3_generation_progress").notNull().default("0"),
    v3FirstTransferredRoot: text("v3_first_transferred_root"),
    v3TransferredRoots: text("v3_transferred_roots")
      .array()
      .notNull()
      .default([]),
    /** Economy v3 single Care activity session (stage 6B/6C). */
    v3CareActivityKind: text("v3_care_activity_kind"),
    v3CareActivityPresetSeconds: integer("v3_care_activity_preset_seconds"),
    v3CareActivityStartedAt: timestamp("v3_care_activity_started_at"),
    v3CareActivityStatus: text("v3_care_activity_status"),
    v3CareActivitySkill: numeric("v3_care_activity_skill"),
    v3CareActivityFinishedAt: timestamp("v3_care_activity_finished_at"),
    /** Economy v3 Care cycle journal (stage 6E). */
    v3CareCycleWaterCompleted: boolean("v3_care_cycle_water_completed")
      .notNull()
      .default(false),
    v3CareCycleWaterPresetSeconds: integer(
      "v3_care_cycle_water_preset_seconds",
    ),
    v3CareCycleWaterSkill: numeric("v3_care_cycle_water_skill"),
    v3CareCycleSunCompleted: boolean("v3_care_cycle_sun_completed")
      .notNull()
      .default(false),
    v3CareCycleSunPresetSeconds: integer("v3_care_cycle_sun_preset_seconds"),
    v3CareCycleSunSkill: numeric("v3_care_cycle_sun_skill"),
    v3CareCycleFertilizerCompleted: boolean(
      "v3_care_cycle_fertilizer_completed",
    )
      .notNull()
      .default(false),
    v3CareCycleFertilizerPresetSeconds: integer(
      "v3_care_cycle_fertilizer_preset_seconds",
    ),
    v3CareCycleFertilizerSkill: numeric("v3_care_cycle_fertilizer_skill"),
    v3CareCycleStartedAt: timestamp("v3_care_cycle_started_at"),
    v3CareCycleCompletedAt: timestamp("v3_care_cycle_completed_at"),
    /** Explicit Care cycle confirmation (stage 6F). */
    v3CareCycleFinishedAt: timestamp("v3_care_cycle_finished_at"),
    v3CareCycleStatus: text("v3_care_cycle_status"),
    v3CareCycleTotalPresetSeconds: integer(
      "v3_care_cycle_total_preset_seconds",
    ),
    v3CareCycleAverageSkill: numeric("v3_care_cycle_average_skill"),
    /** Economy v3 Care cycle claim snapshot (stage 6I). */
    v3CareCycleClaimedAt: timestamp("v3_care_cycle_claimed_at"),
    v3CareCycleClaimedXp: integer("v3_care_cycle_claimed_xp"),
    v3CareCycleClaimedTreeGrowth: integer("v3_care_cycle_claimed_tree_growth"),
    v3CareCycleClaimedBaseIncome: numeric("v3_care_cycle_claimed_base_income"),
    v3CareCycleClaimedBonusIncome: numeric(
      "v3_care_cycle_claimed_bonus_income",
    ),
    v3CareCycleClaimedTotalIncome: numeric(
      "v3_care_cycle_claimed_total_income",
    ),
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