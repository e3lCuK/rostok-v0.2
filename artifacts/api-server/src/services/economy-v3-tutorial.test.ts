import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  grantTutorialV3RootsPure,
  V3_TUTORIAL_ROOT_SECONDS,
} from "./economy-v3-tutorial-pure";

const here = dirname(fileURLToPath(import.meta.url));
const settleSrc = readFileSync(join(here, "economy-v3-roots-settle.ts"), "utf8");
const rootsSrc = readFileSync(join(here, "economy-v3-roots.ts"), "utf8");
const gameSrc = readFileSync(join(here, "../routes/game.ts"), "utf8");
const tutorialRouteSrc = readFileSync(
  join(here, "../routes/game-v3-tutorial.ts"),
  "utf8",
);

describe("Economy v3 tutorial grant (8E)", () => {
  it("grants 5s once per empty root; idempotent; skips transferred/reserved", () => {
    const first = grantTutorialV3RootsPure({
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: [],
      effectivePresetSeconds: 21,
    });
    expect(first.changed).toBe(true);
    expect(first.rootWaterSeconds).toBe(V3_TUTORIAL_ROOT_SECONDS);
    expect(first.rootSunSeconds).toBe(V3_TUTORIAL_ROOT_SECONDS);
    expect(first.rootFertilizerSeconds).toBe(V3_TUTORIAL_ROOT_SECONDS);

    const second = grantTutorialV3RootsPure({
      rootWaterSeconds: first.rootWaterSeconds,
      rootSunSeconds: first.rootSunSeconds,
      rootFertilizerSeconds: first.rootFertilizerSeconds,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: [],
      effectivePresetSeconds: 21,
    });
    expect(second.changed).toBe(false);
    expect(second.alreadyPrepared).toBe(true);

    const afterWater = grantTutorialV3RootsPure({
      rootWaterSeconds: 0,
      rootSunSeconds: 5,
      rootFertilizerSeconds: 5,
      reserveWaterSeconds: 5,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: ["water"],
      effectivePresetSeconds: 21,
    });
    expect(afterWater.changed).toBe(false);
    expect(afterWater.rootWaterSeconds).toBe(0);
    expect(afterWater.rootSunSeconds).toBe(5);
  });

  it("clamps persisted over-cap roots to effectivePresetSeconds", () => {
    const r = grantTutorialV3RootsPure({
      rootWaterSeconds: 25,
      rootSunSeconds: 30,
      rootFertilizerSeconds: 25,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: [],
      effectivePresetSeconds: 21,
    });
    expect(r.rootWaterSeconds).toBe(21);
    expect(r.rootSunSeconds).toBe(21);
    expect(r.rootFertilizerSeconds).toBe(21);
    expect(r.changed).toBe(true);
  });

  it("does not change production insurance timeout constant", () => {
    expect(rootsSrc).toMatch(/V3_TRANSFER_INSURANCE_MS\s*=\s*60_000/);
  });

  it("skips auto-transfer while tutorial is active", () => {
    expect(settleSrc).toContain("Tutorial: player must transfer remaining roots manually");
    expect(settleSrc).toMatch(/tutorialActive\s*\?\s*null/);
  });

  it("exposes prepare route and clears v3 on tutorial complete", () => {
    expect(tutorialRouteSrc).toContain("/game/tutorial/v3/prepare");
    expect(tutorialRouteSrc).toContain("grantTutorialV3Roots");
    expect(gameSrc).toContain("V3_TUTORIAL_COMPLETE_CLEAR_SQL");
    expect(gameSrc).toContain("isEconomyV3RootsEnabled()");
    const tutorialSvc = readFileSync(join(here, "economy-v3-tutorial.ts"), "utf8");
    expect(tutorialSvc).toContain("v3_generation_anchor_at = $3");
    expect(gameSrc).toContain("new Date(now)");
    const completeBlock = gameSrc.slice(
      gameSrc.indexOf("POST /game/tutorial/complete"),
      gameSrc.indexOf("POST /api/game/accrue"),
    );
    expect(completeBlock).not.toContain("v2_energy_seconds");
  });
});
