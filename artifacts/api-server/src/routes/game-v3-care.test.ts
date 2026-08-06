import type { Router } from "express";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  startMock,
  finishMock,
  acknowledgeMock,
  finishCycleMock,
  acknowledgeCycleMock,
  claimCycleMock,
} = vi.hoisted(() => ({
  startMock: vi.fn(),
  finishMock: vi.fn(),
  acknowledgeMock: vi.fn(),
  finishCycleMock: vi.fn(),
  acknowledgeCycleMock: vi.fn(),
  claimCycleMock: vi.fn(),
}));

vi.mock("../services/economy-v3-care-start", () => ({
  startEconomyV3CareActivity: startMock,
  EconomyV3CareStartError: class EconomyV3CareStartError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "EconomyV3CareStartError";
    }
  },
}));

vi.mock("../services/economy-v3-care-finish", () => ({
  finishEconomyV3CareActivity: finishMock,
  EconomyV3CareFinishError: class EconomyV3CareFinishError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "EconomyV3CareFinishError";
    }
  },
}));

vi.mock("../services/economy-v3-care-acknowledge", () => ({
  acknowledgeEconomyV3CareActivity: acknowledgeMock,
  EconomyV3CareAcknowledgeError: class EconomyV3CareAcknowledgeError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "EconomyV3CareAcknowledgeError";
    }
  },
}));

vi.mock("../services/economy-v3-care-finish-cycle", () => ({
  finishEconomyV3CareCycle: finishCycleMock,
  EconomyV3CareFinishCycleError: class EconomyV3CareFinishCycleError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "EconomyV3CareFinishCycleError";
    }
  },
}));

vi.mock("../services/economy-v3-care-acknowledge-cycle", () => ({
  acknowledgeEconomyV3CareCycle: acknowledgeCycleMock,
  EconomyV3CareAcknowledgeCycleError:
    class EconomyV3CareAcknowledgeCycleError extends Error {
      status: number;
      code: string;
      constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "EconomyV3CareAcknowledgeCycleError";
      }
    },
}));

vi.mock("../services/economy-v3-care-claim-cycle", () => ({
  claimEconomyV3CareCycle: claimCycleMock,
  EconomyV3CareClaimCycleError: class EconomyV3CareClaimCycleError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "EconomyV3CareClaimCycleError";
    }
  },
}));

import gameV3CareRouter from "./game-v3-care";
import { EconomyV3CareStartError } from "../services/economy-v3-care-start";
import { EconomyV3CareFinishError } from "../services/economy-v3-care-finish";
import { EconomyV3CareAcknowledgeError } from "../services/economy-v3-care-acknowledge";
import { EconomyV3CareFinishCycleError } from "../services/economy-v3-care-finish-cycle";
import { EconomyV3CareAcknowledgeCycleError } from "../services/economy-v3-care-acknowledge-cycle";
import { EconomyV3CareClaimCycleError } from "../services/economy-v3-care-claim-cycle";

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

function getHandlers(path: string): RouteMiddleware[] {
  const layer = (gameV3CareRouter as Router).stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      entry.route?.path === path && entry.route?.methods?.post,
  ) as { route: { stack: Array<{ handle: RouteMiddleware }> } } | undefined;
  if (!layer) throw new Error(`${path} route not found`);
  return layer.route.stack.map((s) => s.handle);
}

async function runRoute(
  path: string,
  req: TestRequest,
): Promise<TestResponse> {
  const handlers = getHandlers(path);
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

describe("POST /game/v3/care/start-activity", () => {
  beforeEach(() => {
    startMock.mockReset();
  });

  it("registers and returns start result", async () => {
    startMock.mockResolvedValue({
      started: true,
      activity: "water",
      presetSeconds: 5,
      spentSeconds: 5,
      v3Roots: { enabled: true, careSession: { active: true } },
    });

    const res = await runRoute("/game/v3/care/start-activity", {
      session: { userId: "7" },
      body: { activity: "water", presetSeconds: 5 },
      log: { error: vi.fn() },
    });

    expect(startMock).toHaveBeenCalledWith("7", "water", 5);
    expect(res.body).toMatchObject({
      started: true,
      activity: "water",
      spentSeconds: 5,
    });
  });

  it("maps domain errors to HTTP status codes", async () => {
    startMock.mockRejectedValue(
      new EconomyV3CareStartError(409, "activity_in_progress", "busy"),
    );
    const res = await runRoute("/game/v3/care/start-activity", {
      session: { userId: "7" },
      body: { activity: "water", presetSeconds: 5 },
      log: { error: vi.fn() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "activity_in_progress" });
  });
});

describe("POST /game/v3/care/finish-activity", () => {
  beforeEach(() => {
    finishMock.mockReset();
  });

  it("registers and returns finish result", async () => {
    finishMock.mockResolvedValue({
      finished: true,
      alreadyCompleted: false,
      activity: "sun",
      skill: 0.8,
      v3Roots: {
        enabled: true,
        careSession: { active: false, status: "completed", skill: 0.8 },
      },
    });

    const res = await runRoute("/game/v3/care/finish-activity", {
      session: { userId: "7" },
      body: { activity: "sun", skill: 0.8 },
      log: { error: vi.fn() },
    });

    expect(finishMock).toHaveBeenCalledWith("7", "sun", 0.8);
    expect(res.body).toMatchObject({
      finished: true,
      activity: "sun",
      skill: 0.8,
    });
  });

  it("maps domain errors to HTTP status codes", async () => {
    finishMock.mockRejectedValue(
      new EconomyV3CareFinishError(409, "activity_mismatch", "mismatch"),
    );
    const res = await runRoute("/game/v3/care/finish-activity", {
      session: { userId: "7" },
      body: { activity: "water", skill: 0.5 },
      log: { error: vi.fn() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "activity_mismatch" });
  });
});

describe("POST /game/v3/care/acknowledge-activity", () => {
  beforeEach(() => {
    acknowledgeMock.mockReset();
  });

  it("registers and returns acknowledge result", async () => {
    acknowledgeMock.mockResolvedValue({
      acknowledged: true,
      activity: "water",
      v3Roots: {
        enabled: true,
        careSession: {
          active: false,
          activity: null,
          status: null,
        },
      },
    });

    const res = await runRoute("/game/v3/care/acknowledge-activity", {
      session: { userId: "7" },
      body: { activity: "water" },
      log: { error: vi.fn() },
    });

    expect(acknowledgeMock).toHaveBeenCalledWith("7", "water");
    expect(res.body).toMatchObject({
      acknowledged: true,
      activity: "water",
    });
  });

  it("maps domain errors to HTTP status codes", async () => {
    acknowledgeMock.mockRejectedValue(
      new EconomyV3CareAcknowledgeError(
        409,
        "activity_not_completed",
        "still active",
      ),
    );
    const res = await runRoute("/game/v3/care/acknowledge-activity", {
      session: { userId: "7" },
      body: { activity: "water" },
      log: { error: vi.fn() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "activity_not_completed" });
  });
});

describe("POST /game/v3/care/finish-cycle", () => {
  beforeEach(() => {
    finishCycleMock.mockReset();
  });

  it("registers and returns finish-cycle result", async () => {
    finishCycleMock.mockResolvedValue({
      finished: true,
      alreadyFinished: false,
      totalPresetSeconds: 18,
      averageSkill: 0.5,
      v3Roots: { enabled: true, careCycle: { status: "finished" } },
    });

    const res = await runRoute("/game/v3/care/finish-cycle", {
      session: { userId: "7" },
      body: {},
      log: { error: vi.fn() },
    });

    expect(finishCycleMock).toHaveBeenCalledWith("7");
    expect(res.body).toMatchObject({
      finished: true,
      totalPresetSeconds: 18,
    });
  });

  it("maps domain errors to HTTP status codes", async () => {
    finishCycleMock.mockRejectedValue(
      new EconomyV3CareFinishCycleError(
        409,
        "care_cycle_not_complete",
        "incomplete",
      ),
    );
    const res = await runRoute("/game/v3/care/finish-cycle", {
      session: { userId: "7" },
      body: {},
      log: { error: vi.fn() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "care_cycle_not_complete" });
  });
});

describe("POST /game/v3/care/claim-cycle", () => {
  beforeEach(() => {
    claimCycleMock.mockReset();
  });

  it("registers and returns claim-cycle result", async () => {
    claimCycleMock.mockResolvedValue({
      claimed: true,
      alreadyClaimed: false,
      xp: 40,
      treeGrowth: 1,
      income: { base: 1, bonus: 0.5, total: 1.5 },
      v3Roots: { enabled: true, careCycle: { claim: { claimed: true } } },
    });

    const res = await runRoute("/game/v3/care/claim-cycle", {
      session: { userId: "7" },
      body: {},
      log: { error: vi.fn() },
    });

    expect(claimCycleMock).toHaveBeenCalledWith("7");
    expect(res.body).toMatchObject({
      claimed: true,
      alreadyClaimed: false,
      xp: 40,
    });
  });

  it("maps domain errors to HTTP status codes", async () => {
    claimCycleMock.mockRejectedValue(
      new EconomyV3CareClaimCycleError(
        409,
        "care_cycle_not_finished",
        "not finished",
      ),
    );
    const res = await runRoute("/game/v3/care/claim-cycle", {
      session: { userId: "7" },
      body: {},
      log: { error: vi.fn() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "care_cycle_not_finished" });
  });
});

describe("POST /game/v3/care/acknowledge-cycle", () => {
  beforeEach(() => {
    acknowledgeCycleMock.mockReset();
  });

  it("registers and returns acknowledge-cycle result", async () => {
    acknowledgeCycleMock.mockResolvedValue({
      acknowledged: true,
      v3Roots: { enabled: true, careCycle: { status: null } },
    });

    const res = await runRoute("/game/v3/care/acknowledge-cycle", {
      session: { userId: "7" },
      body: {},
      log: { error: vi.fn() },
    });

    expect(acknowledgeCycleMock).toHaveBeenCalledWith("7");
    expect(res.body).toMatchObject({ acknowledged: true });
  });

  it("maps domain errors to HTTP status codes", async () => {
    acknowledgeCycleMock.mockRejectedValue(
      new EconomyV3CareAcknowledgeCycleError(
        409,
        "care_cycle_not_finished",
        "not finished",
      ),
    );
    const res = await runRoute("/game/v3/care/acknowledge-cycle", {
      session: { userId: "7" },
      body: {},
      log: { error: vi.fn() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "care_cycle_not_finished" });
  });
});
