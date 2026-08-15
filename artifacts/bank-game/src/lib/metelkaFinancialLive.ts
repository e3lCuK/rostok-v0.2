/**
 * Continuous Metelka financial-time readout for debug / grey flask.
 * Never rolls back when generation.anchorAt resets on root transfer.
 *
 * After an explicit wipe (debug fill / reset excess), cold-starts at 0 and
 * ignores settle dumps for a short pin window so financial time cannot jump
 * to leftover wait-clock (e.g. 9s / 3h).
 *
 * Care / transfer may clear minting flags (shared-pool no longer max). While
 * minting is off, freeze at the live projection — never adopt a lower server
 * value or restart from 0 when minting resumes.
 *
 * Critical: if UI already stopped minting but this module still has
 * minting=true (no reader called freeze), a later freeze must NOT add the
 * whole idle wall gap — that caused fill-to-capacity jumps of minutes.
 *
 * Wall clock: when `nowMs` is near real Date.now() (live UI), projection uses
 * Date.now() so GamePage (1s tick) and debug panel do not diverge by 1–3s.
 * Synthetic `nowMs` far from wall (tests) stays fully deterministic.
 */

export type MetelkaFinancialLiveState = {
  /** Last adopted server / projected base (ms). */
  baseElapsedMs: number;
  /** Wall-clock when baseElapsedMs was adopted. */
  baseAtMs: number;
  minting: boolean;
};

const INITIAL: MetelkaFinancialLiveState = Object.freeze({
  baseElapsedMs: 0,
  baseAtMs: 0,
  minting: false,
});

/** After resetMetelkaFinancialLive — first minting sample starts at 0. */
let coldStartFromZero = false;
/** Ignore server values that jump ahead during this window (ms wall clock). */
let pinFromZeroUntilMs = 0;

const PIN_AFTER_WIPE_MS = 4000;
/** Server ahead of live by more than this → treat as dump, keep projecting. */
const PIN_SERVER_JUMP_MS = 1500;
/**
 * Final minting→freeze may project at most this much beyond the stored base
 * when the last tick is stale. Prompt UI freeze (GamePage) keeps gaps small;
 * fill after a forgotten freeze must not dump minutes of idle.
 */
const STALE_MINTING_MAX_CATCHUP_MS = 2500;
/** Injected nowMs farther than this from Date.now() → test/synthetic clock. */
const SYNTHETIC_CLOCK_SLACK_MS = 60_000;
/**
 * Client fill hint may only sync this far ahead of the DB ledger.
 * Larger deltas are pause/tutorial dumps and must be ignored.
 */
export const METELKA_CLIENT_ELAPSED_LAG_SLACK_MS = 3000;

let state: MetelkaFinancialLiveState = INITIAL;

function resolveWallMs(nowMs: number): number {
  const wall = Date.now();
  if (
    Number.isFinite(nowMs) &&
    nowMs >= 0 &&
    Math.abs(nowMs - wall) > SYNTHETIC_CLOCK_SLACK_MS
  ) {
    return Math.trunc(nowMs);
  }
  return wall;
}

function projectFromBase(now: number): number {
  if (state.baseAtMs <= 0) return Math.max(0, state.baseElapsedMs);
  if (!state.minting) return Math.max(0, state.baseElapsedMs);
  return state.baseElapsedMs + Math.max(0, now - state.baseAtMs);
}

/** Test / remount / debug wipe helper. */
export function resetMetelkaFinancialLive(nowMs: number = Date.now()): void {
  state = INITIAL;
  coldStartFromZero = true;
  const base =
    Number.isFinite(nowMs) && nowMs >= 0 ? Math.trunc(nowMs) : Date.now();
  pinFromZeroUntilMs = base + PIN_AFTER_WIPE_MS;
}

/**
 * Stop minting. Finalizes at most a short in-flight tick if module minting was
 * left true — never multi-minute idle (fill after Care / gold wait).
 * Call whenever UI minting flags drop.
 */
export function freezeMetelkaFinancialLive(
  nowMs: number = Date.now(),
): number {
  const now = resolveWallMs(
    Number.isFinite(nowMs) && nowMs > 0 ? Math.trunc(nowMs) : Date.now(),
  );
  let frozen = Math.max(0, state.baseElapsedMs);
  if (state.minting && state.baseAtMs > 0) {
    const catchUp = Math.min(
      Math.max(0, now - state.baseAtMs),
      STALE_MINTING_MAX_CATCHUP_MS,
    );
    frozen = Math.max(frozen, state.baseElapsedMs + catchUp);
  }
  coldStartFromZero = false;
  state = {
    baseElapsedMs: frozen,
    baseAtMs: now,
    minting: false,
  };
  return frozen;
}

/**
 * Snap the live financial clock to a known elapsed.
 * By default never decreases; pass `force: true` to pin exactly (fill/sync).
 */
export function adoptMetelkaFinancialLiveMs(
  elapsedMs: number,
  nowMs: number = Date.now(),
  minting: boolean = false,
  opts?: { force?: boolean },
): number {
  const now = resolveWallMs(
    Number.isFinite(nowMs) && nowMs > 0 ? Math.trunc(nowMs) : Date.now(),
  );
  coldStartFromZero = false;
  pinFromZeroUntilMs = 0;
  const incoming = Math.max(0, Math.trunc(Number(elapsedMs) || 0));
  const current = Math.max(
    projectFromBase(now),
    Math.max(0, state.baseElapsedMs),
  );
  const next = opts?.force === true ? incoming : Math.max(incoming, current);
  state = {
    baseElapsedMs: next,
    baseAtMs: now,
    minting: minting === true,
  };
  return next;
}

/**
 * Live financial elapsed ms while excess is minting.
 * - Starts from 0 after wipe (not generation wait-clock / settle dump).
 * - Never decreases when minting continues across transfers.
 * - Freezes (does not reset) when Care briefly clears minting flags.
 * - Adopts higher serverElapsed when polls catch up (outside pin).
 */
export function readMetelkaFinancialLiveMs(input: {
  serverElapsedMs: number;
  minting: boolean;
  nowMs: number;
}): number {
  const server = Math.max(0, Number(input.serverElapsedMs) || 0);
  const now = resolveWallMs(
    Number.isFinite(input.nowMs) && input.nowMs > 0
      ? Math.trunc(input.nowMs)
      : Date.now(),
  );
  const pinned = now < pinFromZeroUntilMs;

  if (!input.minting) {
    // Stop minting. Cap catch-up so a stale module minting flag cannot dump
    // minutes of idle into the ledger (fill after Care / gold).
    let frozen = pinned ? 0 : Math.max(0, state.baseElapsedMs);
    if (!pinned && state.minting && state.baseAtMs > 0) {
      const catchUp = Math.min(
        Math.max(0, now - state.baseAtMs),
        STALE_MINTING_MAX_CATCHUP_MS,
      );
      frozen = Math.max(frozen, state.baseElapsedMs + catchUp);
    }
    if (!pinned && server > frozen) {
      if (server <= frozen + PIN_SERVER_JUMP_MS) {
        frozen = server;
      }
    }
    state = {
      baseElapsedMs: frozen,
      baseAtMs: now,
      minting: false,
    };
    if (!pinned) coldStartFromZero = false;
    return frozen;
  }

  // Explicit wipe only — do NOT treat minting resume after Care as cold start.
  if (coldStartFromZero || state.baseAtMs <= 0) {
    coldStartFromZero = false;
    const base = pinned ? 0 : server;
    state = {
      baseElapsedMs: base,
      baseAtMs: now,
      minting: true,
    };
    return base;
  }

  // Resume after Care pause: keep frozen base, never restart from server=0.
  // Also never absorb a multi-minute dump from fill/settle into the live clock.
  if (!state.minting) {
    let base = pinned ? 0 : Math.max(state.baseElapsedMs, server);
    if (!pinned && server > state.baseElapsedMs + PIN_SERVER_JUMP_MS) {
      base = state.baseElapsedMs;
    }
    state = {
      baseElapsedMs: base,
      baseAtMs: now,
      minting: true,
    };
    return base;
  }

  const projected = projectFromBase(now);

  if (pinned) {
    // During pin: climb from 0 only — never adopt settle dumps (even +1–3s).
    // Still advance base so a later freeze keeps the live projection.
    state = {
      baseElapsedMs: projected,
      baseAtMs: now,
      minting: true,
    };
    return projected;
  }

  // Server caught up or jumped ahead — adopt without going backwards vs live.
  // Ignore large settle dumps (e.g. leftover wait-clock) so live cannot jump
  // from ~0–1s straight to 3s / 9s / hours.
  if (server >= projected) {
    if (server > projected + PIN_SERVER_JUMP_MS) {
      state = {
        baseElapsedMs: projected,
        baseAtMs: now,
        minting: true,
      };
      return projected;
    }
    state = {
      baseElapsedMs: server,
      baseAtMs: now,
      minting: true,
    };
    return server;
  }

  // Transfer / poll reset generation anchor but left stale serverElapsed —
  // keep projecting so the readout never rolls back. Advance base each tick
  // so freeze/fill cannot lose live time or dump idle gaps.
  state = {
    baseElapsedMs: projected,
    baseAtMs: now,
    minting: true,
  };
  return projected;
}

/** @internal test peek */
export function peekMetelkaFinancialLiveState(): MetelkaFinancialLiveState {
  return state;
}

/** @internal */
export function peekMetelkaFinancialPinUntilMs(): number {
  return pinFromZeroUntilMs;
}
