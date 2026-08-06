import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  V2_REFERENCE_CAPITAL,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
} from "./economy-v2";
import { computeV2StorageCapacity } from "./economy-v2-capacity";
import {
  buildEconomyV2RootsPublicState,
  countReadySections,
  settleEconomyV2Roots,
} from "./economy-v2-roots";
import { normalizeRootsAfterBankChange } from "./economy-v2-energy-debug";

const REF = V2_REFERENCE_CAPITAL;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;
const NOW = 1_700_000_000_000;

const { connectMock, releaseMock, state } = vi.hoisted(() => {
  const releaseMock = vi.fn();
  const state = {
    game: null as Record<string, unknown> | null,
    capital: 100_000 as number,
  };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return { rows: [] };
    }
    if (text.includes("FROM game_state") && text.includes("FOR UPDATE")) {
      if (!state.game) return { rows: [] };
      return { rows: [{ ...state.game }] };
    }
    if (text.includes("FROM accounts")) {
      return { rows: [{ active_balance: state.capital }] };
    }
    if (text.startsWith("UPDATE game_state")) {
      if (!state.game) return { rows: [] };
      state.game.v2_energy_seconds = params[1];
      state.game.v2_energy_anchor_at = params[2];
      state.game.v2_root_ready_mask = params[3];
      state.game.v2_root_generation_progress = params[4];
      if (params[5] != null) state.game.last_session_time = params[5];
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });
  const connectMock = vi.fn(async () => ({ query, release: releaseMock }));
  return { connectMock, releaseMock, state, query };
});

vi.mock("@workspace/db", () => ({
  pool: { connect: connectMock, query: vi.fn() },
}));

import { debugMutateEconomyV2Energy } from "./economy-v2-energy-debug";

describe("bank=59 last-second accumulation", () => {
  it("1. capacity: freeCapacity=1 storageFull=false", () => {
    const c = computeV2StorageCapacity({
      energySeconds: 59,
      readyCount: 0,
      generationProgress: 0,
    });
    expect(c.freeCapacity).toBe(1);
    expect(c.storageFull).toBe(false);
  });

  it("2. public state exposes countdown", () => {
    const pub = buildEconomyV2RootsPublicState({
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      capital: REF,
      energySeconds: 59,
    });
    expect(pub.storageFull).toBe(false);
    expect(pub.secondsUntilNextSection).not.toBeNull();
    expect(pub.secondsUntilNextSection).toBeCloseTo(T, 6);
  });

  it("3. half cycle → progress≈0.5, ready=0, not full", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - 0.5 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.usableGeneratedEnergy).toBeCloseTo(0.5, 10);
    expect(r.rootGenerationProgress).toBeCloseTo(0.5, 10);
    expect(countReadySections(r.rootReadyMask)).toBe(0);
    expect(r.storageFull).toBe(false);
    expect(r.excessGenerated).toBeCloseTo(0, 10);
  });

  it("4. full cycle → ready=1 progress=0 occupied=60", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(countReadySections(r.rootReadyMask)).toBe(1);
    expect(r.rootGenerationProgress).toBeCloseTo(0, 10);
    const occ = computeV2StorageCapacity({
      energySeconds: 59,
      readyCount: 1,
      generationProgress: 0,
    });
    expect(occ.occupied).toBe(60);
    expect(occ.storageFull).toBe(true);
  });

  it("7. excess does not grow while last second still free", () => {
    const r = settleEconomyV2Roots({
      energySeconds: 59,
      energyAnchorAt: NOW - 0.25 * T * 1000,
      rootReadyMask: 0n,
      rootGenerationProgress: 0,
      excessSeconds: 0,
      capital: REF,
      nowMs: NOW,
    });
    expect(r.excessGenerated).toBe(0);
    expect(r.usableGeneratedEnergy).toBeCloseTo(0.25, 10);
  });
});

describe("debugMutateEconomyV2Energy fresh snapshot", () => {
  beforeEach(() => {
    state.game = {
      v2_energy_seconds: 60,
      v2_energy_anchor_at: NOW - 10_000,
      last_session_time: NOW - 10_000,
      missed_sessions: 0,
      v2_root_ready_mask: "0",
      v2_root_generation_progress: "0",
    };
    state.capital = REF;
    releaseMock.mockClear();
    connectMock.mockClear();
  });

  it("Fill from empty → bank=60 ready=0 progress=0 full timer=null", async () => {
    state.game!.v2_energy_seconds = 0;
    const r = await debugMutateEconomyV2Energy(1, { setSeconds: 60 }, NOW);
    expect(r.energySeconds).toBe(60);
    expect(r.energySeconds).not.toBe(59);
    expect(r.roots.readyCount).toBe(0);
    expect(r.roots.generationProgress).toBe(0);
    expect(r.capacity.occupied).toBe(60);
    expect(r.capacity.freeCapacity).toBe(0);
    expect(r.capacity.storageFull).toBe(true);
    expect(r.roots.storageFull).toBe(true);
    expect(r.roots.secondsUntilNextSection).toBeNull();
  });

  it("Fill with ready=1 progress=0.7 clears roots and sets bank=60", async () => {
    state.game!.v2_energy_seconds = 10;
    state.game!.v2_root_ready_mask = "1";
    state.game!.v2_root_generation_progress = "0.7";
    const r = await debugMutateEconomyV2Energy(1, { setSeconds: 60 }, NOW);
    expect(r.energySeconds).toBe(60);
    expect(r.roots.readyMask).toBe("0");
    expect(r.roots.readyCount).toBe(0);
    expect(r.roots.generationProgress).toBe(0);
    expect(r.capacity.storageFull).toBe(true);
    // Must NOT clamp to 59 under leftover ready/progress
    expect(r.energySeconds).toBeGreaterThan(59.5);
  });

  it("Fill serializes exact 60 not 59.999", async () => {
    const r = await debugMutateEconomyV2Energy(1, { setSeconds: 60 }, NOW);
    expect(r.energySeconds).toBe(60);
    expect(JSON.stringify(r.energySeconds)).toBe("60");
  });

  it("6. set bank 59 after full → storageFull=false + countdown", async () => {
    const r = await debugMutateEconomyV2Energy(
      1,
      { setSeconds: 59 },
      NOW,
    );
    expect(r.energySeconds).toBe(59);
    expect(r.capacity.occupied).toBe(59);
    expect(r.capacity.freeCapacity).toBe(1);
    expect(r.capacity.storageFull).toBe(false);
    expect(r.roots.storageFull).toBe(false);
    expect(r.roots.secondsUntilNextSection).not.toBeNull();
    expect(r.energyAnchorAt).toBe(NOW);
  });

  it("normalizeRootsAfterBankChange clears near-1 progress into ready when room", () => {
    const n = normalizeRootsAfterBankChange({
      energySeconds: 59,
      rootReadyMask: 0n,
      generationProgress: 0.999999999,
    });
    expect(countReadySections(n.mask)).toBe(1);
    expect(n.progress).toBeCloseTo(0, 10);
  });
});
