import type { Router } from "express";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { poolQueryMock, calculateEconomyV2PreviewMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  calculateEconomyV2PreviewMock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    query: poolQueryMock,
  },
}));

vi.mock("../services/economy-v2-preview", () => ({
  calculateEconomyV2Preview: calculateEconomyV2PreviewMock,
}));

import { registerDebugEconomyV2PreviewRoute } from "./debug-economy-v2-preview";

type JsonBody = Record<string, unknown>;

type TestRequest = {
  session?: { userId?: unknown };
  userId?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  log: {
    error: ReturnType<typeof vi.fn>;
  };
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
  next: () => void,
) => unknown;

const FIXED_PREVIEW = {
  rawEnergy: 28.1838293126,
  freshnessCoefficient: 1,
  usableEnergy: 28.1838293126,
  activityDuration: 25,
  maxXp: 100,
} as const;

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

function createRequest(
  overrides: Partial<TestRequest> = {},
): TestRequest {
  return {
    session: {},
    query: {},
    body: {},
    log: {
      error: vi.fn(),
    },
    ...overrides,
  };
}

describe("registerDebugEconomyV2PreviewRoute", () => {
  let registeredPath: string | undefined;
  let registeredHandlers: RouteMiddleware[] = [];

  beforeEach(() => {
    poolQueryMock.mockReset();
    calculateEconomyV2PreviewMock.mockReset();
    calculateEconomyV2PreviewMock.mockReturnValue(FIXED_PREVIEW);
    registeredPath = undefined;
    registeredHandlers = [];

    const router = {
      get: vi.fn((path: string, ...handlers: RouteMiddleware[]) => {
        registeredPath = path;
        registeredHandlers = handlers;
      }),
    };

    registerDebugEconomyV2PreviewRoute(router as unknown as Router);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers the GET debug preview path", () => {
    expect(registeredPath).toBe("/game/debug/economy-v2-preview");
    expect(registeredHandlers).toHaveLength(2);
  });

  it("rejects unauthorized requests before touching the database", async () => {
    const [requireAuth, handler] = registeredHandlers;
    const req = createRequest({ session: {} });
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
    expect(poolQueryMock).not.toHaveBeenCalled();
    expect(calculateEconomyV2PreviewMock).not.toHaveBeenCalled();
    expect(handler).toEqual(expect.any(Function));
  });

  it("returns a successful preview for account and game_state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00.000Z"));

    const lastSessionMs = new Date("2026-07-17T04:00:00.000Z").getTime();
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ active_balance: "1000.50" }] })
      .mockResolvedValueOnce({
        rows: [{ last_session_time: String(lastSessionMs) }],
      });

    const [requireAuth, handler] = registeredHandlers;
    const req = createRequest({ session: { userId: 7 } });
    const res = createResponse();
    const next = vi.fn(() => undefined);

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("7");

    await handler(req, res, vi.fn());

    expect(calculateEconomyV2PreviewMock).toHaveBeenCalledTimes(1);
    const previewArgs = calculateEconomyV2PreviewMock.mock.calls[0][0] as {
      capital: number;
      lastSessionTime: Date | null;
      currentTime: Date;
      freshnessCoefficient?: number;
    };
    expect(previewArgs.capital).toBe(1000.5);
    expect(previewArgs.lastSessionTime?.getTime()).toBe(lastSessionMs);
    expect(previewArgs.currentTime.getTime()).toBe(
      new Date("2026-07-17T12:00:00.000Z").getTime(),
    );
    expect(previewArgs.freshnessCoefficient).toBeUndefined();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      source: {
        capital: 1000.5,
        lastSessionTime: "2026-07-17T04:00:00.000Z",
        currentTime: "2026-07-17T12:00:00.000Z",
      },
      preview: FIXED_PREVIEW,
    });
  });

  it("uses null lastSessionTime when game_state is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00.000Z"));

    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ active_balance: "1000" }] })
      .mockResolvedValueOnce({ rows: [] });

    const [requireAuth, handler] = registeredHandlers;
    const req = createRequest({ session: { userId: 3 } });
    const res = createResponse();

    await requireAuth(req, res, vi.fn());
    await handler(req, res, vi.fn());

    expect(calculateEconomyV2PreviewMock).toHaveBeenCalledWith({
      capital: 1000,
      lastSessionTime: null,
      currentTime: new Date("2026-07-17T12:00:00.000Z"),
    });
    expect(res.body).toMatchObject({
      success: true,
      source: {
        capital: 1000,
        lastSessionTime: null,
        currentTime: "2026-07-17T12:00:00.000Z",
      },
      preview: FIXED_PREVIEW,
    });
    expect(poolQueryMock.mock.calls.every((call) => {
      const sql = String(call[0]);
      return !/\b(INSERT|UPDATE|DELETE)\b/i.test(sql);
    })).toBe(true);
  });

  it("returns 404 when the account is missing", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const [requireAuth, handler] = registeredHandlers;
    const req = createRequest({ session: { userId: 11 } });
    const res = createResponse();

    await requireAuth(req, res, vi.fn());
    await handler(req, res, vi.fn());

    // Both SELECTs run in Promise.all before the account check.
    expect(poolQueryMock).toHaveBeenCalledTimes(2);
    expect(calculateEconomyV2PreviewMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual({
      success: false,
      error: "Account not found",
    });
  });

  it("returns 500 without leaking database error details", async () => {
    poolQueryMock.mockRejectedValue(new Error("database unavailable"));

    const [requireAuth, handler] = registeredHandlers;
    const req = createRequest({ session: { userId: 5 } });
    const res = createResponse();

    await requireAuth(req, res, vi.fn());
    await handler(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("database unavailable");
    expect(req.log.error).toHaveBeenCalled();
    expect(calculateEconomyV2PreviewMock).not.toHaveBeenCalled();
  });

  it("queries only the authenticated session userId", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00.000Z"));

    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ active_balance: "42" }] })
      .mockResolvedValueOnce({ rows: [] });

    const [requireAuth, handler] = registeredHandlers;
    const req = createRequest({
      session: { userId: 42 },
      query: { userId: 999 },
      body: { userId: 888 },
    });
    const res = createResponse();

    await requireAuth(req, res, vi.fn());
    expect(req.userId).toBe("42");

    await handler(req, res, vi.fn());

    expect(poolQueryMock).toHaveBeenCalledTimes(2);
    expect(poolQueryMock.mock.calls[0][1]).toEqual(["42"]);
    expect(poolQueryMock.mock.calls[1][1]).toEqual(["42"]);
    expect(calculateEconomyV2PreviewMock).toHaveBeenCalledWith({
      capital: 42,
      lastSessionTime: null,
      currentTime: new Date("2026-07-17T12:00:00.000Z"),
    });
  });
});
