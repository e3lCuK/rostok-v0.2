import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  grantTutorialV3RootsPure,
  forceTutorialRootFillSeconds,
  topUpTutorialReservesPure,
  V3_TUTORIAL_ROOT_SECONDS,
} from "./economy-v3-tutorial-pure";

const here = dirname(fileURLToPath(import.meta.url));
const settleSrc = readFileSync(join(here, "economy-v3-roots-settle.ts"), "utf8");
const rootsSrc = readFileSync(join(here, "economy-v3-roots.ts"), "utf8");
const transferSrc = readFileSync(
  join(here, "economy-v3-roots-transfer.ts"),
  "utf8",
);
const gameSrc = readFileSync(join(here, "../routes/game.ts"), "utf8");
const tutorialRouteSrc = readFileSync(
  join(here, "../routes/game-v3-tutorial.ts"),
  "utf8",
);

describe("Economy v3 tutorial grant (8E)", () => {
  it("staged kind grants only that root", () => {
    const water = grantTutorialV3RootsPure({
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: [],
      effectivePresetSeconds: 21,
      kinds: ["water"],
    });
    expect(water.changed).toBe(true);
    expect(water.rootWaterSeconds).toBe(V3_TUTORIAL_ROOT_SECONDS);
    expect(water.rootSunSeconds).toBe(0);
    expect(water.rootFertilizerSeconds).toBe(0);
    expect(water.alreadyPrepared).toBe(true);

    const sun = grantTutorialV3RootsPure({
      rootWaterSeconds: water.rootWaterSeconds,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: [],
      effectivePresetSeconds: 21,
      kinds: ["sun"],
    });
    expect(sun.rootWaterSeconds).toBe(V3_TUTORIAL_ROOT_SECONDS);
    expect(sun.rootSunSeconds).toBe(V3_TUTORIAL_ROOT_SECONDS);
    expect(sun.rootFertilizerSeconds).toBe(0);
  });

  it("grants 10s (two segments) once per empty root; idempotent; skips transferred/reserved", () => {
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
      rootSunSeconds: V3_TUTORIAL_ROOT_SECONDS,
      rootFertilizerSeconds: V3_TUTORIAL_ROOT_SECONDS,
      reserveWaterSeconds: V3_TUTORIAL_ROOT_SECONDS,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: ["water"],
      effectivePresetSeconds: 21,
    });
    expect(afterWater.changed).toBe(false);
    expect(afterWater.rootWaterSeconds).toBe(0);
    expect(afterWater.rootSunSeconds).toBe(V3_TUTORIAL_ROOT_SECONDS);
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
    expect(settleSrc).toMatch(/rowTutorialActive\s*\n\s*\?\s*null/);
  });

  it("tutorial transfer upgrades stale sibling fills before collect", () => {
    expect(transferSrc).toContain("grantTutorialV3RootsPure");
    expect(transferSrc).toContain("forceTutorialRootFillSeconds");
    expect(transferSrc).toContain("isEconomyV2TutorialActive");
    expect(transferSrc).toContain("forceTutorialFill");
  });

  it("keeps extra tutorial root energy above 10s on collect into activity buttons", () => {
    expect(
      forceTutorialRootFillSeconds(15, {
        transferred: false,
        isCollecting: true,
      }),
    ).toBe(15);
    expect(
      forceTutorialRootFillSeconds(5, {
        transferred: false,
        isCollecting: true,
      }),
    ).toBe(V3_TUTORIAL_ROOT_SECONDS);
    expect(
      forceTutorialRootFillSeconds(0, {
        transferred: false,
        isCollecting: true,
      }),
    ).toBe(V3_TUTORIAL_ROOT_SECONDS);
    expect(
      forceTutorialRootFillSeconds(0, {
        transferred: false,
        isCollecting: false,
      }),
    ).toBe(0);
    const extra = grantTutorialV3RootsPure({
      rootWaterSeconds: 15,
      rootSunSeconds: 12,
      rootFertilizerSeconds: 18,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      transferredRoots: [],
      effectivePresetSeconds: 21,
    });
    expect(extra.changed).toBe(false);
    expect(extra.rootWaterSeconds).toBe(15);
    expect(extra.rootSunSeconds).toBe(12);
    expect(extra.rootFertilizerSeconds).toBe(18);
  });

  it("tops up stale 5s tutorial reserves to 10s for activity buttons", () => {
    expect(V3_TUTORIAL_ROOT_SECONDS).toBe(10);
    const topped = topUpTutorialReservesPure({
      reserveWaterSeconds: 5,
      reserveSunSeconds: 5,
      reserveFertilizerSeconds: 0,
      effectivePresetSeconds: 25,
    });
    expect(topped.changed).toBe(true);
    expect(topped.reserveWaterSeconds).toBe(10);
    expect(topped.reserveSunSeconds).toBe(10);
    expect(topped.reserveFertilizerSeconds).toBe(0);
    const keepExtra = topUpTutorialReservesPure({
      reserveWaterSeconds: 15,
      reserveSunSeconds: 12,
      reserveFertilizerSeconds: 0,
      effectivePresetSeconds: 25,
    });
    expect(keepExtra.changed).toBe(false);
    expect(keepExtra.reserveWaterSeconds).toBe(15);
    expect(keepExtra.reserveSunSeconds).toBe(12);
    expect(settleSrc).toContain("topUpTutorialReservesPure");
  });

  it("exposes prepare route and clears v3 on tutorial complete", () => {
    expect(tutorialRouteSrc).toContain("/game/tutorial/v3/prepare");
    expect(tutorialRouteSrc).toContain("grantTutorialV3Roots");
    expect(tutorialRouteSrc).toContain("parsePrepareKinds");
    expect(tutorialRouteSrc).toContain("kind_required");
    expect(tutorialRouteSrc).toContain("all: true");
    expect(tutorialRouteSrc).toContain("kinds");
    expect(gameSrc).toContain("V3_TUTORIAL_COMPLETE_CLEAR_SQL");
    expect(gameSrc).toContain("isEconomyV3RootsEnabled()");
    const tutorialSvc = readFileSync(join(here, "economy-v3-tutorial.ts"), "utf8");
    expect(tutorialSvc).toContain("v3_generation_anchor_at = $3");
    expect(tutorialSvc).toContain("kinds: options?.kinds");
    expect(gameSrc).toContain("generationAnchorAt");
    expect(gameSrc).toContain("new Date(generationAnchorAt)");
    const completeBlock = gameSrc.slice(
      gameSrc.indexOf("POST /game/tutorial/complete"),
      gameSrc.indexOf("POST /api/game/accrue"),
    );
    expect(completeBlock).not.toContain("v2_energy_seconds");
    // Live cycle continues from tutorial 12:00 wait start (not reset to "now").
    expect(completeBlock).toContain("req.body?.generationAnchorAt");
    // Second complete / F5 heal must not wipe progress back to a fresh 12:00.
    expect(completeBlock).toContain("alreadyComplete");
    expect(completeBlock).toContain("tutorial_done === true");
  });
});
