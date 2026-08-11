import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, connect } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: { query, connect },
}));

vi.mock("./economy-v3-feature", () => ({
  isEconomyV3RootsEnabled: () => true,
}));

import {
  plantTutorialSprout,
  transferVaultToChest,
} from "./economy-v3-capital-vault";

describe("economy-v3-capital-vault", () => {
  beforeEach(() => {
    query.mockReset();
    connect.mockReset();
  });

  it("plantTutorialSprout is idempotent", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ tutorial_done: false, sprout_planted: false }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            active_balance: "0",
            vault_balance: "100000",
            active_earned: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    const first = await plantTutorialSprout("1");
    expect(first.alreadyPlanted).toBe(false);
    expect(first.sproutPlanted).toBe(true);

    query
      .mockResolvedValueOnce({
        rows: [{ tutorial_done: false, sprout_planted: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            active_balance: "0",
            vault_balance: "100000",
            active_earned: "0",
          },
        ],
      });

    const second = await plantTutorialSprout("1");
    expect(second.alreadyPlanted).toBe(true);
  });

  it("transferVaultToChest moves vault into active_balance", async () => {
    query.mockResolvedValueOnce({
      rows: [{ tutorial_done: false, sprout_planted: true }],
    });

    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            active_balance: "0",
            vault_balance: "100000",
            active_earned: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined); // COMMIT
    connect.mockResolvedValue({
      query: clientQuery,
      release: vi.fn(),
    });

    const result = await transferVaultToChest("1");
    expect(result.alreadyTransferred).toBe(false);
    expect(result.amount).toBe(100000);
    expect(result.balances).toEqual({
      balance: 100000,
      vaultBalance: 0,
      earned: 0,
    });
  });

  it("transferVaultToChest rejects before plant", async () => {
    query.mockResolvedValueOnce({
      rows: [{ tutorial_done: false, sprout_planted: false }],
    });

    await expect(transferVaultToChest("1")).rejects.toMatchObject({
      code: "sprout_not_planted",
    });
  });
});
