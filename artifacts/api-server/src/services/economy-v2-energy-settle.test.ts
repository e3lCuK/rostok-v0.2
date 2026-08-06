import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  V2_REFERENCE_CAPITAL,
  V2_SECONDS_PER_ENERGY_AT_REFERENCE,
} from "./economy-v2";

const { queryMock, connectMock, releaseMock } = vi.hoisted(() => {
  const queryMock = vi.fn();
  const releaseMock = vi.fn();
  const connectMock = vi.fn(async () => ({
    query: queryMock,
    release: releaseMock,
  }));
  return { queryMock, connectMock, releaseMock };
});

vi.mock("@workspace/db", () => ({
  pool: {
    connect: connectMock,
    query: vi.fn(),
  },
}));

import { settleAndPersistEconomyV2Energy } from "./economy-v2-energy-settle";

const REF = V2_REFERENCE_CAPITAL;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;
const NOW = 1_700_000_000_000;

describe("settleAndPersistEconomyV2Energy (roots)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
  });

  it("locks the row, matures roots, keeps collected bank", async () => {
    const anchor = NOW - T * 1000;
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "10.4",
            v2_energy_anchor_at: String(anchor),
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0",
            v2_excess_seconds: "0",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ active_balance: String(REF) }],
      })
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await settleAndPersistEconomyV2Energy(42, NOW);

    expect(result).not.toBeNull();
    expect(result!.energySeconds).toBeCloseTo(10.4, 10);
    expect(result!.energyAnchorAt).toBe(NOW);
    expect(result!.roots.readyCount).toBe(1);
    expect(result!.roots.readyMask).toBe("1");

    expect(queryMock.mock.calls[0][0]).toBe("BEGIN");
    expect(String(queryMock.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(String(queryMock.mock.calls[3][0])).toContain("v2_root_ready_mask");
    expect(String(queryMock.mock.calls[3][0])).toContain("v2_excess_seconds");
    expect(String(queryMock.mock.calls[3][0])).toContain("v2_excess_elapsed_ms");
    expect(String(queryMock.mock.calls[3][0])).toContain("v2_excess_base_income");
    expect(String(queryMock.mock.calls[3][0])).toContain(
      "v2_ordinary_income_elapsed_ms",
    );
    expect(queryMock.mock.calls[3][1][1]).toBeCloseTo(10.4, 10);
    expect(queryMock.mock.calls[3][1][3]).toBe("1");
    expect(queryMock.mock.calls[3][1][5]).toBeCloseTo(0, 10);
    expect(queryMock.mock.calls[3][1][6]).toBeCloseTo(0, 10);
    expect(queryMock.mock.calls[3][1][7]).toBeCloseTo(0, 10);
    expect(result!.excessSeconds).toBeCloseTo(0, 10);
    expect(result!.excessElapsedMs).toBeCloseTo(0, 10);
    expect(result!.excessBaseIncome).toBeCloseTo(0, 10);
    expect(result!.ordinaryIncomeElapsedMs).toBeGreaterThan(0);
    expect(result!.excess.excessAvailable).toBe(false);
    expect(queryMock.mock.calls[4][0]).toBe("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when game_state row is missing", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);

    const result = await settleAndPersistEconomyV2Energy(7, NOW);
    expect(result).toBeNull();
    expect(queryMock.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
  });

  it("two sequential persists with same now do not double-mature", async () => {
    const anchor = NOW - T * 1000;

    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "0",
            v2_energy_anchor_at: String(anchor),
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0",
            v2_excess_seconds: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const first = await settleAndPersistEconomyV2Energy(1, NOW);
    expect(first?.roots.readyCount).toBe(1);
    expect(first?.energySeconds).toBe(0);

    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: String(first!.energySeconds),
            v2_energy_anchor_at: String(first!.energyAnchorAt),
            v2_root_ready_mask: first!.roots.readyMask,
            v2_root_generation_progress: String(first!.rootGenerationProgress),
            v2_excess_seconds: String(first!.excessSeconds),
            v2_excess_elapsed_ms: String(first!.excessElapsedMs),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const second = await settleAndPersistEconomyV2Energy(1, NOW);
    expect(second?.roots.readyCount).toBe(1);
    expect(second?.excessElapsedMs).toBeCloseTo(first!.excessElapsedMs, 10);
    expect(second?.energySeconds).toBe(0);
  });

  it("tutorial_done=false: does not mature ordinary energy; advances anchor", async () => {
    const anchor = NOW - T * 5_000;
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "0",
            v2_energy_anchor_at: String(anchor),
            tutorial_done: false,
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0.25",
            v2_excess_seconds: "0",
            v2_excess_elapsed_ms: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined) // UPDATE anchor only
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await settleAndPersistEconomyV2Energy(9, NOW);

    expect(result).not.toBeNull();
    expect(result!.energySeconds).toBe(0);
    expect(result!.energyAnchorAt).toBe(NOW);
    expect(result!.rootGenerationProgress).toBeCloseTo(0.25, 10);
    expect(result!.roots.readyCount).toBe(0);
    expect(result!.roots.readyMask).toBe("0");
    expect(result!.excessSeconds).toBeCloseTo(0, 10);
    expect(result!.excess.excessAvailable).toBe(false);

    // Only the generation anchor is moved forward — no mask / excess mutation.
    expect(String(queryMock.mock.calls[3][0])).toContain("v2_energy_anchor_at");
    expect(String(queryMock.mock.calls[3][0])).not.toContain(
      "v2_root_ready_mask",
    );
    expect(queryMock.mock.calls[3][1][1]).toBe(NOW);
  });

  it("tutorial_done=false: excess does not grow while storage would otherwise overflow", async () => {
    const anchor = NOW - T * 3_000;
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "60",
            v2_energy_anchor_at: String(anchor),
            tutorial_done: false,
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0",
            v2_excess_seconds: "1.5",
            v2_excess_elapsed_ms: "1000",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await settleAndPersistEconomyV2Energy(3, NOW);
    expect(result!.excessSeconds).toBeCloseTo(1.5, 10);
    expect(result!.roots.readyCount).toBe(0);
    expect(result!.energyAnchorAt).toBe(NOW);
  });

  it("tutorial_done=true: existing accumulation still matures as before", async () => {
    const anchor = NOW - T * 1000;
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "0",
            v2_energy_anchor_at: String(anchor),
            tutorial_done: true,
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0",
            v2_excess_seconds: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await settleAndPersistEconomyV2Energy(11, NOW);
    expect(result!.roots.readyCount).toBe(1);
    expect(result!.energyAnchorAt).toBe(NOW);
  });
});

describe("isEconomyV2TutorialActive", () => {
  it("only treats explicit false as tutorial-active (old accounts safe)", async () => {
    const { isEconomyV2TutorialActive } = await import(
      "./economy-v2-energy-settle"
    );
    expect(isEconomyV2TutorialActive(false)).toBe(true);
    expect(isEconomyV2TutorialActive(true)).toBe(false);
    expect(isEconomyV2TutorialActive(undefined)).toBe(false);
    expect(isEconomyV2TutorialActive(null)).toBe(false);
  });
});
