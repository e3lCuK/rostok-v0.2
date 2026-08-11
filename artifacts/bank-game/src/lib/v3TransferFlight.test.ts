/**
 * Root → activity reserve flight mapping & measurement helpers.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  activityCardTopAnchor,
  formatV3TransferSecondsLabel,
  measureV3TransferFlight,
  pulseV3ActivityReceive,
  V3_ACTIVITY_CARD_SELECTOR,
  V3_ACTIVITY_RESERVE_SELECTOR,
  V3_ROOT_SELECTOR,
  V3_TRANSFER_FLIGHT_COLORS,
  v3RootToActivityKind,
} from "./v3TransferFlight";
import { V3_ROOT_KINDS } from "./v3Roots";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, "../pages/GamePage.tsx"), "utf8");
const rootSysSrc = readFileSync(
  join(here, "../components/v2/EconomyV3RootSystem.tsx"),
  "utf8",
);
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");

describe("v3TransferFlight mapping", () => {
  it("maps each root kind to the matching activity card 1:1", () => {
    for (const kind of V3_ROOT_KINDS) {
      expect(v3RootToActivityKind(kind)).toBe(kind);
      expect(V3_ROOT_SELECTOR(kind)).toContain(`data-v3-root="${kind}"`);
      expect(V3_ACTIVITY_CARD_SELECTOR(kind)).toContain(
        `data-v3-activity-card="${kind}"`,
      );
      expect(V3_ACTIVITY_RESERVE_SELECTOR(kind)).toContain(
        `data-v3-activity-reserve-fill="${kind}"`,
      );
      expect(V3_TRANSFER_FLIGHT_COLORS[kind]).toMatch(/^#/);
    }
    expect(pageSrc).toContain("data-v3-activity-card=");
    expect(pageSrc).toContain("V3ActivityReserveFill");
    expect(rootSysSrc).toContain("data-v3-root={kind}");
  });

  it("measures flight ABOVE the activity card top (not bottom / center)", () => {
    const root = {
      getBoundingClientRect: () =>
        ({
          left: 100,
          top: 200,
          width: 40,
          height: 80,
          right: 140,
          bottom: 280,
          x: 100,
          y: 200,
          toJSON: () => ({}),
        }) as DOMRect,
    };
    const card = {
      getBoundingClientRect: () =>
        ({
          left: 20,
          top: 40,
          width: 58,
          height: 72,
          right: 78,
          bottom: 112,
          x: 20,
          y: 40,
          toJSON: () => ({}),
        }) as DOMRect,
    };
    const doc = {
      querySelector: (sel: string) => {
        if (sel.includes("data-v3-root")) return root;
        if (sel.includes("data-v3-activity-card")) return card;
        return null;
      },
    } as unknown as Document;

    const points = measureV3TransferFlight("water", doc);
    expect(points).not.toBeNull();
    if (!points) return;
    expect(points.kind).toBe("water");
    expect(points.fromX).toBe(120); // 100 + 20
    expect(points.fromY).toBe(240); // 200 + 40
    expect(points.toX).toBe(49); // 20 + 29
    expect(points.toY).toBe(26); // top - 14 — above the button
    expect(points.toY).toBeLessThan(40);
    expect(activityCardTopAnchor(card.getBoundingClientRect()).y).toBe(26);
    expect(points.midY).toBeLessThan(points.toY);
    expect(points.midX).not.toBe(points.fromX);
    expect(points.color).toBe(V3_TRANSFER_FLIGHT_COLORS.water);
    // Helper source must not embed absolute game-area coordinates.
    const flightSrc = readFileSync(join(here, "v3TransferFlight.ts"), "utf8");
    expect(flightSrc).toContain("getBoundingClientRect");
    expect(flightSrc).toContain("activityCardTopAnchor");
    expect(flightSrc).not.toMatch(/fromX:\s*\d{2,}/);
  });

  it("returns null only when the root is missing", () => {
    const doc = {
      querySelector: () => null,
    } as unknown as Document;
    expect(measureV3TransferFlight("sun", doc)).toBeNull();
  });

  it("falls back to upward arc when activity card is missing", () => {
    const root = {
      getBoundingClientRect: () =>
        ({
          left: 100,
          top: 200,
          width: 40,
          height: 80,
          right: 140,
          bottom: 280,
          x: 100,
          y: 200,
          toJSON: () => ({}),
        }) as DOMRect,
    };
    const doc = {
      querySelector: (sel: string) => {
        if (sel.includes("data-v3-root")) return root;
        return null;
      },
    } as unknown as Document;
    const points = measureV3TransferFlight("fertilizer", doc);
    expect(points).not.toBeNull();
    if (!points) return;
    expect(points.fromX).toBe(120);
    expect(points.fromY).toBe(240);
    expect(points.toY).toBeLessThan(points.fromY);
  });

  it("pulseV3ActivityReceive toggles receive class briefly and clears prior timer", () => {
    vi.useFakeTimers();
    const el = {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    };
    const doc = {
      querySelector: (sel: string) =>
        sel.includes('data-v3-activity-card="fertilizer"') ? el : null,
    } as unknown as Document;
    pulseV3ActivityReceive("fertilizer", doc, 100);
    pulseV3ActivityReceive("fertilizer", doc, 100);
    expect(el.classList.add).toHaveBeenCalledTimes(2);
    vi.runAllTimers();
    // Prior timeout cleared — remove runs once for the latest pulse.
    expect(el.classList.remove).toHaveBeenCalledTimes(1);
    expect(el.classList.remove).toHaveBeenCalledWith(
      "v3-activity-card--receive",
    );
    vi.useRealTimers();
  });
});

describe("formatV3TransferSecondsLabel", () => {
  it("formats whole transferable seconds as +X с", () => {
    expect(formatV3TransferSecondsLabel(10)).toBe("+10 с");
    expect(formatV3TransferSecondsLabel(5.9)).toBe("+5 с");
    expect(formatV3TransferSecondsLabel(0)).toBe("");
    expect(formatV3TransferSecondsLabel(-3)).toBe("");
    expect(formatV3TransferSecondsLabel(null)).toBe("");
  });
});

describe("transfer flight wiring in root system / CSS", () => {
  it("EconomyV3RootSystem mounts V3TransferFlight and defers snapshot apply", () => {
    expect(rootSysSrc).toContain("V3TransferFlight");
    expect(rootSysSrc).toContain("pulseV3ActivityReceive");
    expect(rootSysSrc).toContain("v3-root--press");
    expect(rootSysSrc).toContain("Pending snapshot is never merged");
    expect(rootSysSrc).toMatch(
      /resolveV3RootsDisplaySnapshot[\s\S]*?return live/,
    );
    expect(rootSysSrc).toContain("seconds={Math.max(");
    expect(rootSysSrc).toContain("transferring.holdRoot.seconds");
  });

  it("CSS flight label lands above the activity button", () => {
    expect(cssSrc).toContain(".v3-transfer-flight-layer");
    expect(cssSrc).toContain("v3-transfer-flight-move");
    expect(cssSrc).toContain("v3-transfer-flight-label");
    expect(cssSrc).toContain("v3-transfer-flight-label-above");
    expect(cssSrc).toContain("pointer-events: none");
    expect(cssSrc).toContain("v3-activity-card--receive");
    expect(cssSrc).not.toContain("v3-root-collect-floater");
    expect(cssSrc).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?\.v3-transfer-flight-blob/,
    );
  });

  it("V3TransferFlight renders +X с label only (no blue particle blobs)", () => {
    const flightSrc = readFileSync(
      join(here, "../components/v2/V3TransferFlight.tsx"),
      "utf8",
    );
    expect(flightSrc).toContain("formatV3TransferSecondsLabel");
    expect(flightSrc).toContain("data-v3-transfer-flight-label");
    expect(flightSrc).toContain("seconds");
    expect(flightSrc).not.toContain("v3-transfer-flight-blob");
    expect(flightSrc).not.toContain("showParticles");
  });

  it("root system mounts flight without in-root energy blob", () => {
    expect(rootSysSrc).toContain("V3TransferFlight");
    expect(rootSysSrc).not.toContain("v3-root-collect-floater");
    expect(rootSysSrc).not.toContain("v3-root-transfer-energy");
    expect(rootSysSrc).not.toContain("v3-root-transfer-channel");
  });
});
