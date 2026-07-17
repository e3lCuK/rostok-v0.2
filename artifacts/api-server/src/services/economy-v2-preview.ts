import {
  calculateEconomyV2Activity,
} from "./economy-v2";
import type { EconomyV2ActivityResult } from "./economy-v2";

export type EconomyV2PreviewInput = {
  capital: number;
  lastSessionTime: Date | string | null;
  currentTime: Date | string;
  freshnessCoefficient?: number;
};

function toTimestamp(value: Date | string): number {
  return value instanceof Date
    ? value.getTime()
    : new Date(value).getTime();
}

export function calculateEconomyV2Preview(
  input: EconomyV2PreviewInput,
): EconomyV2ActivityResult {
  const currentTimestamp = toTimestamp(input.currentTime);

  let elapsedSeconds = 0;

  if (input.lastSessionTime !== null) {
    const lastSessionTimestamp = toTimestamp(input.lastSessionTime);
    const elapsed =
      (currentTimestamp - lastSessionTimestamp) / 1000;

    elapsedSeconds = Number.isFinite(elapsed)
      ? Math.max(0, elapsed)
      : 0;
  }

  return calculateEconomyV2Activity({
    capital: input.capital,
    elapsedSeconds,
    freshnessCoefficient: input.freshnessCoefficient,
  });
}
