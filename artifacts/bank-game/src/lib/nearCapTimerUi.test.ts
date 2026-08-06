import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveRootTimerDisplay,
  shouldShowRootCountdown,
} from "@/lib/v2Roots";
import { applyEconomyV2EnergyToState, formatDebugBankLabel } from "@/components/v2/EconomyV2EnergyDebugControls";
import type { UserState } from "@/lib/engine";
import type { EconomyV2RootsState } from "@/lib/api";

const here = dirname(fileURLToPath(import.meta.url));

describe("near-cap timer UI (bank=59)", () => {
  it("1. bank=59 storageFull=false countdown → timer visible", () => {
    expect(
      shouldShowRootCountdown({
        capital: 100_000,
        storageFull: false,
        secondsUntilNext: 720,
      }),
    ).toBe(true);
    const t = resolveRootTimerDisplay({
      isFull: false,
      storageFull: false,
      capital: 100_000,
      secondsUntilNext: 400,
      secondsPerSection: 720,
    });
    expect(t.kind).toBe("countdown");
  });

  it("3. bank=60 / storageFull → timer hidden", () => {
    expect(
      resolveRootTimerDisplay({
        isFull: false,
        storageFull: true,
        capital: 100_000,
        secondsUntilNext: null,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("4. floored bank display must not drive showCountdown", () => {
    expect(
      shouldShowRootCountdown({
        capital: 50_000,
        storageFull: false,
        secondsUntilNext: 12,
      }),
    ).toBe(true);
    expect(
      shouldShowRootCountdown({
        capital: 50_000,
        storageFull: true,
        secondsUntilNext: null,
      }),
    ).toBe(false);
  });

  it("5. fresh energy debug snapshot applies roots (timer without F5)", () => {
    const base = {
      balances: { balance: 100_000, startDate: "2026-01-01" },
      game: {
        v2EnergySeconds: 60,
        v2EnergyAnchorAt: 1,
        v2Roots: {
          readyMask: "0",
          readyCount: 0,
          generationProgress: 0,
          secondsPerSection: 720,
          secondsUntilNextSection: null,
          isFull: false,
          storageFull: true,
          storageOccupied: 60,
          storageFree: 0,
        } satisfies EconomyV2RootsState,
        lastSessionTime: null,
        missedSessions: 0,
      },
    } as UserState;

    const next = applyEconomyV2EnergyToState(base, {
      v2EnergySeconds: 59,
      v2EnergyAnchorAt: 2,
      lastSessionTime: null,
      missedSessions: 0,
      v2Roots: {
        readyMask: "0",
        readyCount: 0,
        generationProgress: 0,
        secondsPerSection: 720,
        secondsUntilNextSection: 720,
        isFull: false,
        storageFull: false,
        storageOccupied: 59,
        storageFree: 1,
      },
    });

    expect(next.game.v2EnergySeconds).toBe(59);
    expect(next.game.v2Roots?.storageFull).toBe(false);
    expect(next.game.v2Roots?.secondsUntilNextSection).toBe(720);
    expect(
      shouldShowRootCountdown({
        capital: 100_000,
        storageFull: next.game.v2Roots?.storageFull,
        secondsUntilNext: next.game.v2Roots?.secondsUntilNextSection,
      }),
    ).toBe(true);
  });

  it("Fill snapshot shows 60.00 and hides timer only when full", () => {
    expect(formatDebugBankLabel(60)).toBe("Банк 60.00 / 60 сек");
    expect(formatDebugBankLabel(59)).toBe("Банк 59.00 / 60 сек");
    expect(formatDebugBankLabel(59.999)).toBe("Банк 60.00 / 60 сек"); // toFixed rounds display

    const afterFill = applyEconomyV2EnergyToState(
      {
        balances: { balance: 1, startDate: "x" },
        game: {
          v2EnergySeconds: 59,
          v2EnergyAnchorAt: 1,
          v2Roots: {
            readyMask: "0",
            readyCount: 0,
            generationProgress: 0,
            secondsPerSection: 720,
            secondsUntilNextSection: 100,
            isFull: false,
            storageFull: false,
            storageOccupied: 59,
            storageFree: 1,
          },
          lastSessionTime: null,
          missedSessions: 0,
        },
      } as UserState,
      {
        v2EnergySeconds: 60,
        v2EnergyAnchorAt: 2,
        lastSessionTime: null,
        missedSessions: 0,
        v2Roots: {
          readyMask: "0",
          readyCount: 0,
          generationProgress: 0,
          secondsPerSection: 720,
          secondsUntilNextSection: null,
          isFull: false,
          storageFull: true,
          storageOccupied: 60,
          storageFree: 0,
        },
      },
    );
    expect(afterFill.game.v2EnergySeconds).toBe(60);
    expect(afterFill.game.v2Roots?.storageFull).toBe(true);
    expect(afterFill.game.v2Roots?.secondsUntilNextSection).toBeNull();
    // Old 59 countdown must not linger
    expect(afterFill.game.v2Roots?.secondsUntilNextSection).not.toBe(100);
    expect(
      shouldShowRootCountdown({
        capital: 100_000,
        storageFull: afterFill.game.v2Roots?.storageFull,
        secondsUntilNext: afterFill.game.v2Roots?.secondsUntilNextSection,
      }),
    ).toBe(false);
  });

  it("partial bank-only update is not used by energy debug path", () => {
    const panel = readFileSync(
      join(here, "../components/v2/EconomyV2EnergyDebugControls.tsx"),
      "utf8",
    );
    const applyIdx = panel.indexOf("export function applyEconomyV2EnergyToState");
    const applyBody = panel.slice(applyIdx, applyIdx + 900);
    expect(applyBody).toContain("v2Roots: EconomyV2RootsState");
    expect(applyBody).toContain("normalizeV2Roots(patch.v2Roots)");
    expect(panel).toContain("normalizeV2Roots(res.game.v2Roots)");
    expect(panel).toContain("debug energy response missing game.v2Roots");
  });

  it("game UI never renders «Накопление приостановлено»", () => {
    const layer = readFileSync(
      join(here, "../components/v2/RootEnergyLayer.tsx"),
      "utf8",
    );
    const roots = readFileSync(join(here, "v2Roots.ts"), "utf8");
    const page = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
    for (const src of [layer, roots, page]) {
      expect(src).not.toContain("Накопление приостановлено");
    }
  });

  it("6. capital<=0 hides indicator without text", () => {
    const t = resolveRootTimerDisplay({
      isFull: false,
      capital: 0,
      secondsUntilNext: 100,
    });
    expect(t).toEqual({ kind: "hidden" });
  });

  it("7. debug applies v2Roots from energy response", () => {
    const panel = readFileSync(
      join(here, "../components/v2/EconomyV2EnergyDebugControls.tsx"),
      "utf8",
    );
    expect(panel).toContain("formatDebugBankLabel");
    expect(panel).toContain("res.game.v2Roots");
    expect(panel).toContain("normalizeV2Roots(res.game.v2Roots)");
  });
});
