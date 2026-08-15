import { describe, expect, it } from "vitest";
import type { EconomyV3RootsState } from "@/lib/api";
import { normalizeEconomyV3RootsSnapshot } from "@/lib/v3Roots";
import {
  shouldRefreshV3ExcessAfterTransfer,
  shouldRefreshV3RootsFromClock,
} from "@/lib/v3RootsRefresh";

function snapAtSharedPoolMax(): EconomyV3RootsState {
  const snap = normalizeEconomyV3RootsSnapshot({
    enabled: true,
    effectivePresetSeconds: 21,
    dailyCapSeconds: 20,
    roots: {
      water: {
        seconds: 0,
        capacitySeconds: 21,
        playableFromRoot: false,
        transferred: true,
        frozen: true,
      },
      sun: {
        seconds: 21,
        capacitySeconds: 21,
        playableFromRoot: true,
        transferred: false,
        frozen: true,
      },
      fertilizer: {
        seconds: 21,
        capacitySeconds: 21,
        playableFromRoot: true,
        transferred: false,
        frozen: true,
      },
    },
    reserves: {
      water: { seconds: 21, capacitySeconds: 21, playable: true },
      sun: { seconds: 0, capacitySeconds: 21, playable: false },
      fertilizer: { seconds: 0, capacitySeconds: 21, playable: false },
    },
    generation: {
      anchorAt: "2026-08-14T14:00:00.000Z",
      progress: 0.2,
      frozenAt: "2026-08-14T14:00:00.000Z",
      insuranceDeadlineAt: "2026-08-14T14:05:00.000Z",
      firstTransferredRoot: "water",
      transferredRoots: ["water"],
      secondsUntilNextWholeSecond: 400,
      accumulating: true,
    },
    excessGate: {
      ordinaryFull: false,
      rootsFull: false,
      reservesFull: { water: true, sun: false, fertilizer: false },
      generatingExcess: false,
    },
  });
  if (!snap) throw new Error("expected snap");
  return snap;
}

describe("v3 roots refresh for financial time after transfer", () => {
  it("refresh after transfer when energy is max on roots/buttons (not only ordinaryFull)", () => {
    const snap = snapAtSharedPoolMax();
    expect(snap.excessGate.ordinaryFull).toBe(false);
    expect(shouldRefreshV3ExcessAfterTransfer(snap)).toBe(true);
  });

  it("polls while frozen when shared-pool max so financial time settles without F5", () => {
    const snap = snapAtSharedPoolMax();
    const now = Date.parse("2026-08-14T14:01:00.000Z");
    expect(shouldRefreshV3RootsFromClock(snap, now, 0).reason).toBe(
      "accumulating",
    );
    expect(shouldRefreshV3RootsFromClock(snap, now, now - 500).refresh).toBe(
      false,
    );
  });
});
