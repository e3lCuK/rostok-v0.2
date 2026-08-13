import { describe, expect, it } from "vitest";
import {
  advanceV3MetelkaCycleFlags,
  buildV3MetelkaCyclePublic,
  completeV3MetelkaCycleFlags,
  computeV3RootsFull,
  isCareBlockedByMetelka,
  isV3MetelkaCycleReadyForStart,
  isV3RootTransferLockedByMetelka,
} from "./economy-v3-metelka-cycle";
import { settleEconomyV3Roots } from "./economy-v3-roots";
import { V2_SECONDS_PER_ENERGY_AT_REFERENCE } from "./economy-v2";
import { isExcessAvailable } from "./economy-v2-excess";

const NOW = Date.parse("2026-07-27T20:00:00.000Z");
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;

describe("economy-v3-metelka-cycle", () => {
  it("rootsFull only at capacity (pass capacitySeconds)", () => {
    expect(
      computeV3RootsFull({
        rootWaterSeconds: 25,
        rootSunSeconds: 25,
        rootFertilizerSeconds: 24,
        capacitySeconds: 25,
      }),
    ).toBe(false);
    expect(
      computeV3RootsFull({
        rootWaterSeconds: 25,
        rootSunSeconds: 25,
        rootFertilizerSeconds: 25,
        capacitySeconds: 25,
      }),
    ).toBe(true);
    expect(
      computeV3RootsFull({
        rootWaterSeconds: 25,
        rootSunSeconds: 25,
        rootFertilizerSeconds: 25,
        // default absolute max 30 — 25 is not full
      }),
    ).toBe(false);
  });

  it("entering roots-full sets required; Metelka complete unlocks transfer", () => {
    const enter = advanceV3MetelkaCycleFlags({
      rootsFull: true,
      required: false,
      completedForCycle: false,
    });
    expect(enter.required).toBe(true);
    expect(enter.completedForCycle).toBe(false);
    expect(enter.dirty).toBe(true);

    const done = completeV3MetelkaCycleFlags({
      required: true,
      completedForCycle: false,
    });
    expect(done.required).toBe(false);
    expect(done.completedForCycle).toBe(true);

    const unlocked = buildV3MetelkaCyclePublic({
      rootsFull: true,
      required: false,
      completedForCycle: true,
      excessAvailable: false,
      metelkaSessionActive: false,
      metelkaPendingResult: false,
    });
    expect(unlocked.phase).toBe("root_transfer_unlocked");
    expect(unlocked.transferLocked).toBe(false);
    expect(unlocked.careLocked).toBe(false);
  });

  it("transfer locked from Metelka available until finish (not while waiting excess)", () => {
    const waiting = buildV3MetelkaCyclePublic({
      rootsFull: true,
      required: true,
      completedForCycle: false,
      excessAvailable: false,
      metelkaSessionActive: false,
      metelkaPendingResult: false,
    });
    expect(waiting.phase).toBe("roots_full_waiting_excess");
    // Roots stay clickable until Metelka CTA exists — otherwise dead-end UX.
    expect(waiting.transferLocked).toBe(false);
    expect(waiting.careLocked).toBe(false);

    const available = buildV3MetelkaCyclePublic({
      rootsFull: false,
      required: false,
      completedForCycle: false,
      excessAvailable: true,
      metelkaSessionActive: false,
      metelkaPendingResult: false,
    });
    expect(available.phase).toBe("metelka_available");
    expect(available.transferLocked).toBe(true);
    expect(available.careLocked).toBe(true);
    expect(
      isV3MetelkaCycleReadyForStart({
        required: false,
        completedForCycle: false,
        rootsFull: false,
        excessAvailable: true,
      }),
    ).toBe(true);
  });

  it("active Metelka locks transfer; pending coin after finish does not", () => {
    const active = buildV3MetelkaCyclePublic({
      rootsFull: true,
      required: true,
      completedForCycle: false,
      excessAvailable: true,
      metelkaSessionActive: true,
      metelkaPendingResult: false,
    });
    expect(active.phase).toBe("metelka_active");
    expect(active.transferLocked).toBe(true);
    expect(active.careLocked).toBe(true);

    const pending = buildV3MetelkaCyclePublic({
      rootsFull: true,
      required: false,
      completedForCycle: true,
      excessAvailable: false,
      metelkaSessionActive: false,
      metelkaPendingResult: true,
    });
    expect(pending.phase).toBe("metelka_pending_result");
    // Finish already completed the cycle — transfer unlocked; Care unlocked.
    expect(pending.transferLocked).toBe(false);
    expect(pending.careLocked).toBe(false);
  });

  it("isV3RootTransferLockedByMetelka matches product order", () => {
    expect(
      isV3RootTransferLockedByMetelka({
        required: true,
        completedForCycle: false,
        excessAvailable: false,
        metelkaSessionActive: false,
      }),
    ).toBe(false);
    expect(
      isV3RootTransferLockedByMetelka({
        required: false,
        completedForCycle: false,
        excessAvailable: true,
        metelkaSessionActive: false,
      }),
    ).toBe(true);
    expect(
      isV3RootTransferLockedByMetelka({
        required: false,
        completedForCycle: true,
        excessAvailable: false,
        metelkaSessionActive: false,
      }),
    ).toBe(false);
    expect(
      isV3RootTransferLockedByMetelka({
        required: false,
        completedForCycle: true,
        excessAvailable: false,
        metelkaSessionActive: true,
      }),
    ).toBe(true);
  });

  it("isCareBlockedByMetelka: excess or active session only", () => {
    expect(
      isCareBlockedByMetelka({
        excessAvailable: false,
        metelkaSessionActive: false,
      }),
    ).toBe(false);
    expect(
      isCareBlockedByMetelka({
        excessAvailable: true,
        metelkaSessionActive: false,
      }),
    ).toBe(true);
    expect(
      isCareBlockedByMetelka({
        excessAvailable: false,
        metelkaSessionActive: true,
      }),
    ).toBe(true);
  });

  it("leaving roots-full clears cycle markers", () => {
    const clear = advanceV3MetelkaCycleFlags({
      rootsFull: false,
      required: false,
      completedForCycle: true,
    });
    expect(clear.required).toBe(false);
    expect(clear.completedForCycle).toBe(false);
  });

  it("25/25/25 settle accrues excess; Metelka ready uses rootsFull not reserves", () => {
    const r = settleEconomyV3Roots({
      rootWaterSeconds: 25,
      rootSunSeconds: 25,
      rootFertilizerSeconds: 25,
      generationProgress: 0,
      generationRrCursor: 0,
      generationAnchorAt: NOW - 5 * T * 1000,
      generationFrozenAt: null,
      dayKey: "2026-07-27",
      capital: 100_000,
      nowMs: NOW,
      tutorialActive: false,
      reserveWaterSeconds: 0,
      reserveSunSeconds: 0,
      reserveFertilizerSeconds: 0,
      dailyCapSeconds: 25,
      streakDays: 0,
      visitBonusSeconds: 0,
      excessSeconds: 0,
      excessElapsedMs: 0,
      transferredRoots: [],
    });
    expect(r.excessSeconds).toBeCloseTo(5, 5);
    expect(isExcessAvailable(r.excessSeconds)).toBe(true);
    expect(
      computeV3RootsFull({
        rootWaterSeconds: r.rootWaterSeconds,
        rootSunSeconds: r.rootSunSeconds,
        rootFertilizerSeconds: r.rootFertilizerSeconds,
        capacitySeconds: 25,
      }),
    ).toBe(true);
    expect(r.ordinaryFull).toBe(false);
  });
});
