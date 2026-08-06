import type { Router } from "express";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { mutateMock, EconomyV3RootsDebugError } = vi.hoisted(() => {
  class EconomyV3RootsDebugError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { mutateMock: vi.fn(), EconomyV3RootsDebugError };
});

vi.mock("../services/economy-v3-roots-debug", () => ({
  debugMutateEconomyV3Roots: mutateMock,
  EconomyV3RootsDebugError,
  parseDebugV3RootsBody: (
    body: unknown,
  ):
    | { action: "reset" }
    | {
        action: "set";
        roots?: Record<string, number>;
        reserves?: Record<string, number>;
      }
    | { error: string } => {
    if (body == null || typeof body !== "object") {
      return { error: "Expected JSON body" };
    }
    const o = body as {
      action?: unknown;
      roots?: Record<string, unknown>;
      reserves?: Record<string, unknown>;
    };
    if (o.action === "reset") return { action: "reset" };
    if (o.action != null && o.action !== "set") {
      return { error: 'action must be "set" or "reset"' };
    }
    const roots = o.roots ?? {};
    const reserves = o.reserves ?? {};
    for (const [k, v] of Object.entries(roots)) {
      if (typeof v === "number" && !Number.isInteger(v)) {
        return { error: `roots.${k} must be a whole integer` };
      }
    }
    if (
      Object.keys(roots).length === 0 &&
      Object.keys(reserves).length === 0
    ) {
      return { error: "set requires roots and/or reserves" };
    }
    return {
      action: "set",
      ...(Object.keys(roots).length ? { roots: roots as Record<string, number> } : {}),
      ...(Object.keys(reserves).length
        ? { reserves: reserves as Record<string, number> }
        : {}),
    };
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

describe("registerDebugEconomyV3RootsRoute", () => {
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
    const { registerDebugEconomyV3RootsRoute } = await import(
      "./debug-economy-v3-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV3RootsRoute(router);
    expect(routes).toHaveLength(0);
  });

  it("registers POST /game/debug/economy-v3/roots when enabled", async () => {
    vi.resetModules();
    const { registerDebugEconomyV3RootsRoute } = await import(
      "./debug-economy-v3-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV3RootsRoute(router);
    expect(routes.map((r) => r.path)).toContain(
      "/game/debug/economy-v3/roots",
    );
  });

  it("set roots returns v3Roots snapshot", async () => {
    vi.resetModules();
    mutateMock.mockResolvedValue({
      v3Roots: { enabled: true, roots: { water: { seconds: 4 } } },
    });
    const { registerDebugEconomyV3RootsRoute } = await import(
      "./debug-economy-v3-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV3RootsRoute(router);
    const handlers = routes[0]!.handlers;
    const req: TestRequest = {
      session: { userId: 3 },
      body: { roots: { water: 4, sun: 4, fertilizer: 4 } },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    await handlers[0]!(req, res, () => {});
    await handlers[1]!(req, res, () => {});
    expect(mutateMock).toHaveBeenCalledWith(3, {
      action: "set",
      roots: { water: 4, sun: 4, fertilizer: 4 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      v3Roots: { enabled: true },
      game: { v3Roots: { enabled: true } },
    });
  });

  it("invalid body → 400 without service call", async () => {
    vi.resetModules();
    const { registerDebugEconomyV3RootsRoute } = await import(
      "./debug-economy-v3-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV3RootsRoute(router);
    const handlers = routes[0]!.handlers;
    const req: TestRequest = {
      session: { userId: 3 },
      body: { roots: { water: 1.5 } },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    await handlers[0]!(req, res, () => {});
    await handlers[1]!(req, res, () => {});
    expect(mutateMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it("feature_disabled → 403", async () => {
    vi.resetModules();
    mutateMock.mockRejectedValue(
      new EconomyV3RootsDebugError(403, "feature_disabled", "disabled"),
    );
    const { registerDebugEconomyV3RootsRoute } = await import(
      "./debug-economy-v3-roots"
    );
    const { router, routes } = createRouterCapture();
    registerDebugEconomyV3RootsRoute(router);
    const handlers = routes[0]!.handlers;
    const req: TestRequest = {
      session: { userId: 3 },
      body: { action: "reset" },
      log: { error: vi.fn() },
    };
    const res = createResponse();
    await handlers[0]!(req, res, () => {});
    await handlers[1]!(req, res, () => {});
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: "feature_disabled" });
  });
});
