import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EconomyV2ExcessSessionState } from "@/lib/api";
import {
  canClickExcessWeb,
  excessWebExitDurationMs,
  filterVisibleExcessWebs,
} from "@/lib/excessWebClearUi";
import ExcessCleaningWebLayer from "./ExcessCleaningWebLayer";

const here = dirname(fileURLToPath(import.meta.url));

const sampleWebs = [
  { id: "web-0", x: 0.2, y: 0.3, size: 0.9, rotation: -8, cleared: false },
  { id: "web-1", x: 0.7, y: 0.4, size: 1.05, rotation: 12, cleared: false },
  { id: "web-2", x: 0.5, y: 0.25, size: 0.8, rotation: 0, cleared: false },
];

function activeSession(
  overrides: Partial<EconomyV2ExcessSessionState> = {},
): EconomyV2ExcessSessionState {
  return {
    active: true,
    startedAt: Date.now(),
    sourceSeconds: 10,
    presetSeconds: 25,
    rate: 0.014,
    webCount: 3,
    layoutSeed: 4242,
    clearedWebIds: [],
    clearedWebCount: 0,
    remainingWebCount: 3,
    webs: sampleWebs,
    ...overrides,
  };
}

describe("ExcessCleaningWebLayer", () => {
  const page = readFileSync(join(here, "../../pages/GamePage.tsx"), "utf8");
  const layerSrc = readFileSync(join(here, "ExcessCleaningWebLayer.tsx"), "utf8");
  const css = readFileSync(join(here, "../../bank.css"), "utf8");
  const panel = readFileSync(
    join(here, "EconomyV2EnergyDebugControls.tsx"),
    "utf8",
  );
  const apiSrc = readFileSync(join(here, "../../lib/api.ts"), "utf8");

  it("1. uncleared web is a clickable button before timer 0", () => {
    const html = renderToStaticMarkup(
      <ExcessCleaningWebLayer
        session={activeSession()}
        onExcessApplied={() => {}}
      />,
    );
    expect(html).toContain('data-excess-web-id="web-0"');
    expect(html).toContain("excess-cleaning-web--clickable");
    expect(html).toContain('aria-label="Убрать паутину 1 из 3"');
    expect(html).toContain("<button");
  });

  it("2. clear endpoint is wired (real API)", () => {
    expect(apiSrc).toContain('"/game/v2/excess/webs/clear"');
    expect(apiSrc).toContain("clearEconomyV2ExcessWeb");
    expect(layerSrc).toContain("api.clearEconomyV2ExcessWeb");
    expect(layerSrc).not.toContain("Math.random");
  });

  it("3. no optimistic removal before HTTP success", () => {
    expect(layerSrc).toContain("await api.clearEconomyV2ExcessWeb");
    expect(layerSrc).toMatch(
      /await api\.clearEconomyV2ExcessWeb[\s\S]*?beginExitAnimation/,
    );
    const clearIdx = layerSrc.indexOf("await api.clearEconomyV2ExcessWeb");
    const exitIdx = layerSrc.indexOf("beginExitAnimation(webId)", clearIdx);
    expect(exitIdx).toBeGreaterThan(clearIdx);
  });

  it("4–5. exit animation class + duration", () => {
    expect(css).toContain("excess-cleaning-web--exiting");
    expect(css).toContain("excess-web-exit");
    expect(css).toMatch(/0\.2[0-9]?s|0\.24s|240ms/);
    expect(excessWebExitDurationMs(false)).toBeGreaterThanOrEqual(180);
    expect(excessWebExitDurationMs(false)).toBeLessThanOrEqual(300);
    expect(excessWebExitDurationMs(true)).toBe(0);
  });

  it("6. in-flight guard is per webId", () => {
    expect(layerSrc).toContain("inFlightRef");
    expect(layerSrc).toContain("inFlightRef.current.has(webId)");
    expect(layerSrc).toContain("inFlightRef.current.add(webId)");
    expect(canClickExcessWeb({
      remainingSeconds: 5,
      cleared: false,
      inFlight: true,
      exiting: false,
    })).toBe(false);
  });

  it("7. different webs can be clicked independently (guard is per id)", () => {
    expect(
      canClickExcessWeb({
        remainingSeconds: 5,
        cleared: false,
        inFlight: false,
        exiting: false,
      }),
    ).toBe(true);
    // Source: Set of ids, not a single boolean busy flag for the whole layer
    expect(layerSrc).not.toMatch(/const \[busy,\s*setBusy\]/);
    expect(layerSrc).toContain("Set<string>");
  });

  it("8. cleared webs from snapshot are not shown", () => {
    const html = renderToStaticMarkup(
      <ExcessCleaningWebLayer
        session={activeSession({
          clearedWebIds: ["web-1"],
          clearedWebCount: 1,
          remainingWebCount: 2,
          webs: sampleWebs.map((w) =>
            w.id === "web-1" ? { ...w, cleared: true } : w,
          ),
        })}
        onExcessApplied={() => {}}
      />,
    );
    expect(html).toContain('data-excess-web-id="web-0"');
    expect(html).toContain('data-excess-web-id="web-2"');
    expect(html).not.toContain('data-excess-web-id="web-1"');
  });

  it("9. F5 restore: cleared stay hidden; uncleared keep coords", () => {
    const session = activeSession({
      clearedWebIds: ["web-0"],
      clearedWebCount: 1,
      remainingWebCount: 2,
      webs: sampleWebs.map((w) =>
        w.id === "web-0" ? { ...w, cleared: true } : w,
      ),
    });
    const a = renderToStaticMarkup(
      <ExcessCleaningWebLayer session={session} onExcessApplied={() => {}} />,
    );
    const b = renderToStaticMarkup(
      <ExcessCleaningWebLayer
        session={{ ...session }}
        onExcessApplied={() => {}}
      />,
    );
    expect(a).toBe(b);
    expect(a).not.toContain('data-excess-web-id="web-0"');
    expect(a).toContain('data-excess-web-x="0.7"');
  });

  it("10. remainingSeconds=0 disables clicks", () => {
    expect(
      canClickExcessWeb({
        remainingSeconds: 0,
        cleared: false,
        inFlight: false,
        exiting: false,
      }),
    ).toBe(false);
    expect(layerSrc).toContain("remainingSeconds");
    expect(layerSrc).toContain("computeExcessCleaningRemainingSeconds");
  });

  it("11. time_expired keeps webs but disables", () => {
    expect(layerSrc).toContain("excess_session_time_expired");
    expect(layerSrc).toContain("setRemainingSeconds(0)");
    const visible = filterVisibleExcessWebs(sampleWebs, new Set());
    expect(visible).toHaveLength(3);
  });

  it("12. layer does not finish session or compute Skill locally", () => {
    expect(layerSrc).not.toContain("Skill");
    expect(layerSrc).not.toContain("playerXP");
    expect(layerSrc).not.toContain("finishEconomyV2ExcessSession");
    expect(layerSrc).not.toContain("/excess/finish");
    expect(layerSrc).toContain("onWebReward");
    expect(layerSrc).toContain("onRewardFloats");
    expect(layerSrc).toContain("buildClearRewardFloatsFromResponse");
    expect(layerSrc).toContain("rewardDelta");
    expect(page).toContain("MetelkaRewardFloatHost");
    expect(page).toContain("pushMetelkaRewardFloats");
    expect(css).toContain("excess-cleaning-reward-float-root");
    expect(css).toContain("z-index: 10050");
    expect(css).toContain("overflow: visible");
    expect(css).toContain("excess-cleaning-reward-rise");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("excess-cleaning-reward-fade");
  });

  it("13. clearing last web does not finish session in layer", () => {
    expect(layerSrc).not.toContain("/excess/finish");
    expect(layerSrc).not.toContain("resetSession");
    expect(page).not.toMatch(/clearEconomyV2ExcessWeb[\s\S]*finish/i);
  });

  it("14. debug shows cleared X/N and remaining", () => {
    expect(panel).toContain("data-excess-session-cleared");
    expect(panel).toContain("Очищено:");
    expect(panel).toContain("data-excess-session-remaining");
    expect(panel).toContain("Осталось:");
    expect(panel).not.toContain("clearedWebIds.join");
  });

  it("layer does not block whole game-area; hit area on buttons", () => {
    expect(css).toMatch(
      /\.excess-cleaning-web-layer[\s\S]*?pointer-events:\s*none/,
    );
    expect(css).toContain("excess-cleaning-web--clickable");
    expect(css).toMatch(
      /\.excess-cleaning-web--clickable[\s\S]*?pointer-events:\s*auto/,
    );
    expect(layerSrc).toContain("HIT_MIN_PX");
  });

  it("GamePage wires onExcessApplied", () => {
    expect(page).toContain("ExcessCleaningWebLayer");
    expect(page).toContain("onExcessApplied={(excess)");
  });

  it("api posts webId body", async () => {
    const { api } = await import("@/lib/api");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        excessSeconds: 10,
        excess: { excessSeconds: 10, session: { active: true } },
        session: { active: true },
        clearedWebId: "web-2",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await api.clearEconomyV2ExcessWeb("web-2");
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toEqual({
      webId: "web-2",
    });
    vi.unstubAllGlobals();
  });
});

describe("ExcessCleaningWebLayer visual size / color", () => {
  const css = readFileSync(join(here, "../../bank.css"), "utf8");
  const iconSrc = readFileSync(join(here, "ExcessWebIcon.tsx"), "utf8");

  it("uses white cobweb color; old dark stone color gone", () => {
    expect(css).toContain("rgba(255, 255, 255, 0.88)");
    expect(css).not.toContain("color: rgba(90, 84, 78, 0.55)");
    expect(iconSrc).toContain('stroke="currentColor"');
    expect(iconSrc).toContain('fill="none"');
    expect(iconSrc).not.toMatch(/fill="(?!none)[^"]+"/);
  });

  it("base visual size increased ~50% (28 → 42); server size still multiplies", async () => {
    const {
      EXCESS_WEB_VISUAL,
      excessWebDisplaySize,
      excessWebHitSize,
    } = await import("./ExcessCleaningWebLayer");
    expect(EXCESS_WEB_VISUAL.basePx).toBe(42);
    expect(EXCESS_WEB_VISUAL.basePx).toBeGreaterThan(28);
    expect(excessWebDisplaySize(1)).toBe(42);
    expect(excessWebDisplaySize(0.9)).toBeCloseTo(37.8, 5);
    expect(excessWebDisplaySize(1.05)).toBeCloseTo(44.1, 5);
    expect(excessWebHitSize(42)).toBe(62); // 42 + 10*2
    expect(excessWebHitSize(20)).toBe(44); // mobile min
  });

  it("rendered markers keep snapshot x/y and apply larger hit box", () => {
    const html = renderToStaticMarkup(
      <ExcessCleaningWebLayer
        session={activeSession()}
        onExcessApplied={() => {}}
      />,
    );
    expect(html).toContain('data-excess-web-x="0.2"');
    expect(html).toContain('data-excess-web-y="0.3"');
    expect(html).toContain('data-excess-web-x="0.7"');
    expect(html).toContain('data-excess-web-size="0.9"');
    expect(html).toContain('data-excess-web-display-px="37.80"');
    expect(html).toContain('data-excess-web-hit-px="57.80"');
    // Soft edge clamp preserves % for mid-field webs while protecting edges
    expect(html).toContain("clamp(");
    expect(html).toContain("translate(-50%, -50%)");
  });

  it("hit-area is at least 44px; left and right webs stay clickable", () => {
    const html = renderToStaticMarkup(
      <ExcessCleaningWebLayer
        session={activeSession()}
        onExcessApplied={() => {}}
      />,
    );
    expect(html).toContain("excess-cleaning-web--clickable");
    expect(html).toContain('data-excess-web-id="web-0"'); // left
    expect(html).toContain('data-excess-web-id="web-1"'); // right
    const hits = [...html.matchAll(/data-excess-web-hit-px="([\d.]+)"/g)].map(
      (m) => Number(m[1]),
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h).toBeGreaterThanOrEqual(44);
  });

  it("soft drop-shadow only; no glow; exit animation unchanged", () => {
    expect(css).toContain("drop-shadow(0 1px 1px rgba(0, 0, 0, 0.15))");
    expect(css).not.toMatch(/excess-cleaning-web[^{]*\{[^}]*box-shadow:\s*0 0 \d+px/);
    expect(css).toContain("excess-cleaning-web--exiting");
    expect(css).toContain("excess-web-exit");
    expect(excessWebExitDurationMs(false)).toBeGreaterThanOrEqual(180);
  });

  it("timer stays above cobweb layer; cleaning wrap still pointer-events none", () => {
    const webZ = css.match(
      /\.excess-cleaning-web-layer\s*\{[^}]*z-index:\s*(\d+)/,
    );
    const timerZ = css.match(
      /\.excess-cleaning-timer\s*\{[^}]*z-index:\s*(\d+)/,
    );
    expect(Number(timerZ?.[1])).toBeGreaterThan(Number(webZ?.[1]));
    expect(css).toMatch(
      /\.session-actions-wrap--cleaning[\s\S]*?pointer-events:\s*none/,
    );
  });

  it("F5: identical markup for same snapshot coords", () => {
    const session = activeSession();
    const a = renderToStaticMarkup(
      <ExcessCleaningWebLayer session={session} onExcessApplied={() => {}} />,
    );
    const b = renderToStaticMarkup(
      <ExcessCleaningWebLayer
        session={{ ...session, webs: session.webs!.map((w) => ({ ...w })) }}
        onExcessApplied={() => {}}
      />,
    );
    expect(a).toBe(b);
    expect(a).toContain('data-excess-web-x="0.2"');
    expect(a).toContain('data-excess-web-y="0.3"');
  });
});
