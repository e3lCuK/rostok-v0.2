import { beforeEach, describe, expect, it, vi } from "vitest";
import { V2_REFERENCE_CAPITAL } from "./economy-v2";
import { placeMaturedSections, setSectionReady } from "./economy-v2-roots";

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

import {
  debugMutateEconomyV2Roots,
  EconomyV2RootsDebugError,
} from "./economy-v2-roots-debug";

const REF = V2_REFERENCE_CAPITAL;
const NOW = 1_700_000_000_000;
const OLD_ANCHOR = NOW - 60_000;

function mockLockedRow(opts: {
  energy?: string;
  anchor?: string;
  mask?: string;
  progress?: string;
}) {
  queryMock
    .mockResolvedValueOnce(undefined) // BEGIN
    .mockResolvedValueOnce({
      rows: [
        {
          v2_energy_seconds: opts.energy ?? "12",
          v2_energy_anchor_at: opts.anchor ?? String(OLD_ANCHOR),
          v2_root_ready_mask: opts.mask ?? "0",
          v2_root_generation_progress: opts.progress ?? "0.25",
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
    .mockResolvedValueOnce(undefined) // UPDATE
    .mockResolvedValueOnce(undefined); // COMMIT
}

describe("debugMutateEconomyV2Roots", () => {
  beforeEach(() => {
    queryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
  });

  it("uses BEGIN + SELECT FOR UPDATE + COMMIT", async () => {
    mockLockedRow({});
    await debugMutateEconomyV2Roots(9, { action: "reset" }, NOW);
    expect(queryMock.mock.calls[0][0]).toBe("BEGIN");
    expect(String(queryMock.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("reset → mask 0, progress 0, anchor=now; bank unchanged", async () => {
    mockLockedRow({ energy: "12", mask: "31", progress: "0.4" });
    const result = await debugMutateEconomyV2Roots(9, { action: "reset" }, NOW);

    expect(result.readyMask).toBe("0");
    expect(result.readyCount).toBe(0);
    expect(result.generationProgress).toBe(0);
    expect(result.anchorAt).toBe(NOW);
    expect(result.energySeconds).toBe(12);

    const updateSql = String(queryMock.mock.calls[3][0]);
    const updateParams = queryMock.mock.calls[3][1] as unknown[];
    expect(updateSql).toContain("v2_root_ready_mask");
    expect(updateSql).not.toContain("v2_energy_seconds");
    expect(updateParams[1]).toBe("0");
    expect(updateParams[2]).toBe(0);
    expect(updateParams[3]).toBe(NOW);
  });

  it("add 1 → first free bit (section 0)", async () => {
    mockLockedRow({ mask: "0" });
    const result = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 1 },
      NOW,
    );
    expect(result.readyCount).toBe(1);
    expect(result.readyMask).toBe("1");
    expect(result.energySeconds).toBe(12);
    expect(result.anchorAt).toBe(OLD_ANCHOR);
  });

  it("add fills earliest hole (0,2,5 → adds 1)", async () => {
    let mask = 0n;
    mask = setSectionReady(mask, 0);
    mask = setSectionReady(mask, 2);
    mask = setSectionReady(mask, 5);
    mockLockedRow({ mask: mask.toString(10) });

    const result = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 1 },
      NOW,
    );
    const expected = placeMaturedSections(mask, 1).mask;
    expect(result.readyMask).toBe(expected.toString(10));
    expect(result.readyCount).toBe(4);
  });

  it("add 15 places up to 15 free bits; keeps existing ready bits", async () => {
    const mask = setSectionReady(0n, 0);
    mockLockedRow({ energy: "0", mask: mask.toString(10), progress: "0" });
    const result = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 15 },
      NOW,
    );
    // preexisting bit 0 + 15 newly placed → 16
    expect(result.readyCount).toBe(16);
    expect(BigInt(result.readyMask) & 1n).toBe(1n);
    expect(result.energySeconds).toBe(0);
    expect(result.anchorAt).toBe(OLD_ANCHOR);
  });

  it("add when free < count fills only remaining; cap 60", async () => {
    const almostFull = placeMaturedSections(0n, 58).mask;
    mockLockedRow({
      energy: "0",
      mask: almostFull.toString(10),
      progress: "0",
    });
    const result = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 15 },
      NOW,
    );
    expect(result.readyCount).toBe(60);
    expect(result.roots.isFull).toBe(true);

    // second add on full mask — no change / no crash
    queryMock.mockReset();
    mockLockedRow({
      energy: "0",
      mask: result.readyMask,
      progress: "0",
    });
    const again = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 15 },
      NOW,
    );
    expect(again.readyCount).toBe(60);
  });

  it("add +15 respects shared storage (bank 50 + ready 5 → +5)", async () => {
    const mask = placeMaturedSections(0n, 5).mask;
    mockLockedRow({
      energy: "50",
      mask: mask.toString(10),
      progress: "0",
    });
    const result = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 15 },
      NOW,
    );
    expect(result.readyCount).toBe(10);
    expect(result.energySeconds).toBe(50);
    expect(result.roots.storageFull).toBe(true);
    expect(result.roots.storageOccupied).toBe(60);
  });

  it("add 1 with bank 12 still places when free capacity remains", async () => {
    mockLockedRow({ energy: "12", mask: "0", progress: "0" });
    const result = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 1 },
      NOW,
    );
    expect(result.readyCount).toBe(1);
    expect(result.readyMask).toBe("1");
    expect(result.energySeconds).toBe(12);
  });

  it("add does not change energy bank", async () => {
    mockLockedRow({ energy: "7", mask: "0", progress: "0" });
    const result = await debugMutateEconomyV2Roots(
      9,
      { action: "add", count: 15 },
      NOW,
    );
    expect(result.energySeconds).toBe(7);
    const updateSql = String(queryMock.mock.calls[3][0]);
    expect(updateSql).not.toMatch(/v2_energy_seconds\s*=/);
  });

  it("invalid count → 400", async () => {
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "1",
            v2_energy_anchor_at: String(NOW),
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(
      debugMutateEconomyV2Roots(9, { action: "add", count: 0 }, NOW),
    ).rejects.toMatchObject({ code: "invalid_count", status: 400 });
  });

  it("missing game_state → 404", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      debugMutateEconomyV2Roots(9, { action: "reset" }, NOW),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});
