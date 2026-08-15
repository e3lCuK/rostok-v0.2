import { describe, expect, it } from "vitest";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import { splitGeneratedIntoOrdinaryAndExcess } from "./economy-v2-excess";
import {
  computeV3OrdinaryFullState,
  isV3CareCycleHoldingExcess,
  shouldPauseV3GenerationForCarePhase,
  shouldSuppressV3ExcessForCarePhase,
  splitV3ElapsedOrdinaryAndExcess,
  splitV3GeneratedIntoOrdinaryAndExcess,
} from "./economy-v3-excess-gate";
import {
  buildEconomyV3RootsPublicState,
  settleEconomyV3Roots,
} from "./economy-v3-roots";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const CAP = 20;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

function settleBase(overrides: Record<string, unknown> = {}) {
  return settleEconomyV3Roots({
    rootWaterSeconds: 0,
    rootSunSeconds: 0,
    rootFertilizerSeconds: 0,
    generationProgress: 0,
    generationAnchorAt: NOW - 3 * T * 1000,
    generationFrozenAt: null,
    dayKey: "2026-07-23",
    capital: 100_000,
    nowMs: NOW,
    tutorialActive: false,
    reserveWaterSeconds: 0,
    reserveSunSeconds: 0,
    reserveFertilizerSeconds: 0,
    dailyCapSeconds: CAP,
    visitBonusSeconds: 0,
    excessSeconds: 0,
    excessElapsedMs: 0,
    ...overrides,
  });
}

describe("economy v3 excess gate (8A) — ordinaryFull", () => {
  it("1. all reserves below cap → excess does not grow", () => {
    const r = settleBase({
      reserveWaterSeconds: 5,
      reserveSunSeconds: 5,
      reserveFertilizerSeconds: 5,
    });
    expect(r.ordinaryFull).toBe(false);
    expect(r.excessGenerated).toBe(0);
    expect(r.excessSeconds).toBe(0);
    expect(r.generatingExcess).toBe(false);
    expect(r.rootWaterSeconds).toBe(1);
    expect(r.rootSunSeconds).toBe(1);
    expect(r.rootFertilizerSeconds).toBe(1);
  });

  it("2. one reserve full, two not → excess does not grow", () => {
    const r = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: 5,
      reserveFertilizerSeconds: 5,
    });
    expect(r.ordinaryFull).toBe(false);
    expect(r.excessGenerated).toBe(0);
    expect(r.generatingExcess).toBe(false);
  });

  it("3. two full, one not → excess does not grow", () => {
    const r = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: 5,
    });
    expect(r.ordinaryFull).toBe(false);
    expect(r.excessGenerated).toBe(0);
    expect(r.generatingExcess).toBe(false);
  });

  it("4. all three full → excess grows", () => {
    const r = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
      excessSeconds: 1.5,
      excessElapsedMs: 1000,
    });
    expect(r.ordinaryFull).toBe(true);
    expect(r.excessGenerated).toBeGreaterThan(0);
    expect(r.excessSeconds).toBeGreaterThan(1.5);
    expect(r.excessElapsedMs).toBeGreaterThan(1000);
    expect(r.generatingExcess).toBe(true);
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.rootSunSeconds).toBe(0);
    expect(r.rootFertilizerSeconds).toBe(0);
    // Roots unchanged; wholes may complete into excess while progress advances.
    expect(r.generationProgress).toBeGreaterThanOrEqual(0);
    expect(r.generationProgress).toBeLessThan(1);
  });

  it("5. partial interval splits ordinary/excess via v3 adapter", () => {
    const split = splitV3ElapsedOrdinaryAndExcess({
      elapsedMs: 10_000,
      generatedGameSeconds: 10,
      ordinaryFull: false,
      ordinaryFreeGameSeconds: 3,
    });
    expect(split.ordinaryAccepted).toBe(3);
    expect(split.excessGenerated).toBe(7);
    expect(split.ordinaryElapsedMs + split.excessElapsedMs).toBeCloseTo(
      10_000,
      6,
    );
    expect(split.excessElapsedMs).toBeCloseTo(7000, 6);
    // v2 helper still works unchanged for cap-60 path
    expect(
      splitGeneratedIntoOrdinaryAndExcess({ generated: 10, freeCapacity: 3 }),
    ).toEqual({ ordinaryAccepted: 3, excessGenerated: 7 });
  });

  it("6. corresponding root does not grow when its reserve is already full", () => {
    const r = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: 5,
      reserveFertilizerSeconds: 5,
      rootWaterSeconds: 2,
      rootSunSeconds: 2,
      rootFertilizerSeconds: 2,
    });
    // Shared pool: reserve at cap ⇒ root trimmed to 0 on normalize.
    // Water's RR slot reroutes to sun/fert (no void).
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.rootSunSeconds).toBe(4);
    expect(r.rootFertilizerSeconds).toBe(3);
    expect(r.excessGenerated).toBe(0);
  });

  it("6b. shared pool: partial reserve blocks root from exceeding cap", () => {
    const settled = settleBase({
      reserveWaterSeconds: CAP - 1,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      rootWaterSeconds: 0,
      rootSunSeconds: 0,
      rootFertilizerSeconds: 0,
      generationAnchorAt: NOW - 30 * T * 1000,
    });
    expect(settled.rootWaterSeconds).toBeLessThanOrEqual(1);
    expect(
      settled.rootWaterSeconds + settled.reserveWaterSeconds,
    ).toBeLessThanOrEqual(CAP);
  });

  it("7. other roots continue to grow while one reserve is full", () => {
    const r = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      rootWaterSeconds: 10,
      rootSunSeconds: 1,
      rootFertilizerSeconds: 1,
    });
    expect(r.reservesFull.water).toBe(true);
    expect(r.reservesFull.sun).toBe(false);
    // Shared pool trims water root against full reserve; water slot reroutes.
    expect(r.rootWaterSeconds).toBe(0);
    expect(r.rootSunSeconds).toBe(3);
    expect(r.rootFertilizerSeconds).toBe(2);
  });

  it("8. after spending one reserve, excess generation stops", () => {
    const full = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
    });
    expect(full.generatingExcess).toBe(true);

    const afterSpend = settleBase({
      reserveWaterSeconds: CAP - 5,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
      excessSeconds: full.excessSeconds,
      excessElapsedMs: full.excessElapsedMs,
    });
    expect(afterSpend.ordinaryFull).toBe(false);
    expect(afterSpend.excessGenerated).toBe(0);
    expect(afterSpend.generatingExcess).toBe(false);
    // Only water has room; sun/fert slots reroute into water.
    expect(afterSpend.rootWaterSeconds).toBe(3);
    expect(afterSpend.rootSunSeconds).toBe(0);
    expect(afterSpend.rootFertilizerSeconds).toBe(0);
  });

  it("9. already accumulated excess is preserved when ordinary resumes", () => {
    const afterSpend = settleBase({
      reserveWaterSeconds: 10,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
      excessSeconds: 12.25,
      excessElapsedMs: 50_000,
    });
    expect(afterSpend.excessSeconds).toBeCloseTo(12.25, 10);
    expect(afterSpend.excessElapsedMs).toBe(50_000);
    expect(afterSpend.excessGenerated).toBe(0);
  });

  it("10. Tutorial does not generate ordinary or excess", () => {
    const r = settleBase({
      tutorialActive: true,
      generationAnchorAt: NOW,
      reserveWaterSeconds: CAP,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
      excessSeconds: 4,
      excessElapsedMs: 2000,
    });
    expect(r.generated).toBe(false);
    expect(r.wholeSeconds).toBe(0);
    expect(r.excessGenerated).toBe(0);
    expect(r.excessSeconds).toBe(4);
    expect(r.excessElapsedMs).toBe(2000);
    expect(r.generatingExcess).toBe(false);
    expect(r.generationAnchorAt).toBe(NOW);
  });

  it("11. F5 / second settle does not double-count the same window", () => {
    const first = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
    });
    const second = settleBase({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
      generationAnchorAt: first.generationAnchorAt,
      excessSeconds: first.excessSeconds,
      excessElapsedMs: first.excessElapsedMs,
      nowMs: first.generationAnchorAt,
    });
    expect(second.elapsedMs).toBe(0);
    expect(second.excessGenerated).toBe(0);
    expect(second.excessSeconds).toBeCloseTo(first.excessSeconds, 10);
  });

  it("12. feature-flag-off path keeps v2 split helper / cap-60 semantics", () => {
    // Pure v2 helper unchanged (used when ENABLE_ECONOMY_V3_ROOTS=false).
    expect(
      splitGeneratedIntoOrdinaryAndExcess({
        generated: 15,
        freeCapacity: 10,
      }),
    ).toEqual({ ordinaryAccepted: 10, excessGenerated: 5 });
    const energySettleSrc = readFileSync(
      join(here, "economy-v2-energy-settle.ts"),
      "utf8",
    );
    expect(energySettleSrc).toContain("isEconomyV3RootsEnabled()");
    expect(energySettleSrc).toContain(
      "Economy v3 owns ordinary generation + excess gate",
    );
  });

  it("13. Metelka session schema/formulas are not changed by v3 gate", () => {
    const excessSrc = readFileSync(join(here, "economy-v2-excess.ts"), "utf8");
    const sessionSrc = readFileSync(
      join(here, "economy-v2-excess-session.ts"),
      "utf8",
    );
    expect(excessSrc).toContain("V2_EXCESS_CYCLE_SECONDS");
    expect(excessSrc).toContain("splitGeneratedIntoOrdinaryAndExcess");
    expect(sessionSrc).toContain("startEconomyV2ExcessSession");
    // v3 settle must not mutate Metelka session active flag (SELECT is fine)
    const v3SettleSrc = readFileSync(
      join(here, "economy-v3-roots-settle.ts"),
      "utf8",
    );
    expect(v3SettleSrc).not.toMatch(
      /v2_excess_session_active\s*=\s*(TRUE|FALSE|NULL|\$)/i,
    );
  });

  it("14. one elapsed is not counted by both v2 and v3", () => {
    const gameSrc = readFileSync(join(here, "../routes/game.ts"), "utf8");
    expect(gameSrc).toContain("settleAndPersistEconomyV2Energy");
    expect(gameSrc).toContain("settleAndPersistEconomyV3Roots");
    const energySettleSrc = readFileSync(
      join(here, "economy-v2-energy-settle.ts"),
      "utf8",
    );
    // When v3 flag on, v2 advances anchor only (no settleEconomyV2Roots call).
    expect(energySettleSrc).toMatch(
      /if \(isEconomyV3RootsEnabled\(\)\) \{[\s\S]*?v2_energy_anchor_at/,
    );
    expect(energySettleSrc).toMatch(
      /if \(isEconomyV3RootsEnabled\(\)\) \{[\s\S]*?return \{/,
    );
  });
});

describe("economy v3 excessGate snapshot", () => {
  it("exposes ordinaryFull / reservesFull / generatingExcess", () => {
    const gate = computeV3OrdinaryFullState({
      reserveWaterSeconds: CAP,
      reserveSunSeconds: CAP,
      reserveFertilizerSeconds: CAP,
      dailyCapSeconds: CAP,
    });
    expect(gate.ordinaryFull).toBe(true);

    const snap = buildEconomyV3RootsPublicState(
      {
        v3_daily_cap_seconds: CAP,
        // Day-1 streak → effective 21; fill reserves to that SoT.
        streak_days: 0,
        v3_reserve_water_seconds: 21,
        v3_reserve_sun_seconds: 21,
        v3_reserve_fertilizer_seconds: 21,
        tutorial_done: true,
      },
      { generatingExcess: true },
    );
    expect(snap.effectivePresetSeconds).toBe(21);
    expect(snap.excessGate).toEqual({
      ordinaryFull: true,
      rootsFull: false,
      reservesFull: { water: true, sun: true, fertilizer: true },
      generatingExcess: true,
    });
  });

  it("binary split adapter: full → all excess; not full → all ordinary", () => {
    expect(
      splitV3GeneratedIntoOrdinaryAndExcess({
        generated: 8,
        ordinaryFull: true,
      }),
    ).toEqual({ ordinaryAccepted: 0, excessGenerated: 8 });
    expect(
      splitV3GeneratedIntoOrdinaryAndExcess({
        generated: 8,
        ordinaryFull: false,
      }),
    ).toEqual({ ordinaryAccepted: 8, excessGenerated: 0 });
  });
});

describe("isV3CareCycleHoldingExcess", () => {
  it("partial Care without latch → false", () => {
    expect(
      isV3CareCycleHoldingExcess({
        careCycleStatus: "in_progress",
        careHoldExcess: false,
      }),
    ).toBe(false);
  });

  it("Care with capacity latch → true", () => {
    expect(
      isV3CareCycleHoldingExcess({
        careCycleStatus: "in_progress",
        careHoldExcess: true,
      }),
    ).toBe(true);
  });

  it("not in_progress → false even with latch", () => {
    expect(
      isV3CareCycleHoldingExcess({
        careCycleStatus: "idle",
        careHoldExcess: true,
      }),
    ).toBe(false);
  });
});

describe("shouldSuppressV3ExcessForCarePhase / shouldPauseV3GenerationForCarePhase", () => {
  it("suppresses excess on post-collect when reserves not full", () => {
    expect(
      shouldSuppressV3ExcessForCarePhase({
        ordinaryFull: false,
        postCollectPause: true,
      }),
    ).toBe(true);
  });

  it("does not suppress when reserves are truly full", () => {
    expect(
      shouldSuppressV3ExcessForCarePhase({
        ordinaryFull: true,
        postCollectPause: true,
      }),
    ).toBe(false);
  });

  it("care-hold keeps excess (no suppress)", () => {
    expect(
      shouldSuppressV3ExcessForCarePhase({
        careCycleStatus: "in_progress",
        careHoldExcess: true,
        ordinaryFull: false,
        postCollectPause: true,
      }),
    ).toBe(false);
  });

  it("partial Care in_progress suppresses excess without hold", () => {
    expect(
      shouldSuppressV3ExcessForCarePhase({
        careCycleStatus: "in_progress",
        careHoldExcess: false,
        ordinaryFull: false,
      }),
    ).toBe(true);
  });

  it("full generation pause is retired (always false)", () => {
    expect(
      shouldPauseV3GenerationForCarePhase({
        ordinaryFull: false,
        sharedPoolEnergyAtMaximum: false,
        postCollectPause: true,
      }),
    ).toBe(false);
    expect(
      shouldPauseV3GenerationForCarePhase({
        careCycleStatus: "in_progress",
        careHoldExcess: false,
        ordinaryFull: false,
        sharedPoolEnergyAtMaximum: false,
      }),
    ).toBe(false);
  });
});
