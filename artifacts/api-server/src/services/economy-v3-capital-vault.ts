/**
 * Tutorial capital vault: starting capital lives in vault_balance until the
 * player plants a sprout and drags capital into the tree chest (active_balance).
 */

import { pool } from "@workspace/db";
import { isEconomyV3RootsEnabled } from "./economy-v3-feature";

export class EconomyV3CapitalVaultError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EconomyV3CapitalVaultError";
    this.status = status;
    this.code = code;
  }
}

export type CapitalVaultBalances = {
  balance: number;
  vaultBalance: number;
  earned: number;
};

export type PlantSproutResult = {
  planted: true;
  alreadyPlanted: boolean;
  sproutPlanted: true;
  balances: CapitalVaultBalances;
};

export type TransferVaultResult = {
  transferred: true;
  alreadyTransferred: boolean;
  amount: number;
  sproutPlanted: boolean;
  balances: CapitalVaultBalances;
};

function parseMoney(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

async function loadBalances(userId: string): Promise<CapitalVaultBalances> {
  const acc = await pool.query(
    `SELECT active_balance, vault_balance, active_earned
     FROM accounts WHERE user_id = $1`,
    [userId],
  );
  if (acc.rows.length === 0) {
    throw new EconomyV3CapitalVaultError(404, "not_found", "Account not found");
  }
  const row = acc.rows[0];
  return {
    balance: parseMoney(row.active_balance),
    vaultBalance: parseMoney(row.vault_balance),
    earned: parseMoney(row.active_earned),
  };
}

async function assertTutorialActive(userId: string): Promise<{
  sproutPlanted: boolean;
}> {
  if (!isEconomyV3RootsEnabled()) {
    throw new EconomyV3CapitalVaultError(
      403,
      "v3_disabled",
      "Economy v3 roots are disabled",
    );
  }
  const gs = await pool.query(
    `SELECT tutorial_done, sprout_planted FROM game_state WHERE user_id = $1`,
    [userId],
  );
  if (gs.rows.length === 0) {
    throw new EconomyV3CapitalVaultError(404, "not_found", "Game state not found");
  }
  const row = gs.rows[0];
  if (row.tutorial_done === true) {
    throw new EconomyV3CapitalVaultError(
      409,
      "tutorial_done",
      "Tutorial already completed",
    );
  }
  return { sproutPlanted: row.sprout_planted === true };
}

/** Idempotent: unlock tree + underground roots for the tutorial plant step. */
export async function plantTutorialSprout(
  userId: string,
): Promise<PlantSproutResult> {
  const { sproutPlanted } = await assertTutorialActive(userId);
  const balances = await loadBalances(userId);

  if (sproutPlanted) {
    return {
      planted: true,
      alreadyPlanted: true,
      sproutPlanted: true,
      balances,
    };
  }

  await pool.query(
    `UPDATE game_state
     SET sprout_planted = TRUE
     WHERE user_id = $1`,
    [userId],
  );

  return {
    planted: true,
    alreadyPlanted: false,
    sproutPlanted: true,
    balances,
  };
}

/**
 * Idempotent: move entire vault_balance → active_balance (tree chest).
 * Requires sprout planted. No-op when vault is already empty.
 */
export async function transferVaultToChest(
  userId: string,
): Promise<TransferVaultResult> {
  const { sproutPlanted } = await assertTutorialActive(userId);
  if (!sproutPlanted) {
    throw new EconomyV3CapitalVaultError(
      409,
      "sprout_not_planted",
      "Plant the sprout before transferring capital",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const acc = await client.query(
      `SELECT active_balance, vault_balance, active_earned
       FROM accounts WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (acc.rows.length === 0) {
      throw new EconomyV3CapitalVaultError(404, "not_found", "Account not found");
    }
    const row = acc.rows[0];
    const vault = parseMoney(row.vault_balance);
    const active = parseMoney(row.active_balance);
    const earned = parseMoney(row.active_earned);

    if (vault <= 0) {
      await client.query("COMMIT");
      return {
        transferred: true,
        alreadyTransferred: true,
        amount: 0,
        sproutPlanted: true,
        balances: {
          balance: active,
          vaultBalance: 0,
          earned,
        },
      };
    }

    const nextActive = active + vault;
    await client.query(
      `UPDATE accounts
       SET active_balance = $2,
           vault_balance = 0
       WHERE user_id = $1`,
      [userId, nextActive],
    );
    await client.query("COMMIT");

    return {
      transferred: true,
      alreadyTransferred: false,
      amount: vault,
      sproutPlanted: true,
      balances: {
        balance: nextActive,
        vaultBalance: 0,
        earned,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
