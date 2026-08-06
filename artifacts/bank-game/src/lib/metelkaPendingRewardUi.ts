/**
 * Metelka pending reward UI helpers — coin visibility + one-shot XP animation guard.
 * Source of truth for amounts: game.metelkaPendingReward (server).
 */

import { formatRub } from "@/lib/engine";

export type MetelkaPendingRewardUi = {
  active: boolean;
  baseAmount: number;
  bonusAmount: number;
  totalAmount: number;
  xpAmount: number;
  createdAt: number | null;
  claimToken: string | null;
  claimedAt: number | null;
};

const XP_SHOWN_PREFIX = "metelka-xp-shown:";

/** In-tab fallback when sessionStorage is unavailable (SSR / private mode / tests). */
const xpShownMemory = new Set<string>();

export function isMetelkaPendingRewardActive(
  pending: MetelkaPendingRewardUi | null | undefined,
): boolean {
  // Coin is for money claim — hide when total rounds to 0 (XP may still animate).
  return pending?.active === true && Number(pending.totalAmount) > 0;
}

export function metelkaPendingClaimToken(
  pending: MetelkaPendingRewardUi | null | undefined,
): string | null {
  if (!pending?.active) return null;
  const t = pending.claimToken;
  if (t == null) return null;
  const s = String(t).trim();
  return s.length > 0 ? s : null;
}

/** Coin face: total only (base+bonus already merged server-side). */
export function formatMetelkaCoinAmountLabel(totalAmount: number): string {
  const n = Number(totalAmount);
  if (!Number.isFinite(n) || n < 0) return `+${formatRub(0)}`;
  return `+${formatRub(n)}`;
}

export function metelkaXpShownStorageKey(claimToken: string): string {
  return `${XP_SHOWN_PREFIX}${claimToken}`;
}

export function hasMetelkaXpAnimationShown(claimToken: string): boolean {
  if (xpShownMemory.has(claimToken)) return true;
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(metelkaXpShownStorageKey(claimToken)) === "1";
  } catch {
    return false;
  }
}

export function markMetelkaXpAnimationShown(claimToken: string): void {
  xpShownMemory.add(claimToken);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(metelkaXpShownStorageKey(claimToken), "1");
  } catch {
    // private mode / quota — memory Set still guards this tab
  }
}

/** Undo mark — used when React Strict Mode cancels the effect before animation commits. */
export function unmarkMetelkaXpAnimationShown(claimToken: string): void {
  xpShownMemory.delete(claimToken);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(metelkaXpShownStorageKey(claimToken));
  } catch {
    // ignore
  }
}

/** @internal test helper */
export function clearMetelkaXpAnimationShownForTests(): void {
  xpShownMemory.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(XP_SHOWN_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * Whether to play the finish XP animation for this pending reward.
 * Does not mutate playerXp — visual only until claim.
 */
export function shouldShowMetelkaFinishXpAnimation(
  pending: MetelkaPendingRewardUi | null | undefined,
): boolean {
  // XP may play even when money rounds to 0 (no coin).
  if (pending?.active !== true) return false;
  const token = metelkaPendingClaimToken(pending);
  if (token == null) return false;
  const xp = Math.floor(Number(pending.xpAmount) || 0);
  if (xp <= 0) return false;
  return !hasMetelkaXpAnimationShown(token);
}

/** Normalize API / finish / claim snapshot into game state field. */
export function normalizeMetelkaPendingReward(
  raw: MetelkaPendingRewardUi | null | undefined,
): MetelkaPendingRewardUi | undefined {
  if (raw == null) return undefined;
  const baseAmount = Number(raw.baseAmount) || 0;
  const bonusAmount = Number(raw.bonusAmount) || 0;
  const totalAmount = Number.isFinite(Number(raw.totalAmount))
    ? Number(raw.totalAmount)
    : baseAmount + bonusAmount;
  return {
    active: raw.active === true,
    baseAmount,
    bonusAmount,
    totalAmount,
    xpAmount: Math.max(0, Math.floor(Number(raw.xpAmount) || 0)),
    createdAt: raw.createdAt == null ? null : Number(raw.createdAt) || null,
    claimToken: raw.claimToken == null ? null : String(raw.claimToken),
    claimedAt: raw.claimedAt == null ? null : Number(raw.claimedAt) || null,
  };
}

/**
 * Apply Metelka claim response onto game slice.
 * Uses server playerXp/playerLevel as SoT (field name playerXP for LevelWidget).
 */
export function applyMetelkaClaimToGameState<
  G extends {
    playerXP?: number;
    playerLevel?: number;
    metelkaPendingReward?: MetelkaPendingRewardUi;
  },
>(
  game: G,
  res: {
    playerXp: number;
    playerLevel: number;
    metelkaPendingReward?: MetelkaPendingRewardUi | null;
  },
): G {
  return {
    ...game,
    playerXP: Math.max(0, Math.floor(Number(res.playerXp) || 0)),
    playerLevel: Math.max(1, Math.floor(Number(res.playerLevel) || 1)),
    metelkaPendingReward: normalizeMetelkaPendingReward(
      res.metelkaPendingReward ?? undefined,
    ),
  };
}

export function metelkaClaimErrorMessage(err: unknown): string {
  const e = err as { status?: number; message?: string; code?: string };
  const code = String(e?.code ?? "");
  if (code === "invalid_metelka_claim_token") {
    return "Не удалось подтвердить награду. Попробуйте ещё раз.";
  }
  if (
    code === "metelka_pending_reward_already_claimed" ||
    code === "metelka_pending_reward_not_found"
  ) {
    return "Награда уже собрана или недоступна.";
  }
  if (!e?.status || e.status >= 500) {
    return "Сеть или сервер недоступны. Попробуйте ещё раз.";
  }
  return e.message || "Не удалось забрать награду Метёлки.";
}
