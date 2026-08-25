import type { Router } from "express";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { poolQueryMock, settleMock, settleV3Mock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  settleMock: vi.fn(),
  settleV3Mock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    query: poolQueryMock,
    connect: vi.fn(),
  },
}));

vi.mock("../services/economy-v2-energy-settle", () => ({
  settleAndPersistEconomyV2Energy: settleMock,
}));

vi.mock("../services/economy-v3-roots-settle", () => ({
  settleAndPersistEconomyV3Roots: settleV3Mock,
}));

import gameRouter from "./game";

type JsonBody = Record<string, unknown>;

type TestRequest = {
  session?: { userId?: unknown };
  userId?: string;
  query?: { visitDate?: string };
  log: { error: ReturnType<typeof vi.fn> };
};

type TestResponse = {
  statusCode: number;
  body: JsonBody | undefined;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

type RouteMiddleware = (
  req: TestRequest,
  res: TestResponse,
  next: (err?: unknown) => void,
) => unknown;

function createResponse(): TestResponse {
  const res: TestResponse = {
    statusCode: 200,
    body: undefined,
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((payload: JsonBody) => {
    res.body = payload;
    return res;
  });
  return res;
}

function getStateHandlers(): RouteMiddleware[] {
  const layer = (gameRouter as Router).stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      entry.route?.path === "/game/state" && entry.route?.methods?.get,
  ) as { route: { stack: Array<{ handle: RouteMiddleware }> } } | undefined;

  if (!layer) {
    throw new Error("GET /game/state route not found");
  }
  return layer.route.stack.map((s) => s.handle);
}

async function runGetState(req: TestRequest): Promise<TestResponse> {
  const handlers = getStateHandlers();
  const res = createResponse();
  let idx = 0;

  await new Promise<void>((resolve, reject) => {
    res.json.mockImplementation((payload: JsonBody) => {
      res.body = payload;
      resolve();
      return res;
    });
    res.status.mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    });

    const next = (err?: unknown) => {
      if (err) {
        reject(err);
        return;
      }
      const handler = handlers[idx++];
      if (!handler) {
        resolve();
        return;
      }
      Promise.resolve(handler(req, res, next)).catch(reject);
    };
    next();
  });

  return res;
}

function mockHappyPathQueries() {
  settleMock.mockResolvedValue({
    energySeconds: 11.4,
    energyAnchorAt: 1_700_000_000_000,
    rootReadyMask: 1n,
    rootGenerationProgress: 0.4,
    excessSeconds: 2.5,
    roots: {
      readyMask: "1",
      readyCount: 1,
      generationProgress: 0.4,
      secondsPerSection: 720,
      secondsUntilNextSection: 432,
      isFull: false,
      storageFull: false,
      storageOccupied: 1.4,
      storageFree: 58.6,
      storageOverCapacity: false,
    },
    excess: {
      excessSeconds: 2.5,
      excessElapsedMs: 0,
      excessFinanciallyValid: true,
      excessCycle: 2.5 / 60,
      excessAvailable: false,
      excessPresetSeconds: 5,
      excessRate: 0.015,
      session: {
        active: false,
        startedAt: null,
        sourceSeconds: null,
        sourceElapsedMs: null,
        capital: null,
        presetSeconds: null,
        rate: null,
      },
    },
  });

  settleV3Mock.mockResolvedValue({
    rootWaterSeconds: 3,
    rootSunSeconds: 3,
    rootFertilizerSeconds: 3,
    generationProgress: 0.1,
    generationAnchorAt: 1_700_000_000_000,
    dayKey: "2026-07-23",
    elapsedMs: 0,
    elapsedSeconds: 0,
    generatedRaw: 0,
    wholeSeconds: 0,
    generated: true,
    autoTransfer: null,
    snapshot: {
      enabled: true,
      dailyCapSeconds: 20,
      dayKey: "2026-07-23",
      roots: {
        water: {
          seconds: 3,
          fullSegments: 0,
          partialSegmentSeconds: 3,
          capacitySeconds: 25,
          fillFraction: 3 / 25,
          playableFromRoot: true,
          transferred: false,
          frozen: false,
        },
        sun: {
          seconds: 3,
          fullSegments: 0,
          partialSegmentSeconds: 3,
          capacitySeconds: 25,
          fillFraction: 3 / 25,
          playableFromRoot: true,
          transferred: false,
          frozen: false,
        },
        fertilizer: {
          seconds: 3,
          fullSegments: 0,
          partialSegmentSeconds: 3,
          capacitySeconds: 25,
          fillFraction: 3 / 25,
          playableFromRoot: true,
          transferred: false,
          frozen: false,
        },
      },
      reserves: {
        water: { seconds: 0, capacitySeconds: 20, playable: false },
        sun: { seconds: 0, capacitySeconds: 20, playable: false },
        fertilizer: { seconds: 0, capacitySeconds: 20, playable: false },
      },
      careAvailability: {
        water: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
        sun: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
        fertilizer: { reserveSeconds: 0, playable: false, maxPresetSeconds: 0 },
      },
      careSession: {
        active: false,
        activity: null,
        presetSeconds: null,
        startedAt: null,
        finishedAt: null,
        status: null,
        skill: null,
      },
      careCycle: {
        startedAt: null,
        completedAt: null,
        finishedAt: null,
        status: null,
        allCompleted: false,
        readyToFinish: false,
        totalPresetSeconds: null,
        averageSkill: null,
        activities: {
          water: { completed: false, presetSeconds: null, skill: null },
          sun: { completed: false, presetSeconds: null, skill: null },
          fertilizer: { completed: false, presetSeconds: null, skill: null },
        },
        rewardPreview: {
          available: false,
          xp: 0,
          apples: 0,
          treeGrowth: 0,
          income: { base: 0, bonus: 0, total: 0 },
        },
        claim: {
          claimed: false,
          claimedAt: null,
          xp: 0,
          treeGrowth: 0,
          income: { base: 0, bonus: 0, total: 0 },
        },
      },
      generation: {
        anchorAt: new Date(1_700_000_000_000).toISOString(),
        progress: 0.1,
        frozenAt: null,
        insuranceDeadlineAt: null,
        firstTransferredRoot: null,
        transferredRoots: [],
        secondsUntilNextWholeSecond: 648,
        accumulating: true,
      },
    },
  });

  poolQueryMock
    .mockResolvedValueOnce({
      rows: [
        {
          active_balance: "100000",
          active_earned: "0",
          total_days_earned: 0,
          start_date: "1700000000000",
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          last_session_time: null,
          session_in_progress: false,
          current_session_water: false,
          current_session_sun: false,
          current_session_fertilizer: false,
          streak_days: 0,
          missed_sessions: 0,
          pending_base_reward: "0",
          pending_bonus_reward: "0",
          pending_stored_sessions: 1,
          tree_growth_mm: "0",
          tree_growth_remainder: "0",
          player_xp: 0,
          player_level: 1,
          total_apples: 0,
          purchased_items: [],
          xp_history: [],
          tutorial_done: true,
          last_login_date: new Date().toISOString().slice(0, 10),
          v2_energy_seconds: "0",
          v2_energy_anchor_at: null,
          v2_care_in_progress: false,
          v2_care_cycle_id: null,
          v2_care_water_seconds: 0,
          v2_care_sun_seconds: 0,
          v2_care_fertilizer_seconds: 0,
          v2_care_water_completed: false,
          v2_care_sun_completed: false,
          v2_care_fertilizer_completed: false,
          v2_freshness: "1",
          v2_income_anchor_at: null,
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [
        {
          v2_care_in_progress: false,
          v2_care_cycle_id: null,
          v2_care_water_seconds: 0,
          v2_care_sun_seconds: 0,
          v2_care_fertilizer_seconds: 0,
          v2_care_water_completed: false,
          v2_care_sun_completed: false,
          v2_care_fertilizer_completed: false,
          v2_care_started_at: null,
          v2_care_water_score: null,
          v2_care_sun_score: null,
          v2_care_fertilizer_score: null,
        },
      ],
    });
}

describe("GET /game/state Economy v3Roots settle wiring", () => {
  const prevFlag = process.env.ENABLE_ECONOMY_V3_ROOTS;

  beforeEach(() => {
    poolQueryMock.mockReset();
    settleMock.mockReset();
    settleV3Mock.mockReset();
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    } else {
      process.env.ENABLE_ECONOMY_V3_ROOTS = prevFlag;
    }
  });

  it("omits v3Roots and does not call v3 settle when flag is false", async () => {
    delete process.env.ENABLE_ECONOMY_V3_ROOTS;
    mockHappyPathQueries();

    const res = await runGetState({
      session: { userId: "42" },
      log: { error: vi.fn() },
    });

    const game = res.body?.game as Record<string, unknown>;
    expect(game).not.toHaveProperty("v3Roots");
    expect(settleV3Mock).not.toHaveBeenCalled();
    expect(settleMock).toHaveBeenCalledWith("42");
    expect(game.v2EnergySeconds).toBe(11.4);
  });

  it("calls v3 settle once and returns settled snapshot when flag is true", async () => {
    process.env.ENABLE_ECONOMY_V3_ROOTS = "true";
    mockHappyPathQueries();

    const res = await runGetState({
      session: { userId: "42" },
      log: { error: vi.fn() },
    });

    expect(settleV3Mock).toHaveBeenCalledTimes(1);
    expect(settleV3Mock).toHaveBeenCalledWith("42");
    const game = res.body?.game as Record<string, unknown>;
    expect(game.v3Roots).toMatchObject({
      enabled: true,
      roots: {
        water: { seconds: 3, playableFromRoot: true },
        sun: { seconds: 3 },
        fertilizer: { seconds: 3 },
      },
      generation: {
        progress: 0.1,
        accumulating: true,
      },
    });
    expect(game.v2EnergySeconds).toBe(11.4);
  });
});

describe("GET /game/state visit-day login tick", () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
    settleMock.mockReset();
    settleV3Mock.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("second calendar day with streak 0 persists day 2", async () => {
    mockHappyPathQueries();
    poolQueryMock.mockReset();
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            active_balance: "100000",
            active_earned: "0",
            total_days_earned: 0,
            start_date: "1700000000000",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            last_session_time: null,
            session_in_progress: false,
            current_session_water: false,
            current_session_sun: false,
            current_session_fertilizer: false,
            streak_days: 0,
            last_streak_date: null,
            last_login_date: "2026-08-25",
            missed_sessions: 0,
            pending_base_reward: "0",
            pending_bonus_reward: "0",
            pending_stored_sessions: 1,
            tree_growth_mm: "0",
            tree_growth_remainder: "0",
            player_xp: 0,
            player_level: 1,
            total_apples: 0,
            purchased_items: [],
            xp_history: [],
            tutorial_done: true,
            v2_energy_seconds: "0",
            v2_energy_anchor_at: null,
            v2_care_in_progress: false,
            v2_care_cycle_id: null,
            v2_care_water_seconds: 0,
            v2_care_sun_seconds: 0,
            v2_care_fertilizer_seconds: 0,
            v2_care_water_completed: false,
            v2_care_sun_completed: false,
            v2_care_fertilizer_completed: false,
            v2_freshness: "1",
            v2_income_anchor_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            v2_care_in_progress: false,
            v2_care_cycle_id: null,
            v2_care_water_seconds: 0,
            v2_care_sun_seconds: 0,
            v2_care_fertilizer_seconds: 0,
            v2_care_water_completed: false,
            v2_care_sun_completed: false,
            v2_care_fertilizer_completed: false,
            v2_care_started_at: null,
            v2_care_water_score: null,
            v2_care_sun_score: null,
            v2_care_fertilizer_score: null,
          },
        ],
      });

    const res = await runGetState({
      session: { userId: "42" },
      log: { error: vi.fn() },
    });

    const updateCall = poolQueryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("last_streak_date"),
    );
    expect(updateCall?.[1]).toEqual(["42", "2026-08-26", 2, 1]);
    const game = res.body?.game as Record<string, unknown>;
    expect(game.streakDays).toBe(2);
  });
});
