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
