import { describe, expect, it, beforeEach } from "vitest";
import {
  adoptMetelkaFinancialLiveMs,
  freezeMetelkaFinancialLive,
  peekMetelkaFinancialLiveState,
  readMetelkaFinancialLiveMs,
  resetMetelkaFinancialLive,
} from "./metelkaFinancialLive";

describe("metelkaFinancialLive — continuous, never rolls back", () => {
  beforeEach(() => {
    // Pin window is relative to this clock; tests use large nowMs so pin is expired
    // unless a test calls resetMetelkaFinancialLive(t0) itself.
    resetMetelkaFinancialLive(0);
  });

  it("starts from serverElapsed (0), not a wait-clock offset", () => {
    const t0 = 1_000_000;
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0,
      }),
    ).toBe(0);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0 + 3000,
      }),
    ).toBe(3000);
  });

  it("does not snap back when serverElapsed is stale after transfer", () => {
    const t0 = 2_000_000;
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0,
      }),
    ).toBe(0);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0 + 12_000,
      }),
    ).toBe(12_000);
    // Transfer applied new generation.anchorAt but same stale excessElapsedMs=0
    // (or old 5000) — must keep climbing, not reset to 5s.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 5000,
        minting: true,
        nowMs: t0 + 12_500,
      }),
    ).toBe(12_500);
    expect(peekMetelkaFinancialLiveState().minting).toBe(true);
  });

  it("adopts higher serverElapsed when poll catches up within slack", () => {
    const t0 = 3_000_000;
    readMetelkaFinancialLiveMs({
      serverElapsedMs: 0,
      minting: true,
      nowMs: t0,
    });
    readMetelkaFinancialLiveMs({
      serverElapsedMs: 0,
      minting: true,
      nowMs: t0 + 4000,
    });
    // Small forward catch-up (≤1.5s) is adopted.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 4_800,
        minting: true,
        nowMs: t0 + 4500,
      }),
    ).toBe(4_800);
    // Large settle dump is ignored — keep projecting.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 10_000,
        minting: true,
        nowMs: t0 + 4600,
      }),
    ).toBe(4_900);
  });

  it("freezes live projection when minting stops (does not snap to stale server)", () => {
    const t0 = 4_000_000;
    readMetelkaFinancialLiveMs({
      serverElapsedMs: 2000,
      minting: true,
      nowMs: t0,
    });
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 2000,
        minting: true,
        nowMs: t0 + 8000,
      }),
    ).toBe(10_000);
    // Care pause with stale server — keep projected live, do not roll back to 2s.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 2000,
        minting: false,
        nowMs: t0 + 9000,
      }),
    ).toBe(11_000);
  });

  it("Care start: preserves financial time across minting false→true (no 1s restart)", () => {
    const t0 = 7_000_000;
    readMetelkaFinancialLiveMs({
      serverElapsedMs: 0,
      minting: true,
      nowMs: t0,
    });
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0 + 90_000,
      }),
    ).toBe(90_000);
    // Transfer for activity: shared-pool max clears → minting false, server may be 0.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: false,
        nowMs: t0 + 91_000,
      }),
    ).toBe(91_000);
    // Later poll / gate flicker remints — must resume from frozen ~91s, not 0→1s.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0 + 92_000,
      }),
    ).toBe(91_000);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0 + 95_000,
      }),
    ).toBe(94_000);
  });

  it("after wipe: cold-starts at 0 and ignores settle dump (9s / 3h)", () => {
    const t0 = 5_000_000;
    resetMetelkaFinancialLive(t0);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 9_000,
        minting: true,
        nowMs: t0,
      }),
    ).toBe(0);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 3 * 3600_000,
        minting: true,
        nowMs: t0 + 2000,
      }),
    ).toBe(2000);
    // After pin: still ignore large dumps; adopt only when server is close.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 10_000,
        minting: true,
        nowMs: t0 + 5000,
      }),
    ).toBe(5000);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 5_200,
        minting: true,
        nowMs: t0 + 5100,
      }),
    ).toBe(5_200);
  });

  it("during pin: ignores even a small +3s settle dump", () => {
    const t0 = 6_000_000;
    resetMetelkaFinancialLive(t0);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0,
      }),
    ).toBe(0);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 3_000,
        minting: true,
        nowMs: t0 + 400,
      }),
    ).toBe(400);
  });

  it("live UI: two readers with skewed nowMs stay on the same wall clock", () => {
    const wall = Date.now();
    resetMetelkaFinancialLive(wall);
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: wall - 3000, // stale GamePage tick
      }),
    ).toBe(0);
    const later = readMetelkaFinancialLiveMs({
      serverElapsedMs: 0,
      minting: true,
      nowMs: wall, // fresher debug tick
    });
    // Must not jump by ~3s from the stale baseAtMs.
    expect(later).toBeLessThan(500);
  });

  it("resume after pause ignores multi-minute fill/settle dump", () => {
    const t0 = 8_000_000;
    readMetelkaFinancialLiveMs({
      serverElapsedMs: 32_000,
      minting: true,
      nowMs: t0,
    });
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 32_000,
        minting: false,
        nowMs: t0 + 1000,
      }),
    ).toBe(33_000);
    // Pause for ~3 minutes (shovel / debug) — live stays frozen.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 32_000,
        minting: false,
        nowMs: t0 + 180_000,
      }),
    ).toBe(33_000);
    // Fill returns dumped elapsed (= pause wall) — must not jump.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 33_000 + 180_000,
        minting: true,
        nowMs: t0 + 181_000,
      }),
    ).toBe(33_000);
  });

  it("adoptMetelkaFinancialLiveMs never decreases below live accumulation", () => {
    const t0 = 9_000_000;
    readMetelkaFinancialLiveMs({
      serverElapsedMs: 0,
      minting: true,
      nowMs: t0,
    });
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: true,
        nowMs: t0 + 32_000,
      }),
    ).toBe(32_000);
    // Same as fill: freeze live first, then adopt must not wipe.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 0,
        minting: false,
        nowMs: t0 + 32_000,
      }),
    ).toBe(32_000);
    expect(adoptMetelkaFinancialLiveMs(0, t0 + 33_000, true)).toBe(32_000);
    expect(adoptMetelkaFinancialLiveMs(40_000, t0 + 34_000, true)).toBe(40_000);
  });

  it("stale minting state does not dump idle wall-time on freeze/fill", () => {
    const t0 = 10_000_000;
    readMetelkaFinancialLiveMs({
      serverElapsedMs: 20_000,
      minting: true,
      nowMs: t0,
    });
    // Active tick advances base.
    expect(
      readMetelkaFinancialLiveMs({
        serverElapsedMs: 20_000,
        minting: true,
        nowMs: t0 + 5_000,
      }),
    ).toBe(25_000);
    // UI stops — freeze promptly (GamePage effect); tiny catch-up OK.
    expect(freezeMetelkaFinancialLive(t0 + 5_200)).toBe(25_200);
    // Idle 3 minutes, then fill freeze again — must stay put.
    expect(freezeMetelkaFinancialLive(t0 + 180_000)).toBe(25_200);
  });
});
