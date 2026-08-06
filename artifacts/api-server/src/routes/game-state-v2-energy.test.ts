import type { Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("GET /game/state v2 energy settle", () => {
  beforeEach(() => {
    poolQueryMock.mockReset();
    settleMock.mockReset();
    settleV3Mock.mockReset();
    settleV3Mock.mockResolvedValue(null);
  });

  it("returns settled v2EnergySeconds from settle helper", async () => {
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
      },
      excess: {
        excessSeconds: 2.5,
        excessCycle: 2.5 / 60,
        excessAvailable: false,
        excessPresetSeconds: 5,
        excessRate: 0.015,
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
            v2_care_in_progress: true,
            v2_care_cycle_id: "cycle-f5",
            v2_care_water_seconds: 6,
            v2_care_sun_seconds: 5,
            v2_care_fertilizer_seconds: 5,
            v2_care_water_completed: true,
            v2_care_sun_completed: false,
            v2_care_fertilizer_completed: false,
            v2_care_started_at: 1_700_000_000_000,
            v2_care_water_score: 83,
            v2_care_sun_score: null,
            v2_care_fertilizer_score: null,
            v2_freshness: "1",
            v2_income_anchor_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      // Re-read Care snapshot after settle (F5 recovery)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_care_in_progress: true,
            v2_care_cycle_id: "cycle-f5",
            v2_care_water_seconds: 6,
            v2_care_sun_seconds: 5,
            v2_care_fertilizer_seconds: 5,
            v2_care_water_completed: true,
            v2_care_sun_completed: false,
            v2_care_fertilizer_completed: false,
            v2_care_started_at: 1_700_000_000_000,
            v2_care_water_score: 83,
            v2_care_sun_score: null,
            v2_care_fertilizer_score: null,
          },
        ],
      });

    const res = await runGetState({
      session: { userId: "42" },
      log: { error: vi.fn() },
    });

    expect(settleMock).toHaveBeenCalledWith("42");
    expect(res.body).toMatchObject({
      exists: true,
      game: {
        v2EnergySeconds: 11.4,
        v2EnergyAnchorAt: 1_700_000_000_000,
        v2Roots: {
          readyMask: "1",
          readyCount: 1,
          generationProgress: 0.4,
          secondsPerSection: 720,
          secondsUntilNextSection: 432,
          isFull: false,
        },
        v2Excess: {
          excessSeconds: 2.5,
          excessAvailable: false,
        },
        // v1 session lock field untouched by settle
        lastSessionTime: null,
        v2Care: {
          inProgress: true,
          cycleId: "cycle-f5",
          allocation: {
            waterSeconds: 6,
            sunSeconds: 5,
            fertilizerSeconds: 5,
            totalAllocatedSeconds: 16,
          },
          completed: {
            water: true,
            sun: false,
            fertilizer: false,
          },
          allCompleted: false,
          scores: {
            water: 83,
            sun: null,
            fertilizer: null,
          },
        },
        v2Freshness: 1,
        v2IncomeAnchorAt: null,
      },
    });
  });
});
