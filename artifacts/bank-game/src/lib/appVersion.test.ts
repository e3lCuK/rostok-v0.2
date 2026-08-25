import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APP_GIT_SHA,
  APP_PUSH_COUNT,
  APP_VERSION,
  APP_VERSION_LABEL,
} from "./engine";

const pageSrc = readFileSync(resolve(__dirname, "../pages/GamePage.tsx"), "utf8");

describe("app version badge", () => {
  it("left badge is BETA V0.3.{git commit count}; hash stays on the right", () => {
    expect(APP_VERSION_LABEL).toBe("BETA V0.3");
    expect(APP_VERSION).toBe(`${APP_VERSION_LABEL}.${APP_PUSH_COUNT}`);
    expect(pageSrc).toContain("{APP_VERSION}");
    expect(pageSrc).toContain("{APP_GIT_SHA}");
    expect(pageSrc).toContain("game-beta-floating--left");
    expect(pageSrc).toContain("game-beta-floating--right");
  });

  it("hash is a non-empty string", () => {
    expect(typeof APP_GIT_SHA).toBe("string");
    expect(APP_GIT_SHA.length).toBeGreaterThan(0);
  });
});
