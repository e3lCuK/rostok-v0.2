/**
 * Contract tests: v2 Care path must not depend on v1 session/start.
 * GamePage orchestration is asserted via the public client + API shapes.
 */
import { describe, expect, it } from "vitest";
import { api } from "./api";
import { ENABLE_ECONOMY_V2_CARE } from "./featureFlags";

describe("v2 Care — no session/start dependency (contract)", () => {
  it("api exposes startV2Care / completeV2CareActivity / finishV2Care separately from startSession", () => {
    expect(typeof api.startV2Care).toBe("function");
    expect(typeof api.completeV2CareActivity).toBe("function");
    expect(typeof api.finishV2Care).toBe("function");
    expect(typeof api.startSession).toBe("function");
    // Methods are distinct — v2 start must not be an alias of session/start.
    expect(api.startV2Care).not.toBe(api.startSession);
  });

  it("v1 startSession remains available for flag-off mode", () => {
    // When ENABLE_ECONOMY_V2_CARE is false, GamePage calls api.startSession.
    // This test only asserts the client still exposes that path.
    expect(api.startSession).toBeTypeOf("function");
    expect(typeof ENABLE_ECONOMY_V2_CARE).toBe("boolean");
  });
});
