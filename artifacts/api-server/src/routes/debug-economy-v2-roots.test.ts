import type { Router } from "express";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { mutateMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
}));

vi.mock("../services/economy-v2-roots-debug", () => ({
  debugMutateEconomyV2Roots: mutateMock,
  EconomyV2RootsDebugError: class EconomyV2RootsDebugError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

type JsonBody = Record<string, unknown>;

type TestRequest = {
  session?: { userId?: unknown };
  userId?: number;
  body?: Record<string, unknown>;
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
  next: () => void,
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

function createRouterCapture() {
  const routes: { path: string; handlers: RouteMiddleware[] }[] = [];
  const router = {
    post(path: string, ...handlers: RouteMiddleware[]) {
      routes.push({ path, handlers });
    },
  } as unknown as Router;
  return { router, routes };
}

describe("registerDebugEconomyV2RootsRoute", () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    mutateMock.mockReset();
    process.env.ENABLE_DEBUG_ROUTES = "true";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env.ENABLE_DEBUG_ROUTES = prevEnv.ENABLE_DEBUG_ROUTES;
    process.env.NODE_ENV = prevEnv.NODE_ENV;
    vi.resetModules();
  });

  it("does not register when debug routes disabled", async () => {
    process.env.ENABLE_DEBUG_ROUTES = "false";
    vi.resetModules();
    const { registerDebugEconomyV2RootsRoute } = await import(
      "./debug-economy-v2-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV2RootsRoute(router);
    expect(routes).toHaveLength(0);
  });

  it("registers POST /game/debug/economy-v2/roots when enabled", async () => {
    vi.resetModules();
    const { registerDebugEconomyV2RootsRoute } = await import(
      "./debug-economy-v2-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV2RootsRoute(router);
    expect(routes.map((r) => r.path)).toContain("/game/debug/economy-v2/roots");
  });

  it("reset action calls service and returns server state", async () => {
    vi.resetModules();
    mutateMock.mockResolvedValue({
      readyMask: "0",
      readyCount: 0,
      generationProgress: 0,
      energySeconds: 12,
      anchorAt: 99,
      roots: {
        readyMask: "0",
        readyCount: 0,
        generationProgress: 0,
        secondsPerSection: 720,
        secondsUntilNextSection: 720,
        isFull: false,
      },
    });
    const { registerDebugEconomyV2RootsRoute } = await import(
      "./debug-economy-v2-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV2RootsRoute(router);
    const handlers = routes[0].handlers;
    const req: TestRequest = {
      session: { userId: 7 },
      body: { action: "reset" },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    // auth middleware
    await handlers[0](req, res, () => {});
    expect(req.userId).toBe(7);
    await handlers[1](req, res, () => {});
    expect(mutateMock).toHaveBeenCalledWith(7, { action: "reset" });
    expect(res.body).toMatchObject({
      success: true,
      readyCount: 0,
      readyMask: "0",
      energySeconds: 12,
    });
  });

  it("add 15 forwards count", async () => {
    vi.resetModules();
    mutateMock.mockResolvedValue({
      readyMask: "32767",
      readyCount: 15,
      generationProgress: 0,
      energySeconds: 5,
      anchorAt: 1,
      roots: {
        readyMask: "32767",
        readyCount: 15,
        generationProgress: 0,
        secondsPerSection: 720,
        secondsUntilNextSection: 720,
        isFull: false,
      },
    });
    const { registerDebugEconomyV2RootsRoute } = await import(
      "./debug-economy-v2-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV2RootsRoute(router);
    const handlers = routes[0].handlers;
    const req: TestRequest = {
      session: { userId: "3" },
      body: { action: "add", count: 15 },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    await handlers[0](req, res, () => {});
    await handlers[1](req, res, () => {});
    expect(mutateMock).toHaveBeenCalledWith(3, { action: "add", count: 15 });
    expect(res.body).toMatchObject({ readyCount: 15, energySeconds: 5 });
  });

  it("rejects bad body", async () => {
    vi.resetModules();
    const { registerDebugEconomyV2RootsRoute } = await import(
      "./debug-economy-v2-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV2RootsRoute(router);
    const handlers = routes[0].handlers;
    const req: TestRequest = {
      session: { userId: 1 },
      body: { action: "nope" },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    await handlers[0](req, res, () => {});
    await handlers[1](req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("rejects add with non-positive count", async () => {
    vi.resetModules();
    const { registerDebugEconomyV2RootsRoute } = await import(
      "./debug-economy-v2-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV2RootsRoute(router);
    const handlers = routes[0].handlers;
    const req: TestRequest = {
      session: { userId: 1 },
      body: { action: "add", count: 0 },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    await handlers[0](req, res, () => {});
    await handlers[1](req, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: "add requires a positive integer count",
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("accepts arbitrary positive integer count", async () => {
    vi.resetModules();
    mutateMock.mockResolvedValue({
      readyMask: "7",
      readyCount: 3,
      generationProgress: 0,
      energySeconds: 10,
      anchorAt: 1,
      roots: {
        readyMask: "7",
        readyCount: 3,
        generationProgress: 0,
        secondsPerSection: 720,
        secondsUntilNextSection: 720,
        isFull: false,
      },
    });
    const { registerDebugEconomyV2RootsRoute } = await import(
      "./debug-economy-v2-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV2RootsRoute(router);
    const handlers = routes[0].handlers;
    const req: TestRequest = {
      session: { userId: 1 },
      body: { action: "add", count: 3 },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    await handlers[0](req, res, () => {});
    await handlers[1](req, res, () => {});
    expect(mutateMock).toHaveBeenCalledWith(1, { action: "add", count: 3 });
    expect(res.body).toMatchObject({ success: true, readyCount: 3 });
  });
});
