import type { Router } from "express";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { transferMock } = vi.hoisted(() => ({
  transferMock: vi.fn(),
}));

vi.mock("../services/economy-v3-roots-transfer", () => ({
  transferEconomyV3Root: transferMock,
  EconomyV3RootsTransferError: class EconomyV3RootsTransferError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "EconomyV3RootsTransferError";
    }
  },
}));

import gameV3RootsRouter from "./game-v3-roots";
import { EconomyV3RootsTransferError } from "../services/economy-v3-roots-transfer";

type JsonBody = Record<string, unknown>;

type TestRequest = {
  session?: { userId?: unknown };
  userId?: string;
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
  next: (err?: unknown) => void,
) => unknown;

function getTransferHandlers(): RouteMiddleware[] {
  const layer = (gameV3RootsRouter as Router).stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      entry.route?.path === "/game/v3/roots/transfer" &&
      entry.route?.methods?.post,
  ) as { route: { stack: Array<{ handle: RouteMiddleware }> } } | undefined;
  if (!layer) throw new Error("transfer route not found");
  return layer.route.stack.map((s) => s.handle);
}

async function runTransfer(req: TestRequest): Promise<TestResponse> {
  const handlers = getTransferHandlers();
  const res: TestResponse = {
    statusCode: 200,
    body: undefined,
    status: vi.fn(),
    json: vi.fn(),
  };
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

describe("POST /game/v3/roots/transfer", () => {
  beforeEach(() => {
    transferMock.mockReset();
  });

  it("registers and returns transfer result", async () => {
    transferMock.mockResolvedValue({
      transferred: true,
      root: "water",
      transferredSeconds: 5,
      acceptedSeconds: 5,
      discardedSeconds: 0,
      v3Roots: { enabled: true, roots: {}, reserves: {} },
    });

    const res = await runTransfer({
      session: { userId: "7" },
      body: { root: "water" },
      log: { error: vi.fn() },
    });

    expect(transferMock).toHaveBeenCalledWith("7", "water");
    expect(res.body).toMatchObject({
      transferred: true,
      root: "water",
      acceptedSeconds: 5,
    });
  });

  it("maps domain errors to HTTP status codes", async () => {
    transferMock.mockRejectedValue(
      new EconomyV3RootsTransferError(409, "already_transferred", "done"),
    );
    const res = await runTransfer({
      session: { userId: "7" },
      body: { root: "water" },
      log: { error: vi.fn() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "already_transferred" });
  });
});
