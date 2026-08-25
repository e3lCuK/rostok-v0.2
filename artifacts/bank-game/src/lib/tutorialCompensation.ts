/**
 * Client mirror of api-server economy-v3-tutorial-compensation.
 * Awards capital × 12% APR × elapsed / year for capital → gold-flask start.
 */

export const TUTORIAL_COMPENSATION_APR = 0.12;
export const TUTORIAL_COMPENSATION_SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
export const TUTORIAL_COMPENSATION_ELAPSED_MAX_MS = 30 * 60 * 1000;
export const TUTORIAL_COMPENSATION_FALLBACK_RUB = 1;

export type TutorialCompensationInput = {
  capital: number;
  startedAtMs: number | null | undefined;
  endedAtMs: number | null | undefined;
  nowMs?: number;
};

export type TutorialCompensationResult = {
  elapsedMs: number;
  amountRub: number;
  growthMm: number;
  usedFallback: boolean;
};

function roundMoneyToKopecks(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveTutorialCompensationCapital(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 100_000;
  return n;
}

export type TutorialHandoffBalances = {
  balance: number;
  earned: number;
};

function asNonNegMoney(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * After tutorialComplete, the server owns the ruble grant (12% APR kopecks).
 * Do not floor earned to 1₽ — that leftover from FALLBACK_RUB showed +1,00₽
 * while income history kept the 0,01₽ tutorial row.
 */
export function reconcileTutorialHandoffBalances(input: {
  serverBalance?: number | null;
  serverEarned?: number | null;
  localBalance: number;
  localEarned: number;
  demoMoney?: number | null;
}): TutorialHandoffBalances {
  const serverEarned = asNonNegMoney(input.serverEarned);
  const serverBalance = asNonNegMoney(input.serverBalance);
  const localGranted = asNonNegMoney(input.localEarned);
  const demoMoney = asNonNegMoney(input.demoMoney);
  const localEarned = Math.max(localGranted, demoMoney);
  const localBalance = asNonNegMoney(input.localBalance);

  if (serverEarned > 0) {
    return {
      earned: serverEarned,
      balance: serverBalance > 0 ? serverBalance : localBalance,
    };
  }

  return {
    earned: localEarned,
    balance: localBalance + Math.max(0, localEarned - localGranted),
  };
}

/**
 * Poll/sync: a stale client floored tutorial earned at 1₽ while the server
 * kept kopecks. Snap down only that exact mismatch — never hide a real 1₽.
 */
export function reconcileMoneyAgainstTutorialRubleFloor(
  server: number,
  local: number,
): number {
  const s = asNonNegMoney(server);
  const l = asNonNegMoney(local);
  if (l === 1 && s > 0 && s < 1) return s;
  return Math.max(s, l);
}

export function computeTutorialCompensation(
  input: TutorialCompensationInput,
): TutorialCompensationResult {
  const capital = resolveTutorialCompensationCapital(input.capital);
  const nowMs =
    input.nowMs != null && Number.isFinite(input.nowMs)
      ? Math.trunc(input.nowMs)
      : Date.now();
  const started =
    input.startedAtMs != null && Number.isFinite(Number(input.startedAtMs))
      ? Math.trunc(Number(input.startedAtMs))
      : null;
  const ended =
    input.endedAtMs != null && Number.isFinite(Number(input.endedAtMs))
      ? Math.trunc(Number(input.endedAtMs))
      : null;

  const windowOk =
    started != null &&
    ended != null &&
    ended >= started &&
    started <= nowMs &&
    ended <= nowMs + 5_000;

  if (!windowOk) {
    return {
      elapsedMs: 0,
      amountRub: TUTORIAL_COMPENSATION_FALLBACK_RUB,
      growthMm: 1,
      usedFallback: true,
    };
  }

  const rawElapsed = ended! - started!;
  const elapsedMs = Math.min(
    TUTORIAL_COMPENSATION_ELAPSED_MAX_MS,
    Math.max(0, Math.trunc(rawElapsed)),
  );
  if (elapsedMs <= 0) {
    return {
      elapsedMs: 0,
      amountRub: TUTORIAL_COMPENSATION_FALLBACK_RUB,
      growthMm: 1,
      usedFallback: true,
    };
  }

  const amountRub = roundMoneyToKopecks(
    capital *
      TUTORIAL_COMPENSATION_APR *
      (elapsedMs / 1000 / TUTORIAL_COMPENSATION_SECONDS_PER_YEAR),
  );
  if (amountRub <= 0) {
    return {
      elapsedMs,
      amountRub: TUTORIAL_COMPENSATION_FALLBACK_RUB,
      growthMm: 1,
      usedFallback: true,
    };
  }

  return {
    elapsedMs,
    amountRub,
    growthMm: 1,
    usedFallback: false,
  };
}
