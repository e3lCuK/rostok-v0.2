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

import {
  collectEconomyV2RootSection,
  EconomyV2RootsCollectError,
} from "./economy-v2-roots-collect";

const REF = V2_REFERENCE_CAPITAL;
const T = V2_SECONDS_PER_ENERGY_AT_REFERENCE;
const NOW = 1_700_000_000_000;

describe("collectEconomyV2RootSection", () => {
  beforeEach(() => {
    queryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
  });

  it("ready section → bit clear, energy +1", async () => {
    // settle: no new sections (anchor=now); collect section 0 from mask=1
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "4",
            v2_energy_anchor_at: String(NOW),
            v2_root_ready_mask: "1",
            v2_root_generation_progress: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined) // settle UPDATE
      .mockResolvedValueOnce(undefined) // collect UPDATE
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await collectEconomyV2RootSection(9, 0, NOW);
    expect(result.collected).toBe(true);
    expect(result.collectedSectionIndex).toBe(0);
    expect(result.energySeconds).toBe(5);
    expect(result.roots.readyMask).toBe("0");
    expect(result.roots.readyCount).toBe(0);
  });

  it("empty section → 409 section_not_ready", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "4",
            v2_energy_anchor_at: String(NOW),
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined) // settle
      .mockResolvedValueOnce(undefined); // COMMIT settle before error

    await expect(collectEconomyV2RootSection(9, 3, NOW)).rejects.toMatchObject({
      code: "section_not_ready",
      status: 409,
    });
  });

  it("bank full → 409 energy_bank_full; section stays ready", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "60",
            v2_energy_anchor_at: String(NOW),
            v2_root_ready_mask: "1",
            v2_root_generation_progress: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(collectEconomyV2RootSection(9, 0, NOW)).rejects.toMatchObject({
      code: "energy_bank_full",
      status: 409,
    });
    expect(EconomyV2RootsCollectError).toBeTruthy();
  });

  it("settle during collect can mature then collect", async () => {
    const anchor = NOW - T * 1000;
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "14",
            v2_energy_anchor_at: String(anchor),
            v2_root_ready_mask: "0",
            v2_root_generation_progress: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ active_balance: String(REF) }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await collectEconomyV2RootSection(1, 0, NOW);
    expect(result.energySeconds).toBe(15);
    expect(result.roots.readyCount).toBe(0);
  });

  it("tutorial_done=false → 403 tutorial_active (no collect)", async () => {
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            v2_energy_seconds: "0",
            v2_energy_anchor_at: String(NOW),
            tutorial_done: false,
            v2_root_ready_mask: "1",
            v2_root_generation_progress: "0",
          },
        ],
      })
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(collectEconomyV2RootSection(2, 0, NOW)).rejects.toMatchObject({
      code: "tutorial_active",
      status: 403,
    });
    // Lock + rollback only — no settle/collect writes.
    expect(queryMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "BEGIN",
      expect.stringContaining("FOR UPDATE"),
      "ROLLBACK",
    ]);
  });
});
