/**
 * Economy v3 activity-card presentation from reserves / careAvailability.
 * Cards follow live `game.v3Roots.enabled` (server flag), not the legacy preview env.
 */

import type {
  EconomyV3RootKind,
  EconomyV3RootsState,
} from "@/lib/api";
import {
  V3_SEGMENT_COUNT,
  V3_SEGMENT_SECONDS,
  v3SegmentFillFraction,
} from "@/components/v2/EconomyV3RootSystem";
import { isV3CareSessionBlocking } from "@/lib/v3CareClient";

/** Minimum reserve seconds to look playable (matches server careAvailability). */
export const V3_ACTIVITY_PLAYABLE_MIN_SECONDS = 5;

export type V3ActivityCardUiState =
  | "disabled"
  | "available"
  | "completed"
  | "session-locked";

export type V3ActivityCardView = {
  kind: EconomyV3RootKind;
  reserveSeconds: number;
  /** Server dailyCapSeconds — visual fill denominator only. */
  dailyCapSeconds: number;
  playable: boolean;
  completed: boolean;
  sessionActiveHere: boolean;
  blockedByOtherSession: boolean;
  uiState: V3ActivityCardUiState;
  fullSegments: number;
  partialSegmentSeconds: number;
};

/**
 * Live `game.v3Roots` → show reserve meters on activity cards.
 * `previewEnabled` is retained for call-site compatibility but no longer required.
 */
export function shouldUseV3ActivityCardUi(
  _previewEnabled: boolean,
  v3Roots: EconomyV3RootsState | null | undefined,
): boolean {
  return v3Roots?.enabled === true;
}

/**
 * Visual-only height for the continuous reserve fill (0–100).
 * Uses server reserveSeconds / dailyCapSeconds — no local economy math.
 */
export function v3ActivityReserveFillPercent(
  reserveSeconds: unknown,
  dailyCapSeconds: unknown,
): number {
  const reserve = Math.max(0, Math.floor(Number(reserveSeconds) || 0));
  const cap = Math.max(0, Math.floor(Number(dailyCapSeconds) || 0));
  if (cap <= 0) return 0;
  return Math.min(100, Math.max(0, (reserve / cap) * 100));
}

/** Split whole reserve seconds into 5×5s segments (partial supported). Legacy helpers / tests. */
export function splitV3ReserveSeconds(secondsRaw: unknown): {
  fullSegments: number;
  partialSegmentSeconds: number;
} {
  const n = typeof secondsRaw === "number" ? secondsRaw : Number(secondsRaw);
  const seconds =
    Number.isFinite(n) && n > 0 ? Math.min(25, Math.floor(n)) : 0;
  const fullSegments = Math.min(
    V3_SEGMENT_COUNT,
    Math.floor(seconds / V3_SEGMENT_SECONDS),
  );
  const partialSegmentSeconds =
    fullSegments >= V3_SEGMENT_COUNT ? 0 : seconds % V3_SEGMENT_SECONDS;
  return { fullSegments, partialSegmentSeconds };
}

export function v3ActivitySegmentFill(
  segmentIndex: number,
  reserveSeconds: number,
): number {
  const { fullSegments, partialSegmentSeconds } =
    splitV3ReserveSeconds(reserveSeconds);
  return v3SegmentFillFraction(
    segmentIndex,
    fullSegments,
    partialSegmentSeconds,
  );
}

/**
 * Per-card view from v3 snapshot.
 * - reserve / careAvailability drive playable
 * - careCycle.activities[kind].completed → completed
 * - any transient careSession (active or completed-pending-ack) locks others
 */
export function resolveV3ActivityCard(
  kind: EconomyV3RootKind,
  v3Roots: EconomyV3RootsState,
): V3ActivityCardView {
  const reserve = v3Roots.reserves[kind];
  const availability = v3Roots.careAvailability[kind];
  const reserveSeconds = Math.max(
    0,
    Math.floor(Number(reserve?.seconds) || 0),
  );
  const dailyCapSeconds = Math.max(
    0,
    Math.floor(Number(v3Roots.dailyCapSeconds) || 0),
  );
  const playable =
    typeof availability?.playable === "boolean"
      ? availability.playable
      : reserveSeconds >= V3_ACTIVITY_PLAYABLE_MIN_SECONDS;

  const completed = v3Roots.careCycle?.activities?.[kind]?.completed === true;
  const session = v3Roots.careSession;
  const sessionBlocking = isV3CareSessionBlocking(v3Roots);
  const sessionActiveHere =
    sessionBlocking &&
    session?.activity === kind &&
    session.status === "active";
  const blockedByOtherSession =
    sessionBlocking && session?.activity != null && session.activity !== kind;

  let uiState: V3ActivityCardUiState;
  if (completed) {
    uiState = "completed";
  } else if (blockedByOtherSession) {
    uiState = "session-locked";
  } else if (sessionActiveHere) {
    uiState = "session-locked";
  } else if (
    sessionBlocking &&
    session?.status === "completed" &&
    session.activity === kind
  ) {
    uiState = "completed";
  } else if (!playable) {
    uiState = "disabled";
  } else {
    uiState = "available";
  }

  const split = splitV3ReserveSeconds(reserveSeconds);

  return {
    kind,
    reserveSeconds,
    dailyCapSeconds,
    playable,
    completed,
    sessionActiveHere,
    blockedByOtherSession,
    uiState,
    fullSegments: split.fullSegments,
    partialSegmentSeconds: split.partialSegmentSeconds,
  };
}

/**
 * Whether a card click may start the legacy v2 Care / session flow.
 * When v3 UI is active (`v3Roots.enabled`), never — avoids dual v2+v3 spend.
 */
export function mayStartLegacyCareFromActivityCard(input: {
  previewEnabled: boolean;
  v3Roots: EconomyV3RootsState | null | undefined;
  /** Tutorial steps still use the old local minigame path. */
  tutorialOverride?: boolean;
}): boolean {
  if (input.tutorialOverride === true) return true;
  if (!shouldUseV3ActivityCardUi(input.previewEnabled, input.v3Roots)) {
    return true;
  }
  return false;
}

/**
 * Themed (colored) activity chrome — only when server says playable/active/done.
 * Never invent availability from tutorial step alone.
 */
export function shouldThemeV3ActivityButton(card: V3ActivityCardView | null | undefined): boolean {
  if (!card) return false;
  if (card.uiState === "available") return true;
  if (card.uiState === "completed") return true;
  if (card.sessionActiveHere) return true;
  return false;
}

/** Grey locked chrome: no reserve / blocked / forced tutorial lock. */
export function isV3ActivityButtonVisuallyLocked(
  card: V3ActivityCardView | null | undefined,
  forcedTutorialLock: boolean,
): boolean {
  if (forcedTutorialLock) return true;
  if (!card) return true;
  return !shouldThemeV3ActivityButton(card);
}
