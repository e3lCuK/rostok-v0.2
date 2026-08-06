/**
 * Ephemeral per-click Metelka reward floats (+XP / +₽).
 * Not persisted — F5 must not replay.
 */

import { formatRub } from "@/lib/engine";

export type ExcessRewardFloatKind = "xp" | "money";

export type ExcessRewardFloatMotion = "rise" | "to-chest";

export type ExcessRewardFloatSize = "regular" | "large";

export type ExcessRewardFloat = {
  id: string;
  kind: ExcessRewardFloatKind;
  label: string;
  /** Viewport start (client coords), already edge-clamped. */
  startX: number;
  startY: number;
  /** Delta to fly (px). Rise motion uses a small upward dy. */
  dx: number;
  dy: number;
  motion: ExcessRewardFloatMotion;
  size: ExcessRewardFloatSize;
};

let floatSeq = 0;

/** Visual float duration — within 500–700 ms product range. */
export const EXCESS_REWARD_FLOAT_MS = 600;

/** Soft rise distance for white-web stacked feedback (px). */
export const EXCESS_REWARD_RISE_DY = -28;

/** Vertical gap between stacked XP / bonus lines (px). */
export const EXCESS_REWARD_STACK_GAP = 16;

/** Keep float labels inside the viewport. */
export const EXCESS_REWARD_EDGE_MARGIN = 44;

/**
 * XP float label. Accepts fractional raw shares from server rewardDelta.
 * Integer → "+2 XP"; fractional → "+0,51 XP" (ru-RU).
 */
export function formatExcessXpFloatLabel(xp: number): string {
  const n = Number(xp);
  if (!Number.isFinite(n) || n <= 0) return "+0 XP";
  if (Math.abs(n - Math.round(n)) < 1e-9) {
    return `+${Math.round(n)} XP`;
  }
  const s = n.toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  return `+${s} XP`;
}

/** Legacy / balance-style money float (always rubles, 2 digits). */
export function formatExcessMoneyFloatLabel(amount: number): string {
  return `+${formatRub(amount)}`;
}

/**
 * Micro-money float for Metelka click feedback (server raw deltas).
 * >= 0.01 ₽ → rubles; < 0.01 ₽ → kopecks. Never "+0,00 ₽" for a positive amount.
 */
export function formatExcessMicroMoneyFloatLabel(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "+0 ₽";
  if (n >= 0.01) {
    return `+${formatRub(n)}`;
  }
  const kop = n * 100;
  const s = kop.toLocaleString("ru-RU", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });
  return `+${s} коп.`;
}

/** Clamp click origin so labels stay on-screen. */
export function clampExcessRewardOrigin(
  x: number,
  y: number,
  viewport?: { width: number; height: number },
  margin: number = EXCESS_REWARD_EDGE_MARGIN,
): { x: number; y: number } {
  const w =
    viewport?.width ??
    (typeof window !== "undefined" ? window.innerWidth : 390);
  const h =
    viewport?.height ??
    (typeof window !== "undefined" ? window.innerHeight : 700);
  const m = Math.max(8, margin);
  return {
    x: Math.min(Math.max(m, x), Math.max(m, w - m)),
    y: Math.min(Math.max(m, y), Math.max(m, h - m)),
  };
}

export function createExcessRewardFloat(input: {
  kind: ExcessRewardFloatKind;
  label: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  motion?: ExcessRewardFloatMotion;
  size?: ExcessRewardFloatSize;
}): ExcessRewardFloat {
  floatSeq += 1;
  const motion = input.motion ?? "to-chest";
  const origin = clampExcessRewardOrigin(input.startX, input.startY);
  const dx =
    motion === "rise" ? 0 : input.targetX - origin.x;
  const dy =
    motion === "rise" ? EXCESS_REWARD_RISE_DY : input.targetY - origin.y;
  return {
    id: `excess-reward-${Date.now()}-${floatSeq}`,
    kind: input.kind,
    label: input.label,
    startX: origin.x,
    startY: origin.y,
    dx,
    dy,
    motion,
    size: input.size ?? "regular",
  };
}

/**
 * White web: compact XP + bonus stacked at click (local rise, not to HUD).
 * Values must already be formatted from server rewardDelta.
 */
export function createRegularWebRewardFloats(input: {
  clientX: number;
  clientY: number;
  xpLabel: string | null;
  moneyLabel: string | null;
}): ExcessRewardFloat[] {
  const origin = clampExcessRewardOrigin(input.clientX, input.clientY);
  const lines: { kind: ExcessRewardFloatKind; label: string }[] = [];
  if (input.xpLabel) lines.push({ kind: "xp", label: input.xpLabel });
  if (input.moneyLabel) lines.push({ kind: "money", label: input.moneyLabel });
  if (lines.length === 0) return [];

  const startY0 =
    lines.length === 1
      ? origin.y
      : origin.y - EXCESS_REWARD_STACK_GAP / 2;

  return lines.map((line, i) =>
    createExcessRewardFloat({
      kind: line.kind,
      label: line.label,
      startX: origin.x,
      startY: startY0 + i * EXCESS_REWARD_STACK_GAP,
      targetX: origin.x,
      targetY: startY0 + i * EXCESS_REWARD_STACK_GAP + EXCESS_REWARD_RISE_DY,
      motion: "rise",
      size: "regular",
    }),
  );
}

/**
 * Red base-income web: larger money label flying toward the capital chest.
 */
export function createBaseIncomeRewardFloat(input: {
  clientX: number;
  clientY: number;
  moneyLabel: string;
  chestX: number;
  chestY: number;
}): ExcessRewardFloat {
  return createExcessRewardFloat({
    kind: "money",
    label: input.moneyLabel,
    startX: input.clientX,
    startY: input.clientY,
    targetX: input.chestX,
    targetY: input.chestY,
    motion: "to-chest",
    size: "large",
  });
}

/**
 * True for any strictly positive finite amount (including micro < 0.01 ₽).
 * Do not use truthiness — keeps 0.0012 etc.
 */
export function isPositiveRewardAmount(raw: unknown): boolean {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0;
}

export function asPositiveRewardAmount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Build viewport floats from a successful clear response.
 * Version=2 prefers rewardDelta; legacy falls back to reward xp/money.
 * Never invents amounts — only formats server values.
 */
export function buildClearRewardFloatsFromResponse(input: {
  clientX: number;
  clientY: number;
  reward?: {
    kind?: string;
    xpGained?: number;
    moneyGained?: number;
  } | null;
  rewardDelta?: {
    kind?: string;
    xpRawDelta?: number;
    bonusRawDelta?: number;
    baseIncomeAmount?: number;
  } | null;
}): ExcessRewardFloat[] {
  const delta = input.rewardDelta;
  const reward = input.reward;

  if (delta?.kind === "progress") {
    return [];
  }

  if (delta?.kind === "regular") {
    const xp = asPositiveRewardAmount(delta.xpRawDelta);
    const bonus = asPositiveRewardAmount(delta.bonusRawDelta);
    return createRegularWebRewardFloats({
      clientX: input.clientX,
      clientY: input.clientY,
      xpLabel: xp > 0 ? formatExcessXpFloatLabel(xp) : null,
      moneyLabel: bonus > 0 ? formatExcessMicroMoneyFloatLabel(bonus) : null,
    });
  }

  if (delta?.kind === "base_income") {
    const amount = asPositiveRewardAmount(
      delta.baseIncomeAmount ?? reward?.moneyGained,
    );
    if (amount <= 0) return [];
    const chest = queryCapitalChestTarget();
    return [
      createBaseIncomeRewardFloat({
        clientX: input.clientX,
        clientY: input.clientY,
        moneyLabel: formatExcessMicroMoneyFloatLabel(amount),
        chestX: chest?.x ?? input.clientX,
        chestY: chest?.y ?? Math.max(24, input.clientY - 80),
      }),
    ];
  }

  // Legacy / missing rewardDelta
  const kind = reward?.kind;
  if (kind === "progress") {
    return [];
  }
  if (kind === "special" || kind === "base_income") {
    const amount = asPositiveRewardAmount(reward?.moneyGained);
    if (amount <= 0) return [];
    const chest = queryCapitalChestTarget();
    return [
      createBaseIncomeRewardFloat({
        clientX: input.clientX,
        clientY: input.clientY,
        moneyLabel:
          kind === "base_income"
            ? formatExcessMicroMoneyFloatLabel(amount)
            : formatExcessMoneyFloatLabel(amount),
        chestX: chest?.x ?? input.clientX,
        chestY: chest?.y ?? Math.max(24, input.clientY - 80),
      }),
    ];
  }

  if (kind === "regular") {
    const xp = asPositiveRewardAmount(reward?.xpGained);
    const money = asPositiveRewardAmount(reward?.moneyGained);
    return createRegularWebRewardFloats({
      clientX: input.clientX,
      clientY: input.clientY,
      xpLabel: xp > 0 ? formatExcessXpFloatLabel(xp) : null,
      moneyLabel: money > 0 ? formatExcessMoneyFloatLabel(money) : null,
    });
  }

  return [];
}

/** Resolve level badge center in viewport coords. */
export function queryLevelWidgetTarget(): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const el =
    document.querySelector<HTMLElement>("[data-level-widget='true']") ??
    document.querySelector<HTMLElement>(".lvl-badge-wrap");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Resolve capital chest center in viewport coords. */
export function queryCapitalChestTarget(): { x: number; y: number } | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>("[data-capital-chest='true']");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
