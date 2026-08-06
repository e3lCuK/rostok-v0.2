/**
 * Metelka pending claim — atomic balance + XP + history; no tree growth.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { poolConnectMock, clientQueryMock } = vi.hoisted(() => ({
  poolConnectMock: vi.fn(),
  clientQueryMock: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    connect: poolConnectMock,
    query: vi.fn(),
  },
}));

import { claimMetelkaPendingReward } from "./economy-v2-excess-metelka-claim";
import { EconomyV2ExcessSessionError } from "./economy-v2-excess-session";
import {
  emptyMetelkaPendingReward,
  readMetelkaPendingRewardFromRow,
} from "./economy-v2-excess-metelka-pending";
import { calcPlayerLevel } from "./economy-v2-care-xp";

const NOW = 1_720_000_000_000;
const TOKEN = "claim-tok-abc123";

type GameRow = Record<string, unknown>;
type AccRow = { active_balance: number; active_earned: number };

function activePending(overrides: Partial<GameRow> = {}): GameRow {
  return {
    player_xp: 100,
    player_level: 1,
    tree_growth_mm: 42,
    tree_growth_remainder: 0.3,
    pending_base_reward: 9.99,
    pending_bonus_reward: 1.11,
    metelka_pending_active: true,
    metelka_pending_base: 1.23,
    metelka_pending_bonus: 0.45,
    metelka_pending_xp: 7,
    metelka_pending_created_at: NOW - 60_000,
    metelka_pending_claim_token: TOKEN,
    metelka_pending_claimed_at: null,
    ...overrides,
  };
}

function makeDb(initial: { game: GameRow | null; acc: AccRow }) {
  const state = {
    game: initial.game ? { ...initial.game } : null,
    acc: { ...initial.acc },
    history: [] as Array<{ amount: number; type: string }>,
    commits: 0,
    rollbacks: 0,
  };

  clientQueryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);

    if (text === "BEGIN") return { rows: [] };
    if (text === "COMMIT") {
      state.commits += 1;
      return { rows: [] };
    }
    if (text === "ROLLBACK") {
      state.rollbacks += 1;
      return { rows: [] };
    }

    if (
      text.includes("FROM accounts") &&
      text.includes("FOR UPDATE") &&
      text.startsWith("SELECT")
    ) {
      return { rows: [{ active_balance: state.acc.active_balance }] };
    }

    if (
      text.includes("FROM game_state") &&
      text.includes("FOR UPDATE") &&
      text.startsWith("SELECT")
    ) {
      if (!state.game) return { rows: [] };
      return { rows: [{ ...state.game }] };
    }

    if (
      text.startsWith("UPDATE game_state") &&
      text.includes("metelka_pending_active = FALSE") &&
      text.includes("metelka_pending_claimed_at = $2")
    ) {
      if (
        !state.game ||
        state.game.metelka_pending_active !== true ||
        String(state.game.metelka_pending_claim_token) !== String(params[4]) ||
        state.game.metelka_pending_claimed_at != null
      ) {
        return { rows: [] };
      }
      state.game.metelka_pending_active = false;
      state.game.metelka_pending_claimed_at = params[1];
      state.game.player_xp = params[2];
      state.game.player_level = params[3];
      return { rows: [{ ...state.game }] };
    }

    if (
      text.startsWith("UPDATE accounts") &&
      text.includes("active_balance = active_balance + $2")
    ) {
      const delta = Number(params[1]);
      state.acc.active_balance += delta;
      state.acc.active_earned += delta;
      return { rows: [] };
    }

    if (text.startsWith("INSERT INTO income_history")) {
      const typeMatch = text.match(/'([a-z_]+)'/);
      state.history.push({
        amount: Number(params[1]),
        type: typeMatch?.[1] ?? "unknown",
      });
      return { rows: [] };
    }

    if (
      text.includes("FROM accounts") &&
      text.startsWith("SELECT") &&
      !text.includes("FOR UPDATE")
    ) {
      return {
        rows: [
          {
            active_balance: state.acc.active_balance,
            active_earned: state.acc.active_earned,
          },
        ],
      };
    }

    throw new Error(`Unexpected SQL in Metelka claim mock:\n${text}`);
  });

  poolConnectMock.mockResolvedValue({
    query: clientQueryMock,
    release: vi.fn(),
  });

  return state;
}

describe("claimMetelkaPendingReward", () => {
  beforeEach(() => {
    clientQueryMock.mockReset();
    poolConnectMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("successful claim: money + XP + history; closes pending; no tree", async () => {
    const state = makeDb({
      game: activePending(),
      acc: { active_balance: 10, active_earned: 5 },
    });
    const treeBefore = {
      mm: state.game!.tree_growth_mm,
      rem: state.game!.tree_growth_remainder,
    };
    const carePendingBefore = {
      base: state.game!.pending_base_reward,
      bonus: state.game!.pending_bonus_reward,
    };

    const result = await claimMetelkaPendingReward("1", TOKEN, NOW);

    expect(result.success).toBe(true);
    expect(result.moneyGained).toBe(1.68);
    expect(result.xpGained).toBe(7);
    expect(result.playerXp).toBe(107);
    expect(result.playerLevel).toBe(calcPlayerLevel(107));
    expect(state.game!.player_xp).toBe(107);
    expect(result.reward).toMatchObject({
      baseAmount: 1.23,
      bonusAmount: 0.45,
      totalAmount: 1.68,
      xpAmount: 7,
      claimToken: TOKEN,
      claimedAt: NOW,
    });
    expect(result.balances.balance).toBe(11.68);
    expect(result.balances.earned).toBe(6.68);
    expect(result.playerXp).toBe(107);
    expect(result.playerLevel).toBe(calcPlayerLevel(107));
    expect(result.metelkaPendingReward.active).toBe(false);
    expect(result.metelkaPendingReward.claimedAt).toBe(NOW);

    expect(state.game!.metelka_pending_active).toBe(false);
    expect(state.game!.metelka_pending_claimed_at).toBe(NOW);
    expect(state.game!.metelka_pending_base).toBe(1.23);
    expect(state.game!.metelka_pending_bonus).toBe(0.45);
    expect(state.game!.metelka_pending_claim_token).toBe(TOKEN);
    expect(state.game!.tree_growth_mm).toBe(treeBefore.mm);
    expect(state.game!.tree_growth_remainder).toBe(treeBefore.rem);
    expect(state.game!.pending_base_reward).toBe(carePendingBefore.base);
    expect(state.game!.pending_bonus_reward).toBe(carePendingBefore.bonus);
    expect(state.history).toEqual([{ amount: 1.68, type: "metelka" }]);
    expect(state.commits).toBe(1);
  });

  it("only base (bonus = 0)", async () => {
    const state = makeDb({
      game: activePending({
        metelka_pending_base: 2.5,
        metelka_pending_bonus: 0,
        metelka_pending_xp: 1,
      }),
      acc: { active_balance: 0, active_earned: 0 },
    });
    const result = await claimMetelkaPendingReward("1", TOKEN, NOW);
    expect(result.moneyGained).toBe(2.5);
    expect(result.reward.bonusAmount).toBe(0);
    expect(state.history).toEqual([{ amount: 2.5, type: "metelka" }]);
  });

  it("base + partial bonus keeps kopecks", async () => {
    const state = makeDb({
      game: activePending({
        metelka_pending_base: 1.11,
        metelka_pending_bonus: 0.07,
        metelka_pending_xp: 0,
      }),
      acc: { active_balance: 0, active_earned: 0 },
    });
    const result = await claimMetelkaPendingReward("1", TOKEN, NOW);
    expect(result.moneyGained).toBe(1.18);
    expect(state.acc.active_balance).toBe(1.18);
    expect(state.history[0]?.amount).toBe(1.18);
  });

  it("XP = 0: money credits, XP unchanged", async () => {
    const state = makeDb({
      game: activePending({
        player_xp: 50,
        player_level: 1,
        metelka_pending_xp: 0,
      }),
      acc: { active_balance: 0, active_earned: 0 },
    });
    const result = await claimMetelkaPendingReward("1", TOKEN, NOW);
    expect(result.xpGained).toBe(0);
    expect(result.playerXp).toBe(50);
    expect(result.moneyGained).toBe(1.68);
    expect(state.game!.player_xp).toBe(50);
  });

  it("wrong token: nothing credited; pending stays active", async () => {
    const state = makeDb({
      game: activePending(),
      acc: { active_balance: 10, active_earned: 5 },
    });
    await expect(
      claimMetelkaPendingReward("1", "wrong-token", NOW),
    ).rejects.toMatchObject({
      code: "invalid_metelka_claim_token",
      status: 400,
    } satisfies Partial<EconomyV2ExcessSessionError>);
    expect(state.acc.active_balance).toBe(10);
    expect(state.history).toEqual([]);
    expect(state.game!.metelka_pending_active).toBe(true);
    expect(state.game!.player_xp).toBe(100);
    expect(state.rollbacks).toBe(1);
  });

  it("pending absent: explicit error; no side effects", async () => {
    const state = makeDb({
      game: activePending({
        metelka_pending_active: false,
        metelka_pending_claim_token: null,
        metelka_pending_base: 0,
        metelka_pending_bonus: 0,
        metelka_pending_xp: 0,
        metelka_pending_claimed_at: null,
      }),
      acc: { active_balance: 3, active_earned: 1 },
    });
    await expect(claimMetelkaPendingReward("1", TOKEN, NOW)).rejects.toMatchObject({
      code: "metelka_pending_reward_not_found",
    });
    expect(state.acc.active_balance).toBe(3);
    expect(state.history).toEqual([]);
  });

  it("repeat claim after success: already_claimed; no second credit", async () => {
    const state = makeDb({
      game: activePending(),
      acc: { active_balance: 0, active_earned: 0 },
    });
    await claimMetelkaPendingReward("1", TOKEN, NOW);
    const bal = state.acc.active_balance;
    const xp = state.game!.player_xp;
    const histLen = state.history.length;

    await expect(claimMetelkaPendingReward("1", TOKEN, NOW + 1)).rejects.toMatchObject({
      code: "metelka_pending_reward_already_claimed",
    });
    expect(state.acc.active_balance).toBe(bal);
    expect(state.game!.player_xp).toBe(xp);
    expect(state.history.length).toBe(histLen);
  });

  it("parallel claim: second UPDATE gate yields already_claimed", async () => {
    const state = makeDb({
      game: activePending(),
      acc: { active_balance: 0, active_earned: 0 },
    });

    // First claim wins.
    await claimMetelkaPendingReward("1", TOKEN, NOW);
    expect(state.history.length).toBe(1);
    expect(state.acc.active_balance).toBe(1.68);

    // Simulate racing second txn that still saw active=true in SELECT,
    // but gate UPDATE returns empty — force active+token briefly then empty UPDATE.
    state.game!.metelka_pending_active = true;
    state.game!.metelka_pending_claimed_at = null;

    let closeAttempts = 0;
    const prev = clientQueryMock.getMockImplementation()!;
    clientQueryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);
      if (
        text.startsWith("UPDATE game_state") &&
        text.includes("metelka_pending_active = FALSE")
      ) {
        closeAttempts += 1;
        // Gate lost — another claim already closed.
        return { rows: [] };
      }
      return prev(sql, params);
    });

    await expect(claimMetelkaPendingReward("1", TOKEN, NOW + 5)).rejects.toMatchObject({
      code: "metelka_pending_reward_already_claimed",
    });
    expect(closeAttempts).toBe(1);
    expect(state.history.length).toBe(1);
    expect(state.acc.active_balance).toBe(1.68);
  });

  it("old token cannot claim a newer pending reward", async () => {
    const state = makeDb({
      game: activePending({
        metelka_pending_claim_token: "new-token-xyz",
        metelka_pending_base: 5,
        metelka_pending_bonus: 1,
      }),
      acc: { active_balance: 0, active_earned: 0 },
    });
    await expect(
      claimMetelkaPendingReward("1", TOKEN, NOW),
    ).rejects.toMatchObject({ code: "invalid_metelka_claim_token" });
    expect(state.acc.active_balance).toBe(0);
    expect(state.game!.metelka_pending_active).toBe(true);
    expect(state.history).toEqual([]);
  });
});

describe("readMetelkaPendingRewardFromRow (GET state contract)", () => {
  it("before claim: active pending with token and null claimedAt", () => {
    const snap = readMetelkaPendingRewardFromRow(activePending());
    expect(snap.active).toBe(true);
    expect(snap.totalAmount).toBe(1.68);
    expect(snap.claimToken).toBe(TOKEN);
    expect(snap.claimedAt).toBeNull();
  });

  it("after claim: inactive; claimedAt set; not collectible as coin", () => {
    const snap = readMetelkaPendingRewardFromRow(
      activePending({
        metelka_pending_active: false,
        metelka_pending_claimed_at: NOW,
      }),
    );
    expect(snap.active).toBe(false);
    expect(snap.claimedAt).toBe(NOW);
    expect(snap.claimToken).toBe(TOKEN);
    expect(emptyMetelkaPendingReward().active).toBe(false);
  });
});

describe("Metelka claim source contracts", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const claimSrc = readFileSync(
    join(here, "economy-v2-excess-metelka-claim.ts"),
    "utf8",
  );
  const routeSrc = readFileSync(join(here, "../routes/game-v2-excess.ts"), "utf8");
  const gameRouteSrc = readFileSync(join(here, "../routes/game.ts"), "utf8");

  it("claim does not grow tree or touch Care pending", () => {
    expect(claimSrc).not.toContain("tree_growth_mm =");
    expect(claimSrc).not.toContain("pending_base_reward");
    expect(claimSrc).not.toContain("pending_bonus_reward");
    expect(claimSrc).toContain("income_history");
    expect(claimSrc).toContain("'metelka'");
    expect(claimSrc).toContain("calcPlayerLevel");
  });

  it("dedicated Metelka claim route; Care claimAll unchanged", () => {
    expect(routeSrc).toContain("/game/v2/excess/metelka/claim");
    expect(routeSrc).toContain("claimMetelkaPendingReward");
    expect(gameRouteSrc).toContain("/game/session/claimAll");
    expect(gameRouteSrc).toContain("tree_growth_mm = $2");
  });
});
